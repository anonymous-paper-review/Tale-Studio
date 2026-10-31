// 일괄 영상 생성에서 한 샷이 어떤 테이크의 설정으로 만들어지는가 — 요청 조립(video-batch-inputs.ts)과
//   Take 사전 계산(video-batch-plan.ts)이 함께 쓴다. 두 곳이 따로 정하면 확인창의 Take 와 서버가 잡는 Take 가
//   어긋난다(종량제 신뢰). 그래서 "어느 테이크 · 어느 모델 · 어느 해상도"를 이 파일 하나로 정한다.
import {
  isShotData,
  isVideoData,
  type DirectorNode,
  type VideoNodeData,
  type VideoOverride,
} from '@/types/director'
import {
  DEFAULT_VIDEO_RESOLUTION,
  isVideoResolution,
  normalizeProvider,
  type VideoModelKey,
  type VideoResolution,
} from '@/lib/video-models'
import { normalizeFrameInputs, usableFrameImageUrl } from '@/lib/director/video-frame-inputs'

function getChildVideos(nodes: readonly DirectorNode[], shotNodeId: string): DirectorNode[] {
  return nodes.filter(
    (n) => isVideoData(n.data) && n.data.parentShotNodeId === shotNodeId,
  )
}

function isPlayableCompleted(data: VideoNodeData): boolean {
  return data.status === 'completed' && !!usableFrameImageUrl(data.videoUrl)
}

function isManuallyWired(data: VideoNodeData): boolean {
  const frameInputs = normalizeFrameInputs(data.frameInputs)
  return (
    !!frameInputs.start ||
    !!frameInputs.end ||
    frameInputs.refs.length > 0 ||
    !!data.videoChainInputId
  )
}

/**
 * 아직 완성되지 않았고 사람이 배선한 take 중 가장 최근 것을 고른다.
 * takeNumber 큰 순 → 동률이면 createdAt 최신 순. 없으면 null(마더 설정 그대로).
 */
export function pickActiveTake(nodes: readonly DirectorNode[], shotNodeId: string): (DirectorNode & { data: VideoNodeData }) | null {
  const candidates = getChildVideos(nodes, shotNodeId).filter(
    (n) => isVideoData(n.data) && !isPlayableCompleted(n.data) && isManuallyWired(n.data),
  ) as Array<DirectorNode & { data: VideoNodeData }>
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    if (a.data.takeNumber !== b.data.takeNumber) return b.data.takeNumber - a.data.takeNumber
    return (b.data.createdAt ?? '').localeCompare(a.data.createdAt ?? '')
  })
  return candidates[0]!
}

/**
 * 일괄이 이 샷에 쓸 모델과 해상도. 배선한 테이크가 있으면 그 테이크의 설정, 없으면 마더 샷 설정(해상도는 720p —
 * 마더 샷에는 해상도가 없다, 오너 2026-10-31). 샷이 아니면 null.
 */
export function videoBatchShotSettings(
  nodes: readonly DirectorNode[],
  shotNodeId: string,
): { model: VideoModelKey; resolution: VideoResolution } | null {
  const shotNode = nodes.find((n) => n.id === shotNodeId)
  if (!shotNode || !isShotData(shotNode.data)) return null
  const take = pickActiveTake(nodes, shotNodeId)
  // 배선한 테이크는 이 샷의 자식(마더가 있는 영상)이다 — 독립 영상의 설정은 여기 오지 않는다.
  const override: VideoOverride = take && take.data.parentShotNodeId !== null ? take.data.override : {}
  return {
    model: normalizeProvider(override.provider ?? shotNode.data.provider),
    resolution: isVideoResolution(override.resolution) ? override.resolution : DEFAULT_VIDEO_RESOLUTION,
  }
}
