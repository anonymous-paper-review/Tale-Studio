// writer 파이프라인 결과 → DB 기록 (단일 생산자, §3 일원화)
//
// 기존 generate-scenes(낡은 writer)를 대체한다. lossy 한 adapters.ts 대신, 대사를 보유한
// shot_sequence(ShotSequenceItem.S.dialogue)를 샷 소스로 쓴다.
//
// 매핑:
//   characters ← S2.characters (appearance = appearance_description, costume = L2.costumes[id])
//   locations  ← L2.locations
//   scenes     ← S3.scenes
//   shots      ← shot_sequence.shots (대사 포함)
//
// id: scene/shot 은 main 포맷(sc_01 / sh_01_01)으로 정규화, character 는 writer snake_case 유지
//     → shots.characters 와 characters.character_id 가 동일 id 공간(referential 정합).
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writerSceneIdToMain, writerShotIdToMain } from '@/lib/writer/adapters'
import type { ShotType } from '@/types'
import type {
  Characters,
  Scenes,
  ProductionDesign,
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
  productionDesign: ProductionDesign,
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

  // locations (writer productionDesign.locations — name 은 id 기반, time_of_day 는 미보유)
  if (productionDesign.locations?.length) {
    await supabaseAdmin.from('locations').insert(
      productionDesign.locations.map((loc) => ({
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
    await supabaseAdmin.from('scenes').insert(
      scenes.scenes.map((sc, i) => ({
        project_id: projectId,
        scene_id: writerSceneIdToMain(sc.scene_id),
        narrative_summary: sc.dialogue_summary ?? sc.purpose ?? '',
        original_text_quote: (sc.scene_actions ?? []).join(' '),
        location: sc.location ?? '',
        time_of_day: sc.time_of_day ?? '',
        mood: `${sc.emotion_beat?.start ?? ''} → ${sc.emotion_beat?.end ?? ''}`,
        characters_present: sc.characters_in_scene ?? [],
        estimated_duration_seconds: sc.estimated_seconds ?? 0,
        sort_order: i,
      })),
    )
  }

  // characters: additive (producer-story-gate §4 — 인물=입력). 기존 행(producer·writer-origin)은
  //   보존하고, 새 slug 만 origin='writer' 로 insert + 기존 행은 비어 있는 보강 필드만 채운다.
  //   producer 가 확정한 정체성(name/role/voice/arc/motivation/이미지)은 절대 덮어쓰지 않는다.
  const costumes = productionDesign.costumes ?? {}
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
    await supabaseAdmin.from('shots').insert(
      shotSequence.shots.map((it, i) => {
        const chars = (it.assets?.characters ?? [])
          .map((c) => c.id)
          .filter((id): id is string => typeof id === 'string')
        const dialogue = it.S?.dialogue
        return {
          project_id: projectId,
          scene_id: writerSceneIdToMain(it.S.scene_id),
          shot_id: writerShotIdToMain(it.shot_id, it.S.scene_id),
          shot_type: normShotType(it.V?.camera?.type),
          action_description: it.S?.character_action ?? '',
          characters: Array.from(new Set(chars)),
          duration_seconds: it.duration_seconds ?? 5,
          generation_method: 'I2V',
          dialogue_lines: dialogue
            ? [{ characterId: chars[0] ?? null, text: dialogue, emotion: '', delivery: '', durationHint: 0 }]
            : [],
          camera_config: { ...DEFAULT_CAMERA },
          lighting_config: { ...DEFAULT_LIGHTING },
          sort_order: i,
        }
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
  productionDesign: ProductionDesign,
  shotSequence: ShotSequence,
): Promise<void> {
  await persistAssetsToDb(projectId, characters, scenes, productionDesign)
  await persistShotsToDb(projectId, shotSequence)
}
