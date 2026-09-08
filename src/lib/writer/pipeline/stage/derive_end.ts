// END 추정(#derived-end 2026-09-08, 오너 결정: "B안에서 END 는 필요해 — previz 는 END 까지 생성하되 실사는 이를 참조하지
//   않는다"). 무대 비트에 END 상태가 없으면 배치도 END 가 START 의 복사본이 됐다(실측 겨울_8 sh_02_08: 도약 샷의 END
//   캡슐이 START 와 같음). 여기서 샷의 동작 문장(character_motion)과 카메라 무브(camera_motion)에서 END 를 추정한다.
//   러프(previz) 전용 추정이다: 무대 비트·상태 장부·다음 샷의 시작 상태는 손대지 않고(호출부가 새 배열만 쓴다),
//   실사 파이프라인은 배치도를 읽지 않는다. 순수 함수.
import type { ScreenPlacement, StageCamera, StageCharacterState, StagePosture } from '@/lib/writer/types/pipeline'
import { vfovRad } from '@/lib/writer/pipeline/stage/geometry'
import { postureFromMotionText, verticalMatch, POSTURE_KO } from './posture_text'

export interface DeriveEndInput {
  /** 샷 START 상태(자세 권위 적용 뒤) */
  start: StageCharacterState[]
  /** 비트의 END 상태(없으면 START 와 같은 내용) — 추정은 이 위에 덮는다 */
  end: StageCharacterState[]
  motions: ReadonlyArray<{ character_id: string; verb: string; magnitude?: string }>
  cameraMotion: { type?: string; direction?: string; magnitude?: string; target?: string | null } | null | undefined
  /** START 의 최종 카메라 */
  camera: StageCamera
  /** 이미 END 카메라가 있으면(달리·설정 end·리빌 교정) 카메라는 추정하지 않는다 */
  cameraAlreadyMoves: boolean
  /** 추정하지 않는 인물 — 전이 소유권 핀이 걸렸거나 비트가 이미 END 를 적은 인물 */
  skipIds?: ReadonlySet<string>
  /** 추정 후보 — START 프레임 안 인물만 */
  candidateIds: ReadonlySet<string>
  /** START 배치(발 위치·화면 높이) — 따라가는 카메라가 인물을 프레임에 남기는 계산에 쓴다 */
  startPlacements?: ReadonlyMap<string, ScreenPlacement>
  /** 프레임 가로/세로 비 */
  aspect?: number
}

export interface DerivedEnd {
  /** END 상태 전원 목록(추정된 인물만 바뀜) */
  states: StageCharacterState[]
  /** 추정된 인물 id */
  characters: string[]
  /** 추정된 END 카메라(없으면 null = 카메라 제자리 또는 이미 다른 데서 풀림) */
  camera: StageCamera | null
  /** 한국어 보고 문장 */
  notes: string[]
}

/** 도약·비행 높이(m) — 동작 크기별 추정값. */
export const LIFT_M: Record<'small' | 'medium' | 'large', number> = { small: 0.8, medium: 2, large: 3.5 }
/** 따라가는 카메라: 인물이 프레임에서 오를 수 있는 최대 폭(화면 세로 [-1,1] 단위, 0.5 = 프레임의 1/4). 나머지는 카메라가 따라간다. */
export const FOLLOW_RISE_V = 0.5
const UP_GROUP: ReadonlySet<StagePosture> = new Set(['standing', 'walking', 'running'])
const EFF_RATIO = (p: StagePosture | undefined) => (p === 'lying' ? 0.35 : p === 'sitting' || p === 'kneeling' || p === 'crouching' ? 0.65 : 1)
const CAM_VERTICAL_M = [0.4, 1.2, 2.5]
const CAM_LATERAL_M = [0.6, 1.5, 3]
const TILT_DEG = [8, 15, 25]
const PAN_DEG = [10, 20, 35]

function magIndex(m: string | undefined): 0 | 1 | 2 {
  const v = String(m ?? '').toLowerCase()
  if (v === 'minimal' || v === 'small' || v === 'subtle') return 0
  if (v === 'large' || v === 'big' || v === 'dramatic') return 2
  return 1
}
function strongestCharMag(mags: Array<string | undefined>): 'small' | 'medium' | 'large' {
  const k = Math.max(0, ...mags.map((m) => magIndex(m)))
  return k === 0 ? 'small' : k === 2 ? 'large' : 'medium'
}
const r1 = (v: number) => Math.round(v * 10) / 10

export function deriveShotEnd(input: DeriveEndInput): DerivedEnd | null {
  const notes: string[] = []
  const changed = new Map<string, StageCharacterState>()

  for (const s of input.start) {
    if (!input.candidateIds.has(s.character_id) || input.skipIds?.has(s.character_id)) continue
    const verbs = input.motions.filter((m) => m.character_id === s.character_id && m.verb?.trim())
    if (!verbs.length) continue
    const text = verbs.map((m) => m.verb.trim()).join('. ')
    const posture = postureFromMotionText(text)
    const v = verticalMatch(text)
    if (!posture && !v) continue
    const ground = posture && posture.posture !== 'floating' ? posture : null // 땅 자세 낱말(부유 제외)
    const mag = strongestCharMag(verbs.map((m) => m.magnitude))
    const z0 = Math.max(0, s.z ?? 0)
    let z = z0
    let next = s.posture
    if (v?.dir === 'up' && !(ground && ground.index > v.index)) {
      // 공중으로 — 끝 자세는 부유, 높이는 동작 크기. 올라간 뒤에 땅 자세 낱말이 오면("jumps onto the rock and stands") 착지다.
      next = 'floating'
      z = z0 + LIFT_M[mag]
    } else if (v?.dir === 'down') {
      z = 0
      next = ground?.posture ?? (z0 > 0 || s.posture === 'floating' ? 'standing' : 'lying') // 착지(공중에서) / 쓰러짐(지면에서)
    } else if (ground) {
      next = ground.posture
      z = 0
    } else if (posture) {
      next = 'floating' // 방향 없이 '떠 있음'만 — 조금 띄운다
      z = z0 > 0 ? z0 : LIFT_M.small
    }
    if (next === s.posture && z === z0) continue
    if (UP_GROUP.has(next) && UP_GROUP.has(s.posture) && z === z0) continue // 서기↔걷기↔달리기는 그림이 같다 — 변화가 아니다
    const out: StageCharacterState = { ...s, posture: next }
    if (z > 0) out.z = r1(z)
    else delete out.z
    changed.set(s.character_id, out)
    notes.push(
      `${s.character_id} ${POSTURE_KO[s.posture]}→${POSTURE_KO[next]}${z !== z0 ? ` 높이 ${r1(z0)}→${r1(z)}m` : ''} ("${text.slice(0, 60)}")`,
    )
  }

  let camera: StageCamera | null = null
  const cm = input.cameraMotion
  if (!input.cameraAlreadyMoves && cm?.type) {
    const cam = input.camera
    const t = String(cm.type).toLowerCase()
    const dir = String(cm.direction ?? '').toLowerCase()
    const k = magIndex(cm.magnitude)
    const fx = cam.look_at.x - cam.x
    const fy = cam.look_at.y - cam.y
    const fl = Math.hypot(fx, fy) || 1
    const f = { x: fx / fl, y: fy / fl }
    const right = { x: f.y, y: -f.x } // geometry.basisOf 와 같은 화면 오른쪽
    const moveType = /tracking|dolly|crane|steadicam|boom|pedestal|truck/.test(t)
    if (moveType && (dir === 'up' || dir === 'down')) {
      // 대상 인물이 추정으로 오르내리면 카메라가 따라간다 — 인물의 꼭대기가 프레임에 남을 만큼(최대 프레임의 1/4)만 화면에서
      //   오르게 두고 나머지 높이는 카메라가 같이 오른다(실측 sh_02_08: 절반만 따라가면 풀샷 인물이 프레임 위로 나갔다).
      const target = cm.target ? changed.get(cm.target) : undefined
      const targetStart = cm.target ? input.start.find((c) => c.character_id === cm.target) : undefined
      const pl = cm.target ? input.startPlacements?.get(cm.target) : undefined
      let followed = 0
      if (target && targetStart) {
        const dzFig = (target.z ?? 0) - (targetStart.z ?? 0)
        if (dzFig !== 0) {
          let riseM = 0
          if (pl && pl.apparent_height > 0) {
            const aEnd = (pl.apparent_height * EFF_RATIO(target.posture)) / EFF_RATIO(targetStart.posture)
            const room = 0.9 - (pl.screen_y + 2 * aEnd) // 꼭대기 위 여유(v 단위)
            const riseV = Math.max(0, Math.min(FOLLOW_RISE_V, room))
            const halfH = pl.distance_m * Math.tan(vfovRad(cam.lens_mm, input.aspect ?? 16 / 9) / 2)
            riseM = riseV * halfH
          }
          followed = dzFig - Math.sign(dzFig) * Math.min(Math.abs(dzFig), riseM)
        }
      }
      const dz = followed !== 0 ? followed : (dir === 'up' ? 1 : -1) * CAM_VERTICAL_M[k]
      const z = Math.max(0.3, cam.z + dz)
      const applied = r1(z - cam.z)
      if (applied !== 0) {
        camera = { ...cam, z: r1(z), look_at: { ...cam.look_at, z: r1(cam.look_at.z + applied) } }
        notes.push(`카메라 ${applied > 0 ? '상승' : '하강'} ${Math.abs(applied)}m${followed ? '(인물을 따라감)' : ''}`)
      }
    } else if (moveType && (dir === 'left' || dir === 'right')) {
      const d = (dir === 'right' ? 1 : -1) * CAM_LATERAL_M[k]
      camera = {
        ...cam,
        x: r1(cam.x + right.x * d),
        y: r1(cam.y + right.y * d),
        look_at: { ...cam.look_at, x: r1(cam.look_at.x + right.x * d), y: r1(cam.look_at.y + right.y * d) },
      }
      notes.push(`카메라 ${dir === 'right' ? '오른쪽' : '왼쪽'}으로 ${Math.abs(d)}m 트래킹`)
    } else if (/tilt/.test(t) && (dir === 'up' || dir === 'down')) {
      const dz = Math.tan((TILT_DEG[k] * Math.PI) / 180) * fl * (dir === 'up' ? 1 : -1)
      camera = { ...cam, look_at: { ...cam.look_at, z: r1(cam.look_at.z + dz) } }
      notes.push(`카메라 틸트 ${dir === 'up' ? '업' : '다운'} ${TILT_DEG[k]}°`)
    } else if (/pan/.test(t) && (dir === 'left' || dir === 'right')) {
      // 화면 왼쪽 = 위에서 본 반시계 회전(basisOf: right = (f.y, -f.x)).
      const ang = ((PAN_DEG[k] * Math.PI) / 180) * (dir === 'right' ? -1 : 1)
      const nx = f.x * Math.cos(ang) - f.y * Math.sin(ang)
      const ny = f.x * Math.sin(ang) + f.y * Math.cos(ang)
      camera = { ...cam, look_at: { x: r1(cam.x + nx * fl), y: r1(cam.y + ny * fl), z: cam.look_at.z } }
      notes.push(`카메라 팬 ${dir === 'right' ? '오른쪽' : '왼쪽'} ${PAN_DEG[k]}°`)
    }
  }

  if (!changed.size && !camera) return null
  const states = input.end.map((e) => changed.get(e.character_id) ?? e)
  return { states, characters: [...changed.keys()], camera, notes }
}
