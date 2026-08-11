// shotDesign(V4) 원본 → DB camera_config/lighting_config(6축) 근사 매핑.
//   persist 가 camera/lighting 을 DEFAULT 로 평탄화(증발)하므로, Director 진입 시
//   writer_runs.state->shotDesign 에서 6축 config 를 복원해 "DB가 DEFAULT일 때만" 자동 채운다(Option B).
//   범주형 angle/motion → 6축 수치는 근사다(완전 가역 아님). 사용자는 이후 수동 편집한다.
import type { CameraConfig, LightingConfig } from '@/types/shot'
import type { ShotDesign } from '@/lib/writer/types/pipeline'
import { normalizeCameraMotion } from '@/lib/writer/motion-vocabulary'

// persist DEFAULT 센티넬 (persist_manifest.ts 와 동일) — "미설정(빈칸)" 판정용.
export const SENTINEL_CAMERA: CameraConfig = {
  horizontal: 0,
  vertical: 0,
  pan: 0,
  tilt: 0,
  roll: 0,
  zoom: 0,
}
export const SENTINEL_LIGHTING: LightingConfig = {
  position: 'front',
  brightness: 50,
  colorTemp: 5000,
}

/** camera_config 가 persist DEFAULT(전부 0) 와 동일하면 "빈칸"으로 본다. */
export function isDefaultCamera(c: Partial<CameraConfig> | null | undefined): boolean {
  if (!c) return true
  return (['horizontal', 'vertical', 'pan', 'tilt', 'roll', 'zoom'] as const).every(
    (k) => (c[k] ?? 0) === 0,
  )
}
/** lighting_config 가 persist DEFAULT(front/50/5000) 와 동일하면 "빈칸"으로 본다. */
export function isDefaultLighting(l: Partial<LightingConfig> | null | undefined): boolean {
  if (!l) return true
  return (
    (l.position ?? 'front') === SENTINEL_LIGHTING.position &&
    (l.brightness ?? 50) === SENTINEL_LIGHTING.brightness &&
    (l.colorTemp ?? 5000) === SENTINEL_LIGHTING.colorTemp
  )
}

const clamp = (n: number) => Math.max(-10, Math.min(10, Math.round(n)))

// magnitude/speed → 6축 강도 (kling.ts intensity 임계와 정합: ≤3 약, ≤6 중, >6 강)
function intensity(magnitude?: string, speed?: string): number {
  const m = (magnitude ?? '').toLowerCase()
  const s = (speed ?? '').toLowerCase()
  if (m === 'large' || s === 'fast') return 8
  if (m === 'micro' || m === 'minimal' || s === 'slow') return 3
  return 5 // moderate / medium / 기본
}

// 정적 camera_angle(범주) → pitch(pan)·roll
function angleToPitchRoll(angle: string): { pan: number; roll: number } {
  const a = (angle ?? '').toLowerCase()
  let pan = 0
  let roll = 0
  if (a.includes('overhead') || a.includes('bird') || a.includes('top_down') || a.includes('top-down')) pan = -8
  else if (a.includes('worm')) pan = 8
  else if (a.includes('high')) pan = -5 // 위에서 내려봄 → pitch down
  else if (a.includes('low')) pan = 5 // 아래서 올려봄 → pitch up
  // eye_level → 0
  if (a.includes('dutch') || a.includes('canted') || a.includes('tilt')) roll = 4
  return { pan, roll }
}

/** shotDesign → 6축 camera_config (정적 angle + 동적 motion 합성, 근사). */
export function cameraConfigFromShotDesign(d: ShotDesign): CameraConfig {
  const cam: CameraConfig = { ...SENTINEL_CAMERA }

  // 1) 정적 angle → pitch(pan)/roll
  const { pan, roll } = angleToPitchRoll(d.static_spec?.camera_angle ?? '')
  cam.pan = pan
  cam.roll = roll

  // 2) 동적 motion → 해당 축 (kling.ts 6축 의미론: pan=pitch, tilt=yaw)
  //   교정기 경유(#motion-vocab 2026-08-11): 어휘 밖 유형은 아래 switch 의 default 로 떨어져
  //   **6축이 전부 0** 으로 남았다(실측: `pan_right`). 프롬프트는 "오른쪽으로 팬", 6축은 "정지" —
  //   같은 샷에 모순된 두 지시가 나갔다. 정규화하면 pan_right → type:'pan' + direction:'right' 로
  //   풀려 아래 case 에 정상 진입한다.
  const { motion: mo } = normalizeCameraMotion(d.dynamic_spec?.camera_motion)
  if (mo.type && mo.type !== 'static') {
    const v = intensity(mo.magnitude, mo.speed)
    const dir = mo.direction
    switch (mo.type) {
      case 'pan': // yaw 좌우
        cam.tilt = clamp(v * (dir.includes('left') ? -1 : 1))
        break
      case 'tilt': // pitch 상하 (정적 angle 위에 덮어씀)
        cam.pan = clamp(v * (dir.includes('down') ? -1 : 1))
        break
      case 'dolly_in':
        cam.zoom = clamp(v)
        break
      case 'dolly_out':
        cam.zoom = clamp(-v)
        break
      case 'tracking':
        cam.horizontal = clamp(v * (dir.includes('left') ? -1 : 1))
        break
      case 'crane':
        cam.vertical = clamp(v * (dir.includes('down') ? -1 : 1))
        break
      case 'handheld_drift':
        cam.horizontal = clamp(2) // 미세 드리프트
        break
      case 'rack_focus':
        break // 초점 변화 — 6축 무관
      default:
        // 정규화 후에도 안 걸리는 값 = 교정기가 못 알아본 유형(mapped:false).
        //   6축은 근사 수치라 모르는 움직임을 지어내는 것보다 0(미설정)이 안전하다.
        //   이 경로로 새는 건 계약문 쪽에서 원문 그대로 영상 모델에 전달된다.
        break
    }
  }
  return cam
}

/** shotDesign.static_spec.lighting → lighting_config (color_temp/direction 직접, brightness 근사). */
export function lightingConfigFromShotDesign(d: ShotDesign): LightingConfig {
  const out: LightingConfig = { ...SENTINEL_LIGHTING }
  const lt = d.static_spec?.lighting
  if (!lt) return out

  if (typeof lt.color_temp_kelvin === 'number' && lt.color_temp_kelvin > 0)
    out.colorTemp = Math.max(2000, Math.min(10000, Math.round(lt.color_temp_kelvin)))

  const kd = (lt.key_direction ?? '').toLowerCase()
  if (kd.includes('left')) out.position = 'left'
  else if (kd.includes('right')) out.position = 'right'
  else if (kd.includes('top') || kd.includes('overhead') || kd.includes('above')) out.position = 'top'
  else if (kd.includes('front') || kd.includes('frontal')) out.position = 'front'
  // 'back'/'behind' 은 LightingConfig union(left|top|right|front)에 없음 → front 유지.

  // key_fill_ratio "N:1" → brightness 근사 (대비비가 클수록 키가 강함 → 밝게).
  const ratio = parseFloat(String(lt.key_fill_ratio ?? '').split(':')[0])
  if (Number.isFinite(ratio) && ratio > 0)
    out.brightness = Math.max(20, Math.min(90, Math.round(40 + ratio * 6)))

  return out
}
