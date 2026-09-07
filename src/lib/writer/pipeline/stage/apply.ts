// 무대 → 샷 적용(#stage 2026-09-03): v4 가 고른 camera_setup 과 무대의 비트 상태에서 카메라를 풀고,
//   인물의 화면 안 위치·깊이·크기·향(screen_layout)을 계산해 character_blocking 을 그 진실로 맞춘다.
//   LLM 이 적은 position_in_frame 은 여기서 덮어쓴다(좌우 뒤집힘의 원천 제거). 화면 안 포함 여부도
//   기하로 결정한다 — 프레임에 들어온 무대 인물은 blocking 에 추가되고, 안 들어온 비피사체는 빠진다.
import type {
  CompassDir,
  DecoupageShot,
  SceneStage,
  ShotCameraSetup,
  ShotDesign,
  ShotScreenLayout,
  ShotStaticSpec,
  StageCharacterState,
  ValidationIssue,
  FacingWord,
} from '@/lib/writer/types/pipeline'
import {
  aspectRatioOf,
  axisSide,
  compassVector,
  distanceScaleForMotion,
  facingVector,
  hfovRad,
  isCompassDir,
  lineOfSightObstructions,
  nearestCompassDir,
  placeCharacter,
  resolveSubjectPoints,
  solveCamera,
  COMPASS_DIRS,
  DEFAULT_CHARACTER_HEIGHT_M,
} from '@/lib/writer/pipeline/stage/geometry'
import { landmarksInView } from '@/lib/writer/pipeline/stage/view'
import type { StageCamera } from '@/lib/writer/types/pipeline'

export interface ApplyStageResult {
  shots: ShotDesign[]
  issues: ValidationIssue[]
}

/** 비트 번호의 무대 상태 — 없는 비트는 직전 비트의 끝 상태(없으면 시작 상태)로 잇는다. */
export function stageStatesForBeat(stage: SceneStage, beat: number): { start: StageCharacterState[]; end: StageCharacterState[]; beatUsed: number } {
  const sorted = [...stage.beats].sort((a, b) => a.beat - b.beat)
  if (sorted.length === 0) return { start: [], end: [], beatUsed: beat }
  const exact = sorted.find((b) => b.beat === beat)
  if (exact) return { start: exact.characters, end: exact.end_characters ?? exact.characters, beatUsed: beat }
  const prev = [...sorted].reverse().find((b) => b.beat < beat) ?? sorted[0]
  const carried = prev.end_characters ?? prev.characters
  return { start: carried, end: carried, beatUsed: prev.beat }
}

/** 전이 소유권 핀: 소유 샷이 아닌 샷은 그 인물을 비트 시작('start') 또는 끝('end') 상태로 고정한다 — 변화는 한 샷만 보여준다. */
export function pinStates(
  states: { start: StageCharacterState[]; end: StageCharacterState[]; beatUsed: number },
  pins?: ReadonlyMap<string, 'start' | 'end'>,
): { start: StageCharacterState[]; end: StageCharacterState[]; beatUsed: number } {
  if (!pins || pins.size === 0) return states
  const pick = (id: string, which: 'start' | 'end') => (which === 'start' ? states.start : states.end).find((c) => c.character_id === id)
  const start = states.start.map((c) => {
    const p = pins.get(c.character_id)
    return p === 'end' ? (pick(c.character_id, 'end') ?? c) : c
  })
  const end = states.end.map((c) => {
    const p = pins.get(c.character_id)
    return p === 'start' ? (pick(c.character_id, 'start') ?? c) : c
  })
  const same = start.length === end.length && start.every((c, i) => c === end[i])
  return { start, end: same ? start : end, beatUsed: states.beatUsed }
}

/** 샷의 비트 — 데쿠파주 source_beats 첫 값. 추가(added) 샷은 직전 샷의 비트를 잇는다. */
export function beatForShot(shot: ShotDesign, dec: DecoupageShot | null | undefined, prevBeat: number): number {
  if (dec) {
    // 데쿠파주가 진실: source_beats 첫 값. 비어 있으면 added 샷 — 직전 샷의 비트를 잇는다.
    const fromDec = dec.source_beats?.length ? dec.source_beats[0] : undefined
    return typeof fromDec === 'number' && Number.isFinite(fromDec) ? fromDec : Math.max(0, prevBeat)
  }
  const fromIntent = shot.intent?.source_beats?.length ? shot.intent.source_beats[0] : undefined
  if (typeof fromIntent === 'number' && Number.isFinite(fromIntent)) return fromIntent
  // 데쿠파주 없는 레거시(plan 구동)만 story_beat_ref 를 믿는다 — LLM echo 라 데쿠파주가 있으면 쓰지 않는다.
  const ref = shot.intent?.story_beat_ref
  if (typeof ref === 'number' && Number.isFinite(ref) && ref >= 0) return ref
  return Math.max(0, prevBeat)
}

function heightToAngle(height: ShotCameraSetup['height']): string {
  return height === 'low' ? 'low_angle' : height === 'high' ? 'high_angle' : height === 'overhead' ? 'overhead' : 'eye_level'
}
function angleToHeight(angle: unknown): ShotCameraSetup['height'] {
  const a = String(angle ?? '').toLowerCase()
  if (/overhead|bird|top_down/.test(a)) return 'overhead'
  if (/low|worm/.test(a)) return 'low'
  if (/high/.test(a)) return 'high'
  return 'eye'
}

/** 축의 camera_side 쪽을 가리키는 나침반 방향 — 축이 없으면 S. */
function defaultDirection(stage: SceneStage, states: StageCharacterState[]): CompassDir {
  if (!stage.axis) return 'S'
  const find = (id: string) => {
    const c = states.find((s) => s.character_id === id)
    if (c) return { x: c.x, y: c.y }
    const l = stage.landmarks.find((m) => m.id === id)
    return l ? { x: l.x, y: l.y } : null
  }
  const from = find(stage.axis.from)
  const to = find(stage.axis.to)
  if (!from || !to) return 'S'
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  let best: CompassDir = 'S'
  let bestScore = -Infinity
  for (const d of COMPASS_DIRS) {
    const v = compassVector(d)
    const p = { x: mid.x + v.x * 3, y: mid.y + v.y * 3 }
    if (axisSide(from, to, p) !== stage.camera_side) continue
    // 축에 수직에 가까운 방향 우선 — 정면(축 위에서)이 아닌 쪽
    const ax = to.x - from.x
    const ay = to.y - from.y
    const al = Math.hypot(ax, ay) || 1
    const score = Math.abs(v.x * (ay / al) - v.y * (ax / al))
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

/** camera_setup 이 없는 샷(구 run·모델 누락)의 기본값 — 이슈로 남긴다. */
export function defaultCameraSetup(spec: ShotStaticSpec, stage: SceneStage, states: StageCharacterState[]): ShotCameraSetup {
  const first = spec.character_blocking?.[0]?.character_id
  return {
    subject: first && states.some((s) => s.character_id === first) ? first : 'group',
    from_direction: defaultDirection(stage, states),
    height: angleToHeight(spec.camera_angle),
    lens_mm: Number.isFinite(spec.lens_mm) && spec.lens_mm > 0 ? spec.lens_mm : 35,
    axis_cross: 'none',
  }
}

function normalizeSetup(raw: unknown, spec: ShotStaticSpec, stage: SceneStage, states: StageCharacterState[]): { setup: ShotCameraSetup; defaulted: boolean } {
  if (!raw || typeof raw !== 'object') return { setup: defaultCameraSetup(spec, stage, states), defaulted: true }
  const r = raw as Record<string, unknown>
  const subject =
    typeof r.subject === 'string' && r.subject.trim() ? r.subject.trim()
    : Array.isArray(r.subject) ? r.subject.filter((s): s is string => typeof s === 'string' && !!s.trim()).map((s) => s.trim())
    : 'group'
  const heightRaw = String(r.height ?? '').toLowerCase()
  const height: ShotCameraSetup['height'] =
    heightRaw === 'low' || heightRaw === 'high' || heightRaw === 'overhead' ? heightRaw : heightRaw === 'eye' ? 'eye' : angleToHeight(spec.camera_angle)
  const lensRaw = Number(r.lens_mm)
  const lens = Number.isFinite(lensRaw) && lensRaw > 0 ? lensRaw : Number.isFinite(spec.lens_mm) && spec.lens_mm > 0 ? spec.lens_mm : 35
  const endRaw = r.end && typeof r.end === 'object' ? (r.end as Record<string, unknown>) : null
  const end = endRaw
    ? {
        ...(isCompassDir(endRaw.from_direction) ? { from_direction: endRaw.from_direction } : {}),
        ...(Number.isFinite(Number(endRaw.distance_scale)) && Number(endRaw.distance_scale) > 0 ? { distance_scale: Number(endRaw.distance_scale) } : {}),
        // #camera-motivation reveal: 드러날 대상 id — 기하가 START 밖·END 안을 검사한다.
        ...(typeof endRaw.subject === 'string' && endRaw.subject.trim() ? { subject: endRaw.subject.trim() } : {}),
      }
    : null
  const setup: ShotCameraSetup = {
    subject: Array.isArray(subject) && subject.length === 0 ? 'group' : subject,
    from_direction: isCompassDir(r.from_direction) ? r.from_direction : defaultDirection(stage, states),
    height,
    lens_mm: lens,
    over_shoulder_of: typeof r.over_shoulder_of === 'string' && r.over_shoulder_of.trim() ? r.over_shoulder_of.trim() : null,
    axis_cross: r.axis_cross === 'motivated' ? 'motivated' : 'none',
    end: end && Object.keys(end).length ? end : null,
    // #camera-motivation pov: 시점 주인 — 카메라가 이 인물의 눈에 놓인다.
    pov_of: typeof r.pov_of === 'string' && r.pov_of.trim() ? r.pov_of.trim() : null,
  }
  return { setup, defaulted: false }
}

/** 시점(pov) 카메라 — 인물의 눈 위치·높이에서 그 인물의 향을 본다. 피사체 거리는 setup.subject 까지(없으면 6m). */
function povCamera(
  owner: StageCharacterState,
  setup: ShotCameraSetup,
  stage: SceneStage,
  states: StageCharacterState[],
): { camera: StageCamera; subjectCenter: { x: number; y: number }; subjectDistance: number; axisCorrected: boolean; issues: string[] } {
  const lens = Number.isFinite(setup.lens_mm) && setup.lens_mm > 0 ? setup.lens_mm : 35
  const h = owner.height_m ?? DEFAULT_CHARACTER_HEIGHT_M
  const eyeZ = owner.posture === 'lying' ? h * 0.2 : owner.posture === 'sitting' || owner.posture === 'kneeling' || owner.posture === 'crouching' ? h * 0.6 : h * 0.93
  const f = facingVector(owner.facing_deg)
  const others = states.filter((s) => s.character_id !== owner.character_id)
  const pts = resolveSubjectPoints(setup.subject, others, stage.landmarks).filter((p) => p.id !== owner.character_id)
  const center = pts.length
    ? { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length }
    : { x: owner.x + f.x * 6, y: owner.y + f.y * 6 }
  const dist = Math.max(0.5, Math.hypot(center.x - owner.x, center.y - owner.y))
  // 시선은 인물의 향을 따른다 — 피사체가 향 밖에 있으면 향이 우선(카메라는 그 인물의 눈이지 피사체 추적기가 아니다).
  const look = { x: owner.x + f.x * dist, y: owner.y + f.y * dist, z: Math.max(0.3, eyeZ * 0.95) }
  const camera: StageCamera = { x: owner.x, y: owner.y, z: eyeZ, look_at: look, lens_mm: lens, hfov_deg: Math.round((hfovRad(lens) * 180) / Math.PI * 100) / 100 }
  return { camera, subjectCenter: center, subjectDistance: dist, axisCorrected: false, issues: [] }
}

const POSTURE_WORD: Record<string, string> = {
  standing: 'standing', sitting: 'sitting', kneeling: 'kneeling', crouching: 'crouching', lying: 'lying down',
  walking: 'walking', running: 'running', floating: 'floating', other: 'present',
}
function gazeFromFacing(f: FacingWord): string {
  if (f === 'front') return 'toward_camera'
  if (f === 'back') return 'away_from_camera'
  return f.endsWith('_left') ? 'toward_left' : 'toward_right'
}

function subjectIds(setup: ShotCameraSetup): string[] {
  if (setup.subject === 'group') return []
  return Array.isArray(setup.subject) ? setup.subject : [setup.subject]
}

/**
 * 한 씬의 샷들에 무대를 적용한다. 샷 순서대로 비트를 잇고, 샷마다 START/END 카메라·배치를 계산해
 *   static_spec.screen_layout 과 character_blocking(위치·포함 여부)을 갱신한다.
 */
/** 명단 규칙(2026-09-05, 오너 승인): 화면 높이 8% 미만 인물은 blocking 에서 빼고 "먼 인물"로만 서술한다. */
export const DISTANT_APPARENT_HEIGHT = 0.08

export function applyStageToShots(
  shots: ShotDesign[],
  stage: SceneStage,
  sceneDec: DecoupageShot[] | null,
  opts?: {
    format?: string | null
    aspect?: number
    /** 전이 소유권 핀(ledger.transitionPins): 샷별 인물을 비트 시작('start') 또는 끝('end') 상태로 고정한다. */
    pins?: ReadonlyMap<string, ReadonlyMap<string, 'start' | 'end'>>
    /** 사람이 읽는 이름 — 프레임 밖 봉인 제약 문장에 쓴다. */
    names?: ReadonlyMap<string, string>
  },
): ApplyStageResult {
  const aspect = opts?.aspect ?? aspectRatioOf(opts?.format)
  const issues: ValidationIssue[] = []
  let prevBeat = stage.beats[0]?.beat ?? 0
  const decById = new Map((sceneDec ?? []).map((d) => [d.shot_id, d]))
  // #pair-axis(2026-09-03, 실측 겨울_4 27→28): 씬 축 하나로는 세 인물의 모든 쌍을 못 지킨다. 두 인물이 함께
  //   프레임에 잡힌 첫 샷에서 그 쌍의 선에 대한 카메라 쪽을 기억하고, 이후 샷이 반대편이면 방향을 그 선에
  //   반사한다(같은 거리). 못 고치면 경고. 어깨 너머·동기 있는 축 이동은 제외.
  const pairSides = new Map<string, 'left' | 'right'>()

  const out = shots.map((shot, i) => {
    const spec = shot.static_spec
    const shotId = shot.intent?.shot_id ?? spec?.shot_id ?? `shot_${i + 1}`
    if (!spec) return shot
    const dec = decById.get(shotId) ?? sceneDec?.[i] ?? null
    const beat = beatForShot(shot, dec, prevBeat)
    prevBeat = beat
    const states = pinStates(stageStatesForBeat(stage, beat), opts?.pins?.get(shotId))
    if (states.start.length === 0) return shot
    const push = (severity: ValidationIssue['severity'], message: string, suggestion?: string) =>
      issues.push({ category: 'cinematography', severity, location: shotId, message, ...(suggestion ? { suggestion } : {}) })
    const nameOf = (id: string) => opts?.names?.get(id) ?? id

    const { setup, defaulted } = normalizeSetup(spec.camera_setup, spec, stage, states.start)
    if (defaulted) push('WARNING', 'camera_setup 이 없어 기본 카메라(축 안쪽·피사체 첫 인물)로 계산했다', 'v4 출력에 camera_setup 을 채워라')

    const intendedIds = (Array.isArray(spec.character_blocking) ? spec.character_blocking : []).map((b) => b.character_id)
    // #camera-motivation pov: 카메라 = 시점 주인의 눈. 시야 가림·물러섬·쌍 축 보정은 걸지 않는다(카메라가 몸에 붙어 있다).
    const povOwner = setup.pov_of ? states.start.find((c) => c.character_id === setup.pov_of) ?? null : null
    if (setup.pov_of && !povOwner) push('WARNING', `pov_of "${setup.pov_of}" 가 무대에 없어 보통 카메라로 계산했다`)
    const isPov = !!povOwner
    let startSolve = povOwner
      ? povCamera(povOwner, setup, stage, states.start)
      : solveCamera({ setup, shotType: spec.shot_type, aspect, stage, states: states.start, intendedIds })
    const isOts = !isPov && !!setup.over_shoulder_of && states.start.some((c) => c.character_id === setup.over_shoulder_of)
    const tight = /^(ECU|CU|MCU|INSERT)$/i.test(String(spec.shot_type ?? ''))
    const subjectsForSight = new Set(subjectIds(setup))
    if (isOts && setup.over_shoulder_of) subjectsForSight.add(setup.over_shoulder_of)
    // 시야 가림(타이트 샷): 피사체가 아닌 인물이 렌즈 바로 앞을 막으면 카메라 방향을 이웃 나침반으로 돌린다
    //   (씬 축 안쪽 방향만). 실측(겨울_4 sh_01_06): 다가온 수인이 용족 MCU 의 오른쪽 절반을 가렸다.
    if (tight && !isOts && !isPov) {
      const blockers = lineOfSightObstructions(startSolve.camera, states.start, subjectsForSight, aspect, startSolve.subjectDistance)
      if (blockers.length) {
        const order = COMPASS_DIRS
        const i0 = order.indexOf(setup.from_direction)
        const tries = [1, -1, 2, -2, 3, -3, 4].map((k) => order[(i0 + k + order.length * 2) % order.length])
        let fixed = false
        for (const dir of tries) {
          const alt = solveCamera({ setup: { ...setup, from_direction: dir }, shotType: spec.shot_type, aspect, stage, states: states.start, intendedIds })
          if (alt.axisCorrected) continue
          if (lineOfSightObstructions(alt.camera, states.start, subjectsForSight, aspect, alt.subjectDistance).length) continue
          startSolve = alt
          setup.from_direction = dir
          push('INFO', `${blockers.join(', ')} 가 렌즈 앞을 가려 카메라 방향을 ${dir} 로 돌렸다`)
          fixed = true
          break
        }
        if (!fixed) push('WARNING', `${blockers.join(', ')} 가 렌즈 앞을 가리는데 축 안쪽에서 시야가 트인 방향이 없다`, '무대 위치나 샷 사이즈를 조정')
      }
    }
    // 명단 맞춤: LLM 이 화면에 두려던 인물(character_blocking)이 카메라 앞인데 가로로 잘리면 최대 6단계
    //   (×1.2) 물러선다 — 샷은 넓어지지만 의도한 인물이 빠지지 않는다. 뒤에 있는 인물은 물러서도 못 담는다.
    //   단, 타이트한 샷(ECU/CU/MCU/INSERT)은 데쿠파주의 샷 사이즈가 우선 — 물러서지 않고 프레임 밖 인물을 뺀다.
    //   OTS 는 카메라가 어깨 인물에 붙어 있어 물러서기가 의미 없다.
    const listedIds = tight || isOts || isPov ? [] : (Array.isArray(spec.character_blocking) ? spec.character_blocking : []).map((b) => b.character_id)
    let backoff = 1
    for (let k = 0; k < 6 && listedIds.length; k++) {
      const missing = listedIds.filter((id) => {
        const st = states.start.find((c) => c.character_id === id)
        if (!st) return false
        const pl = placeCharacter(startSolve.camera, st, aspect, startSolve.subjectDistance)
        return !pl.in_frame && pl.distance_m > 0.5 && Math.abs(pl.screen_x) > 1 && pl.screen_x !== 0
      })
      if (!missing.length) break
      backoff *= 1.2
      startSolve = solveCamera({ setup, shotType: spec.shot_type, aspect, stage, states: states.start, distanceScale: backoff, intendedIds })
      if (k === 5) push('INFO', `${missing.join(', ')} 를 프레임에 담으려 물러섰지만 끝내 못 담았다`)
    }
    if (backoff > 1) push('INFO', `의도한 인물을 프레임에 담으려 카메라가 ×${Math.round(backoff * 100) / 100} 물러섰다(샷이 지정보다 넓다)`)
    for (const m of startSolve.issues) push(startSolve.axisCorrected && m.includes('축') ? 'WARNING' : 'INFO', m)

    // 쌍 축 검사 — 프레임 안 두 인물의 좌우가 이전 샷과 같은지.
    if (!isOts && !isPov && setup.axis_cross !== 'motivated') {
      for (let pass = 0; pass < 2; pass++) {
        const inFrame = states.start.filter((c) => placeCharacter(startSolve.camera, c, aspect, startSolve.subjectDistance).in_frame)
        let corrected = false
        for (let i = 0; i < inFrame.length && !corrected; i++) {
          for (let j = i + 1; j < inFrame.length && !corrected; j++) {
            const [A, B] = [inFrame[i], inFrame[j]].sort((p, q) => (p.character_id < q.character_id ? -1 : 1))
            const key = `${A.character_id}|${B.character_id}`
            const side = axisSide({ x: A.x, y: A.y }, { x: B.x, y: B.y }, { x: startSolve.camera.x, y: startSolve.camera.y })
            if (side === 'on') continue
            const prev = pairSides.get(key)
            if (!prev) { pairSides.set(key, side); continue }
            if (prev === side) continue
            // 반대편 — 지금 방향에서 가까운 나침반 방향부터 돌려가며, 그 쌍의 선에서 이전 쪽에 놓이고
            //   씬 축 보정도 안 걸리는 첫 방향을 고른다(같은 거리). 카메라가 두 인물의 선과 나란할 때
            //   반사는 제자리라 소용없다 — 회전 탐색이 맞다.
            const cur = nearestCompassDir({ x: startSolve.camera.x - startSolve.subjectCenter.x, y: startSolve.camera.y - startSolve.subjectCenter.y })
            const i0 = COMPASS_DIRS.indexOf(cur)
            const tries = [1, -1, 2, -2, 3, -3, 4].map((k) => COMPASS_DIRS[(i0 + k + COMPASS_DIRS.length * 2) % COMPASS_DIRS.length])
            let fixedDir: typeof cur | null = null
            for (const dir of tries) {
              const alt = solveCamera({ setup: { ...setup, from_direction: dir }, shotType: spec.shot_type, aspect, stage, states: states.start, distanceScale: backoff, intendedIds })
              if (alt.axisCorrected) continue
              const altSide = axisSide({ x: A.x, y: A.y }, { x: B.x, y: B.y }, { x: alt.camera.x, y: alt.camera.y })
              if (altSide !== prev) continue
              startSolve = alt
              fixedDir = dir
              break
            }
            if (fixedDir) {
              setup.from_direction = fixedDir
              push('INFO', `${A.character_id}·${B.character_id} 의 좌우가 이전 샷과 뒤집혀 카메라 방향을 ${fixedDir} 로 돌렸다(쌍 축)`)
              corrected = true
            } else {
              push('WARNING', `${A.character_id}·${B.character_id} 의 좌우가 이전 샷과 뒤집힌다 — 돌려도 못 지켰다`, '카메라 방향·샷 사이즈를 조정하거나 axis_cross:motivated 로 의도 표시')
              pairSides.set(key, side) // 이 뒤 샷은 새 관계를 기준으로
            }
          }
        }
        if (!corrected) break
      }
      // 이 샷이 관계를 다시 세운다 — 다음 샷은 "가장 최근에 함께 잡힌 샷"과 비교한다(인물이 화면에서 이동해
      //   관계가 바뀐 것을 관객이 봤으면 그것이 새 기준이다).
      const inFrameFinal = states.start.filter((c) => placeCharacter(startSolve.camera, c, aspect, startSolve.subjectDistance).in_frame)
      for (let i = 0; i < inFrameFinal.length; i++) {
        for (let j = i + 1; j < inFrameFinal.length; j++) {
          const [A, B] = [inFrameFinal[i], inFrameFinal[j]].sort((p, q) => (p.character_id < q.character_id ? -1 : 1))
          const side = axisSide({ x: A.x, y: A.y }, { x: B.x, y: B.y }, { x: startSolve.camera.x, y: startSolve.camera.y })
          if (side !== 'on') pairSides.set(`${A.character_id}|${B.character_id}`, side)
        }
      }
    }
    // END: 카메라 무브(설정 또는 camera_motion 추정) 또는 비트 안 이동이 있을 때만 별도 계산.
    //   반드시 START 의 **최종** 카메라(시야 가림·물러섬·쌍 축 보정 뒤) 다음에 푼다 — 앞에서 풀면 쌍 축 검사가 카메라를
    //   돌린 뒤에도 END 가 돌리기 전 카메라를 쥐고 있어, 한 발짝도 안 움직인 인물이 화면에서 옮겨간다
    //   (2026-09-07 실측 겨울_6 sh_01_02: 용족이 왼쪽→오른쪽, 향 three_quarter→front).
    const motion = shot.dynamic_spec?.camera_motion
    const endScale = setup.end?.distance_scale ?? distanceScaleForMotion(motion)
    const endDir = setup.end?.from_direction
    const statesChange = states.end !== states.start
    let cameraMoves = endScale !== 1 || (!!endDir && endDir !== setup.from_direction)
    // 카메라가 움직일 때만 END 카메라를 END 피사체 기준으로 다시 푼다. 정지 카메라에서 인물만 이동하면 START 카메라
    //   그대로 END 배치를 계산해야 화면상 이동(멀어짐·좌우 이동)이 남는다(실측 sh_01_30: 다시 풀면 셋이 제자리).
    let endSolve = cameraMoves
      ? solveCamera({ setup, shotType: spec.shot_type, aspect, stage, states: states.end, distanceScale: endScale * backoff, fromDirectionOverride: endDir, intendedIds })
      : statesChange
        ? startSolve
        : null
    // pov: 시점 주인이 비트 끝에 움직였으면 END 카메라도 그 눈을 따라간다.
    if (povOwner) {
      const ownerEnd = states.end.find((c) => c.character_id === povOwner.character_id)
      const moved = !!ownerEnd && (ownerEnd.x !== povOwner.x || ownerEnd.y !== povOwner.y || ownerEnd.facing_deg !== povOwner.facing_deg || ownerEnd.posture !== povOwner.posture)
      endSolve = moved ? povCamera(ownerEnd!, setup, stage, states.end) : statesChange ? startSolve : null
      cameraMoves = moved
    }

    // #camera-motivation reveal: 대상(end.subject)은 START 프레임 밖·END 프레임 안이어야 한다. END 에 없으면
    //   회전형(pan/tilt·무브 없음)은 제자리에서 대상을 향해 돌고, 이동형은 대상을 피사체로 END 카메라를 다시 푼다.
    let reveal: ShotScreenLayout['reveal'] | undefined
    const revealTarget = setup.end?.subject ?? null
    if (revealTarget) {
      const targetPoint = (list: StageCharacterState[]): { x: number; y: number; z: number; character?: StageCharacterState } | null => {
        const ch = list.find((c) => c.character_id === revealTarget)
        if (ch) return { x: ch.x, y: ch.y, z: (ch.height_m ?? DEFAULT_CHARACTER_HEIGHT_M) * 0.6, character: ch }
        const lm = stage.landmarks?.find((l) => l.id === revealTarget)
        return lm ? { x: lm.x, y: lm.y, z: 1 } : null
      }
      const inFrame = (cam: StageCamera, subjectDistance: number, list: StageCharacterState[]): boolean => {
        const p = targetPoint(list)
        if (!p) return false
        if (p.character) return placeCharacter(cam, p.character, aspect, subjectDistance).in_frame
        const lm = stage.landmarks?.find((l) => l.id === revealTarget)
        return !!lm && landmarksInView(cam, [lm], aspect).length > 0
      }
      const pEnd = targetPoint(states.end)
      if (!pEnd) {
        push('WARNING', `리빌 대상 "${revealTarget}" 이 무대에 없다`, 'camera_setup.end.subject 를 무대의 인물·표지 id 로')
      } else {
        const inStart = inFrame(startSolve.camera, startSolve.subjectDistance, states.start)
        const baseEnd = endSolve ?? startSolve
        let inEnd = inFrame(baseEnd.camera, baseEnd.subjectDistance, states.end)
        let resolved = false
        if (!inEnd) {
          const rotational = !cameraMoves || /^(pan|tilt)$/i.test(String(motion?.type ?? ''))
          const turned: StageCamera = { ...baseEnd.camera, look_at: { x: pEnd.x, y: pEnd.y, z: pEnd.z } }
          const alt = rotational
            ? { ...baseEnd, camera: turned }
            : solveCamera({ setup: { ...setup, subject: revealTarget }, shotType: spec.shot_type, aspect, stage, states: states.end, distanceScale: endScale * backoff, fromDirectionOverride: endDir, intendedIds })
          if (inFrame(alt.camera, alt.subjectDistance, states.end)) {
            endSolve = alt
            cameraMoves = true
            inEnd = true
            resolved = true
            push('INFO', `리빌 대상 ${nameOf(revealTarget)} 을 END 프레임에 들이려 END 카메라를 ${rotational ? '제자리에서 돌렸다' : '대상 쪽으로 다시 풀었다'}`)
          }
        }
        if (inStart) push('INFO', `리빌 대상 ${nameOf(revealTarget)} 이 START 프레임에 이미 있다 — 드러남이 아니다`)
        if (!inEnd) push('WARNING', `리빌 대상 ${nameOf(revealTarget)} 이 END 프레임에도 들어오지 않는다`, 'camera_setup.end 의 방향·거리나 무대 위치를 조정')
        reveal = { target: revealTarget, in_start: inStart, in_end: inEnd, resolved }
      }
    }

    const placementsStart = new Map(states.start.map((s) => [s.character_id, placeCharacter(startSolve.camera, s, aspect, startSolve.subjectDistance)]))
    const placementsEnd = endSolve
      ? new Map(states.end.map((s) => [s.character_id, placeCharacter(endSolve.camera, s, aspect, endSolve.subjectDistance)]))
      : null

    const listed = Array.isArray(spec.character_blocking) ? spec.character_blocking : []
    const listedById = new Map(listed.map((b) => [b.character_id, b]))
    const subjects = new Set(subjectIds(setup))
    const orderedIds = [
      ...listed.map((b) => b.character_id).filter((id) => placementsStart.has(id)),
      ...states.start.map((s) => s.character_id).filter((id) => !listedById.has(id)),
    ]
    const blocking: ShotStaticSpec['character_blocking'] = []
    const layoutChars: ShotScreenLayout['characters'] = []
    const offFrame: string[] = []
    for (const id of orderedIds) {
      const start = placementsStart.get(id)!
      const end = placementsEnd?.get(id)
      // pov: 시점 주인은 카메라 자신 — 명단·배치에서 빼고 "그리지 말 것"보다 강한 제약을 붙인다.
      if (povOwner && id === povOwner.character_id) {
        offFrame.push(id)
        issues.push({
          category: 'continuity',
          severity: 'WARNING',
          location: shotId,
          message: `${nameOf(id)} 는 이 샷의 카메라(시점) — 프레임에서 뺐다`,
          constraint_target: 'visual',
          constraint: `${nameOf(id)} (${id}) is the camera in this shot (point-of-view): do not draw ${nameOf(id)} — the frame is what ${nameOf(id)} sees; at most a hand or weapon may enter at the frame edge.`,
        })
        continue
      }
      const visible = start.in_frame || !!end?.in_frame
      const isSubject = subjects.has(id)
      const existing = listedById.get(id)
      if (!visible && !isSubject) {
        if (existing) push('INFO', `${id} 는 이 카메라에서 프레임 밖 — blocking 에서 뺐다`)
        // 프레임 밖 봉인(2026-09-05): 씬에 있지만 이 카메라 밖인 인물은 프롬프트가 "그리지 말 것"으로 못박는다 —
        //   명단에서만 빼면 작가 문장("세 수장")과 참조 시트가 남아 모델이 인물을 지어낸다(겨울_6 sh 5·7 실측).
        offFrame.push(id)
        issues.push({
          category: 'continuity',
          severity: 'WARNING',
          location: shotId,
          message: `${nameOf(id)} 프레임 밖 — "그리지 말 것" 제약을 붙였다`,
          constraint_target: 'visual',
          constraint: `${nameOf(id)} (${id}) is OFF-SCREEN in this shot, not inside the frame at all: do not draw ${nameOf(id)} anywhere in START or END.`,
        })
        continue
      }
      // 명단 규칙: 프레임 안이어도 8% 미만이면 번호 인물이 아니라 "먼 인물" — 시트 참조·자세 문장 없이 배경 실루엣로만.
      const tiny = start.apparent_height < DISTANT_APPARENT_HEIGHT && (!end || end.apparent_height < DISTANT_APPARENT_HEIGHT)
      if (tiny && !isSubject) {
        if (existing) push('INFO', `${id} 는 화면 높이 ${Math.round(start.apparent_height * 100)}% 로 너무 작아 blocking 에서 빼고 먼 인물로 둔다`)
        layoutChars.push({ character_id: id, start, ...(end ? { end } : {}), distant: true })
        continue
      }
      if (!visible && isSubject) push('WARNING', `피사체 ${id} 가 프레임 밖이다 — 샷 사이즈·렌즈·방향을 확인`, 'camera_setup 을 바꾸거나 무대 위치를 조정')
      const state = states.start.find((s) => s.character_id === id)!
      if (existing) {
        blocking.push({ ...existing, position_in_frame: start.position_in_frame })
      } else {
        blocking.push({
          character_id: id,
          position_in_frame: start.position_in_frame,
          pose: `${POSTURE_WORD[state.posture] ?? state.posture}${state.note ? `, ${state.note}` : ''}, in the ${start.depth_band}`,
          gaze: gazeFromFacing(start.facing),
          asset_version: 'v1',
        })
        push('INFO', `${id} 가 이 카메라의 프레임 안에 들어와 blocking 에 추가됐다(${start.position_in_frame}, ${start.depth_band})`)
      }
      layoutChars.push({ character_id: id, start, ...(end ? { end } : {}) })
    }
    // 무대에 없는 인물이 blocking 에 있으면(사물이거나 씬 밖) 그대로 두되 알린다 — 지우면 정체성 참조가 사라진다.
    for (const b of listed) {
      if (!placementsStart.has(b.character_id)) {
        blocking.push(b)
        push('INFO', `${b.character_id} 는 무대에 없어 위치를 계산하지 못했다(LLM 값 유지)`)
      }
    }

    const layout: ShotScreenLayout = {
      beat: states.beatUsed,
      camera: startSolve.camera,
      ...(endSolve && cameraMoves ? { end_camera: endSolve.camera } : {}),
      ...(povOwner ? { pov_of: povOwner.character_id } : {}),
      ...(reveal ? { reveal } : {}),
      ...(startSolve.axisCorrected ? { axis_corrected: true } : {}),
      characters: layoutChars,
      ...(offFrame.length ? { off_frame: offFrame } : {}),
      issues: issues.filter((x) => x.location === shotId && x.severity !== 'INFO').map((x) => x.message),
    }
    const nextSpec: ShotStaticSpec = {
      ...spec,
      lens_mm: setup.lens_mm,
      camera_angle: heightToAngle(setup.height),
      character_blocking: blocking,
      camera_setup: setup,
      screen_layout: layout,
    }
    return { ...shot, static_spec: nextSpec }
  })

  return { shots: out, issues }
}
