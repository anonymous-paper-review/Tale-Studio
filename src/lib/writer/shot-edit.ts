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

/** [적용] 뒤 — 다 됐으면 닫고, 저장만 됐으면 [다시 그리기](그리기만 다시), 저장이 안 됐으면 [적용]을 남긴다(고친 내용을 다시 저장).
 *  저장이 실패했는데 [다시 그리기]를 남기면 옛 내용으로 그리고 "고친 내용으로 다시 그렸어요"라고 알렸다(검토 지적). */
export function nextApplyStep(result: { saved: boolean; drawn: boolean }): 'close' | 'redraw' | 'resave' {
  if (!result.saved) return 'resave'
  return result.drawn ? 'close' : 'redraw'
}

/** 러프 다시 그리기 요청(/api/writer/rough-storyboard · force)의 답 — 무엇을 기다리고 무엇을 알릴지. 보드 카드와 같은 구분.
 *  자리 부족 · 콘텐츠 정책 같은 공용 안내(notifyIfQuotaExceeded)는 이것보다 먼저 본다. */
export type RedrawReply =
  /** 맡긴 작업들 — 다 끝날 때까지 기다린다. */
  | { kind: 'jobs'; jobIds: string[] }
  /** 앞선 요청의 접수 여부를 확인하는 중 — 기다리지 않는다(확인 중인 작업은 끝나지 않은 것처럼 보여 10분 잠겼다). */
  | { kind: 'confirming' }
  /** 그 샷을 아직 그리는 중 — 잠시 뒤 다시. */
  | { kind: 'busy' }
  /** 스토리가 비어 그릴 것이 없다. */
  | { kind: 'nothing' }
  | { kind: 'failed' }

export function readRedrawReply(status: number, body: unknown): RedrawReply {
  const reply = body as {
    ok?: boolean
    data?: {
      submitted?: Array<{ jobId?: string; confirmationPending?: boolean }>
      skipped?: Array<{ reason?: string; confirmationPending?: boolean }>
      confirmationPending?: boolean
    }
  } | null
  if (status < 200 || status >= 300 || !reply?.ok || !reply.data) return { kind: 'failed' }
  const submitted = reply.data.submitted ?? []
  const skipped = reply.data.skipped ?? []
  if (reply.data.confirmationPending === true || submitted.some((item) => item.confirmationPending) || skipped.some((item) => item.confirmationPending)) {
    return { kind: 'confirming' }
  }
  const jobIds = [...new Set(submitted.map((item) => item.jobId).filter((id): id is string => !!id))]
  if (jobIds.length) return { kind: 'jobs', jobIds }
  if (skipped.some((item) => item.reason === 'in_flight')) return { kind: 'busy' }
  if (skipped.some((item) => item.reason === 'no_info')) return { kind: 'nothing' }
  return { kind: 'failed' }
}

/** [연출만 다시 만들기] — 저장 → 연출 그림만(약속 I: 나머지는 그대로). */
export async function redrawDirectionOnly(deps: { save: () => Promise<void>; regenerate: (frame: RoughFrame) => Promise<boolean> }): Promise<boolean> {
  await deps.save()
  return deps.regenerate('direction')
}
