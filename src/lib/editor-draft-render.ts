// Draft Render — 타임라인 전체를 브라우저에서 이어 붙여 한 파일로 저장 (#draft-render 2026-08-26).
//
// FFmpeg 합성은 Vercel 서버리스에서 불가(런타임 없음 + 응답 4.5MB 제한 — 옛 render-draft 라우트의
// TODO 그대로)라서, 프리뷰가 이미 하는 일(클립 재생 + 오디오 트랙 믹스)을 캔버스+MediaRecorder
// 로 **실시간 녹화**한다. 재생 시간만큼 걸리는 대신(드래프트 용도에 정합) 코덱·트림·배속·음량을
// 전부 브라우저 재생 능력에 위임해, 재생만 되는 소스면 무엇이든 합쳐진다.
//   - 그림은 모니터와 같은 그릴 것 목록(selectFrameAt, 2단계 ⑦)으로 장마다 그린다 — 줄 차례 겹침 · 모션 · 불투명도 · 영상 효과 ·
//     교차 디졸브 · 물들이기 · 타이틀 카드 · 제목 · 자막(R7, 오너 답 3 "미리 보기의 모든 것"). 크기는 시퀀스 크기(긴 변 1280, 위 둘째
//     줄과 같은 값)이고 영상은 틀을 꽉 채운다(모니터와 같은 "비율 100%").
//   - 영상 요소는 클립마다 하나 — 곧 그릴 층을 1.5초 먼저 불러 두고, 모니터와 같은 함수로 시각을 맞춘다(layer-sync). 보이는 영상 층이
//     아직 그림을 못 냈으면 그 장은 그리지 않아 직전 장이 남고(멈춤으로 흡수), 8초 넘게 못 내면 못 불러온 클립으로 친다.
//   - 클립은 #watch-all 의 blob 캐시(prefetchVideos)로 선다운로드 — 경계 스톨과 CORS 캔버스
//     오염(녹화 불능)을 함께 차단한다. 실패한 URL 은 원본 스트리밍 폴백(캐시 규약 그대로).
//   - 소리는 프리뷰 규약 그대로: 영상 요소는 muted, 가청 소스는 오디오 트랙 클립(AudioTrackClip)
//     만이다 — 클립 volume × 페이드 세기 × 클립/트랙 mute 를 굽고, 마스터 볼륨은 모니터용이라 굽지 않는다.
//   - 진행 시계는 벽시계(타임라인 초 = 녹화 경과 초).
//   - 출력: MediaRecorder 가 지원하면 mp4, 아니면 webm → <a download> 저장.
//   약속: tests/editor/frame-plan.test.ts

import type { AudioTrackClip, Shot, VideoClip } from '@/types'
import type { TitleCardData } from '@/types/shot'
import { drawTitleCard } from '@/lib/editor/title-card'
import { drawTitleText } from '@/lib/editor/title-clip'
import { audioFadeGain } from '@/lib/editor/transition'
import { hasVideoEffects, videoEffectFilter } from '@/lib/editor/video-effects'
import { drawSubtitle, resolveSubtitle } from '@/lib/editor/subtitle'
import { cachedVideoUrl, prefetchVideos } from '@/features/editor/video-prefetch'
import { audioSourceTime } from '@/lib/editor/audio-time'
import { timelineEnd } from '@/lib/editor/timeline-segments'
import { SEQUENCE_FPS } from '@/lib/editor/sequence-info'
import { syncLayerVideo } from '@/lib/editor/layer-sync'
import { DEFAULT_VIDEO_TRACKS, selectFrameAt, selectVideoLayout, type FramePlan, type OverlayPlacements, type VideoTrackState } from '@/stores/editor-store'

/** 그릴 것 목록의 바탕 — 샷 · 클립 · V1 차례 · V1 밖 자리 · 줄. */
type FrameInput = Parameters<typeof selectFrameAt>[0]

/**
 * 들리는 소리 줄 — 음소거(M)한 줄은 빼고, 그 줄만(S)을 켠 줄이 있으면 S 줄만(2단계 ②, 시안 E1 줄 머리). 재생(audio-meter)과
 *   내보내기가 같이 쓴다. 약속: tests/editor/tracks.test.ts
 */
export function audibleTrackIds(audioTracks: ReadonlyArray<{ id: string; muted?: boolean; solo?: boolean }>): Set<string> {
  const anySolo = audioTracks.some((t) => t.solo)
  return new Set(audioTracks.filter((t) => !t.muted && (!anySolo || t.solo)).map((t) => t.id))
}

/** 내보내기에 넣는 소리 조각 — 음소거 · 소리 0 · 들리지 않는 줄 · 주소 없는 것을 뺀다. 편집 상태의 자리 그대로 재생한다(2026-11-10 결정 4). */
export function draftAudioClips(audioClips: AudioTrackClip[], audioTracks: Array<{ id: string; muted?: boolean; solo?: boolean }>): AudioTrackClip[] {
  const audible = audibleTrackIds(audioTracks)
  const firstTrackId = audioTracks[0]?.id
  return audioClips.filter(
    (a) =>
      !a.muted &&
      a.volume > 0 &&
      audible.has(a.trackId ?? firstTrackId ?? '') &&
      !!a.url,
  )
}

export interface DraftRenderStats {
  durationSec: number
  bytes: number
  mimeType: string
  /** 영상이 없거나 불러오지 못해 자리표시 화면으로 들어간 클립 수(그 시각 맨 위였던 클립). */
  skippedClips: number
}

/** 맨 위 클립 차례(selectProgramLayout) — 영상 줄 끝을 셀 때. */
interface LayoutItem {
  shotId: string
  startSec: number
  durationSec: number
}

/** 그릴 것 목록 한 장을 그릴 바탕 — 클립마다 그림을 낸 영상, 미리 받은 타이틀 카드 그림, 샷 · 클립 값, 캔버스가 filter 를 그릴 줄 아는지. */
export interface FrameSources {
  /** 그 클립의 그림을 낸 영상 — 영상이 없거나 불러오지 못했으면 null. */
  video: (shotId: string) => HTMLVideoElement | null
  titleCards: ReadonlyMap<string, { card: TitleCardData; image: HTMLImageElement | null }>
  shots: ReadonlyMap<string, Shot>
  clips: ReadonlyMap<string, VideoClip>
  filterOk: boolean
}

const TAIL_PAD_SEC = 0.05 // 마지막 프레임 유실 방지 꼬리
/** 곧 그릴 층을 이만큼 먼저 불러 둔다(초) — 내보내기는 다시 할 수 없어 모니터(1초)보다 넉넉히(⑦ 계획 d). */
const PRELOAD_SEC = 1.5
/** 보이는 영상 층이 이만큼 넘게 그림을 못 내면 그 내보내기에서는 못 불러온 클립으로 친다(맨 위면 자리표시) — 예전 8초 그대로. */
const LOAD_TIMEOUT_MS = 8000

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

/** object-cover 로 캔버스에 그리기 — 소스 AR 이 달라도 왜곡 없이 채운다(모니터의 꽉 채우기와 같은 셈). */
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

/** 빈 곳 — 미리 보기처럼 순검정(자유 배치, 검토 c 낮음 5). 영상을 아직 못 받은 클립 자리(어두운 회색 + 이름)와 다르다. */
export function drawGap(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, W, H)
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

/**
 * 캔버스가 filter(흑백 · 흐림 · 밝기 및 대비)를 그릴 줄 아는가 — 넣어 보고 읽어서 안다(브라우저 이름으로 추측하지 않는다, 리드 11/14).
 *   못 그리는 브라우저는 효과 없이 내보내고, 화면이 내보내기를 시작할 때 먼저 알린다.
 */
export function canvasFilterSupported(ctx: CanvasRenderingContext2D | null): boolean {
  if (!ctx || typeof (ctx as { filter?: unknown }).filter !== 'string') return false
  const before = ctx.filter
  ctx.filter = 'blur(1px)'
  const ok = ctx.filter === 'blur(1px)'
  ctx.filter = before
  return ok
}

/** 내보낼 클립(눈 켠 줄) 가운데 영상 효과를 넣은 클립이 있는가 — 캔버스가 효과를 못 그리면 시작할 때 알릴지 정한다. */
export function effectsInUse(input: FrameInput): boolean {
  const hidden = new Set((input.videoTracks ?? DEFAULT_VIDEO_TRACKS).filter((t) => t.hidden).map((t) => t.id))
  return selectVideoLayout(input).some((item) => !hidden.has(item.trackId) && hasVideoEffects(input.videoClips.find((c) => c.shotId === item.shotId)))
}

/**
 * 그릴 것 목록 한 장을 캔버스에 — 검정 바탕 위에 층을 아래부터 그 세기 · 모션 · 효과로, 맨 위 영상의 자막, 물들이기 막(자막 위). 모니터가 같은
 *   목록을 같은 셈으로 그린다(2단계 ⑦). 맨 위 영상이 없거나 못 불러오면 자리표시를 그리고, 아래 줄이면 건너뛴다(모니터는 안내 판).
 */
export function drawPlanFrame(ctx: CanvasRenderingContext2D, W: number, H: number, plan: FramePlan, src: FrameSources): void {
  drawGap(ctx, W, H)
  for (const layer of plan.layers) {
    if (layer.alpha <= 0) continue
    ctx.save()
    ctx.globalAlpha = layer.alpha
    if (layer.kind === 'card') {
      const activeTitle = src.titleCards.get(layer.shotId)
      if (activeTitle) drawTitleCard(ctx, W, H, activeTitle.card, activeTitle.image)
    } else {
      // 모션 — 틀 폭 · 높이 비율만큼 옮기고 가운데를 기준으로 키운다(모니터의 translate · scale 과 같은 셈).
      const clip = src.clips.get(layer.shotId)
      const motion = clip?.motion
      if (motion) {
        ctx.translate(W / 2 + motion.x * W, H / 2 + motion.y * H)
        ctx.scale(motion.scale, motion.scale)
        ctx.translate(-W / 2, -H / 2)
      }
      if (layer.kind === 'title') {
        const data = src.shots.get(layer.shotId)?.titleText
        if (data) drawTitleText(ctx, W, H, data)
      } else {
        const video = src.video(layer.shotId)
        if (video) {
          // 영상 효과 — 모니터와 같은 글(흐림 반지름은 틀 폭 기준). 모니터는 흐린 그림을 줄이므로 흐림도 그 비율만큼 — 캔버스의 흐림은 위의
          //   옮기기 · 키우기를 따르지 않는다. 캔버스가 못 그리면 효과 없이(시작할 때 알렸다).
          const filter = src.filterOk ? videoEffectFilter(clip?.effects, W * (motion?.scale ?? 1)) : undefined
          if (filter) ctx.filter = filter
          drawCover(ctx, video, W, H)
        } else if (layer.shotId === plan.topShotId) {
          const shot = src.shots.get(layer.shotId)
          drawPlaceholder(ctx, W, H, shot?.shotType ? `${layer.shotId} · ${shot.shotType}` : layer.shotId)
        }
      }
    }
    ctx.restore()
  }
  // 약속 K6: 그 시각 맨 위 영상의 자막을 층 위에.
  const shot = plan.topShotId ? src.shots.get(plan.topShotId) : undefined
  const activeSubtitle = shot ? resolveSubtitle(shot) : null
  if (activeSubtitle) drawSubtitle(ctx, W, H, activeSubtitle)
  // 물들이기(2026-09-08 · 2단계 ⑤): 모니터와 같은 검은 · 흰 막 — 투명도만 시간에 따라. 자막 위에 얹는다(경계에서는 자막도 같이 잠긴다).
  const dip = plan.black
  if (dip > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dip})`
    ctx.fillRect(0, 0, W, H)
  }
  if (plan.white > 0) {
    ctx.fillStyle = `rgba(255,255,255,${plan.white})`
    ctx.fillRect(0, 0, W, H)
  }
}

/**
 * 타임라인 전체(모든 영상 줄 + 오디오 트랙)를 한 파일로 녹화해 다운로드한다.
 * 길이 = max(영상 줄 끝, 오디오 끝, 시퀀스 길이) — 재생 엔진(use-editor-playback)의 종료 규약과 동일.
 */
export async function renderDraftTimeline(opts: {
  projectId: string | null
  /** 저장 파일 이름(확장자 제외). */
  fileBaseName: string
  /** 맨 위 클립 차례(selectProgramLayout) — 영상 줄 끝을 셀 때. */
  layout: LayoutItem[]
  /** 시퀀스 길이(눈 끈 줄 · 소리까지 센 끝) — 보이는 클립보다 길면 그 끝까지 검은 화면으로 녹화한다(위 둘째 줄과 같은 길이). */
  endSec?: number
  shots: Shot[]
  videoClips: VideoClip[]
  /** 그릴 것 목록의 나머지 바탕(2단계 ⑦) — V1 차례 · V1 밖 자리 · 줄(눈 · 차례). 모니터와 같은 값을 넘긴다. */
  clipOrder: Record<string, string[]>
  overlay: OverlayPlacements
  videoTracks: readonly VideoTrackState[]
  /** 내보내기 크기 — 시퀀스 크기(exportFrameSize, 위 둘째 줄과 같은 값). */
  frameSize: { width: number; height: number }
  audioClips: AudioTrackClip[]
  audioTracks: Array<{ id: string; muted?: boolean; solo?: boolean }>
  /** phase: 'prefetch'(클립 선다운로드) → 'record'(실시간 녹화). frac 0~1. */
  onPhase?: (phase: 'prefetch' | 'record', frac: number) => void
  signal?: AbortSignal
}): Promise<DraftRenderStats> {
  const { layout, shots, videoClips, audioClips, audioTracks, onPhase, signal } = opts
  const input: FrameInput = { shots, videoClips, clipOrder: opts.clipOrder, overlay: opts.overlay, videoTracks: opts.videoTracks }

  // 빈 곳이 있어도 영상 줄은 마지막 클립 끝까지다(자유 배치, 2026-11-14).
  const videoTotal = timelineEnd(layout)
  const audioEnd = audioClips.reduce((m, a) => Math.max(m, a.startSec + a.durationSec), 0)
  const total = Math.max(videoTotal, audioEnd, opts.endSec ?? 0)
  if (!(total > 0)) throw new Error('empty timeline')
  if (signal?.aborted) throw abortError()

  // ── 1) 선다운로드: 눈 켠 줄의 영상 전체 + 원격 오디오 (실패는 스트리밍 폴백 — 렌더는 계속) ──
  const hidden = new Set(opts.videoTracks.filter((t) => t.hidden).map((t) => t.id))
  const placed = selectVideoLayout(input)
    .filter((item) => !hidden.has(item.trackId))
    .sort((a, b) => a.startSec - b.startSec)
  const clipUrl = (shotId: string) => videoClips.find((c) => c.shotId === shotId)?.url ?? null
  const audible = draftAudioClips(audioClips, audioTracks)
  const remoteUrls = [
    ...placed.map((item) => clipUrl(item.shotId)).filter((u): u is string => !!u),
    ...audible.map((a) => a.url).filter((u) => /^https?:/i.test(u)),
  ]
  // 취소하면 미리 받기도 바로 멈춘다(QA 2026-11-03 밤) — 받기가 다 끝날 때까지 "클립 준비 중"이 남았다.
  await prefetchVideos(opts.projectId, remoteUrls, (done, prefetchTotal) => {
    onPhase?.('prefetch', prefetchTotal > 0 ? done / prefetchTotal : 1)
  }, { signal })
  if (signal?.aborted) throw abortError()

  const localUrl = (url: string): string => cachedVideoUrl(url) ?? url

  // ── 2) 장치 준비: 캔버스(시퀀스 크기) · 타이틀 카드 그림 · 오디오 그래프 · 레코더 ──
  const { width: W, height: H } = opts.frameSize
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  const filterOk = canvasFilterSupported(ctx)
  drawPlaceholder(ctx, W, H, '')

  // 타이틀 카드 그림은 녹화 전에 다 받아 둔다 — 실패 · 지연(8초)이면 그림 없이 글자만(약속 J6 · J7 · J8).
  const titleCards = new Map<string, { card: TitleCardData; image: HTMLImageElement | null }>()
  for (const item of placed) {
    const card = shots.find((s) => s.shotId === item.shotId)?.titleCard
    if (card && !titleCards.has(item.shotId)) titleCards.set(item.shotId, { card, image: await loadTitleImage(card.imageUrl) })
  }
  if (signal?.aborted) throw abortError()

  const ac = new AudioContext()
  const dest = ac.createMediaStreamDestination()
  const audioEls = audible.map((clip) => {
    const el = document.createElement('audio')
    el.crossOrigin = 'anonymous'
    el.preload = 'auto'
    el.src = localUrl(clip.url)
    // 영상에 이어진 소리는 그 영상의 속도로 — 미리 보기와 같다(2026-11-10 결정 4).
    const rate = clip.playbackRate ?? 1
    el.playbackRate = rate
    const source = ac.createMediaElementSource(el)
    const gain = ac.createGain()
    const volume = Math.max(0, Math.min(1, clip.volume))
    const level = volume * audioFadeGain(clip, 0)
    gain.gain.value = level
    source.connect(gain).connect(dest)
    return { el, clip, endSec: clip.startSec + clip.durationSec, rate, gain, volume, level }
  })

  // 영상 요소 — 클립마다 하나. 곧 그릴 층부터 붙이고, 목록에서 빠지면 거둔다.
  const pool = new Map<string, { el: HTMLVideoElement; waitingSince: number | null }>()
  const failedUrls = new Set<string>()
  const placeholderIds = new Set<string>()
  const failed = (shotId: string) => {
    const url = clipUrl(shotId)
    return !url || failedUrls.has(url)
  }
  const videoOf = (shotId: string) => {
    const url = clipUrl(shotId)
    if (!url || failedUrls.has(url)) return null
    let entry = pool.get(shotId)
    if (!entry) {
      const el = document.createElement('video')
      el.muted = true
      el.playsInline = true
      el.crossOrigin = 'anonymous'
      el.preload = 'auto'
      el.addEventListener('error', () => failedUrls.add(url))
      el.src = localUrl(url)
      entry = { el, waitingSince: null }
      pool.set(shotId, entry)
    }
    return entry
  }
  const release = (el: HTMLVideoElement) => {
    el.pause()
    el.removeAttribute('src')
    el.load()
  }
  const hasPicture = (el: HTMLVideoElement) => el.readyState >= 2 && !el.seeking && el.videoWidth > 0
  const sources: FrameSources = {
    video: (shotId) => {
      const entry = pool.get(shotId)
      return entry && !failed(shotId) && hasPicture(entry.el) ? entry.el : null
    },
    titleCards,
    shots: new Map(shots.map((s) => [s.shotId, s])),
    clips: new Map(videoClips.map((c) => [c.shotId, c])),
    filterOk,
  }

  /**
   * 그 시각 목록의 영상 층(곧 그릴 층 포함)을 붙이고 모니터와 같은 함수로 시각을 맞춘다 — 목록에서 빠진 영상은 거둔다. 보이는 영상 층이
   *   아직 그림을 못 냈으면 true(그 장은 그리지 않는다). 8초 넘게 못 내면 그 클립은 못 불러온 것으로 친다.
   */
  const prepare = (plan: FramePlan, playing: boolean): boolean => {
    const wanted = new Set<string>()
    for (const layer of [...plan.layers, ...plan.preload]) {
      if (layer.kind !== 'video') continue
      const entry = videoOf(layer.shotId)
      if (!entry) continue
      wanted.add(layer.shotId)
      syncLayerVideo(entry.el, layer, videoClips.find((c) => c.shotId === layer.shotId)?.speed ?? 1, playing)
    }
    for (const [id, entry] of pool) {
      if (wanted.has(id)) continue
      release(entry.el)
      pool.delete(id)
    }
    let waiting = false
    const now = performance.now()
    for (const layer of plan.layers) {
      if (layer.kind !== 'video' || layer.alpha <= 0) continue
      const entry = pool.get(layer.shotId)
      if (!entry || failed(layer.shotId)) continue
      if (hasPicture(entry.el)) {
        entry.waitingSince = null
        continue
      }
      entry.waitingSince ??= now
      if (now - entry.waitingSince > LOAD_TIMEOUT_MS) failedUrls.add(clipUrl(layer.shotId) as string)
      else waiting = true
    }
    // 맨 위 영상이 없거나 못 불러오면 자리표시로 들어간다 — 끝에 그 클립 수를 알린다.
    const top = plan.layers.find((l) => l.shotId === plan.topShotId)
    if (top?.kind === 'video' && top.alpha > 0 && failed(top.shotId)) placeholderIds.add(top.shotId)
    return waiting
  }

  const mimeType = pickMimeType()
  // 녹화 장 수 — Editor 의 시:분:초:장 · 시퀀스 정보와 같은 값(2단계 ① 새 배치).
  const stream = canvas.captureStream(SEQUENCE_FPS)
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

  const cleanup = () => {
    if (raf != null) cancelAnimationFrame(raf)
    for (const { el } of audioEls) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    for (const { el } of pool.values()) release(el)
    pool.clear()
    void ac.close().catch(() => {})
  }

  const recorded = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
    recorder.onerror = () => reject(new Error('MediaRecorder error'))
  })

  const finishedAll = (async () => {
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

    // 장마다: 그릴 것 목록 → 영상 층 맞추기 → 그리기(보이는 영상 층이 다 그림을 냈을 때만) → 소리.
    const drawLoop = () => {
      if (aborted) return
      const clock = clockSec()
      onPhase?.('record', Math.min(1, clock / total))
      // 그릴 것 목록(2단계 ⑦) — 모니터와 같은 목록. 곧 그릴 층은 1.5초 먼저 불러 둔다.
      const plan = selectFrameAt(input, clock, { prerollSec: PRELOAD_SEC })
      const waiting = prepare(plan, true)
      // 아직 그림을 못 낸 영상 층이 있으면 그리지 않는다 — 캔버스에 직전 장이 남는다(멈춤으로 흡수).
      if (!waiting) drawPlanFrame(ctx, W, H, plan, sources)
      // 오디오: 활성 구간 진입 시 소스 오프셋으로 시킹해 재생, 이탈 시 정지. 크기는 장마다 소리 크기 × 페이드 세기(2단계 ⑤, 미리 보기와 같다).
      for (const a of audioEls) {
        const active = clock >= a.clip.startSec && clock < a.endSec
        if (active && a.el.paused) {
          a.el.currentTime = audioSourceTime(a.clip, clock)
          void a.el.play().catch(() => {})
        } else if (!active && !a.el.paused) {
          a.el.pause()
        }
        const level = a.volume * audioFadeGain(a.clip, clock)
        if (Math.abs(level - a.level) > 1e-3) {
          a.level = level
          a.gain.gain.setTargetAtTime(level, ac.currentTime, 0.015)
        }
      }
      raf = requestAnimationFrame(drawLoop)
    }

    // 첫 장의 영상을 먼저 불러 그 자리에 세워 둔다 → 녹화 시작 — 선두 블랙 프레임을 줄인다.
    prepare(selectFrameAt(input, 0, { prerollSec: PRELOAD_SEC }), false)
    await Promise.all(
      [...pool.values()].map(async ({ el }) => {
        if (!hasPicture(el)) await waitEvent(el, 'loadeddata', LOAD_TIMEOUT_MS)
        if (el.seeking) await waitEvent(el, 'seeked', 2000)
      }),
    )
    if (signal?.aborted) throw abortError()

    recorder.start(1000)
    t0Promise.t0 = performance.now()
    raf = requestAnimationFrame(drawLoop)

    // 시퀀스 끝까지 — 그릴 층이 없는 자리(빈 곳 · 소리 · 눈 끈 줄만 남은 끝)는 미리 보기처럼 순검정이다(자유 배치 · 검토 c ② 낮음 4).
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

  return { durationSec: total, bytes: blob.size, mimeType, skippedClips: placeholderIds.size }
}
