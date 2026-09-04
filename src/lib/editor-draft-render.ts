// Draft Render — 타임라인 전체를 브라우저에서 이어 붙여 한 파일로 저장 (#draft-render 2026-08-26).
//
// FFmpeg 합성은 Vercel 서버리스에서 불가(런타임 없음 + 응답 4.5MB 제한 — 옛 render-draft 라우트의
// TODO 그대로)라서, 프리뷰가 이미 하는 일(클립 순차 재생 + 오디오 트랙 믹스)을 캔버스+MediaRecorder
// 로 **실시간 녹화**한다. 재생 시간만큼 걸리는 대신(드래프트 용도에 정합) 코덱·트림·배속·음량을
// 전부 브라우저 재생 능력에 위임해, 재생만 되는 소스면 무엇이든 합쳐진다.
//   - 클립은 #watch-all 의 blob 캐시(prefetchVideos)로 선다운로드 — 경계 스톨과 CORS 캔버스
//     오염(녹화 불능)을 함께 차단한다. 실패한 URL 은 원본 스트리밍 폴백(캐시 규약 그대로).
//   - 소리는 프리뷰 규약 그대로: 영상 요소는 muted, 가청 소스는 오디오 트랙 클립(AudioTrackClip)
//     만이다 — 클립 volume × 클립/트랙 mute 를 굽고, 마스터 볼륨은 모니터용이라 굽지 않는다.
//   - 진행 시계는 벽시계(타임라인 초 = 녹화 경과 초). 클립 경계의 짧은 로드 공백은 캔버스가
//     직전 프레임을 유지해(그리기 생략) 프리즈로 흡수된다.
//   - 출력: MediaRecorder 가 지원하면 mp4, 아니면 webm → <a download> 저장.

import type { AudioTrackClip } from '@/types'
import { drawTitleCard } from '@/lib/editor/title-card'
import type { TitleCardData } from '@/types/shot'
import { cachedVideoUrl, prefetchVideos } from '@/features/editor/video-prefetch'

export interface DraftRenderStats {
  durationSec: number
  bytes: number
  mimeType: string
  /** 영상 URL 이 없어 자리표시 화면으로 들어간 클립 수. */
  skippedClips: number
}

interface LayoutItem {
  shotId: string
  startSec: number
  durationSec: number
}

interface VideoClipLike {
  shotId: string
  url?: string | null
  trimStart?: number
  speed?: number
}

interface ShotLike {
  shotId: string
  shotType?: string | null
  /** 타이틀 카드(#owner-title-card) — 있으면 검은 플레이스홀더 라벨을 카드 텍스트로 대체. */
  titleCard?: { text: string; imageUrl: string | null } | null
}

const RECORD_FPS = 30
const TAIL_PAD_SEC = 0.05 // 마지막 프레임 유실 방지 꼬리

function pickMimeType(): string {
  const candidates = [
    'video/mp4;codecs="avc1.640028,mp4a.40.2"',
    'video/mp4',
    'video/webm;codecs="vp9,opus"',
    'video/webm',
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return 'video/webm'
}

function abortError(): DOMException {
  return new DOMException('draft render aborted', 'AbortError')
}

/** 이벤트 1회 대기 (timeout 초과 시 false — 실패는 자리표시/프리즈로 강등, 렌더는 계속). */
function waitEvent(el: HTMLMediaElement, event: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      el.removeEventListener(event, onOk)
      el.removeEventListener('error', onErr)
      clearTimeout(timer)
      resolve(ok)
    }
    const onOk = () => finish(true)
    const onErr = () => finish(false)
    const timer = setTimeout(() => finish(false), timeoutMs)
    el.addEventListener(event, onOk, { once: true })
    el.addEventListener('error', onErr, { once: true })
  })
}

/** object-cover 로 캔버스에 그리기 — 소스 AR 이 달라도 왜곡 없이 채운다. */
function drawCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, W: number, H: number) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return
  const scale = Math.max(W / vw, H / vh)
  const sw = W / scale
  const sh = H / scale
  drawImageSafe(ctx, video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, H)
}

// drawImage 는 디코더 상태에 따라 드물게 throw 할 수 있다(InvalidStateError) — 한 프레임 건너뛴다.
function drawImageSafe(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  sx: number, sy: number, sw: number, sh: number,
  dx: number, dy: number, dw: number, dh: number,
) {
  try {
    ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh)
  } catch {
    /* skip frame */
  }
}

/** 타이틀 카드 이미지 미리 받기 — 실패·지연(8초)이면 이미지 없이 글자만 그린다(내보내기를 막지 않는다). */
function loadTitleImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const done = (v: HTMLImageElement | null) => {
      clearTimeout(timer)
      resolve(v)
    }
    const timer = setTimeout(() => done(null), 8000)
    img.onload = () => done(img)
    img.onerror = () => done(null)
    img.src = url
  })
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, W: number, H: number, label: string) {
  ctx.fillStyle = '#101014'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `${Math.round(H * 0.05)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, W / 2, H / 2)
}

/** 첫 재생 가능한 클립의 실측 AR 로 캔버스 크기 결정(긴 변 1280, 2의 배수). 실패 시 1280×720. */
async function resolveCanvasSize(urls: string[]): Promise<{ width: number; height: number }> {
  for (const url of urls) {
    const probe = document.createElement('video')
    probe.muted = true
    probe.preload = 'metadata'
    probe.src = url
    const ok = await waitEvent(probe, 'loadedmetadata', 6000)
    const vw = probe.videoWidth
    const vh = probe.videoHeight
    probe.removeAttribute('src')
    probe.load()
    if (ok && vw > 0 && vh > 0) {
      const scale = 1280 / Math.max(vw, vh)
      const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2)
      return { width: even(vw), height: even(vh) }
    }
  }
  return { width: 1280, height: 720 }
}

/**
 * 타임라인 전체(영상 순차 + 오디오 트랙)를 한 파일로 녹화해 다운로드한다.
 * 길이 = max(영상 총길이, 오디오 끝) — 재생 엔진(use-editor-playback)의 종료 규약과 동일.
 */
export async function renderDraftTimeline(opts: {
  projectId: string | null
  /** 저장 파일 이름(확장자 제외). */
  fileBaseName: string
  layout: LayoutItem[]
  shots: ShotLike[]
  videoClips: VideoClipLike[]
  audioClips: AudioTrackClip[]
  audioTracks: Array<{ id: string; muted?: boolean }>
  /** phase: 'prefetch'(클립 선다운로드) → 'record'(실시간 녹화). frac 0~1. */
  onPhase?: (phase: 'prefetch' | 'record', frac: number) => void
  signal?: AbortSignal
}): Promise<DraftRenderStats> {
  const { layout, shots, videoClips, audioClips, audioTracks, onPhase, signal } = opts

  const videoTotal = layout.reduce((sum, l) => sum + l.durationSec, 0)
  const audioEnd = audioClips.reduce((m, a) => Math.max(m, a.startSec + a.durationSec), 0)
  const total = Math.max(videoTotal, audioEnd)
  if (!(total > 0)) throw new Error('empty timeline')
  if (signal?.aborted) throw abortError()

  // ── 1) 선다운로드: 영상 전체 + 원격 오디오 (실패는 스트리밍 폴백 — 렌더는 계속) ──
  const mutedTracks = new Set(audioTracks.filter((t) => t.muted).map((t) => t.id))
  const firstTrackId = audioTracks[0]?.id
  const audible = audioClips.filter(
    (a) =>
      !a.muted &&
      a.volume > 0 &&
      !mutedTracks.has(a.trackId ?? firstTrackId ?? '') &&
      !!a.url,
  )
  const remoteUrls = [
    ...layout
      .map((l) => videoClips.find((c) => c.shotId === l.shotId)?.url)
      .filter((u): u is string => !!u),
    ...audible.map((a) => a.url).filter((u) => /^https?:/i.test(u)),
  ]
  await prefetchVideos(opts.projectId, remoteUrls, (done, prefetchTotal) => {
    onPhase?.('prefetch', prefetchTotal > 0 ? done / prefetchTotal : 1)
  })
  if (signal?.aborted) throw abortError()

  const localUrl = (url: string): string => cachedVideoUrl(url) ?? url

  // ── 2) 장치 준비: 캔버스·오디오 그래프·레코더 ──
  const orderedVideoUrls = layout
    .map((l) => videoClips.find((c) => c.shotId === l.shotId)?.url)
    .filter((u): u is string => !!u)
    .map(localUrl)
  const { width: W, height: H } = await resolveCanvasSize(orderedVideoUrls)
  if (signal?.aborted) throw abortError()

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  drawPlaceholder(ctx, W, H, '')

  const ac = new AudioContext()
  const dest = ac.createMediaStreamDestination()
  const audioEls: Array<{
    el: HTMLAudioElement
    clip: AudioTrackClip
    endSec: number
  }> = audible.map((clip) => {
    const el = document.createElement('audio')
    el.crossOrigin = 'anonymous'
    el.preload = 'auto'
    el.src = localUrl(clip.url)
    const src = ac.createMediaElementSource(el)
    const gain = ac.createGain()
    gain.gain.value = Math.max(0, Math.min(1, clip.volume))
    src.connect(gain).connect(dest)
    return { el, clip, endSec: clip.startSec + clip.durationSec }
  })

  const videoEl = document.createElement('video')
  videoEl.muted = true
  videoEl.playsInline = true
  videoEl.crossOrigin = 'anonymous'
  videoEl.preload = 'auto'

  const mimeType = pickMimeType()
  const stream = canvas.captureStream(RECORD_FPS)
  const audioTrack = dest.stream.getAudioTracks()[0]
  if (audioTrack) stream.addTrack(audioTrack)
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 192_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  // ── 3) 실시간 녹화 루프 ──
  let raf: number | null = null
  let aborted = false
  let skippedClips = 0
  // 세그먼트 러너가 갱신 — 그리기 루프는 "지금 활성인 세그먼트"만 읽는다.
  let activeLabel = ''
  let videoActive = false
  let activeTitle: { card: TitleCardData; image: HTMLImageElement | null } | null = null

  const cleanup = () => {
    if (raf != null) cancelAnimationFrame(raf)
    for (const { el } of audioEls) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    videoEl.pause()
    videoEl.removeAttribute('src')
    videoEl.load()
    void ac.close().catch(() => {})
  }

  const recorded = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
    recorder.onerror = () => reject(new Error('MediaRecorder error'))
  })

  const finishedAll = (async () => {
    // 첫 세그먼트를 먼저 준비해 선두 블랙 프레임을 줄인다.
    await ac.resume()
    const t0Promise: { t0: number } = { t0: 0 }

    const clockSec = () => (performance.now() - t0Promise.t0) / 1000

    // 벽시계 대기 — abort 즉응.
    const waitUntil = (timelineSec: number) =>
      new Promise<void>((resolve, reject) => {
        const step = () => {
          if (signal?.aborted || aborted) return reject(abortError())
          if (clockSec() >= timelineSec) return resolve()
          setTimeout(step, 32)
        }
        step()
      })

    // 오디오 스케줄러 + 캔버스 그리기 — rAF 루프.
    const drawLoop = () => {
      if (aborted) return
      const clock = clockSec()
      onPhase?.('record', Math.min(1, clock / total))
      if (videoActive && videoEl.readyState >= 2) {
        drawCover(ctx, videoEl, W, H)
      } else if (activeTitle) {
        drawTitleCard(ctx, W, H, activeTitle.card, activeTitle.image)
      } else if (!videoActive) {
        drawPlaceholder(ctx, W, H, activeLabel)
      }
      // 오디오: 활성 구간 진입 시 소스 오프셋으로 시킹해 재생, 이탈 시 정지.
      for (const a of audioEls) {
        const active = clock >= a.clip.startSec && clock < a.endSec
        if (active && a.el.paused) {
          a.el.currentTime = (a.clip.sourceOffsetSec ?? 0) + (clock - a.clip.startSec)
          void a.el.play().catch(() => {})
        } else if (!active && !a.el.paused) {
          a.el.pause()
        }
      }
      raf = requestAnimationFrame(drawLoop)
    }

    // 세그먼트 0 사전 로드 → 녹화 시작 → 순차 진행.
    const prepareSegment = async (item: LayoutItem): Promise<boolean> => {
      const clip = videoClips.find((c) => c.shotId === item.shotId)
      if (!clip?.url) return false
      videoEl.src = localUrl(clip.url)
      const loaded = await waitEvent(videoEl, 'loadeddata', 8000)
      if (!loaded) return false
      const speed = Math.max(0.25, Math.min(4, clip.speed ?? 1))
      videoEl.playbackRate = speed
      videoEl.currentTime = clip.trimStart ?? 0
      await waitEvent(videoEl, 'seeked', 2000)
      return true
    }

    const first = layout[0]
    let firstReady = false
    if (first) firstReady = await prepareSegment(first)
    if (signal?.aborted) throw abortError()

    recorder.start(1000)
    t0Promise.t0 = performance.now()
    raf = requestAnimationFrame(drawLoop)

    for (let i = 0; i < layout.length; i++) {
      const item = layout[i]
      const shot = shots.find((s) => s.shotId === item.shotId)
      // 타이틀 카드(#owner-title-card): FFmpeg drawtext 없이도 캔버스 placeholder 경로를 그대로
      //   재사용해 검은 배경+텍스트를 그린다 — 이미지 합성(이미지 위에 텍스트 오버레이)은 범위 밖(MVP: 텍스트만).
      if (shot?.titleCard) {
        // 약속 J6·J7·J8(2026-09-04): 이미지+글자를 미리보기와 같은 배치·줄바꿈으로 그린다. 빈 글자는 아무것도 찍지 않는다.
        activeTitle = { card: shot.titleCard, image: await loadTitleImage(shot.titleCard.imageUrl) }
        activeLabel = ''
        videoActive = false
        await waitUntil(item.startSec + item.durationSec)
        activeTitle = null
        continue
      }
      activeLabel = shot?.shotType ? `${item.shotId} · ${shot.shotType}` : item.shotId
      const ready = i === 0 ? firstReady : await prepareSegment(item)
      videoActive = ready
      if (ready) {
        void videoEl.play().catch(() => {})
      } else {
        skippedClips += 1
      }
      await waitUntil(item.startSec + item.durationSec)
      videoEl.pause()
    }
    // 오디오가 영상보다 길면 마지막 프레임을 유지한 채 끝까지 녹음.
    videoActive = false
    activeLabel = ''
    await waitUntil(total + TAIL_PAD_SEC)
  })()

  const onAbort = () => {
    aborted = true
  }
  signal?.addEventListener('abort', onAbort)

  try {
    await finishedAll
  } catch (e) {
    aborted = true
    try {
      if (recorder.state !== 'inactive') recorder.stop()
    } catch {
      /* noop */
    }
    cleanup()
    signal?.removeEventListener('abort', onAbort)
    throw e
  }

  if (recorder.state !== 'inactive') recorder.stop()
  const blob = await recorded
  cleanup()
  signal?.removeEventListener('abort', onAbort)
  if (signal?.aborted) throw abortError()

  // ── 4) 저장 ──
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
  const a = document.createElement('a')
  const objectUrl = URL.createObjectURL(blob)
  a.href = objectUrl
  a.download = `${opts.fileBaseName}.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 다운로드 시작 후 회수 — 즉시 revoke 하면 일부 브라우저에서 저장이 빈 파일이 된다.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)

  return { durationSec: total, bytes: blob.size, mimeType, skippedClips }
}
