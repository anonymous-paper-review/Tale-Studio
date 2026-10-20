// Storyboard 샷 고치기 팝업(프로토타입 S2, 2026-10-20)의 순수 규칙 — 씬 안 번호 · 카메라 앵글 · 다시 그리는 순서.
//   약속: tests/writer/shot-edit-popup.test.ts
import type { CameraConfig } from '@/types'

/** 씬 안 순서로 부르는 샷 번호(프로토타입 "S1-3") — 씬 순서는 장면 목록, 샷 순서는 보드(샷 목록) 순서. 없으면 null. */
export function sceneShotLabel(
  manifest: { scenes: ReadonlyArray<{ sceneId: string }> } | null | undefined,
  shots: ReadonlyArray<{ shotId: string; sceneId: string }>,
  shotId: string,
): string | null {
  const shot = shots.find((item) => item.shotId === shotId)
  if (!shot) return null
  const sceneIndex = manifest?.scenes.findIndex((scene) => scene.sceneId === shot.sceneId) ?? -1
  if (sceneIndex < 0) return null
  const inScene = shots.filter((item) => item.sceneId === shot.sceneId)
  return `S${sceneIndex + 1}-${inScene.findIndex((item) => item.shotId === shotId) + 1}`
}

export type CameraAngle = 'eye' | 'high' | 'low'

/** 앵글 이름(영어 키 — 화면에서 번역). 보드 카드 배지와 같은 규칙: pan 3 이상 = 로우, -3 이하 = 하이. */
export const CAMERA_ANGLES: ReadonlyArray<{ value: CameraAngle; label: string; pan: number }> = [
  { value: 'eye', label: 'Eye level', pan: 0 },
  { value: 'high', label: 'High angle (looking down)', pan: -5 },
  { value: 'low', label: 'Low angle (looking up)', pan: 5 },
]

export function angleOfCamera(camera: Pick<CameraConfig, 'pan'> | null | undefined): CameraAngle {
  const pan = camera?.pan ?? 0
  if (pan >= 3) return 'low'
  if (pan <= -3) return 'high'
  return 'eye'
}

export function cameraWithAngle(camera: CameraConfig, angle: CameraAngle): CameraConfig {
  return { ...camera, pan: CAMERA_ANGLES.find((item) => item.value === angle)?.pan ?? 0 }
}

export type RoughFrame = 'start' | 'direction'

/** [적용] — 바꾼 내용을 저장하고(실패하면 던진다 — 그리지 않는다), 그 샷의 러프를 저장한 내용으로 새로 그린다.
 *  한 장씩 다시 그리기(regenerate-frame)는 지금 그림을 보고 고쳐 그려 바꾼 스토리 · 샷 타입을 읽지 않는다(검토 지적). */
export async function applyStartEdit(deps: { save: () => Promise<void>; redrawShot: () => Promise<boolean> }): Promise<boolean> {
  await deps.save()
  return deps.redrawShot()
}

/** [연출만 다시 만들기] — 저장 → 연출 그림만(약속 I: 나머지는 그대로). */
export async function redrawDirectionOnly(deps: { save: () => Promise<void>; regenerate: (frame: RoughFrame) => Promise<boolean> }): Promise<boolean> {
  await deps.save()
  return deps.regenerate('direction')
}
