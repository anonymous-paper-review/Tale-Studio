'use client'

import { AlertCircle, ArrowLeftToLine, ArrowRightToLine, ChevronLeft, ChevronRight, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { videoEffectFilter } from '@/lib/editor/video-effects'
import { drawTitleCard } from '@/lib/editor/title-card'
import { useEntityNames } from '@/lib/writer/use-entity-names'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { useRef, useState, useEffect, useLayoutEffect, useCallback, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { TitleCardStage } from '@/features/editor/title-card-stage'
import { SubtitleLayer } from '@/features/editor/subtitle-layer'
import { TitleTextLayer } from '@/features/editor/title-clip-layer'
import { resolveSubtitle } from '@/lib/editor/subtitle'
import { useEditorStore, selectFrameAt, selectVideoLayout, isTitleCardShotId, type FrameLayerKind } from '@/stores/editor-store'
import { syncLayerVideo } from '@/lib/editor/layer-sync'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { editPointTarget } from '@/lib/editor/timeline-segments'
import { SEQUENCE_FPS, exportFrameSize, formatTimecode, sequenceLengthSec } from '@/lib/editor/sequence-info'
import { cachedVideoUrl } from '@/features/editor/video-prefetch'
import { previewPane } from '@/features/editor/editor-labels'
import { useT } from '@/lib/i18n'
import type { Shot, VideoClip } from '@/types'
import type { TitleCardData } from '@/types/shot'

const FRAME = 1 / SEQUENCE_FPS
/** 재생 중 곧 그릴 층(그냥 컷 · 교차 디졸브 짝 · 위 클립이 끝나 드러날 아래 클립)을 이만큼 먼저 불러 둔다(초) — 나타날 때 그림이 비지 않게. */
const PREROLL_SEC = 1

/**
 * 클립 모션 · 영상 효과를 영상 그림에 입힌다(2단계 ④ · ⑤) — 위치는 틀 폭 · 높이 비율, 비율은 가운데를 기준으로, 효과는 CSS filter
 *   (흐림 반지름은 틀 폭 기준). 처음 값이면 아무것도 안 붙인다. 세기(불투명도 × 전환)는 재생 고리가 층 상자에 입힌다.
 */
function layerStyle(clip: Pick<VideoClip, 'motion' | 'effects'> | undefined, frameWidth: number): CSSProperties | undefined {
  const motion = clip?.motion
  const filter = videoEffectFilter(clip?.effects, frameWidth)
  if (!motion && !filter) return undefined
  return {
    ...(motion ? { transform: `translate(${motion.x * 100}%, ${motion.y * 100}%) scale(${motion.scale})` } : {}),
    ...(filter ? { filter } : {}),
  }
}

/** 받아 둔 타이틀 카드 그림 — 층이 새로 생겨도(교차 디졸브 경계에서 고치는 무대 ↔ 그림) 그 장에 바로 그린다. */
const titleImages = new Map<string, HTMLImageElement>()

/** 타이틀 카드 한 장을 내보내기와 같은 그림(drawTitleCard)으로 — 고치는 무대가 아닌 층(아래 줄 · 교차 디졸브 짝)일 때(2단계 ⑤ · ⑦). */
function TitleCardPicture({ card }: { card: TitleCardData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 그리기 전 빈 장이 보이지 않게 화면에 내기 전에 그린다.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const url = card.imageUrl
    let image = url ? titleImages.get(url) ?? null : null
    let cancelled = false
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(rect.width * ratio))
      canvas.height = Math.max(1, Math.round(rect.height * ratio))
      const ctx = canvas.getContext('2d')
      if (ctx) drawTitleCard(ctx, canvas.width, canvas.height, card, image)
    }
    draw()
    if (url && !image) {
      const loading = new Image()
      loading.onload = () => {
        titleImages.set(url, loading)
        if (cancelled) return
        image = loading
        draw()
      }
      loading.src = url
    }
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw)
    ro?.observe(canvas)
    return () => {
      cancelled = true
      ro?.disconnect()
    }
  }, [card])
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
}

/**
 * 영상이 없거나 불러오지 못한 맨 위 컷 — 큰 판 안 작은 판(샷 크기 · 설명 · 상태, v3 ED1 2026-11-03). 불러오지 못한 영상은 검은 화면 대신
 *   그 까닭을 보인다(QA 2026-11-03 밤 — 검은 채 아무 말이 없어 아직 불러오는 것처럼 보였다). 판단은 editor-labels.previewPane.
 *   화면 안내라 시퀀스 틀이 아니라 모니터 칸 가운데에 둔다 — 세로 시퀀스의 좁은 틀에서도 다 읽힌다.
 */
function ShotInfoCard({ shot, unplayable, generating }: { shot: Shot; unplayable: boolean; generating: boolean }) {
  const entityNames = useEntityNames()
  const t = useT()
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="flex w-[380px] max-w-[calc(100%-2rem)] flex-col items-center rounded-2xl bg-panel px-7 py-5 text-center" data-testid={unplayable ? 'preview-unplayable' : undefined}>
        <p className="font-num text-[20px] font-semibold text-foreground">{shot.shotType}</p>
        <p className="mt-2 line-clamp-3 text-[12.5px] leading-[1.5] text-muted-foreground">{resolveEntityNames(shot.actionDescription, entityNames)}</p>
        {unplayable ? (
          <p className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-destructive">
            <AlertCircle className="size-3.5 shrink-0" aria-hidden />
            {t("Couldn't load this cut's video.")}
          </p>
        ) : (
          <p className="mt-4 text-[11px] font-medium text-subtle-foreground">{generating ? t('Generating') : t('No video made yet')}</p>
        )}
      </div>
    </div>
  )
}

/** 모니터 틀 크기 — 시퀀스 비율(내보내기 크기)을 모니터 칸 안에 맞춘다(2단계 ④). 재기 전에는 0. */
function useFrameSize(aspect: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const width = Math.min(el.clientWidth, el.clientHeight * aspect)
      setSize({ width: Math.floor(width), height: Math.floor(width / aspect) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect])
  return [ref, size] as const
}

/** 붙여 둔 층 — 그릴 층과 미리 불러 둘 층. 차례는 이름(shotId)으로 고정한다(요소를 옮기면 영상이 멈춘다). */
interface MountedLayer {
  id: string
  kind: FrameLayerKind
}

/**
 * Editor 프리뷰. 두 모드:
 *   1) 타임라인 모드(default): 시각마다 그릴 것 목록(selectFrameAt, 2단계 ⑦)을 시퀀스 틀 하나 안에 아래부터 겹쳐 그린다 — 내보내기와 같은
 *      목록이다. 층마다 이름(shotId)으로 같은 요소를 계속 쓰고(경계 · 판 바뀜에 다시 만들지 않는다) 위아래 · 세기만 재생 고리가 바꾼다.
 *      영상은 시퀀스 틀을 꽉 채운다(비율이 다르면 잘린다 — 내보내기와 같은 "비율 100%"). 영상이 없는 구간은 검은 화면 (요청 1).
 *   2) 소스 미리보기 모드(previewSourceShotId): 단일 클립을 원본 그대로(띠 · 효과 없이) loop 재생.
 */
export function VideoPreviewer() {
  const t = useT()
  // 소스 미리 보기 영상(타임라인 모드의 영상은 층마다 따로).
  const videoRef = useRef<HTMLVideoElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  // 지금 시각 · 전체 길이(시:분:초:장) — 시안 E1 409:4721 · 409:4722.
  const currentRef = useRef<HTMLSpanElement>(null)
  const totalRef = useRef<HTMLSpanElement>(null)
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dissolveRef = useRef<HTMLDivElement>(null)
  // 흰색으로 물들이기 막(2단계 ⑤) — 투명도는 재생 고리가 바꾼다.
  const whiteRef = useRef<HTMLDivElement>(null)
  // 그릴 것 목록의 층(2단계 ⑦) — 붙여 둘 층만 상태로 두고, 상자 · 영상 요소는 이름으로 찾는다. 위아래 · 세기 · 시각은 재생 고리가 바꾼다.
  const layerBoxes = useRef(new Map<string, HTMLDivElement>())
  const layerVideos = useRef(new Map<string, HTMLVideoElement>())
  const mountedKeyRef = useRef('')
  const [mounted, setMounted] = useState<MountedLayer[]>([])
  const activeIdRef = useRef<string | null>(null)

  const projectFormat = useProjectFormatStore((s) => s.format)
  const { width: frameW, height: frameH } = exportFrameSize(projectFormat)
  const [pictureRef, frame] = useFrameSize(frameW / frameH)

  const [activeShotId, setActiveShotId] = useState<string | null>(null)
  const [actualDuration, setActualDuration] = useState<number | null>(null)
  // 타이틀 카드 인라인 편집(#owner-title-card) — 프리뷰 더블클릭으로 열림. 저장은 blur/닫기 시.
  const [editingTitleCard, setEditingTitleCard] = useState(false)

  const shots = useEditorStore((s) => s.shots)
  const videoClips = useEditorStore((s) => s.videoClips)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const previewSourceShotId = useEditorStore((s) => s.previewSourceShotId)
  const masterVolume = useEditorStore((s) => s.masterVolume)
  // V1 이 비어도 V2 · V3 에 클립이 있으면 빈 타임라인이 아니다(검토 c ② 낮음 5).
  const hasClips = useEditorStore((s) => Object.values(s.clipOrder).some((ids) => ids.length > 0) || Object.keys(s.overlay).length > 0)
  const togglePlay = useEditorStore((s) => s.togglePlay)
  const seek = useEditorStore((s) => s.seek)
  const setMasterVolume = useEditorStore((s) => s.setMasterVolume)
  const updateTitleCard = useEditorStore((s) => s.updateTitleCard)
  const setSubtitle = useEditorStore((s) => s.setSubtitle)
  const pushHistory = useEditorStore((s) => s.pushHistory)
  const unplayable = useEditorStore((s) => s.unplayableVideoUrls)
  const markVideoUnplayable = useEditorStore((s) => s.markVideoUnplayable)

  // ── 동기화 루프 ──
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const st = useEditorStore.getState()
      const preview = st.previewSourceShotId

      if (preview) {
        if (dissolveRef.current) dissolveRef.current.style.opacity = '0'
        if (whiteRef.current) whiteRef.current.style.opacity = '0'
        if (mountedKeyRef.current) {
          mountedKeyRef.current = ''
          setMounted([])
        }
        if (preview !== activeIdRef.current) {
          activeIdRef.current = preview
          setActiveShotId(preview)
          setActualDuration(null)
        }
        const v = videoRef.current
        if (v) {
          const clip = st.videoClips.find((c) => c.shotId === preview)
          if (clip?.url) {
            v.loop = true
            if (v.playbackRate !== 1) v.playbackRate = 1
            if (st.isPlaying) {
              if (v.paused) void v.play().catch(() => {})
            } else if (!v.paused) {
              v.pause()
            }
          }
          const dur = v.duration || 0
          if (fillRef.current) fillRef.current.style.width = dur > 0 ? `${Math.min(100, (v.currentTime / dur) * 100)}%` : '0%'
          if (currentRef.current) currentRef.current.textContent = formatTimecode(v.currentTime)
          if (totalRef.current) totalRef.current.textContent = formatTimecode(dur)
        }
        raf = requestAnimationFrame(tick)
        return
      }

      // 타임라인 모드 — 전체 길이는 시퀀스 길이(모든 줄 · 소리의 끝, 빈 곳 · 눈 끈 줄 포함 — 검토 c 보통 1 · ② 낮음 4).
      const total = sequenceLengthSec(selectVideoLayout(st), st.audioClips)
      const t = st.currentTime
      // 그릴 것 목록(2단계 ⑦) — 줄 차례대로 영상 · 타이틀 카드 · 제목, 교차 디졸브 · 빈 끝 전환의 세기, 물들이기 막. 내보내기도 같은 목록이다.
      //   재생 중이면 곧 나타날 층을 미리 붙여 그 시각 원본 자리에 맞춰 둔다.
      const plan = selectFrameAt(st, t, { prerollSec: st.isPlaying ? PREROLL_SEC : 0 })
      const all = [...plan.layers, ...plan.preload]
      const next = all.map((l) => ({ id: l.shotId, kind: l.kind })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      const key = next.map((l) => l.id).join('|')
      if (key !== mountedKeyRef.current) {
        mountedKeyRef.current = key
        setMounted(next)
      }
      // 위아래 · 세기 — 목록 차례가 위아래다. 목록 밖(미리 불러 둘 층 · 막 빠진 층)은 그리지 않는다.
      const order = new Map(plan.layers.map((l, i) => [l.shotId, i]))
      for (const [id, box] of layerBoxes.current) {
        const i = order.get(id)
        box.style.zIndex = String(i === undefined ? 0 : i + 1)
        box.style.opacity = i === undefined ? '0' : String(plan.layers[i].alpha)
      }
      // 영상 층 시각 맞추기 — 내보내기와 같은 함수(src/lib/editor/layer-sync.ts). 보이는 맨 위 층은 0.3초 넘게 어긋나면 바로 다시 찾는다.
      for (const layer of all) {
        if (layer.kind !== 'video') continue
        const el = layerVideos.current.get(layer.shotId)
        if (el) syncLayerVideo(el, layer, st.videoClips.find((c) => c.shotId === layer.shotId)?.speed ?? 1.0, st.isPlaying, layer.shotId === plan.topShotId)
      }
      // 물들이기 막(2026-09-08 · 2단계 ⑤) — 검은 · 흰 막의 투명도만 시간에 따라(영상 픽셀은 손대지 않는다). 자막 위에 덮는다.
      if (dissolveRef.current) dissolveRef.current.style.opacity = String(plan.black)
      if (whiteRef.current) whiteRef.current.style.opacity = String(plan.white)

      // 맨 위 영상 · 타이틀 카드 — 자막 · 길이 표시 · 타이틀 카드 고치기가 따른다. 미리 불러 둔 영상이면 길이를 이미 안다.
      const id = plan.topShotId
      if (id !== activeIdRef.current) {
        activeIdRef.current = id
        setActiveShotId(id)
        const el = id ? layerVideos.current.get(id) : undefined
        setActualDuration(el && el.readyState >= 1 && Number.isFinite(el.duration) ? el.duration : null)
        setEditingTitleCard(false)
      }

      if (fillRef.current) fillRef.current.style.width = total > 0 ? `${Math.min(100, (t / total) * 100)}%` : '0%'
      if (currentRef.current) currentRef.current.textContent = formatTimecode(t)
      if (totalRef.current) totalRef.current.textContent = formatTimecode(total)

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const onProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const st = useEditorStore.getState()
      if (st.previewSourceShotId) {
        const v = videoRef.current
        if (v && v.duration) v.currentTime = ratio * v.duration
        return
      }
      const total = sequenceLengthSec(selectVideoLayout(st), st.audioClips)
      seek(ratio * total)
    },
    [seek],
  )

  // 모니터 재생 단추 줄(시안 E1 409:4727–4739) — 처음으로 · 앞 편집점 · 한 장 뒤 · 재생 · 한 장 앞 · 다음 편집점 · 끝으로.
  //   편집점은 Ctrl+← · Ctrl+→ 와 같은 자리, 한 장 단추는 꾹 누르면 이어서 움직인다(예전 도구 줄의 프레임 단추).
  const nudge = useEditorStore((s) => s.nudge)
  const goTo = useCallback((target: (st: ReturnType<typeof useEditorStore.getState>, layout: ReturnType<typeof selectVideoLayout>) => number) => {
    const st = useEditorStore.getState()
    // 편집점은 모든 영상 줄의 클립 시작 · 끝(2단계 ②).
    const layout = selectVideoLayout(st)
    nudge(target(st, layout) - st.currentTime)
  }, [nudge])
  const stopFrameHold = useCallback(() => {
    if (holdRef.current) clearInterval(holdRef.current)
    holdRef.current = null
  }, [])
  const startFrameHold = useCallback((delta: number) => {
    nudge(delta)
    stopFrameHold()
    holdRef.current = setInterval(() => nudge(delta), 70)
  }, [nudge, stopFrameHold])
  useEffect(() => stopFrameHold, [stopFrameHold])

  const activeShot = shots.find((s) => s.shotId === activeShotId)
  const activeClip = videoClips.find((c) => c.shotId === activeShotId)
  // 타이틀 카드(#owner-title-card) 구간 — 영상 없이 검은 배경 + 텍스트(+선택 이미지).
  const isTitleCard = !!activeShotId && isTitleCardShotId(activeShotId)
  const pane = previewPane({ isTitleCard, hasShot: !!activeShot, clip: activeClip, unplayable })
  const frameStyle: CSSProperties = frame.width > 0 ? { width: frame.width, height: frame.height } : { width: '100%', height: '100%' }

  /** 그릴 것 목록 층 하나의 그림 — 영상(틀을 꽉 채움 · 모션 · 효과), 타이틀 카드(맨 위면 고치는 무대), 제목 글자. */
  const layerContent = (id: string, kind: FrameLayerKind) => {
    const clip = videoClips.find((c) => c.shotId === id)
    if (kind === 'title') {
      // 제목 클립(2단계 ⑥) — 글자만 얹는다. 틀 밖으로 나간 글자는 잘린다.
      const data = shots.find((s) => s.shotId === id)?.titleText
      return data ? <TitleTextLayer data={data} frameWidth={frame.width} frameHeight={frame.height} motion={clip?.motion} /> : null
    }
    if (kind === 'card') {
      const card = shots.find((s) => s.shotId === id)?.titleCard ?? { text: '', imageUrl: null }
      return id === activeShotId && pane === 'title' ? (
        // 약속 J(2026-09-04): 글자·이미지 자유 배치 무대 — 내보내기와 같은 배치·줄바꿈(src/lib/editor/title-card.ts).
        <TitleCardStage
          card={card}
          editing={editingTitleCard}
          onStartEdit={() => {
            if (!editingTitleCard) pushHistory()
            setEditingTitleCard(true)
          }}
          onStopEdit={() => setEditingTitleCard(false)}
          onChange={(patch) => updateTitleCard(id, patch)}
          onBeforeChange={pushHistory}
        />
      ) : (
        <TitleCardPicture card={card} />
      )
    }
    // 영상이 없거나 불러오지 못한 클립은 그리지 않는다 — 맨 위면 모니터 칸 가운데에 안내 판(ShotInfoCard)이 뜬다.
    const url = clip?.url
    if (!url || unplayable.includes(url)) return null
    return (
      <video
        ref={(el) => {
          if (el) layerVideos.current.set(id, el)
          else layerVideos.current.delete(id)
        }}
        data-shot-id={id}
        // "전체 보기" 프리패치가 받아둔 blob 이 있으면 그걸로 — 클립 경계 전환이 즉시가 된다(#watch-all).
        src={cachedVideoUrl(url) ?? url}
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover"
        style={layerStyle(clip, frame.width)}
        onLoadedMetadata={(e) => {
          if (id === activeIdRef.current) setActualDuration(e.currentTarget.duration)
        }}
        onError={() => markVideoUnplayable(url)}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={pictureRef} data-testid="program-picture" className="relative flex min-h-0 flex-1 flex-col items-center justify-center bg-black">
        {/* 시퀀스 틀(내보내기 크기 비율, 2단계 ④ · ⑦) — 틀 밖으로 나간 부분은 잘리고, 아무것도 없는 자리는 검정이다(시안 E3 "배경 위에 샷"). */}
        <div data-testid="program-frame" className="relative overflow-hidden rounded" style={frameStyle}>
          {previewSourceShotId ? (
            pane === 'video' && activeClip?.url ? (
              // 소스 미리 보기는 원본 그대로 — 비율이 다르면 띠가 생기고, 모션 · 효과는 타임라인 클립에만.
              <video
                key={activeShotId ?? 'none'}
                ref={videoRef}
                src={cachedVideoUrl(activeClip.url) ?? activeClip.url}
                muted
                playsInline
                preload="auto"
                className="absolute inset-0 h-full w-full object-contain"
                onLoadedMetadata={() => {
                  if (videoRef.current) setActualDuration(videoRef.current.duration)
                }}
                onError={() => markVideoUnplayable(activeClip.url)}
              />
            ) : null
          ) : (
            // 그릴 것 목록의 층(selectFrameAt) — 차례는 이름(shotId)으로 고정하고 위아래 · 세기는 재생 고리가 z-index · 투명도로 바꾼다.
            //   고치는 타이틀 카드 무대만 누를 수 있다(나머지 층은 클릭이 통과).
            <div className="pointer-events-none absolute inset-0 isolate">
              {mounted.map(({ id, kind }) => (
                <div
                  key={id}
                  data-testid="program-layer"
                  data-kind={kind}
                  ref={(el) => {
                    if (el) layerBoxes.current.set(id, el)
                    else layerBoxes.current.delete(id)
                  }}
                  className={`absolute inset-0 overflow-hidden ${kind === 'card' && id === activeShotId && pane === 'title' ? 'pointer-events-auto' : ''}`}
                  style={{ opacity: 0 }}
                >
                  {layerContent(id, kind)}
                </div>
              ))}
            </div>
          )}
          {/* 약속 K: 자막은 화면 틀 위에 얹힌다 — 틀은 시퀀스 비율(내보내기 크기)이라 자리 비율이 내보내기와 같다. */}
          {activeShot && activeShotId && (pane === 'video' || pane === 'title') && (
            <SubtitleLayer
              key={`sub-${activeShotId}`}
              subtitle={resolveSubtitle(activeShot)}
              onChange={(patch) => setSubtitle(activeShotId, patch)}
              onBeforeChange={pushHistory}
            />
          )}
          {/* 영상 없는 구간 = 검은 화면. 타임라인이 비었을 때만 안내 문구. */}
          {!hasClips && !previewSourceShotId && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="text-label text-subtle-foreground">{t('No clips in the timeline')}</p>
            </div>
          )}
        </div>

        {activeShot && (pane === 'unplayable' || pane === 'no-video') && (
          <ShotInfoCard shot={activeShot} unplayable={pane === 'unplayable'} generating={activeClip?.status === 'generating'} />
        )}

        {/* 디졸브 막(2026-09-08): 검은 화면의 투명도만 바뀐다 — 클릭은 통과 */}
        <div ref={dissolveRef} data-testid="dissolve-overlay" className="pointer-events-none absolute inset-0 z-20 bg-black" style={{ opacity: 0 }} />
        {/* 흰색으로 물들이기 막(2단계 ⑤) — 시퀀스 틀 안만 희게(틀 밖 검은 띠는 그대로). 클릭은 통과 */}
        <div
          ref={whiteRef}
          data-testid="dip-white-overlay"
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 bg-white"
          style={{ opacity: 0, ...frameStyle }}
        />

        {/* 모드 뱃지 + 길이 뱃지 (활성 클립 있을 때만) */}
        <div className="absolute right-4 top-3.5 flex items-center gap-1.5">
          {previewSourceShotId && (
            <span className="rounded-full bg-stage px-2.5 py-0.5 text-[11.5px] font-semibold text-on-stage">{t('Source preview')}</span>
          )}
          {activeShot && (
            <span className="rounded-full bg-black/45 px-2 py-0.5 font-num text-meta font-medium text-muted-foreground">
              {t('{seconds}s', { seconds: (actualDuration ?? activeShot.durationSeconds).toFixed(1) })}
            </span>
          )}
        </div>
      </div>

      {/* 재생 막대 · 지금 시각 / 전체 길이 · 재생 단추 줄 · 모니터 음량(시안 E1 409:4721–4739, 음량은 결정 페이지 추천으로 남김) */}
      <div className="shrink-0 px-4 pb-3 pt-2">
        <div className="group relative flex h-4 cursor-pointer items-center" onClick={onProgressClick}>
          <div className="h-1 w-full rounded-full bg-white/15 transition-all group-hover:h-1.5">
            <div ref={fillRef} className="h-full rounded-full bg-foreground" style={{ width: '0%' }} />
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span ref={currentRef} className="w-[92px] shrink-0 font-num text-label font-semibold tabular-nums text-foreground">
            00:00:00:00
          </span>
          <div className="mx-auto flex items-center gap-0.5">
            <Button size="icon" variant="ghost" className="size-8 rounded-full text-muted-foreground hover:text-foreground" onClick={() => goTo(() => 0)} title={t('Go to start')} aria-label={t('Go to start')}>
              <ArrowLeftToLine className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-8 rounded-full text-muted-foreground hover:text-foreground" onClick={() => goTo((st, layout) => editPointTarget(layout, st.currentTime, -1))} title={t('Previous edit point (Ctrl+←)')} aria-label={t('Previous edit point (Ctrl+←)')}>
              <SkipBack className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 rounded-full text-muted-foreground hover:text-foreground"
              onPointerDown={() => startFrameHold(-FRAME)}
              onPointerUp={stopFrameHold}
              onPointerLeave={stopFrameHold}
              onPointerCancel={stopFrameHold}
              title={t('Previous frame (←) · hold for continuous')}
              aria-label={t('Previous frame (←) · hold for continuous')}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="icon" variant="secondary" className="mx-1 size-9 rounded-full" onClick={togglePlay} title={t('Play/pause (Space)')} aria-label={t('Play/pause (Space)')}>
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 rounded-full text-muted-foreground hover:text-foreground"
              onPointerDown={() => startFrameHold(FRAME)}
              onPointerUp={stopFrameHold}
              onPointerLeave={stopFrameHold}
              onPointerCancel={stopFrameHold}
              title={t('Next frame (→) · hold for continuous')}
              aria-label={t('Next frame (→) · hold for continuous')}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-8 rounded-full text-muted-foreground hover:text-foreground" onClick={() => goTo((st, layout) => editPointTarget(layout, st.currentTime, 1))} title={t('Next edit point (Ctrl+→)')} aria-label={t('Next edit point (Ctrl+→)')}>
              <SkipForward className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-8 rounded-full text-muted-foreground hover:text-foreground" onClick={() => goTo((st, layout) => sequenceLengthSec(layout, st.audioClips))} title={t('Go to end')} aria-label={t('Go to end')}>
              <ArrowRightToLine className="size-4" />
            </Button>
          </div>
          <span ref={totalRef} className="w-[92px] shrink-0 text-right font-num text-meta font-medium tabular-nums text-subtle-foreground">
            00:00:00:00
          </span>
          {/* 전역 재생 볼륨 (재생 전용) */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMasterVolume(masterVolume > 0 ? 0 : 1)}
              className="text-muted-foreground hover:text-foreground"
              title={masterVolume > 0 ? t('Mute') : t('Unmute')}
            >
              {masterVolume > 0 ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={masterVolume}
              onChange={(e) => setMasterVolume(Number(e.target.value))}
              className="h-1 w-16 cursor-pointer accent-primary"
              title={t('Overall volume {percent}%', { percent: Math.round(masterVolume * 100) })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
