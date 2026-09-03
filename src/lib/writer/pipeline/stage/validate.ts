// 씬 무대(SceneStage) 추출·정규화·검증(#stage 2026-09-03) — v3s_stage 가 LLM 출력 직후 호출한다.
//   LLM 출력은 제안이다(architecture.md §3). 여기서 결정론적으로 확인하고, CRITICAL 이면 1회 교정
//   재생성, 그래도 남으면 sanitize 로 알 수 없는 id 를 걷어내고 진행한다(조용히 삼키지 않고 이슈로 남긴다).
import type {
  DecoupageShot,
  SceneStage,
  StageBeat,
  StageCharacterState,
  StageLandmark,
  StagePosture,
  ValidationIssue,
} from '@/lib/writer/types/pipeline'

export const STAGE_POSTURES: readonly StagePosture[] = [
  'standing', 'sitting', 'kneeling', 'crouching', 'lying', 'walking', 'running', 'floating', 'other',
]
const POSTURE_SYNONYMS: Record<string, StagePosture> = {
  stand: 'standing', standing: 'standing', upright: 'standing', stands: 'standing',
  sit: 'sitting', sitting: 'sitting', seated: 'sitting', sits: 'sitting',
  kneel: 'kneeling', kneeling: 'kneeling', kneels: 'kneeling',
  crouch: 'crouching', crouching: 'crouching', squatting: 'crouching', squat: 'crouching',
  lie: 'lying', lying: 'lying', lies: 'lying', prone: 'lying', supine: 'lying', 'lying_down': 'lying',
  walk: 'walking', walking: 'walking', walks: 'walking', stepping: 'walking',
  run: 'running', running: 'running', runs: 'running', sprinting: 'running',
  float: 'floating', floating: 'floating', hovering: 'floating', flying: 'floating',
}

export function normalizePosture(raw: unknown): { posture: StagePosture; changed: boolean } {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if ((STAGE_POSTURES as readonly string[]).includes(s)) return { posture: s as StagePosture, changed: false }
  const hit = POSTURE_SYNONYMS[s] ?? POSTURE_SYNONYMS[s.replace(/_.*$/, '')]
  return hit ? { posture: hit, changed: true } : { posture: 'other', changed: true }
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

function normState(raw: unknown): StageCharacterState | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.character_id === 'string' ? r.character_id.trim() : typeof r.id === 'string' ? r.id.trim() : ''
  if (!id) return null
  const facing = ((num(r.facing_deg, 0) % 360) + 360) % 360
  const state: StageCharacterState = {
    character_id: id,
    x: Math.round(num(r.x) * 100) / 100,
    y: Math.round(num(r.y) * 100) / 100,
    facing_deg: Math.round(facing),
    posture: normalizePosture(r.posture).posture,
  }
  const h = num(r.height_m, NaN)
  if (Number.isFinite(h) && h > 0.3 && h < 6) state.height_m = Math.round(h * 100) / 100
  if (typeof r.note === 'string' && r.note.trim()) state.note = r.note.trim().slice(0, 160)
  return state
}

function normLandmark(raw: unknown): StageLandmark | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id.trim() : ''
  if (!id) return null
  return {
    id,
    label: typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 80) : id,
    x: Math.round(num(r.x) * 100) / 100,
    y: Math.round(num(r.y) * 100) / 100,
  }
}

/**
 * LLM 응답 shape 비결정성 방어 — { stage: {...} } / { scene_stage: {...} } / 무대 객체 직접 / [무대].
 *   못 읽으면 null(호출부가 실패로 처리).
 */
export function extractSceneStage(raw: unknown, sceneId: string): SceneStage | null {
  let obj: unknown = raw
  if (Array.isArray(obj)) obj = obj[0]
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>
    if (o.stage && typeof o.stage === 'object') obj = o.stage
    else if (o.scene_stage && typeof o.scene_stage === 'object') obj = o.scene_stage
  }
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const rawBeats = Array.isArray(o.beats) ? o.beats : []
  const beats: StageBeat[] = []
  for (const rb of rawBeats) {
    if (!rb || typeof rb !== 'object') continue
    const b = rb as Record<string, unknown>
    const chars = (Array.isArray(b.characters) ? b.characters : []).map(normState).filter((s): s is StageCharacterState => !!s)
    const endChars = Array.isArray(b.end_characters)
      ? b.end_characters.map(normState).filter((s): s is StageCharacterState => !!s)
      : null
    const beat: StageBeat = { beat: Math.max(0, Math.round(num(b.beat, beats.length))), characters: chars }
    if (typeof b.summary === 'string' && b.summary.trim()) beat.summary = b.summary.trim().slice(0, 200)
    if (endChars && endChars.length) beat.end_characters = endChars
    beats.push(beat)
  }
  beats.sort((a, b) => a.beat - b.beat)
  const axisRaw = o.axis && typeof o.axis === 'object' ? (o.axis as Record<string, unknown>) : null
  const axis =
    axisRaw && typeof axisRaw.from === 'string' && typeof axisRaw.to === 'string' && axisRaw.from !== axisRaw.to
      ? { from: axisRaw.from.trim(), to: axisRaw.to.trim() }
      : null
  const side = String(o.camera_side ?? '').toLowerCase()
  return {
    scene_id: typeof o.scene_id === 'string' && o.scene_id.trim() ? o.scene_id.trim() : sceneId,
    unit: 'm',
    landmarks: (Array.isArray(o.landmarks) ? o.landmarks : []).map(normLandmark).filter((l): l is StageLandmark => !!l).slice(0, 12),
    axis,
    camera_side: side === 'left' ? 'left' : 'right',
    beats,
    ...(typeof o.notes === 'string' && o.notes.trim() ? { notes: o.notes.trim().slice(0, 300) } : {}),
  }
}

export interface SceneStageValidation {
  issues: ValidationIssue[]
  valid: boolean // CRITICAL 없음
}

export interface StageSceneContext {
  scene_id: string
  characters_in_scene: string[]
  scene_actions: string[]
}

const COORD_LIMIT_M = 60
const CROWD_MIN_DISTANCE_M = 0.35

/**
 * 무대 검증 — 인물 전원 배치(첫 비트), 알 수 없는 id, 좌표 범위, 겹침, 데쿠파주가 참조하는 비트의 존재.
 *   personIds: 사람 캐스트 id 집합(사물 캐스트는 무대에 올리지 않는다).
 */
export function validateSceneStage(
  stage: SceneStage,
  scene: StageSceneContext,
  personIds: ReadonlySet<string>,
  decoupageShots?: Pick<DecoupageShot, 'source_beats'>[] | null,
): SceneStageValidation {
  const issues: ValidationIssue[] = []
  const loc = stage.scene_id || scene.scene_id
  const crit = (message: string, suggestion: string) =>
    issues.push({ category: 'cinematography', severity: 'CRITICAL', location: loc, message, suggestion })
  const warn = (message: string, suggestion: string) =>
    issues.push({ category: 'cinematography', severity: 'WARNING', location: loc, message, suggestion })

  const scenePeople = scene.characters_in_scene.filter((id) => personIds.size === 0 || personIds.has(id))
  const known = new Set<string>([...scenePeople, ...personIds])
  const landmarkIds = new Set(stage.landmarks.map((l) => l.id))

  if (stage.beats.length === 0) {
    crit('beats 가 비었다', 'scene_actions 인덱스마다(최소 첫 비트) 인물 전원의 위치를 적어라')
    return { issues, valid: false }
  }

  const first = stage.beats[0]
  const firstIds = new Set(first.characters.map((c) => c.character_id))
  const missing = scenePeople.filter((id) => !firstIds.has(id))
  if (missing.length) {
    crit(`첫 비트(${first.beat})에 씬 인물이 빠졌다: ${missing.join(', ')}`, '씬의 사람 인물 전원을 첫 비트 characters 에 넣어라(화면 밖이어도 어딘가에 있다)')
  }

  const seenUnknown = new Set<string>()
  for (const b of stage.beats) {
    for (const list of [b.characters, b.end_characters ?? []]) {
      for (const c of list) {
        if (!known.has(c.character_id) && !seenUnknown.has(c.character_id)) {
          seenUnknown.add(c.character_id)
          crit(`알 수 없는 인물 id "${c.character_id}" (비트 ${b.beat})`, `씬 인물 id 만 사용: ${scenePeople.join(', ')}`)
        }
        if (Math.abs(c.x) > COORD_LIMIT_M || Math.abs(c.y) > COORD_LIMIT_M) {
          crit(`${c.character_id} 좌표가 무대 범위를 벗어났다 (${c.x}, ${c.y})`, `|x|,|y| ≤ ${COORD_LIMIT_M}m 안에 배치`)
        }
      }
      // 같은 상태 안에서 인물이 겹침
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]
          const c = list[j]
          if (Math.hypot(a.x - c.x, a.y - c.y) < CROWD_MIN_DISTANCE_M) {
            warn(`${a.character_id} 와 ${c.character_id} 가 같은 자리(비트 ${b.beat})`, '0.5m 이상 떨어뜨려라')
          }
        }
      }
      const ids = list.map((c) => c.character_id)
      const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
      if (dup.length) warn(`비트 ${b.beat}에 같은 인물이 두 번: ${[...new Set(dup)].join(', ')}`, '인물당 한 항목')
    }
  }

  if (stage.axis) {
    for (const [label, id] of [['from', stage.axis.from], ['to', stage.axis.to]] as const) {
      if (!known.has(id) && !landmarkIds.has(id)) {
        warn(`axis.${label} "${id}" 가 씬 인물도 표지도 아니다`, '두 주요 인물(또는 인물–표지) id 로 축을 정하라')
      }
    }
  }

  const beatSet = new Set(stage.beats.map((b) => b.beat))
  const referenced = new Set<number>()
  for (const s of decoupageShots ?? []) for (const i of s.source_beats ?? []) referenced.add(i)
  const missingBeats = [...referenced].filter((i) => !beatSet.has(i)).sort((a, b) => a - b)
  if (missingBeats.length) {
    warn(`샷이 참조하는 비트에 무대 상태가 없다: ${missingBeats.join(', ')}`, '그 비트 시작 시점의 인물 위치를 beats 에 추가(직전 비트와 같아도 적는다)')
  }
  const overRange = stage.beats.filter((b) => b.beat >= Math.max(1, scene.scene_actions.length)).map((b) => b.beat)
  if (overRange.length) warn(`scene_actions 범위 밖 비트 번호: ${overRange.join(', ')}`, `비트 인덱스는 0~${Math.max(0, scene.scene_actions.length - 1)}`)

  return { issues, valid: !issues.some((i) => i.severity === 'CRITICAL') }
}

/** 교정 재생성 프롬프트에 붙일 위반 목록. */
export function buildStageCorrectionNote(issues: ValidationIssue[]): string {
  return issues
    .filter((i) => i.severity !== 'INFO')
    .map((i) => `- [${i.severity}] ${i.message}${i.suggestion ? ` → ${i.suggestion}` : ''}`)
    .join('\n')
}

/**
 * 최종 방어 — 알 수 없는 id 와 범위 밖 좌표를 걷어내고, 첫 비트에 빠진 인물은 무대 가장자리에 세운다.
 *   교정 재생성 뒤에도 남은 CRITICAL 을 파이프라인이 죽지 않고 지나가게 한다(이슈는 호출부가 보존).
 */
export function sanitizeSceneStage(stage: SceneStage, scene: StageSceneContext, personIds: ReadonlySet<string>): SceneStage {
  const scenePeople = scene.characters_in_scene.filter((id) => personIds.size === 0 || personIds.has(id))
  const known = new Set<string>([...scenePeople, ...personIds])
  const clamp = (v: number) => Math.max(-COORD_LIMIT_M, Math.min(COORD_LIMIT_M, v))
  const clean = (list: StageCharacterState[]) =>
    list
      .filter((c, i, arr) => known.has(c.character_id) && arr.findIndex((o) => o.character_id === c.character_id) === i)
      .map((c) => ({ ...c, x: clamp(c.x), y: clamp(c.y) }))
  const beats = stage.beats.map((b) => ({
    ...b,
    characters: clean(b.characters),
    ...(b.end_characters ? { end_characters: clean(b.end_characters) } : {}),
  }))
  if (beats.length) {
    const first = beats[0]
    const have = new Set(first.characters.map((c) => c.character_id))
    let k = 0
    for (const id of scenePeople) {
      if (have.has(id)) continue
      // 빠진 인물은 무대 남서쪽 가장자리에 차례로 — 화면 밖에서 시작한다는 뜻.
      first.characters.push({ character_id: id, x: -8 + k * 1.2, y: -8, facing_deg: 0, posture: 'standing', note: 'placed at the stage edge (missing from the plan)' })
      k += 1
    }
  }
  const landmarkIds = new Set(stage.landmarks.map((l) => l.id))
  const axisOk = stage.axis && [stage.axis.from, stage.axis.to].every((id) => known.has(id) || landmarkIds.has(id))
  return { ...stage, beats, axis: axisOk ? stage.axis : null }
}
