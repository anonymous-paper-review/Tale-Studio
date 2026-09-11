// Director 영상 프레임 배선 해석 — 공용 lib(director-store.ts와 video-batch-inputs.ts가 함께 쓴다).
//
//   #batch-resume(2026-09-09): store의 regenerateVideo 요청 조립과 일괄 시작 스냅샷 둘 다
//   "소스 노드 ID → 실제 이미지 URL" 이라는 같은 계산을 해야 한다. 계산법을 두 곳에 복제하면
//   한쪽만 고치는 사고가 난다 — 그래서 이 파일 하나로 합친다.
import {
  isAssetData,
  isShotData,
  type DirectorNode,
  type ShotNodeData,
  type VideoNodeData,
} from '@/types/director'

export type FrameInputSlot = 'start' | 'end' | 'ref'

export const EMPTY_FRAME_INPUTS = (): VideoNodeData['frameInputs'] => ({
  start: null,
  end: null,
  refs: [],
})

/**
 * Persisted Director snapshots can predate frame wiring. Normalize that payload
 * at every rebuild boundary so old cached Video nodes remain usable.
 */
export function normalizeFrameInputs(value: unknown): VideoNodeData['frameInputs'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return EMPTY_FRAME_INPUTS()
  }
  const row = value as Record<string, unknown>
  const refs = Array.isArray(row.refs)
    ? row.refs.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      )
    : []
  return {
    start: typeof row.start === 'string' && row.start.length > 0 ? row.start : null,
    end: typeof row.end === 'string' && row.end.length > 0 ? row.end : null,
    refs: [...new Set(refs)],
  }
}

/** Persisted Shot image-reference IDs may be absent or malformed in old caches. */
export function normalizeImageInputs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  ]
}

export function isFrameSourceNode(node: DirectorNode): boolean {
  // #node-merge: 파생 shotImage 카드 제거 — 이미지 출처는 Shot/Asset 노드뿐.
  return isShotData(node.data) || isAssetData(node.data)
}

export function isImageSourceNode(node: DirectorNode): boolean {
  return isFrameSourceNode(node)
}

export function usableFrameImageUrl(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function firstUploadedReferenceImageUrl(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  for (const image of value) {
    if (!image || typeof image !== 'object' || Array.isArray(image)) continue
    const url = usableFrameImageUrl((image as { url?: unknown }).url)
    if (url) return url
  }
  return null
}

export function resolveShotFrameImageUrl(
  data: ShotNodeData,
  slot: FrameInputSlot,
): string | null {
  const storyboard = data.storyboardImage
  if (storyboard?.status === 'completed') {
    const frame =
      slot === 'start'
        ? storyboard.frames?.start
        : slot === 'end'
          ? storyboard.frames?.end
          : undefined
    const storyboardUrl = usableFrameImageUrl(frame) ?? usableFrameImageUrl(storyboard.url)
    if (storyboardUrl) return storyboardUrl
  }
  return firstUploadedReferenceImageUrl(data.referenceImages)
}

/**
 * Resolve a persisted frame-input source node ID to an image URL. Frame inputs
 * intentionally store Director IDs, so unsupported or not-yet-generated nodes
 * must resolve to null rather than leaking an ID into the generation request.
 */
export function resolveFrameInputImageUrl(
  nodes: DirectorNode[],
  sourceNodeId: string,
  slot: FrameInputSlot,
): string | null {
  const source = nodes.find((node) => node.id === sourceNodeId)
  if (!source || !isFrameSourceNode(source)) return null
  if (isAssetData(source.data)) return usableFrameImageUrl(source.data.imageUrl)
  return isShotData(source.data)
    ? resolveShotFrameImageUrl(source.data, slot)
    : null
}

export function resolveStoryboardImageUrl(data: ShotNodeData): string | null {
  const storyboard = data.storyboardImage
  if (!storyboard || storyboard.status !== 'completed') return null
  return (
    usableFrameImageUrl(storyboard.url) ??
    usableFrameImageUrl(storyboard.frames?.start)
  )
}

export function resolveImageInputImageUrl(
  nodes: DirectorNode[],
  sourceNodeId: string,
): string | null {
  const source = nodes.find((node) => node.id === sourceNodeId)
  if (!source || !isImageSourceNode(source)) return null
  if (isAssetData(source.data)) return usableFrameImageUrl(source.data.imageUrl)
  return isShotData(source.data)
    ? resolveStoryboardImageUrl(source.data)
    : null
}

/** Shot의 최종 유효 prompt. promptOverride(사용자 편집) > derivedPrompt(Writer 파생) > prompt(legacy). */
export function effectivePromptOf(
  data: Pick<ShotNodeData, 'prompt' | 'derivedPrompt' | 'promptOverride'>,
): string {
  return data.promptOverride ?? data.derivedPrompt ?? data.prompt ?? ''
}

export function chainFrameMatchesSource(
  frameUrl: string | null,
  source: VideoNodeData,
): boolean {
  const frame = usableFrameImageUrl(frameUrl)
  if (!frame || !source.videoClipId || !source.generationJobId) {
    return false
  }
  return (
    frame.includes(source.videoClipId) &&
    frame.includes(source.generationJobId)
  )
}
