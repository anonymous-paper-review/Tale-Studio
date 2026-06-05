// writer(=svc) 파이프라인 결과 → DB 기록 (단일 생산자, §3 일원화)
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
// id: scene/shot 은 main 포맷(sc_01 / sh_01_01)으로 정규화, character 는 svc snake_case 유지
//     → shots.characters 와 characters.character_id 가 동일 id 공간(referential 정합).
import { supabaseAdmin } from '@/lib/supabase/admin'
import { svcSceneIdToMain, svcShotIdToMain } from '@/lib/writer/adapters'
import type { ShotType } from '@/types'
import type {
  S2Block,
  S3Block,
  L2Design,
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
 * writer 파이프라인의 텍스트 결과(S2/S3/L2 + shot_sequence)를 DB에 기록.
 * 기존 행은 project_id 기준 삭제 후 재삽입(idempotent). projectId 는 DB UUID 여야 함.
 * 호출자는 non-blocking 으로 감싼다.
 */
export async function persistManifestToDb(
  projectId: string,
  S2: S2Block,
  S3: S3Block,
  L2: L2Design,
  shotSequence: ShotSequence,
): Promise<void> {
  if (!UUID_RE.test(projectId)) return // 핸드오프 외 run — DB project 없음

  // 기존 데이터 정리 (shots → scenes/characters/locations 순서 무관, 모두 project_id scope)
  await Promise.all([
    supabaseAdmin.from('shots').delete().eq('project_id', projectId),
    supabaseAdmin.from('scenes').delete().eq('project_id', projectId),
    supabaseAdmin.from('characters').delete().eq('project_id', projectId),
    supabaseAdmin.from('locations').delete().eq('project_id', projectId),
  ])

  // characters
  const costumes = L2.costumes ?? {}
  if (S2.characters.length) {
    await supabaseAdmin.from('characters').insert(
      S2.characters.map((c) => ({
        project_id: projectId,
        character_id: c.id,
        name: c.name,
        role: normRole(c.role),
        appearance: c.appearance_description ?? '',
        // 레거시 description 도 채워 기존 소비측(c.description) 무변경 유지. fixed_prompt 는 제거(드롭).
        description: c.appearance_description ?? '',
        costume: costumes[c.id] ?? null,
      })),
    )
  }

  // locations (svc L2.locations — name 은 id 기반, time_of_day 는 미보유)
  if (L2.locations?.length) {
    await supabaseAdmin.from('locations').insert(
      L2.locations.map((loc) => ({
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

  // scenes
  if (S3.scenes.length) {
    await supabaseAdmin.from('scenes').insert(
      S3.scenes.map((sc, i) => ({
        project_id: projectId,
        scene_id: svcSceneIdToMain(sc.scene_id),
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
          scene_id: svcSceneIdToMain(it.S.scene_id),
          shot_id: svcShotIdToMain(it.shot_id, it.S.scene_id),
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
