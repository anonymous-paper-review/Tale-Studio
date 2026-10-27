// Artist 브레이크다운 레퍼런스 그림 올리기(2026-10-27 오너 "인물과 배경의 레퍼런스 입력할 수 있는 기능 추가해줘") — 화면 쪽 순서.
//   받을 수 있는 그림인지 → 그림 사용 권리 확인(채팅 · 그림체 올리기와 같은 창) → 큰 그림은 줄이고 → 보관함에 올려 → 그 줄의 카드에 붙인다.
//   그림 내용 검사는 하지 않는다(그림은 어디서도 검사하지 않는다 — 글만 검사한다). 약속: tests/artist/breakdown-reference.test.ts
import { kindOf } from '@/lib/upload/limits'
import { downscaleForUpload, needsDownscale } from '@/lib/upload/downscale'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

export type BreakdownImageError = 'not_image' | 'too_large' | 'unreadable' | 'failed' | 'not_attached'

/** 줄 아래에 보일 이유 — 영어 원문 = 사전 키. */
export const BREAKDOWN_IMAGE_ERROR_TEXT: Record<BreakdownImageError, string> = {
  not_image: 'Choose a JPG, PNG or WebP picture.',
  too_large: 'The picture is too large. Choose a smaller one.',
  unreadable: 'Could not read this picture. Try another file.',
  failed: 'Could not upload the picture. Please try again.',
  not_attached: 'Could not attach the picture to this row.',
}

export type BreakdownImageResult =
  | { status: 'attached'; url: string }
  | { status: 'cancelled' }
  | { status: 'error'; error: BreakdownImageError }

export interface BreakdownImageDeps {
  /** 그림 사용 권리 확인(useImageUploadConsent) — false 면 올리지 않는다. */
  confirm: (files: readonly File[]) => Promise<boolean>
  /** 올리는 중 — 권리를 확인한 뒤 true, 끝나면(붙임 · 실패) false. 올리는 동안 [만들기]를 막는다. */
  onBusy?: (busy: boolean) => void
  /** 보관함에 올린다. 기본은 POST /api/artist/breakdown-image. */
  upload?: (projectId: string, file: File) => Promise<{ url: string } | { error: BreakdownImageError }>
  /** 큰 그림을 줄인다. 기본은 브라우저 캔버스(downscaleForUpload). */
  shrink?: (file: File) => Promise<File>
}

/** 라우트 응답 → 화면이 보일 이유. Vercel 이 본문을 거절하면(413) 우리 응답 모양이 아니다. */
function errorOf(status: number, code: unknown): BreakdownImageError {
  if (code === 'unsupported_type' || status === 415) return 'not_image'
  if (code === 'too_large' || status === 413) return 'too_large'
  if (code === 'invalid_image') return 'unreadable'
  return 'failed'
}

export async function uploadBreakdownImage(projectId: string, file: File): Promise<{ url: string } | { error: BreakdownImageError }> {
  const form = new FormData()
  form.append('projectId', projectId)
  form.append('file', file)
  const response = await fetch('/api/artist/breakdown-image', { method: 'POST', body: form })
  const body = (await response.json().catch(() => null)) as { url?: unknown; code?: unknown } | null
  if (response.ok && typeof body?.url === 'string') return { url: body.url }
  return { error: errorOf(response.status, body?.code) }
}

/** 그림 한 장을 그 줄의 카드에 붙인다. 권리 확인을 닫거나 그 사이 다른 프로젝트로 옮기면 아무것도 하지 않는다. */
export async function addBreakdownImage(
  target: { projectId: string; kind: 'person' | 'background'; localId: string },
  file: File,
  deps: BreakdownImageDeps,
): Promise<BreakdownImageResult> {
  if (kindOf(file.name) !== 'image') return { status: 'error', error: 'not_image' }
  if (!(await deps.confirm([file]))) return { status: 'cancelled' }
  if (useProjectStore.getState().projectId !== target.projectId) return { status: 'cancelled' }
  deps.onBusy?.(true)
  try {
    const sized = needsDownscale(file.size) ? await (deps.shrink ?? downscaleForUpload)(file) : file
    // 줄여도 크면(열지 못한 그림 등) 보내지 않는다 — Vercel 이 사유 없이 거절한다.
    if (needsDownscale(sized.size)) return { status: 'error', error: 'too_large' }
    const uploaded = await (deps.upload ?? uploadBreakdownImage)(target.projectId, sized)
    if ('error' in uploaded) return { status: 'error', error: uploaded.error }
    if (useProjectStore.getState().projectId !== target.projectId) return { status: 'cancelled' }
    if (!useProducerStore.getState().setBreakdownImage(target.kind, target.localId, uploaded.url)) return { status: 'error', error: 'not_attached' }
    return { status: 'attached', url: uploaded.url }
  } catch {
    return { status: 'error', error: 'failed' }
  } finally {
    deps.onBusy?.(false)
  }
}
