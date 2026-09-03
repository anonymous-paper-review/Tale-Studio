// 인물 상태 장부(#ledger 2026-09-03, 무대 진단서 2번) — 순수 함수.
//   무대의 비트별 상태(자세·위치)에서 "변화"를 뽑고, 그 변화가 어느 샷에서 보이는지(프레임 안) 판정한다.
//   보이는 샷에는 그 변화를 character_motion(배경 동작)으로 보충하고, 보이는 샷이 없으면 report_only 이슈로
//   사람에게 알린다. 실측 근거(겨울_4 2026-09-02): 요정·용족이 누움(24)→앉음(25)→섬(26)으로 바뀌는데 어느 샷도
//   그 순간을 보여주지 않았다 — 이야기가 언급한 인물(수인)만 추적됐다.
import type {
  SceneLedger,
  SceneStage,
  ShotDesign,
  StageCharacterState,
  StagePosture,
  StateTransition,
  ValidationIssue,
} from '@/lib/writer/types/pipeline'

const DOWN: ReadonlySet<StagePosture> = new Set(['lying', 'sitting', 'kneeling', 'crouching'])
const UP: ReadonlySet<StagePosture> = new Set(['standing', 'walking', 'running'])
/** 이 거리 이상 옮기면 "이동" 변화 — 화면 위치가 바뀔 만한 크기. */
export const MOVE_THRESHOLD_M = 2.0

/** 자세 변화 → 영어 동작. null = 사소한 변화(서다↔걷다↔뛰다, other) — 보여줄 의무 없음. */
export function postureVerb(from: StagePosture, to: StagePosture): string | null {
  if (from === to) return null
  if (from === 'other' || to === 'other') return null
  if (UP.has(from) && UP.has(to)) return null
  if (from === 'lying' && to === 'sitting') return 'pushes up from lying to a sitting position'
  if (from === 'lying' && UP.has(to)) return 'rises from lying on the ground to standing'
  if (from === 'lying') return `rises from lying to ${to}`
  if (DOWN.has(from) && UP.has(to)) return 'stands up'
  if (UP.has(from) && to === 'sitting') return 'sits down'
  if (UP.has(from) && to === 'kneeling') return 'kneels down'
  if (UP.has(from) && to === 'crouching') return 'crouches down'
  if (UP.has(from) && to === 'lying') return 'lies down'
  if (DOWN.has(from) && DOWN.has(to)) return `shifts from ${from} to ${to}`
  if (from === 'floating') return DOWN.has(to) ? `descends and settles into ${to}` : 'descends and lands on the ground'
  if (to === 'floating') return 'lifts off the ground and floats'
  return `changes from ${from} to ${to}`
}

function distance(a: StageCharacterState, b: StageCharacterState): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function isMajorChange(a: StageCharacterState, b: StageCharacterState): boolean {
  return postureVerb(a.posture, b.posture) !== null || distance(a, b) >= MOVE_THRESHOLD_M
}

/**
 * 비트 사이의 "설명 없는 변화"(직전 비트 끝 ≠ 다음 비트 시작)를 직전 비트의 end_characters 로 옮긴다 —
 *   그래야 그 변화를 보여줄 자리(직전 비트의 샷 END)가 생긴다. 무대 LLM 규칙 7이 놓친 것의 결정론 보정.
 */
export function normalizeStageTransitions(stage: SceneStage): SceneStage {
  const beats = [...stage.beats]
    .sort((a, b) => a.beat - b.beat)
    .map((b) => ({ ...b, characters: b.characters.map((c) => ({ ...c })), ...(b.end_characters ? { end_characters: b.end_characters.map((c) => ({ ...c })) } : {}) }))
  for (let i = 0; i + 1 < beats.length; i++) {
    const cur = beats[i]
    const next = beats[i + 1]
    const endList = (cur.end_characters ?? cur.characters).map((c) => ({ ...c }))
    let changed = false
    for (const n of next.characters) {
      const idx = endList.findIndex((c) => c.character_id === n.character_id)
      if (idx < 0) continue // 직전 비트에 없던 인물 — 첫 비트 검증이 막는다; 여기서는 만들지 않는다
      const e = endList[idx]
      if (isMajorChange(e, n)) {
        endList[idx] = { ...e, x: n.x, y: n.y, facing_deg: n.facing_deg, posture: n.posture, ...(n.note ? { note: n.note } : {}) }
        changed = true
      }
    }
    if (changed) cur.end_characters = endList
  }
  return { ...stage, beats }
}

/** 무대(정규화 뒤)에서 비트 안 변화를 뽑는다. */
export function deriveTransitions(stage: SceneStage): Array<Omit<StateTransition, 'shown_by' | 'injected_into' | 'covered'>> {
  const out: Array<Omit<StateTransition, 'shown_by' | 'injected_into' | 'covered'>> = []
  for (const b of stage.beats) {
    if (!b.end_characters) continue
    for (const s of b.characters) {
      const e = b.end_characters.find((c) => c.character_id === s.character_id)
      if (!e) continue
      const verb = postureVerb(s.posture, e.posture)
      if (verb) out.push({ character_id: s.character_id, beat: b.beat, kind: 'posture', from: s.posture, to: e.posture, verb })
      const d = distance(s, e)
      if (d >= MOVE_THRESHOLD_M) {
        out.push({ character_id: s.character_id, beat: b.beat, kind: 'move', from: `${s.x},${s.y}`, to: `${e.x},${e.y}`, verb: 'walks to a new position', distance_m: Math.round(d * 10) / 10 })
      }
    }
  }
  return out
}

const POSTURE_KO: Record<string, string> = {
  standing: '섬', sitting: '앉음', kneeling: '무릎', crouching: '웅크림', lying: '누움',
  walking: '걸음', running: '달림', floating: '부유', other: '기타',
}

/** 이동 동작을 화면 기준으로 말한다(프레임 안 샷의 START→END 배치에서). */
function moveVerbFromLayout(shot: ShotDesign, characterId: string): string | null {
  const ch = shot.static_spec.screen_layout?.characters.find((c) => c.character_id === characterId)
  if (!ch) return null
  const s = ch.start
  const e = ch.end
  if (!e) return null
  const parts: string[] = []
  const dx = e.screen_x - s.screen_x
  if (Math.abs(dx) > 0.15) parts.push(`toward screen-${dx < 0 ? 'left' : 'right'}`)
  const dh = e.apparent_height - s.apparent_height
  if (dh > 0.15) parts.push('toward the camera')
  else if (dh < -0.15) parts.push('away from the camera')
  if (!e.in_frame && s.in_frame) return `walks out of frame ${dx < 0 ? 'to the left' : dx > 0 ? 'to the right' : 'into the distance'}`
  if (!s.in_frame && e.in_frame) return `walks into frame ${parts.length ? parts.join(' and ') : 'from off-screen'}`
  return `walks ${parts.length ? parts.join(' and ') : 'to a new position'}`
}

export interface ApplyLedgerResult {
  shots: ShotDesign[]
  ledger: SceneLedger
  issues: ValidationIssue[]
}

/**
 * 변화마다 보여주는 샷을 찾고(프레임 안), 그 샷에 동작이 없으면 보충한다. 없으면 report_only 경고.
 *   shots 는 stage/apply 를 거쳐 screen_layout(beat·배치)이 있어야 한다.
 */
export function applyLedgerToShots(
  shots: ShotDesign[],
  stage: SceneStage,
  names?: ReadonlyMap<string, string>,
): ApplyLedgerResult {
  const issues: ValidationIssue[] = []
  const nameOf = (id: string) => names?.get(id) ?? id
  const transitions: StateTransition[] = []
  const out = shots.map((s) => ({ ...s, dynamic_spec: { ...s.dynamic_spec, character_motion: [...(s.dynamic_spec?.character_motion ?? [])] } }))

  for (const t of deriveTransitions(stage)) {
    const candidates = out.filter((s) => s.static_spec.screen_layout?.beat === t.beat)
    const shownBy = candidates.filter((s) => {
      const ch = s.static_spec.screen_layout?.characters.find((c) => c.character_id === t.character_id)
      return !!ch && (ch.start.in_frame || !!ch.end?.in_frame)
    })
    const injected: string[] = []
    let verb = t.verb
    for (const s of shownBy) {
      const sid = s.intent.shot_id
      if (t.kind === 'move') verb = moveVerbFromLayout(s, t.character_id) ?? t.verb
      const motions = s.dynamic_spec.character_motion
      const has = motions.some((m) => m.character_id === t.character_id && m.source !== 'ledger')
      if (!has) {
        motions.push({ character_id: t.character_id, verb, magnitude: 'medium', source: 'ledger' })
        injected.push(sid)
      }
      const label = t.kind === 'posture' ? `${POSTURE_KO[t.from] ?? t.from}→${POSTURE_KO[t.to] ?? t.to}` : `이동 ${t.distance_m}m`
      issues.push({
        category: 'continuity',
        severity: 'WARNING',
        location: sid,
        message: `상태 장부: ${nameOf(t.character_id)} ${label}(비트 ${t.beat})${has ? ' — 작가 동작이 이미 있음' : ' — 배경 동작 보충'}`,
        constraint_target: 'visual',
        constraint: `Continuity of ${nameOf(t.character_id)} (${t.character_id}): during this shot they ${verb}${t.kind === 'posture' ? ` (${t.from} → ${t.to})` : ''}; show the change between START and END.`,
      })
    }
    const covered = shownBy.length > 0
    if (!covered) {
      const label = t.kind === 'posture' ? `${POSTURE_KO[t.from] ?? t.from}→${POSTURE_KO[t.to] ?? t.to}` : `이동 ${t.distance_m}m`
      const beatShots = candidates.map((s) => s.intent.shot_id)
      issues.push({
        category: 'continuity',
        severity: 'WARNING',
        location: beatShots[0] ?? stage.scene_id,
        message: `상태 장부: ${nameOf(t.character_id)} ${label}(비트 ${t.beat})를 보여주는 샷이 없다${beatShots.length ? ` — 비트의 샷 ${beatShots.join(', ')}에서 프레임 밖` : ' — 이 비트를 담는 샷이 없다'}`,
        suggestion: `비트 ${t.beat}의 샷에 ${nameOf(t.character_id)}를 배경으로 넣거나(카메라 방향·샷 사이즈 조정) 샷을 추가`,
        constraint_target: 'report_only',
      })
    }
    transitions.push({ ...t, verb, shown_by: shownBy.map((s) => s.intent.shot_id), injected_into: injected, covered })
  }

  return { shots: out, ledger: { scene_id: stage.scene_id, transitions }, issues }
}
