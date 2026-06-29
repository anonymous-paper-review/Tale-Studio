// writer 파이프라인 결과 → DB 기록 (단일 생산자, §3 일원화)
//
// 기존 generate-scenes(낡은 writer)를 대체한다. lossy 한 adapters.ts 대신, 대사를 보유한
// shot_sequence(ShotSequenceItem.S.dialogue)를 샷 소스로 쓴다.
//
// 매핑:
//   characters ← S2.characters (appearance = appearance_description, costume = v2 CharacterVisual[id].costume)
//   locations  ← v2 WorldVisual.locations
//   scenes     ← S3.scenes
//   shots      ← shot_sequence.shots (대사 포함)
//
// id: scene/shot 은 main 포맷(sc_01 / sh_01_01)으로 정규화, character 는 writer snake_case 유지
//     → shots.characters 와 characters.character_id 가 동일 id 공간(referential 정합).
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writerSceneIdToMain, writerShotIdToMain } from '@/lib/writer/adapters'
import {
  deriveEnBatch,
  deriveNativeBatch,
  i18nHash,
  isTargetScript,
} from '@/lib/writer/i18n/derive-en'
import type { ShotType } from '@/types'
import type {
  Characters,
  Scenes,
  WorldVisual,
  CharacterVisual,
  ShotSequence,
} from '@/lib/writer/types/pipeline'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DEFAULT_CAMERA = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
const DEFAULT_LIGHTING = { position: 'front', brightness: 50, colorTemp: 5000 }

const SHOT_TYPES: ShotType[] = ['ECU', 'CU', 'MCU', 'MS', 'MFS', 'FS', 'WS', 'EWS', 'OTS', 'POV', 'TRACK', '2S']
function normShotType(input: unknown): ShotType {
  const s = String(input ?? '').toUpperCase()
  for (const c of SHOT_TYPES) if (s === c) return c
  if (s.includes('WIDE')) return 'WS'
  if (s.includes('CLOSE')) return 'CU'
  if (s.includes('MEDIUM')) return 'MS'
  return 'MS'
}
function normRole(role: string): 'protagonist' | 'antagonist' | 'supporting' {
  return ['protagonist', 'antagonist', 'supporting'].includes(role)
    ? (role as 'protagonist' | 'antagonist' | 'supporting')
    : 'supporting'
}

// 프로젝트 표시 locale — _native 역파생(EN→유저언어) 대상 판정. 미설정/조회실패 시 'en'(역파생 skip).
async function projectLocale(projectId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('projects')
    .select('locale')
    .eq('id', projectId)
    .maybeSingle()
  return ((data?.locale as string) ?? 'en').trim() || 'en'
}

/**
 * Tier 1 (이미지에 필수): characters + locations + scenes 를 DB 기록.
 *   writer 파이프라인 stage 09(productionDesign) 직후 호출 → artist 가 ~절반 시점에 언블록되어
 *   캐릭터/월드 레퍼런스 이미지 생성을 일찍 시작할 수 있다 (shots/director 단계 10~14를 안 기다림).
 *   scenes 도 여기 포함 — world(로케이션) 이미지 생성이 scene.mood 에 의존하므로
 *   scenes 가 없으면 generateWorldAsset 이 조용히 스킵된다. scenes 는 stage 05 에서 이미 준비됨.
 *   기존 행은 project_id 기준 삭제 후 재삽입(idempotent). projectId 는 DB UUID 여야 함.
 *   호출자는 non-blocking 으로 감싼다.
 */
export async function persistAssetsToDb(
  projectId: string,
  characters: Characters,
  scenes: Scenes,
  worldVisual: WorldVisual,
  characterVisual: CharacterVisual,
): Promise<void> {
  if (!UUID_RE.test(projectId)) return // 핸드오프 외 run — DB project 없음

  // locations/scenes 는 writer 출력 → 매 실행 재생성(delete-then-insert).
  //   characters 는 입력(producer-story-gate §4) → 삭제하지 않고 additive 로만 보강(아래).
  await Promise.all([
    supabaseAdmin.from('locations').delete().eq('project_id', projectId),
    supabaseAdmin.from('scenes').delete().eq('project_id', projectId),
  ])

  // ⚠️ insert 순서 주의: artist 의 loadData 는 `dbChars?.length` 만 보고 hydrate 한다.
  //   characters 가 먼저 들어가면 locations/scenes 가 아직 없는 찰나에 폴링이 끼어 world 가
  //   누락될 수 있다. 그래서 locations → scenes 를 먼저 넣고 characters 를 마지막에 넣어,
  //   characters 가 보이는 순간 나머지가 보장되도록 한다.

  // locations (writer worldVisual.locations — name 은 id 기반, time_of_day 는 미보유)
  if (worldVisual.locations?.length) {
    await supabaseAdmin.from('locations').insert(
      worldVisual.locations.map((loc) => ({
        project_id: projectId,
        location_id: loc.id,
        name: loc.id,
        time_of_day: '',
        style_description: loc.style_description ?? '',
        lighting_sources: loc.lighting_sources ?? [],
        props: loc.props ?? [],
        // 레거시 필드도 채워 기존 소비측(l.visual_description / l.lighting_direction) 무변경 유지.
        visual_description: loc.style_description ?? '',
        lighting_direction: (loc.lighting_sources ?? []).join(', '),
      })),
    )
  }

  // scenes (world 이미지 생성이 scene.mood 에 의존 → Tier 1 에 포함)
  if (scenes.scenes.length) {
    const locale = await projectLocale(projectId)
    // 언어 경계(S3): 파이프라인 산출 자유서술(narrative/mood) → EN base 파생(이미 영어면 skip). 표시는 _native.
    const sRows = scenes.scenes.map((sc, i) => ({
      id: writerSceneIdToMain(sc.scene_id),
      narrativeNative: sc.dialogue_summary ?? sc.purpose ?? '',
      moodNative: `${sc.emotion_beat?.start ?? ''} → ${sc.emotion_beat?.end ?? ''}`,
      quote: (sc.scene_actions ?? []).join(' '),
      location: sc.location ?? '',
      timeOfDay: sc.time_of_day ?? '',
      chars: sc.characters_in_scene ?? [],
      seconds: sc.estimated_seconds ?? 0,
      i,
    }))
    const [narrEn, moodEn] = await Promise.all([
      deriveEnBatch(sRows.map((r) => ({ id: r.id, native: r.narrativeNative })), 'scene narrative summary'),
      deriveEnBatch(sRows.map((r) => ({ id: r.id, native: r.moodNative })), 'scene mood'),
    ])
    // 표시용 _native(유저 locale): 파이프라인이 영어를 산출하므로 EN base → locale 역파생(S7).
    //   파이프라인이 이미 타깃 언어를 준 행은 원문 보존(round-trip 회피). locale=en 이면 deriveNativeBatch=no-op.
    const enSrc = (native: string, en: string | undefined) =>
      isTargetScript(native, locale) ? native : en ?? native
    const [narrKo, moodKo] = await Promise.all([
      deriveNativeBatch(
        sRows.map((r) => ({ id: r.id, en: enSrc(r.narrativeNative, narrEn.get(r.id)) })),
        locale,
        'scene narrative summary',
      ),
      deriveNativeBatch(
        sRows.map((r) => ({ id: r.id, en: enSrc(r.moodNative, moodEn.get(r.id)) })),
        locale,
        'scene mood',
      ),
    ])
    await supabaseAdmin.from('scenes').insert(
      sRows.map((r) => {
        const narrTx = !isTargetScript(r.narrativeNative, locale) && narrKo.has(r.id)
        const moodTx = !isTargetScript(r.moodNative, locale) && moodKo.has(r.id)
        return {
          project_id: projectId,
          scene_id: r.id,
          narrative_summary: narrEn.get(r.id) ?? r.narrativeNative,
          narrative_summary_native: narrKo.get(r.id) ?? r.narrativeNative,
          original_text_quote: r.quote,
          location: r.location,
          time_of_day: r.timeOfDay,
          mood: moodEn.get(r.id) ?? r.moodNative,
          mood_native: moodKo.get(r.id) ?? r.moodNative,
          i18n_provenance: {
            narrative_summary: i18nHash(r.narrativeNative),
            mood: i18nHash(r.moodNative),
            // 역파생(EN→native) 출처 해시 — EN 주 컬럼 변경 시 _native stale 판정.
            ...(narrTx ? { narrative_summary_native: i18nHash(narrEn.get(r.id) ?? r.narrativeNative) } : {}),
            ...(moodTx ? { mood_native: i18nHash(moodEn.get(r.id) ?? r.moodNative) } : {}),
          },
          characters_present: r.chars,
          estimated_duration_seconds: r.seconds,
          sort_order: r.i,
        }
      }),
    )
  }

  // characters: additive (producer-story-gate §4 — 인물=입력). 기존 행(producer·writer-origin)은
  //   보존하고, 새 slug 만 origin='writer' 로 insert + 기존 행은 비어 있는 보강 필드만 채운다.
  //   producer 가 확정한 정체성(name/role/arc/motivation/이미지)은 절대 덮어쓰지 않는다.
  // v2 CharacterVisual[].costume → { character_id: costume[] } (빈 의상 제외 — 옛 productionDesign.costumes 누락과 동일 취급)
  const costumes: Record<string, string[]> = Object.fromEntries(
    characterVisual.characters
      .filter((cv) => cv.costume?.length)
      .map((cv) => [cv.character_id, cv.costume]),
  )
  if (characters.characters.length) {
    const { data: existingRows } = await supabaseAdmin
      .from('characters')
      .select('character_id, appearance, costume')
      .eq('project_id', projectId)
    const existing = new Map(
      (existingRows ?? []).map((r) => [r.character_id as string, r]),
    )

    const toInsert: Record<string, unknown>[] = []
    for (const c of characters.characters) {
      const prev = existing.get(c.id)
      if (!prev) {
        // 새 인물 (writer 가 전개상 추가) — 최소 필드 insert.
        toInsert.push({
          project_id: projectId,
          character_id: c.id,
          name: c.name,
          role: normRole(c.role),
          entity_type: 'person',
          appearance: c.appearance_description ?? '',
          description: c.appearance_description ?? '',
          costume: costumes[c.id] ?? null,
          origin: 'writer',
        })
        continue
      }
      // 기존 행: 빈 보강 필드만 채움 (덮어쓰기 금지).
      const patch: Record<string, unknown> = {}
      if (!prev.appearance && c.appearance_description) {
        patch.appearance = c.appearance_description
        patch.description = c.appearance_description
      }
      if (prev.costume == null && costumes[c.id]) patch.costume = costumes[c.id]
      if (Object.keys(patch).length) {
        await supabaseAdmin
          .from('characters')
          .update(patch)
          .eq('project_id', projectId)
          .eq('character_id', c.id)
      }
    }
    if (toInsert.length) {
      await supabaseAdmin.from('characters').insert(toInsert)
    }
  }
}

/**
 * Tier 2 (스토리보드/director): shots 만 DB 기록.
 *   writer 파이프라인 마지막(stage 14 renderPrompts 직후) 호출 → director 가 콘티 노드를 채운다.
 *   characters/locations/scenes 는 Tier 1 이 이미 기록했으므로 건드리지 않는다(artist 편집 보존).
 *   기존 shots 행은 project_id 기준 삭제 후 재삽입(idempotent). 호출자는 non-blocking.
 */
export async function persistShotsToDb(
  projectId: string,
  shotSequence: ShotSequence,
): Promise<void> {
  if (!UUID_RE.test(projectId)) return // 핸드오프 외 run — DB project 없음

  // 자신이 채우는 테이블만 정리 (shots). characters/locations/scenes 는 Tier 1 소관.
  await supabaseAdmin.from('shots').delete().eq('project_id', projectId)

  // shots (shot_sequence — 대사 보유)
  if (shotSequence.shots.length) {
    // 언어 경계(S3): action_description(파이프라인 산출) → EN base 파생(이미 영어면 skip). 표시는 _native.
    const shRows = shotSequence.shots.map((it, i) => {
      const chars = (it.assets?.characters ?? [])
        .map((c) => c.id)
        .filter((id): id is string => typeof id === 'string')
      return {
        sceneMainId: writerSceneIdToMain(it.S.scene_id),
        shotMainId: writerShotIdToMain(it.shot_id, it.S.scene_id),
        shotType: normShotType(it.V?.camera?.type),
        actionNative: it.S?.character_action ?? '',
        chars: Array.from(new Set(chars)),
        dialogue: it.S?.dialogue,
        duration: it.duration_seconds ?? 5,
        i,
      }
    })
    const actionEn = await deriveEnBatch(
      shRows.map((r) => ({ id: r.shotMainId, native: r.actionNative })),
      'shot action description',
    )
    // 표시용 _native(유저 locale): EN base → locale 역파생(S7). 파이프라인이 타깃 언어를 준 행은 원문 보존.
    const locale = await projectLocale(projectId)
    const actionKo = await deriveNativeBatch(
      shRows.map((r) => ({
        id: r.shotMainId,
        en: isTargetScript(r.actionNative, locale) ? r.actionNative : actionEn.get(r.shotMainId) ?? r.actionNative,
      })),
      locale,
      'shot action description',
    )
    await supabaseAdmin.from('shots').insert(
      shRows.map((r) => {
        const actTx = !isTargetScript(r.actionNative, locale) && actionKo.has(r.shotMainId)
        return {
        project_id: projectId,
        scene_id: r.sceneMainId,
        shot_id: r.shotMainId,
        shot_type: r.shotType,
        action_description: actionEn.get(r.shotMainId) ?? r.actionNative,
        action_description_native: actionKo.get(r.shotMainId) ?? r.actionNative,
        i18n_provenance: {
          action_description: i18nHash(r.actionNative),
          ...(actTx ? { action_description_native: i18nHash(actionEn.get(r.shotMainId) ?? r.actionNative) } : {}),
        },
        characters: r.chars,
        duration_seconds: r.duration,
        generation_method: 'I2V',
        dialogue_lines: r.dialogue
          ? [{ characterId: r.chars[0] ?? null, text: r.dialogue, emotion: '', delivery: '', durationHint: 0 }]
          : [],
        camera_config: { ...DEFAULT_CAMERA },
        lighting_config: { ...DEFAULT_LIGHTING },
        sort_order: r.i,
        }
      }),
    )

    // scene 길이를 데쿠파주(shots) duration 합으로 수렴 (2026-06-24).
    //   scene.estimated_seconds 는 s3_scenes(Story축)가 shot 분해 *전* playtime 을 배분한 추정이라
    //   실제 shot duration 합과 어긋난다(축 독립 생성). shots 가 확정된 직후, 그 합을 진실로 삼아 갱신.
    //   기본값(?? 5)은 insert 의 duration_seconds 와 동일하게 맞춘다.
    const secondsByScene = new Map<string, number>()
    for (const it of shotSequence.shots) {
      const sid = writerSceneIdToMain(it.S.scene_id)
      secondsByScene.set(sid, (secondsByScene.get(sid) ?? 0) + (it.duration_seconds ?? 5))
    }
    await Promise.all(
      [...secondsByScene].map(([sceneId, sum]) =>
        supabaseAdmin
          .from('scenes')
          .update({ estimated_duration_seconds: sum })
          .eq('project_id', projectId)
          .eq('scene_id', sceneId),
      ),
    )
  }
}

/**
 * 호환용 래퍼: 두 tier 를 순차 기록. 점진적 언블록이 필요 없는 호출자용.
 * (핸드오프 파이프라인은 persistAssetsToDb / persistShotsToDb 를 시점 분리해 직접 호출한다.)
 */
export async function persistManifestToDb(
  projectId: string,
  characters: Characters,
  scenes: Scenes,
  worldVisual: WorldVisual,
  characterVisual: CharacterVisual,
  shotSequence: ShotSequence,
): Promise<void> {
  await persistAssetsToDb(projectId, characters, scenes, worldVisual, characterVisual)
  await persistShotsToDb(projectId, shotSequence)
}
