// 6축 카메라 설정을 영상 모델이 읽는 자연어로 옮긴다.
//
// 2026-10-11: 이 함수는 Kling 직접 호출 모듈에 함께 들어 있었다. 그 모듈에서 이 함수만 떼어 왔고,
//   아무도 쓰지 않던 직접 호출 주소·토큰 발급 잔재는 모듈과 함께 지웠다 — 지금 영상은
//   전부 fal 카탈로그 모델로 나간다.
import type { CameraConfig } from '@/types'

/**
 * 6축 카메라 설정 → 자연어. 세기 대응: <=3 "slowly", <=6 "steadily", >6 "dramatically".
 */
export function cameraToText(camera: CameraConfig): string {
  const intensity = (val: number) => {
    const abs = Math.abs(val)
    if (abs <= 3) return 'slowly'
    if (abs <= 6) return 'steadily'
    return 'dramatically'
  }

  const parts: string[] = []

  if (camera.horizontal !== 0) {
    const dir = camera.horizontal > 0 ? 'right' : 'left'
    parts.push(`Camera tracks ${intensity(camera.horizontal)} to the ${dir}`)
  }
  if (camera.vertical !== 0) {
    const dir = camera.vertical > 0 ? 'upward' : 'downward'
    parts.push(`Camera cranes ${intensity(camera.vertical)} ${dir}`)
  }
  if (camera.pan !== 0) {
    const dir = camera.pan > 0 ? 'up' : 'down'
    parts.push(`Camera pitches ${intensity(camera.pan)} ${dir}`)
  }
  if (camera.tilt !== 0) {
    const dir = camera.tilt > 0 ? 'right' : 'left'
    parts.push(`Camera pans ${intensity(camera.tilt)} to the ${dir}`)
  }
  if (camera.roll !== 0) {
    const dir = camera.roll > 0 ? 'clockwise' : 'counter-clockwise'
    parts.push(`Camera rolls ${intensity(camera.roll)} ${dir}`)
  }
  if (camera.zoom !== 0) {
    const dir = camera.zoom > 0 ? 'in' : 'out'
    parts.push(`Camera zooms ${intensity(camera.zoom)} ${dir}`)
  }

  return parts.join('. ')
}
