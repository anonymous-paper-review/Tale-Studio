// 영상 모션 준수 검사 — 클라이언트 캡처(#adherence P2).
//   서버리스에 ffmpeg 이 없어 프레임 추출은 브라우저가 한다: 완료된 영상의 첫/끝 프레임을
//   <video>+canvas 로 캡처해 서버 판정 라우트로 보낸다. 전 과정 best-effort —
//   CORS taint/디코드 실패/판정 실패 어느 것도 생성 플로우를 막지 않는다(null 반환).
import type { VideoAdherence } from '@/types/director'

const CAPTURE_WIDTH = 512
const LOAD_TIMEOUT_MS = 20_000

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('seek failed'))
    }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.currentTime = t
  })
}

function grab(video: HTMLVideoElement): string | null {
  try {
    const scale = CAPTURE_WIDTH / (video.videoWidth || CAPTURE_WIDTH)
    const canvas = document.createElement('canvas')
    canvas.width = CAPTURE_WIDTH
    canvas.height = Math.max(1, Math.round((video.videoHeight || CAPTURE_WIDTH) * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.7) // taint 시 여기서 throw → null
  } catch {
    return null
  }
}

/** 완료 영상의 첫/끝 프레임 캡처. 실패 시 null. */
export async function captureVideoFrames(
  url: string,
): Promise<{ first: string; last: string } | null> {
  if (typeof document === 'undefined') return null
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous' // supabase storage 공개 버킷 — CORS 허용 전제(불허 시 taint→null)
  video.muted = true
  video.preload = 'auto'
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('video load timeout')), LOAD_TIMEOUT_MS)
      video.addEventListener('loadeddata', () => {
        clearTimeout(timer)
        resolve()
      })
      video.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error('video load error'))
      })
      video.src = url
    })
    const dur = Number.isFinite(video.duration) ? video.duration : 0
    await seekTo(video, Math.min(0.05, dur))
    const first = grab(video)
    await seekTo(video, Math.max(0, dur - 0.1))
    const last = grab(video)
    if (!first || !last) return null
    return { first, last }
  } catch {
    return null
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

/** 캡처 → 서버 판정 → 판정 반환 (실패 null). 노드 반영은 호출부(store)가 한다. */
export async function runVideoAdherence(input: {
  projectId: string
  writerShotId: string
  videoClipId: string
  videoUrl: string
}): Promise<VideoAdherence | null> {
  const frames = await captureVideoFrames(input.videoUrl)
  if (!frames) return null
  try {
    const res = await fetch('/api/director/video-adherence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: input.projectId,
        writerShotId: input.writerShotId,
        videoClipId: input.videoClipId,
        firstFrame: frames.first,
        lastFrame: frames.last,
      }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as VideoAdherence
    return body?.status ? body : null
  } catch {
    return null
  }
}
