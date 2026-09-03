import type { Json } from '@/types/database'
// writer 파이프라인 결과 → DB 기록 (단일 생산자, §3 일원화)
//
// 기존 generate-scenes(낡은 writer)를 대체한다. lossy 한 adapters.ts 대신, 대사를 보유한
// shot_sequence(ShotSequenceItem.S.dialogue)를 샷 소스로 쓴다.
//
// 매핑:
//   characters + character_appearances ← S2.characters (기본 모습 = appearance_description, costume = v2 CharacterVisual[id].costume)
//   locations  ← v2 WorldVisual.locations
//   scenes     ← S3.scenes
//   shots      ← shot_sequence.shots (대사 포함)
//
// id: scene/shot 은 main 포맷(sc_01 / sh_01_01)으로 정규화, character 는 writer snake_case 유지
//     → shots.characters 와 characters.character_id 가 동일 id 공간(referential 정합).
import { humanizeSlug } from '@/lib/display-name'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writerSceneIdToMain, writerShotIdToMain } from '@/lib/writer/adapters'
import {
  AppearanceSelectionError,
  resolveCharacterAppearance,
  type CharacterAppearanceCandidate,
} from '@/lib/writer/appearance-selection'
import { reallocateShotDurations, speechSecondsForText } from '@/lib/writer/pipeline/util/duration_reallocation'
import { buildShotDialogueMap } from '@/lib/writer/pipeline/util/dialogue_join'
import { isFlagOn } from '@/lib/flags'
import {
  facetsHash,
  renderDirectorPromptFromFacets,
  renderDirectorPromptTemplate,
  type FacetRenderSpec,
} from '@/lib/writer/facet-render'
import {
  deriveEnBatch,
  deriveNativeBatch,
  i18nHash,
  isTargetScript,
} from '@/lib/writer/i18n/derive-en'
import type { ShotType } from '@/types'
import type {
  SceneStage,
  Characters,
  Scenes,
  WorldVisual,
  CharacterVisual,
  ShotSequence,
  ShotStaticSpec,
  ShotDynamicSpec,
  ShotCheckNote,
  DialogueTrack,
  ShotDialogue,
  NarrativeTime,
} from '@/lib/writer/types/pipeline'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// DB 쓰기 결과 검증(#persist-guard 2026-07-31) — supabase-js 는 DB 에러를 throw 하지 않고
//   { error } 로 반환하므로, 결과를 버리면 실패가 조용히 지나간다. 실사고: 미적용 스키마
//   (shots.static_spec 부재, 42703)로 insert 전체가 거부됐는데 run 은 completed 13/13 —
//   shots 0행(fe699c5b, 2026-07-31). 크리티컬 쓰기는 전부 이 헬퍼로 실패를 던져
//   상위(persistShots step 재시도/give-up 로그)에 드러낸다.
function assertDbOk(op: string, error: { message: string } | null): void {
  if (error) throw new Error(`[persist] ${op} failed: ${error.message}`)
}

const DEFAULT_CAMERA = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
const DEFAULT_LIGHTING = { position: 'front', brightness: 50, colorTemp: 5000 }

// 샷 길이 상한 — 파이프라인이 과다 산정한 길이(예: 18s)의 백스톱(#9, 2026-07-09). 가이드는 2~8초
//   (decoupage/v4 프롬프트), 이 클램프는 LLM 초과분만 막는다. 수동 편집은 상세 팝업에서 최대 60s 허용.
const MAX_SHOT_SECONDS = 10
function clampShotSeconds(s: number | null | undefined): number {
  return Math.min(MAX_SHOT_SECONDS, Math.max(1, Math.round(s ?? 5)))
}

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
 *   idempotent: scenes + writer-origin locations 는 삭제 후 재삽입, producer-origin locations 와
 *   characters 는 보존(파생/빈 필드만 갱신 — §5 원칙 2). projectId 는 DB UUID 여야 함.
 *   호출자는 non-blocking 으로 감싼다.
 */
export async function persistAssetsToDb(
  projectId: string,
  characters: Characters,
  scenes: Scenes,
  worldVisual: WorldVisual,
  characterVisual: CharacterVisual,
  // 오픈캐스트 로케이션의 표시명 원천(#opencast-name-locale 2026-08-12) — mergeOpenWorld 가
  //   드라마투르그 후보의 한국어 표시명을 world.locations[].name 에 보존하는데, 여기서 안 받으면
  //   아래 insert 가 humanizeSlug(id)로 영어 이름을 만들어 그 보존을 무효화한다(리프 채굴 실측).
  world?: { locations: Array<{ id: string; name: string }> },
): Promise<void> {
  if (!UUID_RE.test(projectId)) return // 핸드오프 외 run — DB project 없음

  // scenes 는 writer 출력 → 매 실행 재생성(delete-then-insert).
  // locations 는 혼합(characters 와 동일한 §5 원칙 2): producer 가 핸드오프로 upsert 한 행
  //   (origin='producer' — name/purpose/visual_description 은 사람이 확정한 원천)은 **입력**이라
  //   보존하고 writer 파생 필드만 갱신, writer-origin 행만 재생성한다.
  //   (전체 wipe 가 producer 배경의 이름을 slug 그대로("location_2"), purpose 를 빈칸으로
  //   갈아엎고 origin 까지 'writer' 로 강등시키던 버그 — 2026-06-30. origin 은 NOT NULL default 'writer'.)
  const { data: producerLocRows } = await supabaseAdmin
    .from('locations')
    .select('location_id')
    .eq('project_id', projectId)
    .eq('origin', 'producer')
  const producerLocIds = new Set((producerLocRows ?? []).map((r) => r.location_id as string))
  // 표시 locale — locations/scenes 의 _native 역파생(EN base → 유저 언어, S7)에 공용.
  const locale = await projectLocale(projectId)
  await Promise.all([
    (async () => {
      const { error } = await supabaseAdmin
        .from('locations')
        .delete()
        .eq('project_id', projectId)
        .neq('origin', 'producer')
      assertDbOk('locations delete', error)
    })(),
    (async () => {
      // #F-003 R3(2026-08-13): 파이프라인 소유 행만 갈아엎는다 — 채팅/수동 씬(source='manual')은
      //   재런에서 살아남는다 (위 locations 의 origin='producer' 보존과 같은 소유권 시멘틱).
      const { error } = await supabaseAdmin
        .from('scenes')
        .delete()
        .eq('project_id', projectId)
        .eq('source', 'pipeline')
      assertDbOk('scenes delete', error)
    })(),
  ])

  // ⚠️ insert 순서 주의: artist 의 loadData 는 `dbChars?.length` 만 보고 hydrate 한다.
  //   characters 가 먼저 들어가면 locations/scenes 가 아직 없는 찰나에 폴링이 끼어 world 가
  //   누락될 수 있다. 그래서 locations → scenes 를 먼저 넣고 characters 를 마지막에 넣어,
  //   characters 가 보이는 순간 나머지가 보장되도록 한다.

  // locations (writer worldVisual.locations — 신규 행 name 은 계약 표시명 우선, time_of_day 는 미보유)
  const worldNameById = new Map(
    (world?.locations ?? []).map((l) => [l.id, l.name] as const),
  )
  if (worldVisual.locations?.length) {
    const freshLocs = worldVisual.locations.filter((loc) => !producerLocIds.has(loc.id))
    const producerLocs = worldVisual.locations.filter((loc) => producerLocIds.has(loc.id))
    if (freshLocs.length) {
      // 표시용 _native(유저 locale): writer-신규 로케이션 묘사도 EN base → locale 역파생(S7 —
      //   scenes/shots 와 동일. 빠뜨리면 오픈캐스트 로케이션 설명이 producer 보드에 영어로 뜬다, 2026-07-03).
      //   v2 가 이미 타깃 언어를 준 행은 원문 보존, locale=en 이면 no-op.
      const locNativeKo = await deriveNativeBatch(
        freshLocs.map((loc) => ({ id: loc.id, en: loc.style_description ?? '' })),
        locale,
        'location visual description',
      )
      const { error: locInsertErr } = await supabaseAdmin.from('locations').insert(
        freshLocs.map((loc) => {
          const en = loc.style_description ?? ''
          const locTx = !isTargetScript(en, locale) && locNativeKo.has(loc.id)
          return {
            project_id: projectId,
            location_id: loc.id,
            // 표시 이름 — 1순위는 계약(world.locations)의 표시명: mergeOpenWorld 가 유저 언어
            //   표시명("무인 조위 관측소")을 여기 보존한다. 없을 때만 slug humanize 폴백
            //   (#opencast-name 2026-08-06: "location_1" 노출 방지 / #opencast-name-locale 2026-08-12).
            name: worldNameById.get(loc.id)?.trim() || humanizeSlug(loc.id),
            time_of_day: '',
            style_description: en,
            lighting_sources: loc.lighting_sources ?? [],
            props: loc.props ?? [],
            // 레거시 필드도 채워 기존 소비측(l.visual_description / l.lighting_direction) 무변경 유지.
            visual_description: en,
            visual_description_native: locNativeKo.get(loc.id) ?? en,
            ...(locTx ? { i18n_provenance: { visual_description_native: i18nHash(en) } } : {}),
            lighting_direction: (loc.lighting_sources ?? []).join(', '),
          }
        }),
      )
      assertDbOk('locations insert', locInsertErr)
    }
    // producer 행: writer 파생 필드(아트디렉션)만 갱신 — 원천(name/purpose/visual_description*·
    //   user_edited·origin)은 불변. visual_description 은 producer 원문(EN 파생본)이 그대로
    //   rough-board db_fallback/월드 이미지 입력이 된다.
    if (producerLocs.length) {
      await Promise.all(
        producerLocs.map(async (loc) => {
          const { error } = await supabaseAdmin
            .from('locations')
            .update({
              style_description: loc.style_description ?? '',
              lighting_sources: loc.lighting_sources ?? [],
              props: loc.props ?? [],
              lighting_direction: (loc.lighting_sources ?? []).join(', '),
            })
            .eq('project_id', projectId)
            .eq('location_id', loc.id)
          assertDbOk(`locations update(${loc.id})`, error)
        }),
      )
    }
  }

  // scenes (world 이미지 생성이 scene.mood 에 의존 → Tier 1 에 포함)
  if (scenes.scenes.length) {
    // #F-003 R3: 생존한 수동 씬과 scene_id 가 겹치면 **수동이 이긴다** — 파이프라인 산출은
    //   재생성 가능하고 사람의 글은 아니므로. UNIQUE(project_id, scene_id) 에러로 런을 죽이는
    //   대신 충돌 행만 빼고 경고로 표면화한다.
    const { data: survivorScenes, error: survScErr } = await supabaseAdmin
      .from('scenes')
      .select('scene_id')
      .eq('project_id', projectId)
    assertDbOk('scenes survivors', survScErr)
    const takenSceneIds = new Set((survivorScenes ?? []).map((s) => s.scene_id as string))
    // 언어 경계(S3): 파이프라인 산출 자유서술(narrative/mood) → EN base 파생(이미 영어면 skip). 표시는 _native.
    const sRowsAll = scenes.scenes.map((sc, i) => ({
      id: writerSceneIdToMain(sc.scene_id),
      narrativeNative: sc.dialogue_summary ?? sc.purpose ?? '',
      moodNative: `${sc.emotion_beat?.start ?? ''} → ${sc.emotion_beat?.end ?? ''}`,
      quote: (sc.scene_actions ?? []).join(' '),
      location: sc.location ?? '',
      timeOfDay: sc.time_of_day ?? '',
      narrativeTime: sc.narrative_time,
      characterAppearanceOverrides: sc.character_appearance_overrides ?? {},
      chars: sc.characters_in_scene ?? [],
      seconds: sc.estimated_seconds ?? 0,
      i,
    }))
    const collidedScenes = sRowsAll.filter((r) => takenSceneIds.has(r.id))
    if (collidedScenes.length) {
      console.warn(
        `[persistAssetsToDb] 수동 씬과 scene_id 충돌 — 파이프라인 씬 ${collidedScenes.length}건 스킵(수동 우선): ` +
          collidedScenes.map((r) => r.id).join(', '),
      )
    }
    const sRows = collidedScenes.length
      ? sRowsAll.filter((r) => !takenSceneIds.has(r.id))
      : sRowsAll
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
    const { error: sceneInsertErr } = await supabaseAdmin.from('scenes').insert(
      sRows.map((r) => {
        const narrTx = !isTargetScript(r.narrativeNative, locale) && narrKo.has(r.id)
        const moodTx = !isTargetScript(r.moodNative, locale) && moodKo.has(r.id)
        return {
          project_id: projectId,
          scene_id: r.id,
          source: 'pipeline', // #F-003 R3 — 이 행은 재런 시 파이프라인이 갈아엎는다
          narrative_summary: narrEn.get(r.id) ?? r.narrativeNative,
          narrative_summary_native: narrKo.get(r.id) ?? r.narrativeNative,
          original_text_quote: r.quote,
          location: r.location,
          time_of_day: r.timeOfDay,
          narrative_time: r.narrativeTime,
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
    assertDbOk('scenes insert', sceneInsertErr)
    const overrideRows = sRows.flatMap((scene) =>
      Object.entries(scene.characterAppearanceOverrides).map(([characterId, appearanceKey]) => ({
        project_id: projectId,
        scene_id: scene.id,
        character_id: characterId,
        appearance_key: appearanceKey,
      })),
    )
    if (overrideRows.length) {
      const { error: overrideInsertErr } = await supabaseAdmin
        .from('scene_character_appearance_overrides')
        .insert(overrideRows)
      assertDbOk('scene appearance overrides insert', overrideInsertErr)
    }
  }

  // characters + 기본 모습: Writer가 추가한 인물도 RPC 하나로 identity와 기본 모습을 원자적으로 기록한다.
  // v2 CharacterVisual[].costume → { character_id: costume[] }.
  const costumes: Record<string, string[]> = Object.fromEntries(
    characterVisual.characters
      .filter((cv) => cv.costume?.length)
      .map((cv) => [cv.character_id, cv.costume]),
  )
  if (characters.characters.length) {
    // 언어 경계: writer-신규 인물 외형도 EN base + _native 표기로 분리(생성=EN, 표시=유저 언어).
    //   빠뜨리면 appearance(생성 canonical)가 스토리 언어 그대로 들어간다(라이브 8건 확인, 2026-07-03).
    //   deriveEnBatch 는 이미 영어면 무비용 통과, deriveNativeBatch 는 locale=en 이면 no-op.
    const appearRaw = new Map(
      characters.characters
        .filter((c) => (c.appearance_description ?? '').trim())
        .map((c) => [c.id, (c.appearance_description as string).trim()]),
    )
    const appearEn = await deriveEnBatch(
      [...appearRaw].map(([id, native]) => ({ id, native })),
      'character appearance',
    )
    const appearKo = await deriveNativeBatch(
      [...appearRaw]
        .filter(([, raw]) => !isTargetScript(raw, locale))
        .map(([id, raw]) => ({ id, en: appearEn.get(id) ?? raw })),
      locale,
      'character appearance',
    )
    // 한 인물의 3면: en(생성 base) / native(표시 — 원문이 타깃 언어면 원문, 아니면 역파생) / provenance
    const appearFields = (id: string) => {
      const raw = appearRaw.get(id) ?? ''
      if (!raw) return { appearance: '', appearance_native: '', i18n_provenance: {} as Record<string, string> }
      const en = appearEn.get(id) ?? raw
      const native = isTargetScript(raw, locale) ? raw : appearKo.get(id) ?? raw
      const prov: Record<string, string> = {}
      if (en !== raw) prov.appearance = i18nHash(raw)
      if (native !== raw && native !== en) prov.appearance_native = i18nHash(en)
      return { appearance: en, appearance_native: native, i18n_provenance: prov }
    }

    const people = characters.characters.map((c) => {
      const af = appearFields(c.id)
      return {
        character_id: c.id,
        name: c.name,
        role: normRole(c.role),
        description: null,
        arc: c.arc && (c.arc.start_state || c.arc.end_state || c.arc.arc_type) ? c.arc : null,
        motivation: c.motivation && (c.motivation.want || c.motivation.need) ? c.motivation : null,
        origin: 'writer',
        ...af,
        costume: costumes[c.id] ?? null,
      }
    })
    const { error } = await supabaseAdmin.rpc('upsert_people_with_default_appearances', {
      p_project_id: projectId,
      p_people: people,
    })
    assertDbOk('people with default appearances upsert', error)
  }
}

// v4_shots 의 SHOT_CHUNK_SIZE 와 맞춘 8개 단위 — 서버리스 타임아웃/LLM 팬아웃 방어.
const SHOT_CHUNK_SIZE = 8

const SHOT_USER_CARRY_FORWARD_COLUMNS = [
  'camera_config',
  'lighting_config',
  'canvas_position',
  'speed',
  'trim_start',
  'trim_end',
  'location_ids',
  // TODO(P4): prompt_override / manual prompt edit provenance columns land here once migrated.
] as const

type ShotUserCarryForwardColumn = (typeof SHOT_USER_CARRY_FORWARD_COLUMNS)[number]
type ExistingShotCarryForward = Record<string, unknown> & {
  shot_id?: unknown
  prompt?: unknown
  prompt_source_hash?: unknown
}
type PersistShotDraft = {
  sceneMainId: string
  shotMainId: string
  shotType: ShotType
  actionNative: string
  composition: string
  staticSpec: FacetRenderSpec | null
  // #motion-contract: v4 dynamic_spec 원본 — shots.dynamic_spec 운반(영상 모션 계약 소스).
  dynamicSpec: ShotDynamicSpec | null
  promptSourceHash: string | null
  chars: string[]
  characterAppearanceKeys: Record<string, string>
  shotDialogue: ShotDialogue | null
  duration: number
  i: number
  // #p2-wiring: v4 설계 provenance(분할 자식은 부모 id) + shotCheck 채널1 제약.
  designRef: string | null
  checkNotes: ShotCheckNote[] | null
}

type SceneAppearanceResolution = {
  narrativeTime: NarrativeTime
  overrides: Record<string, string>
}

function requireNarrativeTime(value: unknown, sceneId: string): NarrativeTime {
  if (value === 'present' || value === 'past' || value === 'future') return value
  throw new Error(
    `[persistShotsToDb] scene ${sceneId} has no valid narrative_time; apply the narrative-time migration before persisting shots`,
  )
}

function requireAppearanceOverrides(value: unknown, sceneId: string): Record<string, string> {
  if (value == null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppearanceSelectionError(
      'INVALID_APPEARANCE_OVERRIDE',
      `Scene ${sceneId} has invalid character appearance overrides`,
    )
  }
  const overrides: Record<string, string> = {}
  for (const [characterId, appearanceKey] of Object.entries(value)) {
    if (typeof appearanceKey !== 'string' || !appearanceKey.trim()) {
      throw new AppearanceSelectionError(
        'INVALID_APPEARANCE_OVERRIDE',
        `Scene ${sceneId} has an invalid appearance override for character "${characterId}"`,
      )
    }
    overrides[characterId] = appearanceKey
  }
  return overrides
}

async function loadShotAppearanceResolutionData(
  projectId: string,
): Promise<{
  appearancesByCharacter: Map<string, CharacterAppearanceCandidate[]>
  scenesById: Map<string, SceneAppearanceResolution>
}> {
  const [appearanceResult, sceneResult, overrideResult] = await Promise.all([
    supabaseAdmin
      .from('character_appearances')
      .select('character_id,appearance_key,narrative_time,is_default')
      .eq('project_id', projectId),
    supabaseAdmin
      .from('scenes')
      .select('scene_id,narrative_time')
      .eq('project_id', projectId),
    supabaseAdmin
      .from('scene_character_appearance_overrides')
      .select('scene_id,character_id,appearance_key')
      .eq('project_id', projectId),
  ])
  assertDbOk('character appearances load', appearanceResult.error)
  assertDbOk('scene appearance settings load', sceneResult.error)
  assertDbOk('scene appearance overrides load', overrideResult.error)

  const appearancesByCharacter = new Map<string, CharacterAppearanceCandidate[]>()
  for (const row of appearanceResult.data ?? []) {
    if (typeof row.character_id !== 'string' || typeof row.appearance_key !== 'string' || !row.appearance_key.trim()) {
      continue
    }
    if (
      row.narrative_time !== null &&
      row.narrative_time !== 'present' &&
      row.narrative_time !== 'past' &&
      row.narrative_time !== 'future'
    ) {
      throw new Error(
        `[persistShotsToDb] character ${row.character_id} appearance ${row.appearance_key} has invalid narrative_time`,
      )
    }
    const appearances = appearancesByCharacter.get(row.character_id) ?? []
    appearances.push({
      appearanceKey: row.appearance_key,
      narrativeTime: row.narrative_time,
      isDefault: row.is_default === true,
    })
    appearancesByCharacter.set(row.character_id, appearances)
  }

  const overridesByScene = new Map<string, Record<string, string>>()
  for (const row of overrideResult.data ?? []) {
    if (typeof row.scene_id !== 'string' || typeof row.character_id !== 'string') {
      throw new AppearanceSelectionError(
        'INVALID_APPEARANCE_OVERRIDE',
        'A scene appearance override has no valid scene or character identifier',
      )
    }
    const overrides = overridesByScene.get(row.scene_id) ?? {}
    overrides[row.character_id] = requireAppearanceOverrides(
      { [row.character_id]: row.appearance_key },
      row.scene_id,
    )[row.character_id]
    overridesByScene.set(row.scene_id, overrides)
  }

  const scenesById = new Map<string, SceneAppearanceResolution>()
  for (const row of sceneResult.data ?? []) {
    if (typeof row.scene_id !== 'string') continue
    scenesById.set(row.scene_id, {
      narrativeTime: requireNarrativeTime(row.narrative_time, row.scene_id),
      overrides: overridesByScene.get(row.scene_id) ?? {},
    })
  }
  return { appearancesByCharacter, scenesById }
}

function warnShotPersistFallback(scope: string, error: unknown) {
  console.warn(
    `[persistShotsToDb] ${scope} 실패 — 기본 경로로 계속:`,
    error instanceof Error ? error.message : error,
  )
}

function toFacetSpec(value: unknown): FacetRenderSpec | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<ShotStaticSpec>)
    : null
}

function safeFacetsHash(spec: FacetRenderSpec | null): string | null {
  if (!spec) return null
  try {
    return facetsHash(spec)
  } catch (error) {
    warnShotPersistFallback('static_spec hash', error)
    return null
  }
}

function defaultPersistPrompt(row: PersistShotDraft, actionEn: Map<string, string>): string {
  return row.composition || (actionEn.get(row.shotMainId) ?? row.actionNative)
}

function templatePromptOrDefault(row: PersistShotDraft, actionEn: Map<string, string>): string {
  if (!row.staticSpec) return defaultPersistPrompt(row, actionEn)
  try {
    return renderDirectorPromptTemplate(row.staticSpec) || defaultPersistPrompt(row, actionEn)
  } catch (error) {
    warnShotPersistFallback('FACET_RENDER template fallback', error)
    return defaultPersistPrompt(row, actionEn)
  }
}

function cachedPromptFor(row: PersistShotDraft, existing?: ExistingShotCarryForward): string | null {
  if (!row.promptSourceHash || !existing) return null
  const existingHash =
    typeof existing.prompt_source_hash === 'string' ? existing.prompt_source_hash : null
  const existingPrompt = typeof existing.prompt === 'string' ? existing.prompt : null
  if (existingHash !== row.promptSourceHash || !existingPrompt?.trim()) return null
  return existingPrompt
}

export async function resolvePersistShotPrompts(
  rows: PersistShotDraft[],
  actionEn: Map<string, string>,
  existingByShotId: Map<string, ExistingShotCarryForward>,
): Promise<Map<string, string>> {
  const prompts = new Map(rows.map((row) => [row.shotMainId, defaultPersistPrompt(row, actionEn)]))

  let facetRenderEnabled = false
  try {
    facetRenderEnabled = isFlagOn('FACET_RENDER')
  } catch (error) {
    warnShotPersistFallback('FACET_RENDER flag 확인', error)
    return prompts
  }
  if (!facetRenderEnabled) return prompts

  const facetRows = rows.filter((row) => row.staticSpec)
  for (let start = 0; start < facetRows.length; start += SHOT_CHUNK_SIZE) {
    const chunk = facetRows.slice(start, start + SHOT_CHUNK_SIZE)
    const toRender: PersistShotDraft[] = []
    for (const row of chunk) {
      const cached = cachedPromptFor(row, existingByShotId.get(row.shotMainId))
      if (cached) {
        prompts.set(row.shotMainId, cached)
      } else {
        toRender.push(row)
      }
    }
    if (!toRender.length) continue

    try {
      const rendered = await Promise.all(
        toRender.map(async (row) => {
          const prompt = (await renderDirectorPromptFromFacets(row.staticSpec!)).trim()
          return [row.shotMainId, prompt || templatePromptOrDefault(row, actionEn)] as const
        }),
      )
      for (const [shotId, prompt] of rendered) prompts.set(shotId, prompt)
    } catch (error) {
      warnShotPersistFallback('FACET_RENDER chunk render', error)
      for (const row of toRender) {
        prompts.set(row.shotMainId, templatePromptOrDefault(row, actionEn))
      }
    }
  }

  return prompts
}

export async function readShotCarryForwardById(
  projectId: string,
): Promise<Map<string, ExistingShotCarryForward>> {
  try {
    const { data, error } = await supabaseAdmin.from('shots').select('*').eq('project_id', projectId)
    if (error) throw error
    const rows = new Map<string, ExistingShotCarryForward>()
    for (const row of data ?? []) {
      const shotId = (row as ExistingShotCarryForward).shot_id
      if (typeof shotId === 'string') rows.set(shotId, row as ExistingShotCarryForward)
    }
    return rows
  } catch (error) {
    warnShotPersistFallback('carry-forward 조회', error)
    return new Map()
  }
}

export function applyShotCarryForward<T extends Record<string, unknown>>(
  row: T,
  existing?: ExistingShotCarryForward,
): T {
  if (!existing) return row
  const carry: Partial<Record<ShotUserCarryForwardColumn, unknown>> = {}
  for (const column of SHOT_USER_CARRY_FORWARD_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(existing, column) && existing[column] !== undefined) {
      carry[column] = existing[column]
    }
  }
  return Object.keys(carry).length ? ({ ...row, ...carry } as T) : row
}

/**
 * Tier 2 (스토리보드/director): shots 만 DB 기록.
 *   writer 파이프라인 마지막(stage 14 renderPrompts 직후) 호출 → director 가 콘티 노드를 채운다.
 *   characters/locations/scenes 는 Tier 1 이 이미 기록했으므로 건드리지 않는다(artist 편집 보존).
 *   기존 shots 행은 project_id 기준 삭제 후 재삽입(idempotent). 호출자는 non-blocking.
 */
/**
 * 씬 무대(#stage 2026-09-03) → scenes.stage. 씬 행은 persistAssetsToDb(v2Design)가 이미 넣었으므로 갱신만.
 *   실패는 throw — 호출부(sceneStage step)가 로그로 드러내고 run 은 계속한다.
 */
export async function persistSceneStagesToDb(projectId: string, stages: SceneStage[]): Promise<number> {
  if (!UUID_RE.test(projectId) || !stages.length) return 0
  let n = 0
  for (const st of stages) {
    const { error, count } = await supabaseAdmin
      .from('scenes')
      .update({ stage: st as unknown as Json }, { count: 'exact' })
      .eq('project_id', projectId)
      .eq('scene_id', writerSceneIdToMain(st.scene_id))
    if (error) throw new Error(`scenes.stage update(${st.scene_id}): ${error.message}`)
    if (count === 0) console.warn(`[persistSceneStagesToDb] scene row not found: ${st.scene_id} → ${writerSceneIdToMain(st.scene_id)}`)
    else n += 1
  }
  return n
}

export async function persistShotsToDb(
  projectId: string,
  shotSequence: ShotSequence,
  // 샷 단위 대사 트랙(#dialogue-v4 2026-07-23) — dialogue 스테이지 산출. null이면 대사 없이 기록
  //   (구 run resume 등). 옛 S.dialogue(무스펙 + chars[0] 화자 추정 + dialogue_summary 폴백)는 폐기.
  dialogue?: DialogueTrack | null,
): Promise<void> {
  if (!UUID_RE.test(projectId)) return // 핸드오프 외 run — DB project 없음

  const existingByShotId = await readShotCarryForwardById(projectId)

  // shot_id → 대사 매핑 (화자 명시 — 옛 chars[0] 추정 제거).
  //   #dialogue-join: 조인 키는 리넘버 전 id(source_shot_id) — 최종 id 로 조인하면 분할 지점
  //   이후 전 샷의 대사가 밀린다. 형제는 첫 자식만 상속. (구 시퀀스는 직접 id 조인으로 폴백.)
  const dialogueByShotId = buildShotDialogueMap(shotSequence.shots, dialogue)

  // 인지 부하 재배분(#p2-pacing → #duration-surgery 2026-08-31): 대사가 확정된 유일한 시점이
  //   여기다 — 발화·액션·신규 정보 기준 needed 로 양방향 수렴(부족 증액 / 과대 감액, 롱테이크 면제).
  const realloc = reallocateShotDurations(shotSequence.shots, dialogueByShotId)
  if (realloc.changed.length) {
    console.log(
      `[persistShotsToDb] 인지 부하 재배분: ${realloc.changed.length}샷 조정 — ` +
        realloc.changed.map((c) => `${c.shot_id} ${c.from}→${c.to}s(need ${c.needed})`).join(', '),
    )
  }
  const seqShots = realloc.shots

  // appearance_key는 L4/C2가 알 수 없는 DB 이미지 슬롯이다. 샷을 행으로 매핑하기 전에
  // 씬의 서사 시점과 override, 해당 캐릭터의 DB appearance만으로 결정론적으로 해소한다.
  const { appearancesByCharacter, scenesById } = await loadShotAppearanceResolutionData(projectId)

  // 자신이 채우는 테이블만 정리 (shots). characters/locations/scenes 는 Tier 1 소관.
  // #F-003 R3(2026-08-13): DELETE 를 파이프라인 소유 행으로 좁힌다 — 채팅/수동 샷(source='manual')은
  //   재런에서 살아남는다. 사고(dc531572)에선 persist(07:14:33)가 채팅(07:14:58)보다 먼저라 16샷이
  //   살았을 뿐, 순서가 반대였다면 통째로 조용히 사라졌다 (architecture §5 원칙 2).
  const { error: shotDeleteErr } = await supabaseAdmin
    .from('shots')
    .delete()
    .eq('project_id', projectId)
    .eq('source', 'pipeline')
  assertDbOk('shots delete', shotDeleteErr)
  // 생존(수동) 행의 shot_id — UNIQUE(project_id, shot_id) 충돌 시 수동이 이긴다(씬 쪽과 동일 정책).
  const { data: survivorShots, error: survShErr } = await supabaseAdmin
    .from('shots')
    .select('shot_id')
    .eq('project_id', projectId)
  assertDbOk('shots survivors', survShErr)
  const takenShotIds = new Set((survivorShots ?? []).map((s) => s.shot_id as string))

  // shots (shot_sequence — 대사 보유)
  if (seqShots.length) {
    // 언어 경계(S3): action_description(파이프라인 산출) → EN base 파생(이미 영어면 skip). 표시는 _native.
    // S 블록 누락 방어(#long-writer-run 2026-07-15): 분할 샷이 S 없이 오면 직전 샷의 씬으로
    //   귀속시킨다(분할은 원본 위치 삽입이라 이웃과 같은 씬) — 한 샷 결손이 전체 persist를
    //   죽이던 것(47a62d1d: shots 0행) 방지. 스테이지 쪽 보정과 이중 방어.
    let lastSceneId = ''
    const shRowsAll: PersistShotDraft[] = seqShots.map((it, i) => {
      const sceneId = it.S?.scene_id ?? lastSceneId
      if (!it.S?.scene_id) {
        console.warn(`[persistShotsToDb] shot ${it.shot_id}: S.scene_id 누락 → 직전 씬(${sceneId})으로 귀속`)
      }
      lastSceneId = sceneId
      const blockingChars = (it.assets?.characters ?? [])
        .map((c) => c.id)
        .filter((id): id is string => typeof id === 'string')
      // #w-a(2026-08-31 오너 확정): characters = blocking ∪ 대사 화자. v4 blocking 은 '연기 주체'만
      //   나열하는 습성이 있어(감사 W2) 화자·원경 인물이 빠지면 캐릭터 시트 미동봉 → 익명 렌더.
      //   전 프로젝트 실측: 화자인데 characters 에 없는 샷 151건 — 결정론 합집합이 최종 방어선.
      const speakerChars = (dialogueByShotId.get(it.shot_id)?.dialogue ?? [])
        .map((l) => l.character_id)
        .filter((id): id is string => typeof id === 'string' && !!id)
      const chars = [...new Set([...blockingChars, ...speakerChars])]
      const characterAppearanceKeys: Record<string, string> = {}
      const sceneMainId = writerSceneIdToMain(sceneId)
      const sceneAppearance = scenesById.get(sceneMainId)
      if (!sceneAppearance) {
        throw new Error(
          `[persistShotsToDb] shot ${it.shot_id} references scene ${sceneMainId} without persisted narrative_time`,
        )
      }
      for (const characterId of new Set(chars)) {
        const character = it.assets.characters.find((asset) => asset.id === characterId)
        const explicitAppearanceKey =
          typeof character?.appearance_key === 'string' && character.appearance_key.trim()
            ? character.appearance_key
            : undefined
        const appearanceOverride = explicitAppearanceKey ?? sceneAppearance.overrides[characterId]
        characterAppearanceKeys[characterId] = resolveCharacterAppearance(
          sceneAppearance.narrativeTime,
          appearancesByCharacter.get(characterId) ?? [],
          appearanceOverride,
        )
      }
      // rich 생성 프롬프트(구도/의상/인물 명시) — 스토리보드·영상 생성이 쓰는 shots.prompt 로 저장.
      //   추상 연출의도(character_action)가 아니라 이 값이 이미지/영상 모델에 들어가야 정체성/의상이 고정된다.
      const rich = it as typeof it & {
        first_frame_generation?: { composition_prompt?: string }
        static_spec?: Partial<ShotStaticSpec>
        dynamic_spec?: ShotDynamicSpec
      }
      const composition = (
        rich.first_frame_generation?.composition_prompt ??
        rich.static_spec?.first_frame_prompt ??
        ''
      ).trim()
      const staticSpec = toFacetSpec(rich.static_spec)
      return {
        sceneMainId: writerSceneIdToMain(sceneId),
        shotMainId: writerShotIdToMain(it.shot_id, sceneId),
        shotType: normShotType(it.V?.camera?.type),
        actionNative: it.S?.character_action ?? '',
        composition,
        staticSpec,
        dynamicSpec: rich.dynamic_spec ?? null,
        promptSourceHash: safeFacetsHash(staticSpec),
        chars: Array.from(new Set(chars)),
        characterAppearanceKeys,
        // #dialogue-v4: 대사 트랙(화자 명시)에서 조회 — it.shot_id는 decoupage 표준화 id 그대로.
        shotDialogue: dialogueByShotId.get(it.shot_id) ?? null,
        duration: clampShotSeconds(it.duration_seconds), // #9 페이싱 상한
        i,
        designRef: it.design_ref ?? null,
        checkNotes: it.check_notes?.length ? it.check_notes : null,
      }
    })
    // #F-003 R3: 생존한 수동 샷과 shot_id 충돌 — 수동 우선 스킵(정책 근거는 위 delete 주석).
    const collidedShots = shRowsAll.filter((r) => takenShotIds.has(r.shotMainId))
    if (collidedShots.length) {
      console.warn(
        `[persistShotsToDb] 수동 샷과 shot_id 충돌 — 파이프라인 행 ${collidedShots.length}건 스킵(수동 우선): ` +
          collidedShots.map((r) => r.shotMainId).join(', '),
      )
    }
    const shRows = collidedShots.length
      ? shRowsAll.filter((r) => !takenShotIds.has(r.shotMainId))
      : shRowsAll
    const actionEn = await deriveEnBatch(
      shRows.map((r) => ({ id: r.shotMainId, native: r.actionNative })),
      'shot action description',
    )
    const prompts = await resolvePersistShotPrompts(shRows, actionEn, existingByShotId)
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
    const { error: shotInsertErr } = await supabaseAdmin.from('shots').insert(
      shRows.map((r) => {
        const actTx = !isTargetScript(r.actionNative, locale) && actionKo.has(r.shotMainId)
        const promptValue = prompts.get(r.shotMainId) ?? defaultPersistPrompt(r, actionEn)
        // #p2-wiring 가드: 프롬프트 공란 persist 는 하류(실사/영상)를 추상 폴백에 밀어넣는다 —
        //   과거 실측(25샷 prompt='')의 재발을 로그로 가시화 (composition·action 모두 빈 경우만 남는다).
        if (!promptValue.trim()) {
          console.warn(`[persistShotsToDb] shot ${r.shotMainId}: 생성 프롬프트 공란 — composition/action 모두 비어 있음`)
        }
        const row = {
          project_id: projectId,
          scene_id: r.sceneMainId,
          shot_id: r.shotMainId,
          source: 'pipeline', // #F-003 R3 — 이 행은 재런 시 파이프라인이 갈아엎는다
          shot_type: r.shotType,
          action_description: actionEn.get(r.shotMainId) ?? r.actionNative,
          action_description_native: actionKo.get(r.shotMainId) ?? r.actionNative,
          i18n_provenance: {
            action_description: i18nHash(r.actionNative),
            ...(actTx ? { action_description_native: i18nHash(actionEn.get(r.shotMainId) ?? r.actionNative) } : {}),
          },
          characters: r.chars,
          character_appearance_keys: r.characterAppearanceKeys,
          // 생성 프롬프트: flag off 는 rich composition → action, flag on 은 static_spec facet 렌더(캐시 가능).
          prompt: promptValue,
          static_spec: r.staticSpec ?? null,
          // #motion-contract: 영상 모션 계약 소스(생성-비디오 라우트가 컴파일해 프롬프트에 주입).
          dynamic_spec: r.dynamicSpec ?? null,
          prompt_source_hash: r.promptSourceHash,
          // #p2-wiring: 러프보드 spec 조인 provenance + shotCheck 채널1 제약 운반.
          design_ref: r.designRef,
          check_notes: r.checkNotes,
          duration_seconds: r.duration,
          generation_method: 'I2V',
          // #dialogue-v4: 화자 명시 대사 라인 (옛 chars[0] 화자 추정·dialogue_summary 폴백 폐기).
          //   내레이션(V.O.)은 characterId null 라인으로 — 뷰가 'V.O.'로 표기.
          dialogue_lines: r.shotDialogue
            ? [
                ...r.shotDialogue.dialogue.map((l) => ({
                  characterId: l.character_id,
                  text: l.line,
                  emotion: '',
                  delivery: l.delivery ?? '',
                  // #d6: 실발화 초(캘리브레이션 소스 SHOT_PACING) — 영상 프롬프트가 발화 길이를 알게 한다.
                  durationHint: Math.round(speechSecondsForText(l.line) * 10) / 10,
                })),
                ...(r.shotDialogue.narration
                  ? [{ characterId: null, text: r.shotDialogue.narration, emotion: '', delivery: 'V.O.', durationHint: Math.round(speechSecondsForText(r.shotDialogue.narration) * 10) / 10 }]
                  : []),
              ]
            : [],
          camera_config: { ...DEFAULT_CAMERA },
          lighting_config: { ...DEFAULT_LIGHTING },
          sort_order: r.i,
        }
        return applyShotCarryForward(row, existingByShotId.get(r.shotMainId))
      }),
    )
    assertDbOk('shots insert', shotInsertErr)

    // scene 길이를 데쿠파주(shots) duration 합으로 수렴 (2026-06-24).
    //   scene.estimated_seconds 는 s3_scenes(Story축)가 shot 분해 *전* playtime 을 배분한 추정이라
    //   실제 shot duration 합과 어긋난다(축 독립 생성). shots 가 확정된 직후, 그 합을 진실로 삼아 갱신.
    //   기본값(?? 5)은 insert 의 duration_seconds 와 동일하게 맞춘다.
    const secondsByScene = new Map<string, number>()
    let lastSumSceneId = ''
    for (const it of seqShots) {
      // S 누락 방어 — 위 shRows 와 동일한 직전-씬 귀속 규칙.
      lastSumSceneId = it.S?.scene_id ?? lastSumSceneId
      if (!lastSumSceneId) continue
      const sid = writerSceneIdToMain(lastSumSceneId)
      // 클램프된 shot 길이 합 = insert 의 duration 과 일치(#9).
      secondsByScene.set(sid, (secondsByScene.get(sid) ?? 0) + clampShotSeconds(it.duration_seconds))
    }
    await Promise.all(
      [...secondsByScene].map(async ([sceneId, sum]) => {
        const { error } = await supabaseAdmin
          .from('scenes')
          .update({ estimated_duration_seconds: sum })
          .eq('project_id', projectId)
          .eq('scene_id', sceneId)
        assertDbOk(`scenes duration update(${sceneId})`, error)
      }),
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
