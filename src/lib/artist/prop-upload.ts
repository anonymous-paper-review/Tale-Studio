// 소품 그림 올리기(D7, 2026-11-22) — 화면 쪽 순서. Artist 글 목록 레퍼런스 올리기(breakdown-image)와 같다:
//   받을 수 있는 그림인지 → 그림 사용 권리 확인 → 큰 그림은 줄이고 → 보관함({작업 공간}/{프로젝트}/breakdown/)에 올려 → 그 소품의 그림으로 붙인다.
//   올린 그림은 그대로 쓴다(지문 없음 — 설명 · 그림체 바뀜을 표시하지 않는다). 약속: tests/artist/prop-upload.test.ts
import { kindOf } from '@/lib/upload/limits'
import { downscaleForUpload, needsDownscale } from '@/lib/upload/downscale'
import { uploadBreakdownImage, type BreakdownImageDeps, type BreakdownImageResult } from '@/lib/artist/breakdown-image'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'

export async function addPropImage(
  target: { projectId: string; propId: string },
  file: File,
  deps: BreakdownImageDeps,
): Promise<BreakdownImageResult> {
  if (kindOf(file.name) !== 'image') return { status: 'error', error: 'not_image' }
  if (!(await deps.confirm([file]))) return { status: 'cancelled' }
  if (useProjectStore.getState().projectId !== target.projectId) return { status: 'cancelled' }
  deps.onBusy?.(true)
  try {
    const sized = needsDownscale(file.size) ? await (deps.shrink ?? downscaleForUpload)(file) : file
    if (needsDownscale(sized.size)) return { status: 'error', error: 'too_large' }
    const uploaded = await (deps.upload ?? uploadBreakdownImage)(target.projectId, sized)
    if ('error' in uploaded) return { status: 'error', error: uploaded.error }
    if (useProjectStore.getState().projectId !== target.projectId) return { status: 'cancelled' }
    const res = await fetch('/api/artist/prop-image', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: target.projectId, propId: target.propId, url: uploaded.url }),
    })
    if (!res.ok) return { status: 'error', error: 'not_attached' }
    if (useProjectStore.getState().projectId !== target.projectId) return { status: 'cancelled' }
    useArtistStore.setState((state) => ({
      propAssets: state.propAssets.map((prop) => (prop.propId === target.propId ? { ...prop, imageUrl: uploaded.url, sourceHash: null } : prop)),
    }))
    return { status: 'attached', url: uploaded.url }
  } catch {
    return { status: 'error', error: 'failed' }
  } finally {
    deps.onBusy?.(false)
  }
}
