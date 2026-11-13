// Director 샷 상세(디자이너 11/13 시안 D6 · D7, 오너 2026-11-14) — 화면이 쓰는 순수 규칙.
//   상세는 샷 하나에 이미지 · 영상 탭이다(스토리보드형 = 팝업, 노드형 = 왼쪽 패널, 내용 같음).
//   약속: tests/director/shot-detail.test.ts
import { storyboardImageEndFrame, storyboardImageStartFrame } from '@/lib/director/storyboard-image'
import { IMAGE_MODEL_ORDER, imageModelSupportsSheetCanvas, type ImageModelKey } from '@/lib/image-models'
import { selectHandoffTake } from '@/lib/director-video-take-selection'
import type { DirectorNode, ShotNodeData, StoryboardImage, VideoNodeData } from '@/types/director'

export type ShotDetailTab = 'image' | 'video'

/** 영상 탭 이름 — 영상이 하나도 없으면 "영상 · 없음"(D6). */
export function videoTabLabelKey(takeCount: number): { key: string; params: Record<string, string | number> } {
  return takeCount > 0 ? { key: 'Video', params: {} } : { key: 'Video · none', params: {} }
}

/** 이미지 탭의 시작 · 끝 그림 — 끝 그림이 없으면(한 장짜리 옛 그림) 끝 자리는 비운다. */
export function shotDetailFrames(image: StoryboardImage | null | undefined): { start: string | null; end: string | null } {
  return { start: storyboardImageStartFrame(image ?? null), end: storyboardImageEndFrame(image ?? null) }
}

/** 이미지 모델 칸 — 실제로 도는 모델만(오너 답 5번). Writer 샷은 러프 세 장을 한 장에서 다시 칠하는 시트 길이라
 *  시트를 그릴 수 있는 모델만 돈다(나머지는 GPT Image 2 로 바뀌었다). 캔버스에서 만든 샷은 한 장 생성이라 전부 돈다. */
export function detailImageModels(data: Pick<ShotNodeData, 'writerShotId'>): ImageModelKey[] {
  return data.writerShotId ? IMAGE_MODEL_ORDER.filter(imageModelSupportsSheetCanvas) : [...IMAGE_MODEL_ORDER]
}

export interface ShotDetailTake {
  id: string
  data: VideoNodeData
}

/** 그 샷의 Take — 새것(번호 큰 것)부터. ★ 최종은 사람이 고른 것, 없으면 가장 최근 완성(자동). */
export function shotDetailTakes(nodes: readonly DirectorNode[], shotNodeId: string): { takes: ShotDetailTake[]; final: { id: string; auto: boolean } | null } {
  const takes = nodes
    .filter((node): node is DirectorNode & { data: VideoNodeData } => node.data.kind === 'video' && (node.data as VideoNodeData).parentShotNodeId === shotNodeId)
    .map((node) => ({ id: node.id, data: node.data }))
    .sort((a, b) => b.data.takeNumber - a.data.takeNumber || String(b.data.createdAt ?? '').localeCompare(String(a.data.createdAt ?? '')))
  const records = takes.map((take) => ({
    id: take.id,
    url: take.data.videoUrl,
    status: take.data.status,
    is_final: take.data.final,
    take_number: take.data.takeNumber,
    created_at: take.data.createdAt,
  }))
  const chosen = selectHandoffTake(records)
  return { takes, final: chosen ? { id: String(chosen.id), auto: chosen.is_final !== true } : null }
}

/** 바꿀 점을 붙인 이번 생성 프롬프트 — 바꿀 점은 이번 생성에만 붙고 샷 프롬프트는 바꾸지 않는다. 비워 두면 그대로. */
export function promptWithChange(prompt: string, change: string): string {
  const note = change.trim()
  return note ? `${prompt}\n\nChange from the previous image: ${note}` : prompt
}
