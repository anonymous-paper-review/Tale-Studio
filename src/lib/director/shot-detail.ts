// Director 샷 상세(디자이너 11/13 시안 D6 · D7, 오너 2026-11-14) — 화면이 쓰는 순수 규칙.
//   상세는 샷 하나에 이미지 · 영상 탭이다(스토리보드형 = 팝업, 노드형 = 왼쪽 패널, 내용 같음).
//   약속: tests/director/shot-detail.test.ts
import { storyboardImageEndFrame, storyboardImageStartFrame } from '@/lib/director/storyboard-image'
import { IMAGE_MODEL_ORDER, imageModelSupportsSheetCanvas, normalizeImageModelKey, resolveSheetImageModel, type ImageModelKey } from '@/lib/image-models'
import { selectHandoffTake } from '@/lib/director-video-take-selection'
import { currentStoryboardVersion, versionOfFrames } from '@/lib/director/storyboard-image-versions'
import type { VideoModelKey, VideoResolution } from '@/lib/video-models'
import type { DirectorNode, ShotNodeData, StoryboardImage, VideoNodeData, VideoOverride } from '@/types/director'

export type ShotDetailTab = 'image' | 'video'

/** 영상 탭 이름 — 영상이 하나도 없으면 "영상 · 없음"(D6). */
export function videoTabLabelKey(takeCount: number): { key: string; params: Record<string, string | number> } {
  return takeCount > 0 ? { key: 'Video', params: {} } : { key: 'Video · none', params: {} }
}

/** 상세의 시작 · 끝 그림 — 지금 버전의 그림이다. 끝 그림이 없으면(한 장짜리 옛 그림) 끝 자리는 비운다.
 *  다시 만드는 중 · 실패여도 지금 그림은 그대로라 그대로 보인다(영상 시작 그림 판정 storyboardImageStartFrame 과 다름). */
export function shotDetailFrames(image: StoryboardImage | null | undefined): { start: string | null; end: string | null } {
  const current = currentStoryboardVersion(image)
  if (current) return { start: current.frames?.start ?? current.url, end: current.frames?.end ?? null }
  return { start: storyboardImageStartFrame(image ?? null), end: storyboardImageEndFrame(image ?? null) }
}

/** 이미지 모델 칸 — 실제로 도는 모델만(오너 답 5번). Writer 샷은 러프 세 장을 한 장에서 다시 칠하는 시트 길이라
 *  시트를 그릴 수 있는 모델만 돈다(나머지는 GPT Image 2 로 바뀌었다). 캔버스에서 만든 샷은 한 장 생성이라 전부 돈다. */
export function detailImageModels(data: Pick<ShotNodeData, 'writerShotId'>): ImageModelKey[] {
  return data.writerShotId ? IMAGE_MODEL_ORDER.filter(imageModelSupportsSheetCanvas) : [...IMAGE_MODEL_ORDER]
}

/** Take 의 지금 단계 — 만드는 중 · 멈춤(화면에서 멈췄고 아직 안 끝남) · 완성 · 실패 · 아직 안 만듦. */
export type TakePhase = 'done' | 'making' | 'stopped' | 'failed' | 'idle'

export function takePhaseOf(data: Pick<VideoNodeData, 'status' | 'lastAttemptStatus' | 'videoUrl' | 'cancelledAt'>): TakePhase {
  // 화면에서 멈춘 Take 는 만드는 중으로 세지 않는다 — 그 샷의 새 Take 를 바로 만들 수 있다(오너 2026-11-14 7번).
  if (data.lastAttemptStatus === 'generating' || data.status === 'generating') return data.cancelledAt ? 'stopped' : 'making'
  if (data.status === 'completed' && data.videoUrl) return 'done'
  if (data.status === 'failed' || data.lastAttemptStatus === 'failed') return 'failed'
  return 'idle'
}

/** 이미지 모델 칸에서 골라져 보일 모델 — 서버가 실제로 돌리는 것. Writer 샷은 시트를 못 그리는 모델을 GPT Image 2 로 바꿔 돈다(리드 검토 c ④). */
export function detailImageModel(data: Pick<ShotNodeData, 'writerShotId' | 'imageModel'>): ImageModelKey {
  const saved = normalizeImageModelKey(data.imageModel)
  return data.writerShotId ? resolveSheetImageModel(saved) : saved
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
    cancelled_at: take.data.cancelledAt ?? null,
  }))
  const chosen = selectHandoffTake(records)
  return { takes, final: chosen ? { id: String(chosen.id), auto: chosen.is_final !== true } : null }
}

// 다시 만들기가 이어받을 Take(가장 최근 · 실패해도)와 그 모델 · 해상도 — entry 갈래 D8 [다시 만들기]와 같은 파일(remake-take.ts)의 함수를 쓴다
//   (리드 검토 b 보통 2: 단추에 적는 Take 값과 실제 요청이 같은 함수에서 나온다).
export { latestShotTake, takeSettings } from '@/lib/director/remake-take'

/** 바꿀 점을 붙인 이번 생성 프롬프트 — 바꿀 점은 이번 생성에만 붙고 샷 프롬프트는 바꾸지 않는다. 비워 두면 그대로. */
export function promptWithChange(prompt: string, change: string, subject: 'image' | 'video' = 'image'): string {
  const note = change.trim()
  return note ? `${prompt}\n\nChange from the previous ${subject}: ${note}` : prompt
}

/** 새 Take 요청 — 늘 새 Take 이고(덮어쓰지 않음) 보고 있던 Take 의 설정(마지막 모델 · 해상도 · 배선 · 바꿀 점)을 이어받는다.
 *  영상 고치기에서 바꾼 모델 · 해상도 · 바꿀 점은 새 Take 에만 실린다(보고 있던 Take 는 그대로).
 *  바꿀 점은 쌓이지 않는다(리드 검토 c ③): 새 Take 의 바탕은 늘 지금 샷 프롬프트이고, 바꿀 점은 그 Take 에 기록으로 남아
 *  만들 때 한 번만 붙는다(상점이 붙인다). 칸에 적은 것이 이어받을 바꿀 점과 같으면 그대로 두고, 다르면(지움 포함) 바꾼다.
 *  첫 Take 는 이어받을 것이 없다. shotPrompt 는 옛 호출을 위해 남겨 둔 값이다. */
export function newTakeRequest(input: {
  takeId: string | null
  take: Pick<VideoNodeData, 'override'> | null
  shotPrompt: string
  change: string
  provider?: VideoModelKey
  resolution?: VideoResolution
}): { inheritFromVideoNodeId?: string; videoOverride?: VideoOverride } {
  const note = input.change.trim()
  const inherited = ((input.take?.override ?? {}) as VideoOverride).changeNote?.trim() ?? ''
  const override: VideoOverride = {
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.resolution ? { resolution: input.resolution } : {}),
    ...(note !== inherited ? { changeNote: note } : {}),
  }
  return {
    ...(input.takeId ? { inheritFromVideoNodeId: input.takeId } : {}),
    ...(Object.keys(override).length ? { videoOverride: override } : {}),
  }
}

/** 그 Take 를 만든 뒤 시작 · 끝 이미지를 다시 만들었나 — 이미지가 더 새로우면 그 Take 는 옛 이미지로 만든 것이다(D7). */
export function imageChangedSinceTake(imageGeneratedAt: number | null | undefined, take: Pick<VideoNodeData, 'createdAt' | 'lastAttemptAt'>): boolean {
  const madeAt = Date.parse(String(take.lastAttemptAt ?? take.createdAt ?? ''))
  return typeof imageGeneratedAt === 'number' && Number.isFinite(madeAt) && imageGeneratedAt > madeAt
}

/** Take 가 쓴 이미지 버전("시작 v1 + 끝 v1", D7 · 리드 B) — 작업 기록의 그림 주소를 샷의 버전 목록과 맞춘다. 모르면 null. */
export function takeImageVersions(image: StoryboardImage | null | undefined, take: Pick<VideoNodeData, 'madeFrames'>): { start: number | null; end: number | null } | null {
  return versionOfFrames(image, take.madeFrames ?? null)
}

/** 보던 Take 와 지금 이미지가 다른가 — Take 가 쓴 버전을 알면 버전으로(되돌린 옛 버전도 "바뀜"), 모르면 만든 때와 그린 때로. */
export function imageChangedForTake(image: StoryboardImage | null | undefined, take: Pick<VideoNodeData, 'madeFrames' | 'createdAt' | 'lastAttemptAt'>): boolean {
  if (!image) return false
  const used = takeImageVersions(image, take)
  const current = currentStoryboardVersion(image)
  if (used?.start != null && current) return used.start !== current.n
  if (image.status !== 'completed') return false
  return imageChangedSinceTake(image.generatedAt, take)
}
