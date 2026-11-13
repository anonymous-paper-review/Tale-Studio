// 영상 [다시 만들기]가 이어받을 Take 와 그 Take 의 모델 · 해상도 — Editor 넘기기 창(D8, entry) · 샷 상세 · Lumi(prose)가 같이 쓴다
//   (2026-11-14 검토 b 보통 2: 단추에 적는 Take 값과 실제 요청이 같은 Take 에서 나와야 한다 — 확인 창이 없어 단추 값이 곧 동의다).
//   요청은 노드의 [영상 다시 만들기]처럼 이 Take 의 배선 · 모델 · 해상도를 물려받는 새 Take 다(generateVideoForShot inheritFromVideoNodeId).
//   두 갈래(de1113-entry · de1113-prose)가 이 파일을 글자 하나 다르지 않게 같이 더한다.
import { isVideoData, type DirectorNode, type ShotNodeData, type VideoNodeData, type VideoOverride } from '@/types/director'
import {
  DEFAULT_VIDEO_RESOLUTION,
  isVideoResolution,
  normalizeProvider,
  type VideoModelKey,
  type VideoResolution,
} from '@/lib/video-models'

export interface RemakeTake {
  id: string
  data: VideoNodeData
}

/** 다시 만들기가 이어받을 Take — 그 샷의 가장 최근 Take(번호 큰 것, 같으면 늦게 만든 것 · 실패해도). 없으면 null. */
export function latestShotTake(nodes: readonly DirectorNode[], shotNodeId: string): RemakeTake | null {
  const takes = nodes
    .filter((node): node is DirectorNode & { data: VideoNodeData } => isVideoData(node.data) && node.data.parentShotNodeId === shotNodeId)
    .sort((a, b) => b.data.takeNumber - a.data.takeNumber || String(b.data.createdAt ?? '').localeCompare(String(a.data.createdAt ?? '')))
  return takes[0] ? { id: takes[0].id, data: takes[0].data } : null
}

/** 그 Take 의 모델 · 해상도 — Take 에 고른 값이 없으면 샷 설정, 해상도는 720p(마더 샷에는 해상도가 없다). Take 가 없으면 샷 설정. */
export function takeSettings(
  shot: Pick<ShotNodeData, 'provider'>,
  take: Pick<VideoNodeData, 'override'> | null,
): { model: VideoModelKey; resolution: VideoResolution } {
  const override = (take?.override ?? {}) as VideoOverride
  return {
    model: normalizeProvider(override.provider ?? shot.provider),
    resolution: isVideoResolution(override.resolution) ? override.resolution : DEFAULT_VIDEO_RESOLUTION,
  }
}
