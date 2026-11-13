'use client'

import { AlertCircle, ArrowLeftToLine, ArrowRightToLine, ChevronLeft, ChevronRight, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { crossOverlayAt, crossSourceSec, dipOpacityAt, dissolveOpacityAt, edgeFadeAt, transitionWindows } from '@/lib/editor/transition'
import { videoEffectFilter } from '@/lib/editor/video-effects'
import { drawTitleCard } from '@/lib/editor/title-card'
import { useEntityNames } from '@/lib/writer/use-entity-names'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { useRef, useState, useEffect, useCallback, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { TitleCardStage } from '@/features/editor/title-card-stage'
import { SubtitleLayer } from '@/features/editor/subtitle-layer'
import { resolveSubtitle } from '@/lib/editor/subtitle'
import { useEditorStore, selectProgramLayout, selectStackAt, selectVideoLayout, isTitleCardShotId } from '@/stores/editor-store'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { editPointTarget } from '@/lib/editor/timeline-segments'
import { SEQUENCE_FPS, exportFrameSize, formatTimecode, sequenceLengthSec } from '@/lib/editor/sequence-info'
import { cachedVideoUrl } from '@/features/editor/video-prefetch'
import { previewPane } from '@/features/editor/editor-labels'
import { useT } from '@/lib/i18n'
import type { VideoClip } from '@/types'
import type { TitleCardData } from '@/types/shot'

const FRAME = 1 / SEQUENCE_FPS
/** 교차 디졸브로 겹칠 클립을 재생 중 이만큼 먼저 불러 둔다(초) — 겹치기 시작할 때 그림이 비지 않게. */
const CROSS_PREROLL_SEC = 1

/**
 * 클립 모션 · 불투명도 · 영상 효과를 영상 그림에 입힌다(2단계 ④ · ⑤) — 위치는 틀 폭 · 높이 비율, 비율은 가운데를 기준으로, 효과는 CSS filter
 *   (흐림 반지름은 틀 폭 기준). 처음 값이면 아무것도 안 붙인다. 빈 끝 교차 디졸브로 옅어지는 정도는 재생 고리가 불투명도에 곱한다.
 */
function layerStyle(clip: Pick<VideoClip, 'motion' | 'opacity' | 'effects'> | undefined, frameWidth: number): CSSProperties | undefined {
  const motion = clip?.motion
  const opacity = clip?.opacity
  const filter = videoEffectFilter(clip?.effects, frameWidth)
  if (!motion && opacity === undefined && !filter) return undefined
  return {
    ...(motion ? { transform: `translate(${motion.x * 100}%, ${motion.y * 100}%) scale(${motion.scale})` } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
    ...(filter ? { filter } : {}),
  }
}

/** 타이틀 카드 한 장을 내보내기와 같은 그림(drawTitleCard)으로 — 교차 디졸브로 다른 클립 위에 겹칠 때(2단계 ⑤). */
function TitleCardPicture({ card }: { card: TitleCardData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let image: HTMLImageElement | null = null
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
    if (card.imageUrl) {
      const loading = new Image()
      loading.onload = () => {
        if (cancelled) return
        image = loading
        draw()
      }
      loading.src = card.imageUrl
    }
    return () => {
      cancelled = true
    }
  }, [card])
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
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

/**
 * Editor 프리뷰. 두 모드:
 *   1) 타임라인 모드(default): currentTime 아래 클립을 trim/speed 반영해 일렬 재생.
 *      영상이 없는 구간(영상 끝 이후 등)에선 클립을 잡지 않고 검은 화면 (요청 1).
 *   2) 소스 미리보기 모드(previewSourceShotId): 단일 클립을 원본 그대로 loop 재생.
 *   영상을 불러오지 못하면(404 · 막힘 · 끊김) 검은 화면 대신 그 컷 자리에 안내를 보이고 그 클립을 "불러오지 못함"으로 남긴다
 *   (QA 2026-11-03 밤 — 검은 채 아무 말이 없어 아직 불러오는 것처럼 보였다). 판단은 editor-labels.previewPane.
 */
export function VideoPreviewer() {
  const entityNames = useEntityNames()
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  // 지금 시각 · 전체 길이(시:분:초:장) — 시안 E1 409:4721 · 409:4722.
  const currentRef = useRef<HTMLSpanElement>(null)
  const totalRef = useRef<HTMLSpanElement>(null)
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dissolveRef = useRef<HTMLDivElement>(null)
  // 흰색으로 물들이기 막 · 교차 디졸브로 겹치는 두 클립(2단계 ⑤) — 투명도 · 시각은 재생 고리가 바꾸고, 어느 클립인지만 상태로 둔다.
  //   경계 앞뒤 두 클립을 구간 내내 같은 그림 요소로 둔다(shotId 로 찾음) — 경계에서 다시 불러오지 않게.
  const whiteRef = useRef<HTMLDivElement>(null)
  const crossBoxes = useRef(new Map<string, HTMLDivElement>())
  const crossVideos = useRef(new Map<string, HTMLVideoElement>())
  const crossPairRef = useRef<string[]>([])
  const [crossPair, setCrossPair] = useState<string[]>([])
  const activeIdRef = useRef<string | null>(null)

  // 아래 줄 — 위 클립이 화면을 다 덮지 않을 때 그 밑에 비쳐 보이는 클립들(아래 줄부터, 2단계 ④). 영상 그림은 shotId 로 찾는다.
  const underIdsRef = useRef<string[]>([])
  const underRefs = useRef(new Map<string, HTMLVideoElement>())
  const [underIds, setUnderIds] = useState<string[]>([])
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
      const v = videoRef.current
      const preview = st.previewSourceShotId

      if (preview) {
        if (dissolveRef.current) dissolveRef.current.style.opacity = '0'
        if (whiteRef.current) whiteRef.current.style.opacity = '0'
        if (crossPairRef.current.length) {
          crossPairRef.current = []
          setCrossPair([])
        }
        // 소스 미리 보기는 원본 그대로 — 타임라인에서 옅게 한 불투명도를 거둔다.
        if (v?.style.opacity) v.style.opacity = ''
        if (underIdsRef.current.length) {
          underIdsRef.current = []
          setUnderIds([])
        }
        if (preview !== activeIdRef.current) {
          activeIdRef.current = preview
          setActiveShotId(preview)
          setActualDuration(null)
        }
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

      // 타임라인 모드 — 전체 길이는 시퀀스 길이(모든 줄 · 소리의 끝, 빈 곳 · 눈 끈 줄 포함 — 검토 c 보통 1 · ② 낮음 4). 줄이 여럿이면
      //   시각마다 눈을 켠 가장 위 줄의 클립을 보인다(2단계 ②) — 가려졌다 다시 보이는 클립은 그 자리부터.
      const layout = selectProgramLayout(st)
      const total = sequenceLengthSec(selectVideoLayout(st), st.audioClips)
      const t = st.currentTime
      // 영상이 없는 구간에선 클립을 강제로 잡지 않음 → 검은 화면 (요청 1)
      const item = layout.find((l) => t >= l.startSec && t < l.startSec + l.durationSec)
      // 전환(2단계 ⑤) — 맞닿은 컷마다 하나, 빈 끝마다 그 클립 것(src/lib/editor/transition.ts).
      const videoLayout = selectVideoLayout(st)
      const windows = transitionWindows(videoLayout, st.videoClips)
      const dips = dipOpacityAt(windows, layout, t)
      // 타이틀 카드는 영상이 아니라 빈 끝의 교차 디졸브를 검은 막으로 — 검정에서 나타나고 검정으로 사라진다.
      const titleFade = item && isTitleCardShotId(item.shotId) ? 1 - edgeFadeAt(windows, item.shotId, t) : 0
      // 디졸브(2026-09-08): 검은 막의 투명도만 시간에 따라 — 영상 픽셀은 손대지 않는다. 예전 시작 디졸브(내보내기와 같은 함수)에
      //   끝 · 빈 끝 쪽을 더하고, 흰색으로 물들이기는 같은 자리의 흰 막이다.
      if (dissolveRef.current) dissolveRef.current.style.opacity = String(Math.max(dissolveOpacityAt(layout, st.videoClips, t), dips.black, titleFade))
      if (whiteRef.current) whiteRef.current.style.opacity = String(dips.white)

      // 교차 디졸브 — 맨 위 클립 위로 다른 클립을 겹쳐 투명도를 바꾼다(모자란 원본은 첫 장 · 끝 장에 멈춤). 재생 중이면 먼저 불러 둔다.
      //   경계에서 맨 위 영상이 바뀌어 다시 불러오는 동안은 겹친 층의 같은 클립이 맨 위 영상 자리를 대신한다(검은 번쩍임 없이).
      const cross = crossOverlayAt(windows, layout, t, st.isPlaying ? CROSS_PREROLL_SEC : 0)
      const pair = cross && item ? [cross.shotId, item.shotId].sort() : []
      if (pair.join('|') !== crossPairRef.current.join('|')) {
        crossPairRef.current = pair
        setCrossPair(pair)
      }
      if (cross && item) {
        const mainReady = !!v && v.dataset.shotId === item.shotId && v.readyState >= 2 && !v.seeking
        for (const shotId of pair) {
          const over = shotId === cross.shotId
          const box = crossBoxes.current.get(shotId)
          if (box) {
            box.style.zIndex = over ? '2' : '1'
            box.style.opacity = String(over ? cross.opacity : mainReady || isTitleCardShotId(shotId) ? 0 : 1)
          }
          const el = crossVideos.current.get(shotId)
          const placed = videoLayout.find((l) => l.shotId === shotId)
          const c = st.videoClips.find((x) => x.shotId === shotId)
          const s = st.shots.find((x) => x.shotId === shotId)
          if (!el || !placed || !c || !s) continue
          const speed = c.speed ?? 1.0
          const src = crossSourceSec(placed, c, c.actualDurationSec ?? s.durationSeconds, t)
          // 맨 위 클립의 대신 설 층은 맨 위 영상의 실제 시각을 따라간다 — 경계에서 바꿔 끼울 때 그림이 뒤로 튀지 않게.
          const target = !over && mainReady && v ? v.currentTime : src.sec
          if (st.isPlaying && !src.held) {
            if (el.paused) void el.play().catch(() => {})
            // 작은 어긋남은 빠르기를 살짝 바꿔 따라잡는다 — 다시 찾으면(seek) 찾는 동안 그림이 멈추고, 찾는 사이에 또 어긋난다.
            const drift = target - el.currentTime
            if (Math.abs(drift) > 0.5) el.currentTime = target
            const rate = speed * (drift > 0.04 ? 1.25 : drift < -0.04 ? 0.8 : 1)
            if (el.playbackRate !== rate) el.playbackRate = rate
          } else {
            if (!el.paused) el.pause()
            if (el.playbackRate !== speed) el.playbackRate = speed
            // 멈춘 첫 장 · 끝 장은 이미 그 근처에 서 있으면 다시 찾지 않는다 — 원본 끝 근처를 찾는 동안 그림이 비지 않게.
            if (Math.abs(el.currentTime - target) > (src.held ? 0.3 : 0.02)) el.currentTime = target
          }
        }
      }
      const id = item?.shotId ?? null
      if (id !== activeIdRef.current) {
        activeIdRef.current = id
        setActiveShotId(id)
        setActualDuration(null)
        setEditingTitleCard(false)
      }

      if (fillRef.current) fillRef.current.style.width = total > 0 ? `${Math.min(100, (t / total) * 100)}%` : '0%'
      if (currentRef.current) currentRef.current.textContent = formatTimecode(t)
      if (totalRef.current) totalRef.current.textContent = formatTimecode(total)

      if (v && item) {
        const clip = st.videoClips.find((c) => c.shotId === item.shotId)
        if (clip?.url) {
          v.loop = false
          const trimStart = clip.trimStart ?? 0
          const speed = clip.speed ?? 1.0
          const local = trimStart + (t - (item.clipStartSec ?? item.startSec)) * speed
          if (v.playbackRate !== speed) v.playbackRate = speed
          if (st.isPlaying) {
            if (v.paused) void v.play().catch(() => {})
            if (Math.abs(v.currentTime - local) > 0.3) v.currentTime = local
          } else {
            if (!v.paused) v.pause()
            if (Math.abs(v.currentTime - local) > 0.02) v.currentTime = local
          }
          // 빈 끝의 교차 디졸브 — 옅어지는 만큼 아래 줄(없으면 검정)이 비친다(2단계 ⑤).
          v.style.opacity = String(Math.round((clip.opacity ?? 1) * edgeFadeAt(windows, item.shotId, t) * 1000) / 1000)
        }
      } else if (v && !v.paused) {
        v.pause()
      }

      // 아래 줄(2단계 ④) — 위 클립이 화면을 다 덮지 않으면 그 밑 줄 영상도 같은 시각으로 맞춰 함께 재생한다. 아래 줄 타이틀 카드 ·
      //   못 불러온 영상은 그리지 않는다.
      const under = selectStackAt(st, t)
        .slice(0, -1)
        .filter((l) => {
          const c = st.videoClips.find((x) => x.shotId === l.shotId)
          return !!c?.url && !isTitleCardShotId(l.shotId) && !st.unplayableVideoUrls.includes(c.url)
        })
      const ids = under.map((l) => l.shotId)
      if (ids.join('|') !== underIdsRef.current.join('|')) {
        underIdsRef.current = ids
        setUnderIds(ids)
      }
      for (const l of under) {
        const el = underRefs.current.get(l.shotId)
        const c = st.videoClips.find((x) => x.shotId === l.shotId)
        if (!el || !c) continue
        const speed = c.speed ?? 1.0
        const local = (c.trimStart ?? 0) + (t - l.startSec) * speed
        if (el.playbackRate !== speed) el.playbackRate = speed
        el.style.opacity = String(Math.round((c.opacity ?? 1) * edgeFadeAt(windows, l.shotId, t) * 1000) / 1000)
        if (st.isPlaying) {
          if (el.paused) void el.play().catch(() => {})
          if (Math.abs(el.currentTime - local) > 0.3) el.currentTime = local
        } else {
          if (!el.paused) el.pause()
          if (Math.abs(el.currentTime - local) > 0.02) el.currentTime = local
        }
      }

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
  // 타이틀 카드(#owner-title-card) 구간 — 영상 없이 검은 배경 + 중앙 텍스트(+선택 이미지)만 렌더.
  const isTitleCard = !!activeShotId && isTitleCardShotId(activeShotId)
  const pane = previewPane({ isTitleCard, hasShot: !!activeShot, clip: activeClip, unplayable })
  // 교차 디졸브로 겹쳐 그리는 두 클립(2단계 ⑤) — 영상은 그 클립 모습(모션 · 효과) 그대로, 타이틀 카드는 내보내기와 같은 그림으로.
  //   차례는 shotId 순으로 고정하고 위아래는 z-index 로 바꾼다(요소를 옮기면 영상이 멈춘다). 투명도는 재생 고리가 바꾼다.
  //   맨 위 클립 그림 바로 위 · 자막 아래에 둔다.
  const crossLayer = crossPair.length > 0 ? (
    <div data-testid="program-cross-layer" className="pointer-events-none absolute inset-0">
      {crossPair.map((shotId) => {
        const clip = videoClips.find((c) => c.shotId === shotId)
        const card = shots.find((s) => s.shotId === shotId)?.titleCard
        return (
          <div
            key={shotId}
            ref={(el) => {
              if (el) crossBoxes.current.set(shotId, el)
              else crossBoxes.current.delete(shotId)
            }}
            className="absolute inset-0 overflow-hidden"
            style={{ opacity: 0 }}
          >
            {isTitleCardShotId(shotId) ? (
              <TitleCardPicture card={card ?? { text: '', imageUrl: null }} />
            ) : clip?.url ? (
              <video
                ref={(el) => {
                  if (el) crossVideos.current.set(shotId, el)
                  else crossVideos.current.delete(shotId)
                }}
                src={cachedVideoUrl(clip.url) ?? clip.url}
                muted
                playsInline
                preload="auto"
                className="absolute inset-0 h-full w-full object-contain"
                style={layerStyle(clip, frame.width)}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  ) : null

  return (
    <div className="flex h-full flex-col">
      <div ref={pictureRef} data-testid="program-picture" className="relative flex min-h-0 flex-1 flex-col items-center justify-center bg-black">
        {pane === 'title' && activeShotId ? (
          // 약속 J(2026-09-04): 글자·이미지 자유 배치 무대 — 내보내기와 같은 배치·줄바꿈(src/lib/editor/title-card.ts).
          <TitleCardStage
            key={activeShotId}
            card={activeShot?.titleCard ?? { text: '', imageUrl: null }}
            editing={editingTitleCard}
            onStartEdit={() => {
              if (!editingTitleCard) pushHistory()
              setEditingTitleCard(true)
            }}
            onStopEdit={() => setEditingTitleCard(false)}
            onChange={(patch) => updateTitleCard(activeShotId, patch)}
            onBeforeChange={pushHistory}
            overlay={
              <>
                {crossLayer}
                {activeShot ? (
                  <SubtitleLayer
                    key={`sub-${activeShotId}`}
                    subtitle={resolveSubtitle(activeShot)}
                    onChange={(patch) => setSubtitle(activeShotId, patch)}
                    onBeforeChange={pushHistory}
                  />
                ) : null}
              </>
            }
          />
        ) : pane === 'video' && activeClip?.url ? (
          // 약속 K: 자막은 화면 틀 위에 얹힌다 — 틀은 시퀀스 비율(내보내기 크기)이라 자리 비율이 내보내기와 같다.
          //   2단계 ④: 틀 안에 아래 줄부터 영상을 겹쳐 그리고 클립마다 모션(위치 · 비율) · 불투명도를 입힌다. 틀 밖으로 나간 부분은 잘리고,
          //   아무것도 없는 자리는 검정이다(시안 E3 "배경 위에 샷").
          <div
            data-testid="program-frame"
            className="relative overflow-hidden rounded"
            style={frame.width > 0 ? { width: frame.width, height: frame.height } : { width: '100%', height: '100%' }}
          >
            {underIds.map((id) => {
              const underClip = videoClips.find((c) => c.shotId === id)
              if (!underClip?.url) return null
              return (
                <video
                  key={`under-${id}`}
                  data-testid="program-under-layer"
                  ref={(el) => {
                    if (el) underRefs.current.set(id, el)
                    else underRefs.current.delete(id)
                  }}
                  src={cachedVideoUrl(underClip.url) ?? underClip.url}
                  muted
                  playsInline
                  preload="auto"
                  className="absolute inset-0 h-full w-full object-contain"
                  style={layerStyle(underClip, frame.width)}
                />
              )
            })}
            <video
              key={activeShotId ?? 'none'}
              ref={videoRef}
              data-shot-id={activeShotId ?? undefined}
              // "전체 보기" 프리패치가 받아둔 blob 이 있으면 그걸로 — 클립 경계 전환이 즉시가 된다(#watch-all).
              src={cachedVideoUrl(activeClip.url) ?? activeClip.url}
              muted
              playsInline
              preload="auto"
              className="absolute inset-0 h-full w-full object-contain"
              // 소스 미리 보기는 원본 그대로 — 효과는 타임라인 클립에만.
              style={previewSourceShotId ? undefined : layerStyle(activeClip, frame.width)}
              onLoadedMetadata={() => {
                if (videoRef.current) setActualDuration(videoRef.current.duration)
              }}
              onError={() => markVideoUnplayable(activeClip.url)}
            />
            {crossLayer}
            {activeShot && activeShotId && (
              <SubtitleLayer
                key={`sub-${activeShotId}`}
                subtitle={resolveSubtitle(activeShot)}
                onChange={(patch) => setSubtitle(activeShotId, patch)}
                onBeforeChange={pushHistory}
              />
            )}
          </div>
        ) : pane === 'unplayable' && activeShot ? (
          // 영상을 불러오지 못한 컷 — 아직 영상이 없는 컷과 같은 작은 판에 그 까닭(다른 컷은 그대로 재생된다).
          <div className="flex w-[380px] max-w-[calc(100%-2rem)] flex-col items-center rounded-2xl bg-panel px-7 py-5 text-center" data-testid="preview-unplayable">
            <p className="font-num text-[20px] font-semibold text-foreground">{activeShot.shotType}</p>
            <p className="mt-2 line-clamp-3 text-[12.5px] leading-[1.5] text-muted-foreground">{resolveEntityNames(activeShot.actionDescription, entityNames)}</p>
            <p className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-destructive">
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              {t("Couldn't load this cut's video.")}
            </p>
          </div>
        ) : activeShot ? (
          // v3 ED1(2026-11-03): 아직 영상이 없는 컷 — 큰 판 안 작은 판(샷 크기 · 설명 · 상태).
          <div className="flex w-[380px] max-w-[calc(100%-2rem)] flex-col items-center rounded-2xl bg-panel px-7 py-5 text-center">
            <p className="font-num text-[20px] font-semibold text-foreground">{activeShot.shotType}</p>
            <p className="mt-2 line-clamp-3 text-[12.5px] leading-[1.5] text-muted-foreground">{resolveEntityNames(activeShot.actionDescription, entityNames)}</p>
            <p className="mt-4 text-[11px] font-medium text-subtle-foreground">
              {activeClip?.status === 'generating' ? t('Generating') : t('No video made yet')}
            </p>
          </div>
        ) : (
          // 영상 없는 구간 = 검은 화면. 타임라인이 비었을 때만 안내 문구.
          !hasClips && <p className="text-label text-subtle-foreground">{t('No clips in the timeline')}</p>
        )}

        {/* 디졸브 막(2026-09-08): 검은 화면의 투명도만 바뀐다 — 클릭은 통과 */}
        <div ref={dissolveRef} data-testid="dissolve-overlay" className="pointer-events-none absolute inset-0 z-20 bg-black" style={{ opacity: 0 }} />
        {/* 흰색으로 물들이기 막(2단계 ⑤) — 시퀀스 틀 안만 희게(틀 밖 검은 띠는 그대로). 클릭은 통과 */}
        <div
          ref={whiteRef}
          data-testid="dip-white-overlay"
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 bg-white"
          style={{ opacity: 0, ...(frame.width > 0 ? { width: frame.width, height: frame.height } : { width: '100%', height: '100%' }) }}
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
