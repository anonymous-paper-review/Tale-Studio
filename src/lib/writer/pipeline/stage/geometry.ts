// 씬 무대 기하(#stage 2026-09-03, 무대 진단서 1번) — 순수 함수.
//   무대(세계 좌표) + 샷의 camera_setup → 카메라 위치·화면 안 위치·깊이·크기·향. LLM 은 방향·높이·렌즈·
//   피사체만 고르고, 나머지는 여기서 핀홀 투영으로 계산한다. 180° 축은 선으로 존재하며(camera_side),
//   반대편에 놓인 카메라는 동기(axis_cross='motivated')가 없으면 축 안쪽으로 거울 반사한다.
//   좌표계: x 동, y 북(앞), z 위. facing_deg 0 = +y, 90 = +x(시계 방향).
import type {
  CompassDir,
  DepthBand,
  FacingWord,
  SceneStage,
  ScreenPlacement,
  ScreenPositionWord,
  ShotCameraSetup,
  StageCamera,
  StageCharacterState,
  StageLandmark,
} from '@/lib/writer/types/pipeline'

export const DEFAULT_CHARACTER_HEIGHT_M = 1.75
export const DEFAULT_EYE_HEIGHT_M = 1.5
const SENSOR_HALF_WIDTH_MM = 18
const EPS = 1e-6
/** 축을 넘도록 물러설 때의 여유 — 축 위 인물이 프레임 가장자리에 들어올 만한 거리. */
export const AXIS_BACKOFF_MARGIN_M = 3.0

export type Vec2 = { x: number; y: number }
export type Vec3 = { x: number; y: number; z: number }

/** 프로젝트 포맷 문자열 → 가로/세로 비. 미상은 16:9. */
export function aspectRatioOf(format?: string | null): number {
  const f = (format ?? '').toLowerCase()
  if (f.includes('9:16') || f.includes('vertical')) return 9 / 16
  if (f.includes('2.39') || f.includes('cinema')) return 2.39
  if (f.includes('1:1') || f.includes('square')) return 1
  return 16 / 9
}

const COMPASS: Record<CompassDir, Vec2> = {
  N: { x: 0, y: 1 },
  NE: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  E: { x: 1, y: 0 },
  SE: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  S: { x: 0, y: -1 },
  SW: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  W: { x: -1, y: 0 },
  NW: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
}
export const COMPASS_DIRS: readonly CompassDir[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export function compassVector(dir: CompassDir): Vec2 {
  return COMPASS[dir] ?? COMPASS.S
}

export function isCompassDir(v: unknown): v is CompassDir {
  return typeof v === 'string' && (COMPASS_DIRS as readonly string[]).includes(v)
}

/** facing_deg → 단위 벡터 (0 = +y, 90 = +x). */
export function facingVector(deg: number): Vec2 {
  const r = ((Number.isFinite(deg) ? deg : 0) * Math.PI) / 180
  return { x: Math.sin(r), y: Math.cos(r) }
}

export function hfovRad(lensMm: number): number {
  return 2 * Math.atan(SENSOR_HALF_WIDTH_MM / Math.max(4, lensMm))
}
export function vfovRad(lensMm: number, aspect: number): number {
  return 2 * Math.atan(SENSOR_HALF_WIDTH_MM / Math.max(0.2, aspect) / Math.max(4, lensMm))
}

/** 샷 사이즈 → 프레임 세로에 담을 높이(m). 인물 샷은 몸의 일부, 와이드는 공간. */
export const SHOT_SIZE_VISIBLE_HEIGHT_M: Record<string, number> = {
  ECU: 0.3,
  CU: 0.55,
  MCU: 0.85,
  MS: 1.25,
  OTS: 1.3,
  MFS: 1.6,
  POV: 1.6,
  '2S': 1.7,
  FS: 2.1,
  WS: 4.5,
  EWS: 10,
  INSERT: 0.5,
}
export function visibleHeightFor(shotType: string | undefined | null, subjectHeight = DEFAULT_CHARACTER_HEIGHT_M): number {
  const key = String(shotType ?? 'MS').toUpperCase().trim()
  const base = SHOT_SIZE_VISIBLE_HEIGHT_M[key] ?? SHOT_SIZE_VISIBLE_HEIGHT_M.MS
  // 인물 샷은 키에 비례(어린이·거인) — 와이드는 공간 기준이라 그대로.
  return base <= 2.1 ? base * (subjectHeight / DEFAULT_CHARACTER_HEIGHT_M) : base
}

/** 샷 사이즈·렌즈·화면비에서 피사체까지의 거리(m). */
export function cameraDistanceFor(shotType: string | undefined | null, lensMm: number, aspect: number, subjectHeight = DEFAULT_CHARACTER_HEIGHT_M): number {
  const visible = visibleHeightFor(shotType, subjectHeight)
  const d = visible / (2 * Math.tan(vfovRad(lensMm, aspect) / 2))
  return Math.max(0.6, d)
}

/** 샷 사이즈 → 시선(look_at) 높이 비율(인물 키 대비). */
function lookAtHeightRatio(shotType: string | undefined | null): number {
  const key = String(shotType ?? 'MS').toUpperCase().trim()
  if (key === 'ECU' || key === 'CU' || key === 'MCU') return 0.9
  if (key === 'MS' || key === 'OTS' || key === '2S' || key === 'POV') return 0.7
  return 0.5
}

/** 축의 어느 쪽인가 — from→to 를 바라볼 때 왼쪽/오른쪽. */
export function axisSide(from: Vec2, to: Vec2, p: Vec2): 'left' | 'right' | 'on' {
  const ax = to.x - from.x
  const ay = to.y - from.y
  const cross = ax * (p.y - from.y) - ay * (p.x - from.x)
  if (cross > EPS) return 'left'
  if (cross < -EPS) return 'right'
  return 'on'
}

/** 축(직선)에 대한 거울 반사. */
export function mirrorAcrossAxis(from: Vec2, to: Vec2, p: Vec2): Vec2 {
  const ax = to.x - from.x
  const ay = to.y - from.y
  const len2 = ax * ax + ay * ay
  if (len2 < EPS) return { ...p }
  const t = ((p.x - from.x) * ax + (p.y - from.y) * ay) / len2
  const fx = from.x + t * ax
  const fy = from.y + t * ay
  return { x: 2 * fx - p.x, y: 2 * fy - p.y }
}

export interface SubjectPoint {
  x: number
  y: number
  height: number
  id: string
}

/** subject → 무대 위 점들. 'group' = 인물 전원, 배열 = 각 id, 문자열 = 인물 또는 표지. */
export function resolveSubjectPoints(
  subject: ShotCameraSetup['subject'] | undefined,
  states: StageCharacterState[],
  landmarks: StageLandmark[],
): SubjectPoint[] {
  const charPt = (c: StageCharacterState): SubjectPoint => ({ x: c.x, y: c.y, height: c.height_m ?? DEFAULT_CHARACTER_HEIGHT_M, id: c.character_id })
  if (!subject || subject === 'group') return states.map(charPt)
  const ids = Array.isArray(subject) ? subject : [subject]
  const out: SubjectPoint[] = []
  for (const id of ids) {
    const c = states.find((s) => s.character_id === id)
    if (c) {
      out.push(charPt(c))
      continue
    }
    const l = landmarks.find((m) => m.id === id)
    if (l) out.push({ x: l.x, y: l.y, height: 1.2, id: l.id })
  }
  return out
}

function resolveAxisPoints(stage: SceneStage, states: StageCharacterState[]): { from: Vec2; to: Vec2 } | null {
  if (!stage.axis) return null
  const find = (id: string): Vec2 | null => {
    const c = states.find((s) => s.character_id === id)
    if (c) return { x: c.x, y: c.y }
    const l = stage.landmarks.find((m) => m.id === id)
    return l ? { x: l.x, y: l.y } : null
  }
  const from = find(stage.axis.from)
  const to = find(stage.axis.to)
  if (!from || !to) return null
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.2) return null
  return { from, to }
}

export interface SolveCameraInput {
  setup: ShotCameraSetup
  shotType: string
  aspect: number
  stage: SceneStage
  states: StageCharacterState[]
  /** 카메라 무브 끝 등 — 거리 배율·방향 덮어쓰기 */
  distanceScale?: number
  fromDirectionOverride?: CompassDir
}

export interface SolvedCamera {
  camera: StageCamera
  subjectCenter: Vec2
  subjectDistance: number
  axisCorrected: boolean
  issues: string[]
}

export function solveCamera(input: SolveCameraInput): SolvedCamera {
  const { setup, stage, states, aspect } = input
  const issues: string[] = []
  const lens = Number.isFinite(setup.lens_mm) && setup.lens_mm > 0 ? setup.lens_mm : 35
  let pts = resolveSubjectPoints(setup.subject, states, stage.landmarks)
  if (pts.length === 0) {
    issues.push(`피사체 "${Array.isArray(setup.subject) ? setup.subject.join(',') : String(setup.subject)}" 가 무대에 없어 그룹 중심으로 대체했다`)
    pts = resolveSubjectPoints('group', states, stage.landmarks)
  }
  const center: Vec2 = pts.length
    ? { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length }
    : { x: 0, y: 0 }
  const subjectHeight = pts.length ? pts.reduce((a, p) => a + p.height, 0) / pts.length : DEFAULT_CHARACTER_HEIGHT_M
  // 여러 피사체(그룹)는 서로 벌어진 만큼 더 물러선다 — 가로 폭을 프레임에 담는다.
  const spread = pts.length > 1 ? Math.max(...pts.map((p) => Math.hypot(p.x - center.x, p.y - center.y))) : 0
  const scale = input.distanceScale ?? 1
  let dist = cameraDistanceFor(input.shotType, lens, aspect, subjectHeight) * scale
  if (spread > 0) dist = Math.max(dist, (spread * 1.3) / Math.tan(hfovRad(lens) / 2))

  let cam: Vec2
  let camZ: number
  const lookZ = subjectHeight * lookAtHeightRatio(input.shotType)
  const ots = setup.over_shoulder_of ? states.find((s) => s.character_id === setup.over_shoulder_of) : null
  if (setup.over_shoulder_of && !ots) issues.push(`over_shoulder_of "${setup.over_shoulder_of}" 가 무대에 없어 무시했다`)
  const axis = resolveAxisPoints(stage, states)
  if (ots) {
    // 어깨 너머: 그 인물 뒤 0.9m, 옆으로 0.45m 비켜서 피사체를 본다. 비키는 쪽은 씬 축의 camera_side 쪽을
    //   우선한다(가능할 때). OTS 는 어깨 인물–피사체 선이 자체 축이라 씬 축 보정(반사·물러서기)을 걸지 않는다 —
    //   실측(겨울_4 sh_01_05): 씬 축으로 반사하면 카메라가 피사체 뒤로 넘어가 OTS 가 사라졌다.
    const dx = ots.x - center.x
    const dy = ots.y - center.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const candidates = [+1, -1].map((sgn) => ({ x: ots.x + ux * 0.9 - uy * 0.45 * sgn, y: ots.y + uy * 0.9 + ux * 0.45 * sgn }))
    const onSide = axis ? candidates.find((c) => axisSide(axis.from, axis.to, c) === stage.camera_side) : undefined
    cam = onSide ?? candidates[0]
    if (axis && !onSide) issues.push('어깨 너머 카메라가 씬 축 반대편에 놓인다(어깨 인물 기준 유지 — OTS 는 자체 축)')
    camZ = (ots.height_m ?? DEFAULT_CHARACTER_HEIGHT_M) * 0.9
  } else {
    const dir = compassVector(input.fromDirectionOverride ?? setup.from_direction)
    cam = { x: center.x + dir.x * dist, y: center.y + dir.y * dist }
    camZ =
      setup.height === 'low' ? 0.5
      : setup.height === 'high' ? 2.8
      : setup.height === 'overhead' ? Math.max(6, dist)
      : Math.max(0.9, subjectHeight * 0.88)
  }

  // 180° 축 — 반대편이면 축 안쪽으로 되돌린다(동기 없는 축 넘기 금지).
  //   ① 방향 반사: 피사체가 축 안쪽(또는 축 위)이면 같은 거리에서 방향만 축에 대해 반사한다.
  //   ② 물러서기: 피사체 자체가 축 반대편이면(예: 축 북쪽 5m 에서 다가오는 인물) 같은 방향으로
  //      축을 넘을 때까지 물러선다(+여유 3m) — 샷은 넓어지지만 관객의 좌우가 지켜진다.
  //   ③ 둘 다 안 되면 점 반사(마지막 수단).
  let axisCorrected = false
  if (axis && !ots) {
    const side = axisSide(axis.from, axis.to, cam)
    if (side !== 'on' && side !== stage.camera_side) {
      if (setup.axis_cross === 'motivated') {
        issues.push('카메라가 180° 축을 넘는다(동기 있음 — 유지)')
      } else {
        const ax = axis.to.x - axis.from.x
        const ay = axis.to.y - axis.from.y
        const al = Math.hypot(ax, ay) || 1
        const a = { x: ax / al, y: ay / al }
        const dirRaw = { x: cam.x - center.x, y: cam.y - center.y }
        const dl = Math.hypot(dirRaw.x, dirRaw.y) || 1
        const d = { x: dirRaw.x / dl, y: dirRaw.y / dl }
        // ① 방향 반사: d' = 2(d·a)a − d
        const dot = d.x * a.x + d.y * a.y
        const refl = { x: 2 * dot * a.x - d.x, y: 2 * dot * a.y - d.y }
        const cam1 = { x: center.x + refl.x * dl, y: center.y + refl.y * dl }
        const cross = d.x * a.y - d.y * a.x
        // ② 같은 방향으로 축을 넘는 거리 t: center + d·t 가 축 위 → t = cross(from−center, a) / cross(d, a)
        const t = Math.abs(cross) > EPS ? ((axis.from.x - center.x) * a.y - (axis.from.y - center.y) * a.x) / cross : NaN
        if (axisSide(axis.from, axis.to, cam1) === stage.camera_side) {
          cam = cam1
          issues.push(`카메라가 180° 축 반대편(${side})에 놓여 같은 거리에서 방향을 축 안쪽(${stage.camera_side})으로 반사했다`)
        } else if (Number.isFinite(t) && t > 0) {
          const pushed = t + AXIS_BACKOFF_MARGIN_M
          cam = { x: center.x + d.x * pushed, y: center.y + d.y * pushed }
          issues.push(`피사체가 180° 축 반대편이라 카메라가 같은 방향으로 축을 넘도록 물러섰다(${round(dl)}m → ${round(pushed)}m)`)
        } else {
          cam = mirrorAcrossAxis(axis.from, axis.to, cam)
          issues.push(`카메라가 180° 축 반대편(${side})에 놓여 축 안쪽(${stage.camera_side})으로 점 반사했다`)
        }
        axisCorrected = true
      }
    }
  }

  const camera: StageCamera = {
    x: round(cam.x),
    y: round(cam.y),
    z: round(camZ),
    look_at: { x: round(center.x), y: round(center.y), z: round(lookZ) },
    lens_mm: lens,
    hfov_deg: round((hfovRad(lens) * 180) / Math.PI),
  }
  return {
    camera,
    subjectCenter: center,
    subjectDistance: Math.hypot(camera.x - center.x, camera.y - center.y),
    axisCorrected,
    issues,
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

interface CameraBasis {
  pos: Vec3
  f: Vec3
  r: Vec3
  u: Vec3
  tanH: number
  tanV: number
}

function basisOf(cam: StageCamera, aspect: number): CameraBasis {
  const pos = { x: cam.x, y: cam.y, z: cam.z }
  let f = { x: cam.look_at.x - cam.x, y: cam.look_at.y - cam.y, z: cam.look_at.z - cam.z }
  const fl = Math.hypot(f.x, f.y, f.z) || 1
  f = { x: f.x / fl, y: f.y / fl, z: f.z / fl }
  // right = f × up(0,0,1); 정확히 수직으로 볼 때는 y 축을 up 으로.
  let r = { x: f.y, y: -f.x, z: 0 }
  const rl = Math.hypot(r.x, r.y)
  r = rl < EPS ? { x: 1, y: 0, z: 0 } : { x: r.x / rl, y: r.y / rl, z: 0 }
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x }
  return { pos, f, r, u, tanH: Math.tan(hfovRad(cam.lens_mm) / 2), tanV: Math.tan(vfovRad(cam.lens_mm, aspect) / 2) }
}

/** 세계 점 → 화면 좌표(u,v ∈ [-1,1] 이 프레임 안, y 위쪽 양수). 카메라 뒤면 null. */
export function project(cam: StageCamera, p: Vec3, aspect: number): { u: number; v: number; depth: number } | null {
  const b = basisOf(cam, aspect)
  const d = { x: p.x - b.pos.x, y: p.y - b.pos.y, z: p.z - b.pos.z }
  const depth = d.x * b.f.x + d.y * b.f.y + d.z * b.f.z
  if (depth < 0.2) return null
  const x = d.x * b.r.x + d.y * b.r.y + d.z * b.r.z
  const y = d.x * b.u.x + d.y * b.u.y + d.z * b.u.z
  return { u: x / depth / b.tanH, v: y / depth / b.tanV, depth }
}

export function positionWord(u: number): ScreenPositionWord {
  if (u < -1.05) return 'off_left'
  if (u < -0.72) return 'frame_edge_left'
  if (u < -0.22) return 'left_third'
  if (u <= 0.22) return 'center_third'
  if (u <= 0.72) return 'right_third'
  if (u <= 1.05) return 'frame_edge_right'
  return 'off_right'
}

export function depthBandOf(distance: number, subjectDistance: number): DepthBand {
  const ratio = distance / Math.max(0.3, subjectDistance)
  if (ratio < 0.55) return 'foreground'
  if (ratio > 1.9) return 'background'
  return 'midground'
}

/** 인물이 카메라를 기준으로 어느 쪽을 향하나 — 화면 왼쪽/오른쪽 기준 이름. */
export function facingWordOf(state: StageCharacterState, cam: StageCamera): FacingWord {
  const F = facingVector(state.facing_deg)
  const toCam = { x: cam.x - state.x, y: cam.y - state.y }
  const len = Math.hypot(toCam.x, toCam.y) || 1
  const C = { x: toCam.x / len, y: toCam.y / len }
  const dot = Math.max(-1, Math.min(1, F.x * C.x + F.y * C.y))
  const angle = (Math.acos(dot) * 180) / Math.PI
  // 카메라의 오른쪽 벡터(수평): f=(look-cam) → r=(f.y,-f.x)
  const fx = cam.look_at.x - cam.x
  const fy = cam.look_at.y - cam.y
  const fl = Math.hypot(fx, fy) || 1
  const r = { x: fy / fl, y: -fx / fl }
  const screenRight = F.x * r.x + F.y * r.y >= 0
  if (angle < 25) return 'front'
  if (angle < 70) return screenRight ? 'three_quarter_front_right' : 'three_quarter_front_left'
  if (angle < 110) return screenRight ? 'profile_right' : 'profile_left'
  if (angle < 155) return screenRight ? 'three_quarter_back_right' : 'three_quarter_back_left'
  return 'back'
}

/** 무대 위 인물 하나의 화면 배치. */
export function placeCharacter(cam: StageCamera, state: StageCharacterState, aspect: number, subjectDistance: number): ScreenPlacement {
  const h = state.height_m ?? DEFAULT_CHARACTER_HEIGHT_M
  // 누움·앉음은 실효 높이가 낮다 — 프레임 점유·잘림 판정에 반영.
  const effH = state.posture === 'lying' ? h * 0.35 : state.posture === 'sitting' || state.posture === 'kneeling' || state.posture === 'crouching' ? h * 0.65 : h
  const base = project(cam, { x: state.x, y: state.y, z: 0 }, aspect)
  const top = project(cam, { x: state.x, y: state.y, z: effH }, aspect)
  const distance = Math.hypot(cam.x - state.x, cam.y - state.y)
  if (!base || !top) {
    return {
      in_frame: false,
      screen_x: 0,
      screen_y: 0,
      distance_m: round(distance),
      apparent_height: 0,
      position_in_frame: 'off_left',
      depth_band: depthBandOf(distance, subjectDistance),
      facing: facingWordOf(state, cam),
    }
  }
  const u = (base.u + top.u) / 2
  const apparent = (top.v - base.v) / 2
  const verticalOverlap = top.v > -1 && base.v < 1
  // 가로 경계는 positionWord 의 off_* 경계(±1.05)와 같다 — "프레임 안인데 낱말은 off" 모순 방지.
  const inFrame = Math.abs(u) <= 1.05 && verticalOverlap
  return {
    in_frame: inFrame,
    screen_x: round(u),
    screen_y: round(base.v),
    distance_m: round(distance),
    apparent_height: round(apparent),
    position_in_frame: inFrame ? positionWord(u) : u < 0 ? 'off_left' : 'off_right',
    depth_band: depthBandOf(distance, subjectDistance),
    facing: facingWordOf(state, cam),
    posture: state.posture,
  }
}

/**
 * 시야 가림 — 피사체가 아닌 인물이 카메라 바로 앞(피사체 거리의 절반 안)에 서서 프레임을 크게 막는가.
 *   타이트 샷에서 카메라 방향을 돌리는 판단 근거(apply). 돌려주는 값은 가리는 인물 id 들.
 */
export function lineOfSightObstructions(
  cam: StageCamera,
  states: StageCharacterState[],
  subjectIds: ReadonlySet<string>,
  aspect: number,
  subjectDistance: number,
): string[] {
  const out: string[] = []
  for (const st of states) {
    if (subjectIds.has(st.character_id)) continue
    const pl = placeCharacter(cam, st, aspect, subjectDistance)
    // 피사체 거리의 70% 안쪽에서 프레임 높이의 1.2배 넘게 잡히면 가림(실측 sh_01_06: 거리비 0.51, 높이 4.1).
    if (pl.in_frame && pl.distance_m < subjectDistance * 0.7 && pl.apparent_height > 1.2) out.push(st.character_id)
  }
  return out
}

/** 카메라 무브 → END 카메라 거리 배율(설정이 없을 때의 추정). */
export function distanceScaleForMotion(motion: { type?: string; direction?: string; magnitude?: string } | null | undefined): number {
  if (!motion?.type) return 1
  const t = String(motion.type).toLowerCase()
  const dir = String(motion.direction ?? '').toLowerCase()
  const big = String(motion.magnitude ?? '').toLowerCase() === 'large'
  if (/dolly_in|push_in|zoom_in/.test(t)) return big ? 0.55 : 0.7
  if (/dolly_out|zoom_out|pull_back|pull_out/.test(t)) return big ? 1.7 : 1.4
  if (/tracking|dolly|crane|steadicam/.test(t)) {
    if (dir === 'forward') return big ? 0.6 : 0.75
    if (dir === 'backward' || dir === 'back') return big ? 1.6 : 1.3
  }
  return 1
}
