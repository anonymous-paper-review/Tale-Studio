// 영상 모델이 받는 가장 작은 그림 변(H3 Max · Turbo = 256, fal "Minimum dimensions are 256x256")보다 작은 참고 그림을 비율 그대로 키워
//   우리 보관함에 올린 주소로 바꾼다 — 서버 전용(m-qa 2026-11-27 · 리드). 9:16 프로젝트의 Storyboard [시작] 일괄 실사 칸(235 × 421)은
//   H3 를 골라도 422 로 거절되고 대체 미니맥스도 같은 이유로 실패해 Happy Horse 로 넘어갔다.
//   같은 그림은 늘 같은 주소로 올린다(다시 보내기 · 재생 비교 · 대체 모델이 같은 요청이 되게).
//   작은 것을 알았는데 키우거나 올리지 못하면 VideoReferenceTooSmallError(Take 를 잡기 전에 막는다). 크기를 읽지 못한 그림은 작은지 모르니
//   그대로 보낸다 — 이 기능 전과 같다(보관함이 잠깐 안 닿을 때 큰 그림까지 막지 않게).
//   서버는 우리 보관함 주소(isOwnMediaUrl)만 읽는다 — 손으로 이은 그림 · 따로 만든 영상은 화면이 보낸 주소라, 다른 주소는 읽지 않고 그대로 보낸다.
//   약속: tests/director/h3-min-size.test.ts
import sharp from 'sharp'
import { mediaPublicUrl, mediaUpload } from '@/lib/storage/media'
import { storageKeySegment } from '@/lib/storage/key-segment'
import { isOwnMediaUrl } from '@/lib/storage/media-url'

export class VideoReferenceTooSmallError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VideoReferenceTooSmallError'
  }
}

const SIZE_CHECK_TIMEOUT_MS = 15_000

async function enlarge(url: string, minSide: number, store: { workspaceId: string; projectId: string }): Promise<string> {
  // 아무 주소나 서버가 대신 가져오지 않는다(내부망 보호) — 우리 보관함 밖 주소는 이 기능 전처럼 그대로.
  if (!isOwnMediaUrl(url)) return url
  let source: Buffer
  let width = 0
  let height = 0
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(SIZE_CHECK_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    source = Buffer.from(await res.arrayBuffer())
    const meta = await sharp(source).metadata()
    width = meta.width ?? 0
    height = meta.height ?? 0
  } catch (error) {
    // 크기를 모른다 — 작은지 모르니 그대로 보낸다(이 기능 전과 같다).
    console.warn('[video-ref-min-size] reference image size unknown, sent as is:', error instanceof Error ? error.message : String(error))
    return url
  }
  if (!width || !height || (width >= minSide && height >= minSide)) return url
  // 비율 그대로 — 짧은 변을 minSide 로(긴 변은 따라 커진다). 반올림으로 모자라지 않게 둘 다 minSide 이상.
  const scale = minSide / Math.min(width, height)
  const targetWidth = Math.max(minSide, Math.round(width * scale))
  const targetHeight = Math.max(minSide, Math.round(height * scale))
  let enlarged: Buffer
  try {
    enlarged = await sharp(source).resize(targetWidth, targetHeight, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer()
  } catch (error) {
    throw new VideoReferenceTooSmallError(`Could not enlarge the reference image (${error instanceof Error ? error.message : String(error)})`)
  }
  const path = `${store.workspaceId}/${store.projectId}/video-refs/${storageKeySegment(url)}_min${minSide}.png`
  const { error } = await mediaUpload(path, enlarged, { contentType: 'image/png', upsert: true })
  if (error) throw new VideoReferenceTooSmallError(`Could not store the enlarged reference image (${error.message})`)
  return mediaPublicUrl(path)
}

/** 그림마다 — 두 변이 모두 minSide 이상이면 그 주소 그대로, 아니면 키워 올린 주소. 순서는 그대로. */
export async function ensureMinImageSide(
  urls: readonly string[],
  minSide: number,
  store: { workspaceId: string; projectId: string },
): Promise<string[]> {
  return Promise.all(urls.map((url) => enlarge(url, minSide, store)))
}
