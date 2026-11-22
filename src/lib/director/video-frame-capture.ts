// 앞 영상에서 이어 붙일 장면 잡기(방안 고장 2, 2026-11-22) — 노드의 '이전 영상' 구멍과 Camera 의 "이어서"가 같이 쓴다.
//
// 왜: 이어 붙일 장면은 보는 사람이 본 앞 샷의 마지막 장면이어야 한다. 예전에는 파일 끝 0.15초 앞을 잡았는데
//   Veo 는 8초 고정이라 샷 길이 뒤를 검은 화면으로 채우게 시키고(video-prompt), Seedance 는 4초 미만 샷도 4초로 만든다
//   (video-models) — 짧은 샷에서는 검은 화면이나 Editor 가 잘라 낼 꼬리가 다음 샷의 시작 그림이 됐다.
// 규칙:
//   - 잡는 자리 = Editor 가 자르는 자리(editor-store clipDurationSec: min(샷 길이, 실제 길이))의 0.15초 앞.
//   - 잡은 장면이 거의 검으면 0.25초씩 앞으로 가며 네 번까지 다시 잡고, 그래도 검으면 잡지 않는다(까닭: black_frame).
//   - 서버에 ffmpeg 가 없어(video-adherence 와 같은 이유) 브라우저가 <video> + <canvas> 로 잡는다.
//   - 픽셀을 읽을 수 없는 화면(오래된 브라우저 · 시험용 가짜 캔버스)은 검은 화면 검사를 건너뛴다 — 지금 동작 그대로.
//   - 잡은 그림은 잡은 시각(밀리초)을 이름에 붙여 올린다(upload-image) — 같은 앞 작업에서 다시 잡아도 덮어쓰기 거절이 나지 않게.

export const CONTINUATION_FRAME_LEAD_SEC = 0.15
export const CONTINUATION_RETRY_STEP_SEC = 0.25
export const CONTINUATION_RETRIES = 4

const round3 = (sec: number) => Math.round(sec * 1000) / 1000

/** 잡을 시각(초). 샷 길이를 모르면(독립 영상) 파일 끝 기준. 파일 길이를 모르면 null — 시각을 지어내지 않는다. */
export function continuationCaptureTime(plannedSec: number | null | undefined, actualSec: number): number | null {
  if (!Number.isFinite(actualSec) || actualSec <= 0) return null
  const planned = typeof plannedSec === 'number' && Number.isFinite(plannedSec) && plannedSec > 0 ? plannedSec : actualSec
  return Math.max(0, round3(Math.min(planned, actualSec) - CONTINUATION_FRAME_LEAD_SEC))
}

/** 처음 시각과 검을 때 다시 잡을 시각들(0.25초씩 앞으로, 0초 밑으로는 가지 않는다). */
export function continuationRetryTimes(firstSec: number): number[] {
  const times: number[] = []
  for (let i = 0; i <= CONTINUATION_RETRIES; i += 1) {
    const at = round3(firstSec - i * CONTINUATION_RETRY_STEP_SEC)
    if (at < 0) break
    times.push(at)
  }
  return times
}

/**
 * 거의 검은 장면인가 — RGBA 픽셀(캔버스 getImageData). 평균 밝기가 20/255 밑이고 밝은 점(40/255 넘음)이 0.5% 안 되면 검다.
 *   밤 장면처럼 어두워도 불빛 몇 점이 있으면 검은 화면이 아니다.
 */
export function isNearlyBlackFrame(rgba: ArrayLike<number>): boolean {
  const pixels = Math.floor(rgba.length / 4)
  if (!pixels) return false
  let sum = 0
  let bright = 0
  for (let i = 0; i < pixels; i += 1) {
    const luma = 0.2126 * rgba[i * 4]! + 0.7152 * rgba[i * 4 + 1]! + 0.0722 * rgba[i * 4 + 2]!
    sum += luma
    if (luma > 40) bright += 1
  }
  return sum / pixels < 20 && bright / pixels < 0.005
}

/** 파일 이름에 붙일 잡은 시각(밀리초 정수). */
export function chainFrameAtMs(atSec: number): number {
  return Math.max(0, Math.round(atSec * 1000))
}

export type ContinuationCaptureResult =
  | { ok: true; blob: Blob; atSec: number }
  | { ok: false; reason: 'capture_failed' | 'black_frame' }

type SampleContext = { drawImage: (...args: unknown[]) => void; getImageData?: (x: number, y: number, w: number, h: number) => { data: ArrayLike<number> } }

/** 지금 화면이 검은가 — 작게 줄여 본다. 픽셀을 읽을 수 없으면(가짜 캔버스 · 보안 막힘) 검사하지 않는다(false). */
function frameLooksBlack(video: HTMLVideoElement): boolean {
  try {
    const sample = document.createElement('canvas')
    sample.width = 32
    sample.height = 18
    const ctx = sample.getContext('2d') as unknown as SampleContext | null
    if (!ctx || typeof ctx.getImageData !== 'function') return false
    ctx.drawImage(video, 0, 0, 32, 18)
    return isNearlyBlackFrame(ctx.getImageData(0, 0, 32, 18).data)
  } catch {
    return false
  }
}

/** 브라우저에서 이어 붙일 장면을 잡는다 — 메타데이터 → 잡는 시각으로 이동 → 검으면 앞으로 → JPEG. */
export function captureContinuationFrame(
  videoUrl: string,
  plannedSec: number | null | undefined,
): Promise<ContinuationCaptureResult> {
  if (typeof document === 'undefined') return Promise.resolve({ ok: false, reason: 'capture_failed' })
  return new Promise<ContinuationCaptureResult>((resolve) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'metadata'
    video.playsInline = true

    let settled = false
    let started = false
    let times: number[] = []
    let attempt = 0
    let sawBlack = false
    const finish = (result: ContinuationCaptureResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        video.removeAttribute('src')
        video.load()
      } catch {
        /* noop */
      }
      resolve(result)
    }
    const failed = (): ContinuationCaptureResult => ({ ok: false, reason: sawBlack ? 'black_frame' : 'capture_failed' })
    const timer = setTimeout(() => finish(failed()), 20_000)

    const seek = (): void => {
      const at = times[attempt]
      if (at === undefined) return finish(failed())
      if (at === 0 && video.currentTime === 0) return grab()
      try {
        video.currentTime = at
      } catch {
        grab()
      }
    }
    const grab = (): void => {
      try {
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) return finish(failed())
        if (frameLooksBlack(video)) {
          sawBlack = true
          attempt += 1
          return seek()
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return finish(failed())
        ctx.drawImage(video, 0, 0, w, h)
        const atSec = times[attempt]!
        canvas.toBlob((blob) => finish(blob ? { ok: true, blob, atSec } : failed()), 'image/jpeg', 0.82)
      } catch {
        finish(failed())
      }
    }
    const start = () => {
      if (started) return
      const first = continuationCaptureTime(plannedSec, Number.isFinite(video.duration) ? video.duration : Number.NaN)
      if (first === null) return
      started = true
      times = continuationRetryTimes(first)
      seek()
    }
    video.onloadedmetadata = () => {
      start()
      if (!started) finish(failed())
    }
    video.onloadeddata = start
    video.onseeked = grab
    video.onerror = () => finish(failed())
    video.src = videoUrl
  })
}

/** 잡은 장면을 올린다 — 앞 Take · 그 작업의 완성 파일에서 잡은 것만 서버가 받는다. 주소를 못 받으면 null. */
export async function uploadContinuationFrame(input: {
  projectId: string
  videoClipId: string
  generationJobId: string
  blob: Blob
  atSec: number
}): Promise<string | null> {
  if (!input.projectId || !input.videoClipId || !input.generationJobId) return null
  try {
    const form = new FormData()
    form.append('projectId', input.projectId)
    form.append('type', 'video')
    form.append('entityId', input.videoClipId)
    form.append('field', 'chain_frame')
    form.append('generationJobId', input.generationJobId)
    form.append('atMs', String(chainFrameAtMs(input.atSec)))
    form.append('file', input.blob, `${input.videoClipId}_chain-frame.jpg`)
    const response = await fetch('/api/assets/upload-image', { method: 'POST', body: form })
    if (!response.ok) return null
    const body = (await response.json().catch(() => ({}))) as { publicUrl?: unknown }
    return typeof body.publicUrl === 'string' && body.publicUrl.trim() ? body.publicUrl : null
  } catch {
    return null
  }
}

/** 이어서 요청에 실을 출처(영상 제출의 continueFrom) — 앞 Take · 그 영상을 낸 작업 · 잡은 장면 주소. */
export interface ContinueFrom {
  videoClipId: string
  generationJobId: string
  frameUrl: string
}

export type PrepareContinueFromResult =
  | { ok: true; continueFrom: ContinueFrom; atSec: number }
  | { ok: false; reason: 'capture_failed' | 'black_frame' | 'upload_failed' }

/** 잡고 올리기를 한 번에 — Camera 의 "이어서"와 노드 '이전 영상' 구멍이 같이 쓴다. plannedSec = 앞 샷 길이(모르면 null). */
export async function prepareContinueFrom(input: {
  projectId: string
  source: { videoClipId: string; generationJobId: string; videoUrl: string }
  plannedSec: number | null | undefined
}): Promise<PrepareContinueFromResult> {
  let captured: ContinuationCaptureResult
  try {
    captured = await captureContinuationFrame(input.source.videoUrl, input.plannedSec)
  } catch {
    captured = { ok: false, reason: 'capture_failed' }
  }
  if (!captured.ok) return captured
  const frameUrl = await uploadContinuationFrame({
    projectId: input.projectId,
    videoClipId: input.source.videoClipId,
    generationJobId: input.source.generationJobId,
    blob: captured.blob,
    atSec: captured.atSec,
  })
  if (!frameUrl) return { ok: false, reason: 'upload_failed' }
  return {
    ok: true,
    continueFrom: { videoClipId: input.source.videoClipId, generationJobId: input.source.generationJobId, frameUrl },
    atSec: captured.atSec,
  }
}
