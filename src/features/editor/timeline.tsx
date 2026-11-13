'use client'

import { useRef, useCallback, useMemo, useEffect, useState, type ReactNode } from 'react'
import { useEntityNames } from '@/lib/writer/use-entity-names'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { AlertCircle, Trash2, Plus, Volume2, VolumeX, Scissors, Gauge, Type, Blend, Eye, EyeOff, Lock, LockOpen } from 'lucide-react'
import { DISSOLVE_CHOICES } from '@/lib/editor/transition'
import type { ClipTransition } from '@/types'
import type { Shot, VideoClip, AudioTrackClip } from '@/types'
import { cn } from '@/lib/utils'
import { drawWaveform } from '@/lib/audio-waveform'
import { PX_PER_SEC_MIN, PX_PER_SEC_MAX, isTitleCardShotId, useEditorStore, type TrackLayoutItem, type VideoTrackState, type AudioTrackState } from '@/stores/editor-store'
import { timelineEnd, timelineSegments } from '@/lib/editor/timeline-segments'
import { formatTimecode } from '@/lib/editor/sequence-info'
import { SNAP_PX, draggedIds, makeSnapper, snapTargets } from '@/lib/editor/snap'
import { RulerMarkers } from '@/features/editor/timeline-markers'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
} from '@/components/ui/context-menu'
import { TimelineScrollbars } from '@/features/editor/timeline-scrollbars'
import { clipMenuTitle } from '@/features/editor/editor-labels'
import { thumbUrl } from '@/lib/image-url'
import { ThumbImage } from '@/components/thumb-image'
import { useT } from '@/lib/i18n'

const CLIP_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
const TRIM_MIN = 0.1 // 트림 최소 길이(초)
const HEADER_W = 96 // 좌측 트랙 헤더 폭(px) — 줄 이름 · 자물쇠 · 눈(M · S) 칸(2단계 ②)
// 트랙 레이아웃 높이(px) — 오디오 마퀴(드래그 선택)의 콘텐츠 좌표 계산용. 렌더 높이와 일치해야 함.
const RULER_H = 20 // h-5 눈금자
const VIDEO_H = 96 // h-24 비디오 트랙
const AUDIO_LANE_H = 64 // h-16 오디오 레인
const AUDIO_CLIP_TOP = 4 // 레인 내 클립 top-1
const AUDIO_CLIP_H = 52 // 클립 h-[52px]
// V1 밖 영상 줄(V2 · V3 …, 2단계 ②) — 줄 높이 h-16, 클립 top 8 · 높이 48.
const OVERLAY_ROW_H = 64
const OVERLAY_CLIP_TOP = 8
const OVERLAY_CLIP_H = 48

/** 클립을 그리는 줄 — V1(이야기 줄)과 V1 밖 줄이 같은 클립 그림을 쓴다(2단계 ②). */
interface ClipRow {
  trackId: string
  top: number
  height: number
  locked: boolean
  /** 가장자리를 끄는 동안 점선 칸을 그릴 줄 — V1 은 'video', 나머지는 그 줄 id. */
  scope: string
}

interface TimelineLayoutItem {
  shotId: string
  startSec: number
  durationSec: number
}

interface TimelineProps {
  layout: TimelineLayoutItem[]
  shots: Shot[]
  videoClips: VideoClip[]
  selectedShotIds: string[]
  selectedAudioIds: string[]
  currentTime: number
  pxPerSec: number
  toolMode: 'select' | 'cut'
  binDragKind: 'video' | 'audio' | null
  binDropSec: number | null
  audioClips: AudioTrackClip[]
  audioTracks: AudioTrackState[]
  onSeek: (timeSec: number) => void
  onSelect: (shotId: string) => void
  onToggleSelect: (shotId: string) => void
  onRangeSelect: (shotId: string) => void
  onSetSelection: (ids: string[]) => void
  onClearSelection: () => void
  onDelete: (shotId: string) => void
  onDeleteSelected: () => void
  onMoveClipToIndex: (shotId: string, targetIndex: number) => void
  /** 빈 곳에 놓기 — 그 시각에 놓고 원래 자리는 빈 곳으로(자유 배치, 2026-11-14). */
  onPlaceClipAt: (shotId: string, atSec: number) => void
  /** 빈 곳의 [잔물결 삭제] — 이 클립 앞 빈 곳을 없애고 뒤를 당긴다. */
  onRippleDeleteGap: (shotId: string) => void
  /** 클립 잔물결 삭제 — 빼고 그 자리를 당겨 메운다. */
  onRippleDelete: (shotId: string) => void
  onRippleDeleteSelected: () => void
  onZoom: (nextPxPerSec: number) => void
  onSplitVideo: (shotId: string, atGlobalSec: number) => void
  onSetSpeed: (shotId: string, speed: number) => void
  /** 화면 전환(2026-09-08): 클립 앞 경계의 디졸브 넣기·빼기 */
  onSetTransitionIn: (shotId: string, transition: ClipTransition | null) => void
  onAddAudioTrack: () => void
  onRemoveAudioTrack: (trackId: string) => void
  onToggleAudioTrackMute: (trackId: string) => void
  onToggleAudioMute: (id: string) => void
  onRemoveAudio: (id: string) => void
  onMoveAudio: (id: string, startSec: number, trackId?: string) => void
  onSetAudioVolume: (id: string, volume: number) => void
  onSplitAudio: (id: string, atGlobalSec: number) => void
  onSelectAudio: (id: string) => void
  onToggleAudioSelect: (id: string) => void
  onRangeAudioSelect: (id: string) => void
  onSetAudioSelection: (ids: string[]) => void
  onClearAudioSelection: () => void
  onUpdateVideoClip: (shotId: string, patch: Partial<VideoClip>) => void
  onUpdateAudioClip: (id: string, patch: Partial<AudioTrackClip>) => void
  // trim commit on handle drop - persists via store (DB write-through / snapshot restore)
  onSetTrim: (shotId: string, trimStart: number, trimEnd: number) => void
  /** 약속 J4: 타이틀 카드 길이를 초 단위 숫자로(라벨 클릭·더블클릭). */
  onSetTitleCardDuration: (shotId: string, seconds: number) => void
  onPushHistory: () => void
  /** 타임라인 머리 가운데 자리(시안 E1 409:4796–4808) — 화면이 [+ A 트랙] · 도구 설명 · 확대 −·+ 를 넣는다. */
  toolbar?: ReactNode
  /** 영상 줄(아래부터 V1 · V2 …)과 V1 밖 줄의 클립 · 줄 머리 단추(2단계 ②, 시안 E1 Track Header). */
  videoTracks: VideoTrackState[]
  overlayLayout: TrackLayoutItem[]
  onMoveClipToTrack: (shotId: string, trackId: string, startSec: number) => void
  onToggleTrackLock: (trackId: string) => void
  onToggleTrackVisible: (trackId: string) => void
  onToggleAudioTrackSolo: (trackId: string) => void
  onRemoveVideoTrack: (trackId: string) => void
  /** 스냅 · 마커(2단계 ③) — 끌 때 경계 · 플레이헤드 · 마커에 붙고, 자 위 마커를 누르면 그 시각, 우클릭으로 지운다. */
  snapEnabled: boolean
  markers: number[]
  onRemoveMarker: (sec: number) => void
}

function pickTickInterval(pxPerSec: number): number {
  const candidates = [1, 2, 5, 10, 30, 60, 120, 300]
  for (const c of candidates) {
    if (c * pxPerSec >= 80) return c
  }
  return 600
}

// 오디오 클립 블록 (파형 + 드래그 이동/스냅 + 트랙 간 이동 + cut + 선택 + 우클릭 볼륨/삭제)
function AudioClipBlock({
  clip,
  pxPerSec,
  selected,
  cutMode,
  clientXToSec,
  snapStart,
  snapPoint,
  onToggleMute,
  onRemove,
  onMove,
  onSplit,
  onSelect,
  onToggleSelect,
  onRangeSelect,
  onSetVolume,
  onUpdate,
  onTrimPreview,
  rowTrackId,
  onPushHistory,
}: {
  clip: AudioTrackClip
  pxPerSec: number
  selected: boolean
  cutMode: boolean
  clientXToSec: (clientX: number) => number
  snapStart: (candidateStart: number, durationSec: number, excludeId: string) => number
  /** 가장자리 끌기 스냅 — 그 조각의 가장자리는 뺀다(2단계 ③). */
  snapPoint: (sec: number, excludeId: string) => number
  onToggleMute: () => void
  onRemove: () => void
  onMove: (startSec: number, trackId: string | undefined) => void
  onSplit: (atGlobalSec: number) => void
  onSelect: () => void
  onToggleSelect: () => void
  onRangeSelect: () => void
  onSetVolume: (v: number) => void
  onUpdate: (patch: Partial<AudioTrackClip>) => void
  onTrimPreview: (p: { scope: string; leftSec: number; rightSec: number; label: string; clientX: number; clientY: number } | null) => void
  rowTrackId: string
  onPushHistory: () => void
}) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const width = Math.max(clip.durationSec * pxPerSec, 12)
  const CLIP_H = 52
  const HEADER_H = 14
  const WAVE_H = CLIP_H - HEADER_H
  const vol = Math.max(0, Math.min(1, clip.volume ?? 1))
  const gainTop = HEADER_H + (1 - vol) * WAVE_H // 게인 라인 Y (요청 6)

  const slice = useMemo(() => {
    const peaks = clip.peaks
    if (!peaks?.length) return null
    const srcDur = clip.sourceDurationSec ?? clip.durationSec
    const srcOff = clip.sourceOffsetSec ?? 0
    // 영상에 이어진 소리는 영상 속도로 재생된다 — 원본에서는 타임라인 길이 × 빠르기만큼을 보여 준다(2026-11-10 결정 4).
    const rate = clip.playbackRate ?? 1
    if (srcDur <= 0) return peaks
    const startIdx = Math.max(0, Math.floor((peaks.length * srcOff) / srcDur))
    const endIdx = Math.min(peaks.length, Math.floor((peaks.length * (srcOff + clip.durationSec * rate)) / srcDur))
    return endIdx > startIdx ? peaks.slice(startIdx, endIdx) : peaks
  }, [clip.peaks, clip.sourceDurationSec, clip.sourceOffsetSec, clip.durationSec, clip.playbackRate])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !slice?.length) return
    cv.width = Math.floor(width)
    cv.height = 40
    // v3(2026-11-03): 색 토큰이 hex 라 oklch(...) 로 감싸면 그릴 수 없는 색이 돼 파형이 검게(안 보이게) 그려졌다 — 값 그대로 쓴다.
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim()
    drawWaveform(cv, slice, accent || '#888')
  }, [slice, width])

  const handleBodyPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 2) return
      e.stopPropagation()
      if (cutMode) {
        onSplit(clientXToSec(e.clientX))
        return
      }
      // 다중 선택: Ctrl/⌘=토글, Shift=순차 (선택만 하고 드래그 이동은 하지 않음 — 비디오와 동일)
      if (e.ctrlKey || e.metaKey) {
        onToggleSelect()
        return
      }
      if (e.shiftKey) {
        onRangeSelect()
        return
      }
      onSelect()
      onPushHistory()
      const blockEl = e.currentTarget as HTMLElement
      blockEl.style.pointerEvents = 'none' // elementFromPoint 가 아래 트랙 레인을 보도록
      const startX = e.clientX
      const startY = e.clientY
      const origStart = clip.startSec
      let moved = false
      const move = (ev: PointerEvent) => {
        // 누르기만 해도 손이 몇 px 흔들린다 — 손잡이처럼 2px 를 넘겨야 옮기기로 본다(옮기면 영상에서 떨어진다, 2026-11-10 검토 b).
        if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) <= 2) return
        moved = true
        const raw = Math.max(0, origStart + (ev.clientX - startX) / pxPerSec)
        const snapped = snapStart(raw, clip.durationSec, clip.id)
        const overTrack = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-drop="audio-track"]')
        const tid = overTrack?.getAttribute('data-track-id') ?? clip.trackId
        onMove(snapped, tid)
      }
      const up = () => {
        blockEl.style.pointerEvents = ''
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [cutMode, clientXToSec, onSplit, onSelect, onToggleSelect, onRangeSelect, onPushHistory, clip.startSec, clip.durationSec, clip.id, clip.trackId, pxPerSec, onMove, snapStart],
  )

  // 게인(음량) 러버밴드 드래그 (요청 6) — 위/아래로 끌어 음량 조절
  const handleGain = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      onSelect()
      onPushHistory()
      const startY = e.clientY
      const o = clip.volume ?? 1
      const move = (ev: PointerEvent) => onSetVolume(Math.max(0, Math.min(1, o - (ev.clientY - startY) / WAVE_H)))
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [clip.volume, onSelect, onPushHistory, onSetVolume, WAVE_H],
  )

  // 트림 핸들 (요청): 점선 미리보기 → 드롭 시 적용. 원본 길이 초과 불가.
  const handleTrim = useCallback(
    (edge: 'l' | 'r') => (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      const start = clip.startSec
      const dur = clip.durationSec
      const end = start + dur
      const off = clip.sourceOffsetSec ?? 0
      // 빠르기가 있는 소리(영상 속도를 따른 것)는 타임라인 1초에 원본이 빠르기만큼 나아간다.
      const rate = clip.playbackRate ?? 1
      const srcDur = clip.sourceDurationSec ?? dur * rate
      const minLeft = start - off / rate // 원본 시작까지만 확장
      const maxLeft = end - TRIM_MIN
      const minRight = start + TRIM_MIN
      const maxRight = start + (srcDur - off) / rate // 원본 끝까지만
      const startX = e.clientX
      let moved = false
      const move = (ev: PointerEvent) => {
        if (!moved && Math.abs(ev.clientX - startX) > 2) moved = true
        if (!moved) return
        if (edge === 'l') {
          const lft = Math.max(minLeft, Math.min(snapPoint(clientXToSec(ev.clientX), clip.id), maxLeft))
          onTrimPreview({ scope: rowTrackId, leftSec: lft, rightSec: end, label: `${(end - lft).toFixed(2)}s`, clientX: ev.clientX, clientY: ev.clientY })
        } else {
          const rgt = Math.max(minRight, Math.min(snapPoint(clientXToSec(ev.clientX), clip.id), maxRight))
          onTrimPreview({ scope: rowTrackId, leftSec: start, rightSec: rgt, label: `${(rgt - start).toFixed(2)}s`, clientX: ev.clientX, clientY: ev.clientY })
        }
      }
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        if (moved) {
          onPushHistory()
          if (edge === 'l') {
            const lft = Math.max(minLeft, Math.min(snapPoint(clientXToSec(ev.clientX), clip.id), maxLeft))
            const dd = lft - start
            onUpdate({ startSec: Math.max(0, start + dd), durationSec: dur - dd, sourceOffsetSec: Math.max(0, off + dd * rate) })
          } else {
            const rgt = Math.max(minRight, Math.min(snapPoint(clientXToSec(ev.clientX), clip.id), maxRight))
            onUpdate({ durationSec: rgt - start })
          }
        }
        onTrimPreview(null)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [clip.startSec, clip.durationSec, clip.sourceOffsetSec, clip.sourceDurationSec, clip.playbackRate, clip.id, clientXToSec, snapPoint, onUpdate, onPushHistory, onTrimPreview, rowTrackId],
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-no-seek
          onPointerDown={handleBodyPointerDown}
          className={cn(
            // v3 ED1: 카드 바탕 클립 · 모서리 8, 고른 클립 = 지금 단계 색 1.5px.
            'group absolute top-1.5 flex h-[52px] flex-col overflow-hidden rounded-lg border-[1.5px] bg-chat-lumi-bubble',
            cutMode ? 'cursor-col-resize' : 'cursor-grab active:cursor-grabbing',
            selected ? 'border-stage' : clip.muted ? 'border-transparent opacity-50' : 'border-transparent hover:border-border-strong',
          )}
          style={{ left: clip.startSec * pxPerSec, width }}
        >
          <div className="flex items-center justify-between px-1.5 py-px">
            <span className="truncate text-[9.5px] font-medium text-muted-foreground">{clip.name}</span>
            <button type="button" data-no-seek onPointerDown={(e) => { e.stopPropagation(); onToggleMute() }} title={clip.muted ? t('Unmute') : t('Mute')}>
              {clip.muted ? <VolumeX className="size-3 text-subtle-foreground" /> : <Volume2 className="size-3 text-muted-foreground" />}
            </button>
          </div>
          <canvas ref={canvasRef} className="pointer-events-none h-full w-full" />

          {/* 게인 라인 + % (요청 6) */}
          <div className="pointer-events-none absolute inset-x-0 h-px bg-primary/50" style={{ top: gainTop }} />
          <span
            className="pointer-events-none absolute right-1 font-mono text-[8px] text-primary"
            style={{ top: Math.max(HEADER_H, Math.min(gainTop - 8, CLIP_H - 9)) }}
          >
            {Math.round(vol * 100)}%
          </span>
          <div
            data-no-seek
            onPointerDown={handleGain}
            className="absolute inset-x-1.5 h-2.5 -translate-y-1/2 cursor-ns-resize"
            style={{ top: gainTop }}
            title={t('Volume {percent}%. Drag up or down', { percent: Math.round(vol * 100) })}
          />

          {/* 트림 핸들 (요청): 좌=시작점, 우=끝점 + hover 라벨 */}
          <div data-no-seek onPointerDown={handleTrim('l')} className="group/trim absolute left-0 top-0 z-10 h-full w-1.5 cursor-ew-resize hover:bg-primary/60">
            <span className="pointer-events-none absolute -top-4 left-0 z-30 hidden whitespace-nowrap rounded bg-foreground px-1 text-[8px] text-background group-hover/trim:block">▕ {t('This audio start point')}</span>
          </div>
          <div data-no-seek onPointerDown={handleTrim('r')} className="group/trim absolute right-0 top-0 z-10 h-full w-1.5 cursor-ew-resize hover:bg-primary/60">
            <span className="pointer-events-none absolute -top-4 right-0 z-30 hidden whitespace-nowrap rounded bg-foreground px-1 text-[8px] text-background group-hover/trim:block">{t('This audio end point')} ▏</span>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuLabel className="text-xs">{clip.name}</ContextMenuLabel>
        <ContextMenuSeparator />
        <div className="px-2 py-1.5" onPointerDown={(e) => e.stopPropagation()}>
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{t('Volume (applies to draft)')}</span>
            <span className="font-mono">{Math.round((clip.volume ?? 1) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={clip.volume ?? 1}
            onChange={(e) => onSetVolume(Number(e.target.value))}
            className="h-1 w-full cursor-pointer accent-primary"
          />
        </div>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-xs" onSelect={() => onToggleMute()}>
          {clip.muted ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
          {clip.muted ? t('Unmute') : t('Mute')}
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" className="text-xs" onSelect={() => onRemove()}>
          <Trash2 className="size-3.5" /> {t('Delete audio')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function Timeline({
  layout,
  shots,
  videoClips,
  selectedShotIds,
  selectedAudioIds,
  currentTime,
  pxPerSec,
  toolMode,
  binDragKind,
  binDropSec,
  audioClips,
  audioTracks,
  onSeek,
  onSelect,
  onToggleSelect,
  onRangeSelect,
  onSetSelection,
  onClearSelection,
  onDelete,
  onDeleteSelected,
  onMoveClipToIndex,
  onPlaceClipAt,
  onRippleDeleteGap,
  onRippleDelete,
  onRippleDeleteSelected,
  onZoom,
  onSplitVideo,
  onSetSpeed,
  onSetTransitionIn,
  onAddAudioTrack,
  onRemoveAudioTrack,
  onToggleAudioTrackMute,
  onToggleAudioMute,
  onRemoveAudio,
  onMoveAudio,
  onSetAudioVolume,
  onSplitAudio,
  onSelectAudio,
  onToggleAudioSelect,
  onRangeAudioSelect,
  onSetAudioSelection,
  onClearAudioSelection,
  onUpdateVideoClip,
  onUpdateAudioClip,
  onSetTrim,
  onSetTitleCardDuration,
  onPushHistory,
  toolbar,
  videoTracks,
  overlayLayout,
  onMoveClipToTrack,
  onToggleTrackLock,
  onToggleTrackVisible,
  onToggleAudioTrackSolo,
  onRemoveVideoTrack,
  snapEnabled,
  markers,
  onRemoveMarker,
}: TimelineProps) {
  const entityNames = useEntityNames()
  const t = useT()
  const unplayableUrls = useEditorStore((s) => s.unplayableVideoUrls)
  const trackRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const videoTrackRef = useRef<HTMLDivElement>(null)
  const headerInnerRef = useRef<HTMLDivElement>(null)

  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  // 오디오 마퀴 — 콘텐츠 좌표(눈금자 좌상단 기준). 여러 레인을 가로지르는 드래그 선택.
  const [audioMarquee, setAudioMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [reorder, setReorder] = useState<{ shotId: string; targetIndex: number; placeAtSec?: number; trackId?: string } | null>(null)
  // 빈 곳을 누르면 그 자리에 [잔물결 삭제](시안 E4 409:6873) — 빈 곳 뒤 클립 id 와 빈 곳 가운데 초.
  const [gapChip, setGapChip] = useState<{ shotId: string; centerSec: number } | null>(null)
  const [cutHoverSec, setCutHoverSec] = useState<number | null>(null) // cut 모드 미리보기 위치
  // 트림 미리보기: 드래그 중엔 실제 변경 없이 점선 박스 + 마우스 옆 시간초만 표시, 드롭 시 적용 (요청)
  // 약속 J4(2026-09-04): 타이틀 카드 길이 숫자 입력 — 어느 클립의 라벨을 열었는지.
  const [durationEdit, setDurationEdit] = useState<{ shotId: string; value: string } | null>(null)
  const [trimPreview, setTrimPreview] = useState<
    { scope: 'video' | string; leftSec: number; rightSec: number; label: string; clientX: number; clientY: number } | null
  >(null)
  // 위에서 아래로 그리는 V1 밖 줄(V3 · V2), 잠근 줄(2단계 ②).
  const overlayTracks = useMemo(() => videoTracks.filter((tr) => tr.id !== 'v1').reverse(), [videoTracks])
  const lockedTracks = useMemo(() => new Set([...videoTracks, ...audioTracks].filter((tr) => tr.locked).map((tr) => tr.id)), [videoTracks, audioTracks])
  const v1Track = videoTracks.find((tr) => tr.id === 'v1')
  const overlayH = overlayTracks.length * OVERLAY_ROW_H

  const cutMode = toolMode === 'cut'

  // 빈 곳이 있어도 영상 줄은 마지막 클립 끝까지다(자유 배치, 2026-11-14).
  const videoSec = useMemo(() => timelineEnd(layout), [layout])
  const segments = useMemo(() => timelineSegments(layout), [layout])
  const totalSec = useMemo(() => {
    const audioEnd = audioClips.reduce((max, a) => Math.max(max, a.startSec + a.durationSec), 0)
    return Math.max(videoSec, audioEnd, currentTime) // 플레이헤드가 끝을 넘으면 영역 확장 (요청 5)
  }, [videoSec, audioClips, currentTime])
  const totalWidth = Math.max(totalSec * pxPerSec, 320)

  const clientXToSec = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return 0
      const rect = el.getBoundingClientRect()
      return Math.max(0, (clientX - rect.left + el.scrollLeft) / pxPerSec)
    },
    [pxPerSec],
  )

  // cut: 플레이헤드 근처면 플레이헤드에 스냅 (요청 7)
  const snapToPlayhead = useCallback(
    (sec: number) => (Math.abs(sec - currentTime) * pxPerSec < SNAP_PX ? currentTime : sec),
    [currentTime, pxPerSec],
  )

  // 스냅(2단계 ③, 시안 E1 409:4795) — 0초 · 플레이헤드 · 모든 줄 클립의 시작 · 끝 · 마커에서 8px 안이면 붙는다. 끄는 것(exclude)의
  //   가장자리는 뺀다. [스냅 끔]이면 그대로. 영상 클립 옮기기 · 가장자리 끌기 · 소리 옮기기 · 가장자리 끌기가 같이 쓴다.
  //   playhead — 영상 클립은 누르면 플레이헤드가 누른 자리로 가므로 그 자리를 준다(보이는 플레이헤드에 붙게).
  const snapperFor = useCallback(
    (exclude: readonly string[], playhead = currentTime) =>
      makeSnapper(snapEnabled, snapTargets({ currentTime: playhead, markers, videoLayout: [...layout, ...overlayLayout], audioClips }, new Set(exclude)), pxPerSec),
    [snapEnabled, currentTime, markers, layout, overlayLayout, audioClips, pxPerSec],
  )
  const snapStart = useCallback(
    (candidateStart: number, durationSec: number, excludeId: string) => snapperFor([excludeId]).start(candidateStart, durationSec),
    [snapperFor],
  )
  const snapPoint = useCallback((sec: number, excludeId: string) => snapperFor([excludeId]).point(sec), [snapperFor])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      const el = scrollRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cursorX = e.clientX - rect.left + el.scrollLeft
      const cursorSec = cursorX / pxPerSec
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const next = Math.max(PX_PER_SEC_MIN, Math.min(PX_PER_SEC_MAX, pxPerSec * factor))
      onZoom(next)
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollLeft = cursorSec * next - (e.clientX - rect.left)
      })
    },
    [pxPerSec, onZoom],
  )

  const tickInterval = pickTickInterval(pxPerSec)
  const ticks = useMemo(() => {
    const arr: number[] = []
    for (let sec = 0; sec <= totalSec; sec += tickInterval) arr.push(sec)
    return arr
  }, [totalSec, tickInterval])

  const handleSeekPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 2) return
      if ((e.target as HTMLElement).closest('[data-no-seek]')) return
      onSeek(clientXToSec(e.clientX))
      const move = (ev: PointerEvent) => onSeek(clientXToSec(ev.clientX))
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [clientXToSec, onSeek],
  )

  const computeDropIndex = useCallback(
    (pointerSec: number, draggedId: string) => {
      const others = layout.filter((it) => it.shotId !== draggedId)
      let idx = others.length
      for (let i = 0; i < others.length; i++) {
        const it = others[i]
        if (pointerSec < it.startSec + it.durationSec / 2) { idx = i; break }
      }
      return idx
    },
    [layout],
  )

  // Video track 빈 영역: 마퀴 선택 또는 클릭-seek
  const handleVideoTrackPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 2) return
      if ((e.target as HTMLElement).closest('[data-no-seek]')) return
      if (cutMode) { onSeek(clientXToSec(e.clientX)); return }
      const trackEl = videoTrackRef.current
      if (!trackEl) return
      const trackRect = trackEl.getBoundingClientRect()
      const startClientX = e.clientX
      const startClientY = e.clientY
      const startLocalX = e.clientX - trackRect.left
      const startLocalY = e.clientY - trackRect.top
      const h = trackRect.height
      let moved = false
      const move = (ev: PointerEvent) => {
        if (!moved && Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) > 4) moved = true
        if (!moved) return
        const curX = ev.clientX - trackRect.left
        const curY = Math.max(0, Math.min(h, ev.clientY - trackRect.top))
        setMarquee({ x1: startLocalX, y1: Math.max(0, Math.min(h, startLocalY)), x2: curX, y2: curY })
        const a = clientXToSec(startClientX)
        const b = clientXToSec(ev.clientX)
        const lo = Math.min(a, b)
        const hi = Math.max(a, b)
        onSetSelection(layout.filter((it) => it.startSec < hi && it.startSec + it.durationSec > lo).map((it) => it.shotId))
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        setMarquee(null)
        if (!moved) {
          onClearSelection()
          const sec = clientXToSec(startClientX)
          onSeek(sec)
          // 컷과 컷 사이 빈 곳을 누르면 그 자리에 [잔물결 삭제]가 뜬다(시안 E4 · 규칙 R).
          const at = segments.findIndex((seg) => seg.kind === 'gap' && sec >= seg.startSec && sec < seg.endSec)
          const next = at >= 0 ? segments[at + 1] : undefined
          setGapChip(at >= 0 && next?.kind === 'clip' ? { shotId: next.shotId, centerSec: (segments[at].startSec + segments[at].endSec) / 2 } : null)
        } else {
          setGapChip(null)
        }
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [cutMode, clientXToSec, onSeek, onSetSelection, onClearSelection, layout, segments],
  )

  // Audio 레인 빈 영역: 마퀴 드래그(여러 레인 가로지르며 다중 선택) 또는 클릭-seek.
  // 콘텐츠 좌표(스크롤 보정)로 마퀴 사각형 ↔ 각 오디오 클립 사각형(시간 X · 레인 Y)을 교차 판정.
  const handleAudioLanePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 2) return
      if ((e.target as HTMLElement).closest('[data-no-seek]')) return
      if (cutMode) { onSeek(clientXToSec(e.clientX)); return }
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const toContent = (cx: number, cy: number) => ({
        x: cx - rect.left + el.scrollLeft,
        y: cy - rect.top + el.scrollTop,
      })
      const start = toContent(e.clientX, e.clientY)
      const startClientX = e.clientX
      const firstId = audioTracks[0]?.id
      let moved = false
      const computeSel = (cur: { x: number; y: number }) => {
        const x1 = Math.min(start.x, cur.x)
        const x2 = Math.max(start.x, cur.x)
        const y1 = Math.min(start.y, cur.y)
        const y2 = Math.max(start.y, cur.y)
        const ids = audioClips
          .filter((a) => {
            const ti = audioTracks.findIndex((track) => track.id === (a.trackId ?? firstId))
            if (ti < 0) return false
            const cx = a.startSec * pxPerSec
            const cw = Math.max(a.durationSec * pxPerSec, 12)
            const laneTop = RULER_H + overlayH + VIDEO_H + ti * AUDIO_LANE_H + AUDIO_CLIP_TOP
            return cx < x2 && cx + cw > x1 && laneTop < y2 && laneTop + AUDIO_CLIP_H > y1
          })
          .map((a) => a.id)
        onSetAudioSelection(ids)
      }
      const move = (ev: PointerEvent) => {
        const cur = toContent(ev.clientX, ev.clientY)
        if (!moved && Math.hypot(cur.x - start.x, cur.y - start.y) > 4) moved = true
        if (!moved) return
        setAudioMarquee({ x1: start.x, y1: start.y, x2: cur.x, y2: cur.y })
        computeSel(cur)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        setAudioMarquee(null)
        if (!moved) { onClearAudioSelection(); onSeek(clientXToSec(startClientX)) }
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [cutMode, clientXToSec, onSeek, onSetAudioSelection, onClearAudioSelection, audioClips, audioTracks, pxPerSec, overlayH],
  )

  const handleClipPointerDown = useCallback(
    (e: React.PointerEvent, item: TimelineLayoutItem, trackId = 'v1') => {
      if (e.button === 2) return
      e.stopPropagation()
      // 잠근 줄의 클립은 고르거나 옮기지 않는다(2단계 ②).
      if (lockedTracks.has(trackId)) return
      if (cutMode) { onSplitVideo(item.shotId, snapToPlayhead(clientXToSec(e.clientX))); return }
      if (e.ctrlKey || e.metaKey) { onToggleSelect(item.shotId); return }
      if (e.shiftKey) { onRangeSelect(item.shotId); return }
      onSelect(item.shotId)
      const pressedSec = clientXToSec(e.clientX)
      onSeek(pressedSec)
      setGapChip(null)
      const startClientX = e.clientX
      const startClientY = e.clientY
      // 잡은 곳과 클립 시작 사이 — 빈 곳에 놓을 때 클립 시작 = 놓은 곳 - 이만큼.
      const grabOffset = pressedSec - item.startSec
      // 놓을 시각은 스냅이 켜져 있으면 경계 · 플레이헤드 · 마커에 붙는다 — 이 클립과 이어진 소리의 가장자리는 빼고(2단계 ③).
      const snap = snapperFor(draggedIds(item.shotId, audioClips), pressedSec)
      // 다른 클립 위면 순서 바꾸기, 빈 곳이면 그 시각에 놓기(자유 배치, 2026-11-14). 다른 줄 위면 그 줄의 그 시각(2단계 ②).
      const dropFor = (clientX: number, clientY: number) => {
        const sec = clientXToSec(clientX)
        const row = (document.elementFromPoint(clientX, clientY)?.closest('[data-drop="video-track"]') as HTMLElement | null)?.dataset.trackId ?? trackId
        if (row !== 'v1' || trackId !== 'v1') return { shotId: item.shotId, targetIndex: -1, placeAtSec: snap.start(Math.max(0, sec - grabOffset), item.durationSec), trackId: row }
        const overClip = layout.some((it) => it.shotId !== item.shotId && sec >= it.startSec && sec < it.startSec + it.durationSec)
        return overClip
          ? { shotId: item.shotId, targetIndex: computeDropIndex(sec, item.shotId) }
          : { shotId: item.shotId, targetIndex: -1, placeAtSec: snap.start(Math.max(0, sec - grabOffset), item.durationSec) }
      }
      let reordering = false
      const move = (ev: PointerEvent) => {
        if (!reordering && Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) > 5) reordering = true
        if (reordering) setReorder(dropFor(ev.clientX, ev.clientY))
      }
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        if (reordering) {
          const drop = dropFor(ev.clientX, ev.clientY)
          if (drop.trackId !== undefined && drop.placeAtSec !== undefined) onMoveClipToTrack(item.shotId, drop.trackId, drop.placeAtSec)
          else if (drop.placeAtSec !== undefined) onPlaceClipAt(item.shotId, drop.placeAtSec)
          else onMoveClipToIndex(item.shotId, drop.targetIndex)
        }
        setReorder(null)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [cutMode, clientXToSec, snapToPlayhead, snapperFor, audioClips, onSplitVideo, onToggleSelect, onRangeSelect, onSelect, onSeek, computeDropIndex, onMoveClipToIndex, onPlaceClipAt, onMoveClipToTrack, layout, lockedTracks],
  )

  // 줄 머리 단추(시안 E1 Track Header, 2단계 ②) — 자물쇠: 그 줄을 고칠 수 없게 · 눈: 미리 보기 · 내보내기에서 뺀다.
  const lockButton = (track: { id: string; locked?: boolean }) => (
    <button
      type="button"
      aria-pressed={!!track.locked}
      onClick={(e) => {
        e.stopPropagation()
        onToggleTrackLock(track.id)
      }}
      title={track.locked ? t('Unlock track') : t('Lock track')}
      aria-label={track.locked ? t('Unlock track') : t('Lock track')}
      className={cn('flex size-5 items-center justify-center rounded transition-colors hover:bg-accent', track.locked ? 'text-foreground' : 'text-subtle-foreground')}
    >
      {track.locked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
    </button>
  )
  const videoTrackHeader = (track: VideoTrackState) => (
    <>
      {lockButton(track)}
      <span className={cn('w-6 font-num text-meta font-semibold text-foreground', track.hidden && 'opacity-60')}>{track.id.toUpperCase()}</span>
      <button
        type="button"
        aria-pressed={!track.hidden}
        onClick={(e) => {
          e.stopPropagation()
          onToggleTrackVisible(track.id)
        }}
        title={track.hidden ? t('Show track') : t('Hide track')}
        aria-label={track.hidden ? t('Show track') : t('Hide track')}
        className="flex size-5 items-center justify-center rounded text-subtle-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {track.hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </button>
    </>
  )

  // 영상 클립 하나 — V1 과 V1 밖 줄이 같이 쓴다(줄마다 높이 · 잠금 · 끄는 동안 점선 칸 자리만 다르다, 2단계 ②).
  const renderVideoClip = (item: TimelineLayoutItem, row: ClipRow) => {
    const shot = shots.find((s) => s.shotId === item.shotId)
    const clip = videoClips.find((c) => c.shotId === item.shotId)
    if (!shot) return null
    const isSelected = selectedShotIds.includes(item.shotId)
    const isDragging = reorder?.shotId === item.shotId
    const left = item.startSec * pxPerSec
    const width = item.durationSec * pxPerSec
    const targets = isSelected && selectedShotIds.length > 1 ? selectedShotIds : [item.shotId]

    return (
      <ContextMenu key={item.shotId}>
        <ContextMenuTrigger asChild>
          <div
            data-no-seek
            onPointerDown={(e) => handleClipPointerDown(e, item, row.trackId)}
            title={resolveEntityNames(shot.actionDescription, entityNames)}
            className={cn(
              // v3 ED1: 클립 = 한 단 밝은 판 · 모서리 10, 고른 클립 = 지금 단계 색 1.5px.
              'group absolute flex flex-col overflow-hidden rounded-[10px] border-[1.5px] bg-chat-lumi-bubble',
              row.locked && 'pointer-events-none',
              cutMode ? 'cursor-col-resize' : 'cursor-pointer',
              isDragging && 'opacity-60',
              isSelected ? 'border-stage' : 'border-transparent hover:border-border-strong',
            )}
            style={{ left, width: Math.max(width, 8), top: row.top, height: row.height }}
          >
            <div className="pointer-events-none flex h-full w-full items-center justify-center text-[8px] text-muted-foreground">
              {isTitleCardShotId(item.shotId) ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-black px-1 text-center">
                  <Type className="size-3 text-white/60" />
                  <span className="line-clamp-2 text-[7px] leading-tight text-white/80">
                    {shot.titleCard?.text || t('Title')}
                  </span>
                </div>
              ) : clip?.url ? (
                <video src={clip.url} poster={clip.thumbnailUrl ?? thumbUrl(shot.referenceImageUrl)} className="h-full w-full object-cover" muted preload={(clip.thumbnailUrl ?? shot.referenceImageUrl) ? 'none' : 'metadata'} draggable={false} />
              ) : shot.referenceImageUrl ? (
                <ThumbImage src={shot.referenceImageUrl} alt={shot.shotType} className="h-full w-full object-cover" draggable={false} />
              ) : null}
            </div>
            {/* 약속 J4: 타이틀 카드는 라벨에 길이가 보이고, 누르면 초 단위 숫자를 넣는다. */}
            {isTitleCardShotId(item.shotId) && durationEdit?.shotId === item.shotId ? (
              <input
                data-no-seek
                autoFocus
                type="number"
                min={0.5}
                max={600}
                step={0.1}
                value={durationEdit.value}
                aria-label={t('Title card length (seconds)')}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => setDurationEdit({ shotId: item.shotId, value: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    const n = Number(durationEdit.value)
                    if (Number.isFinite(n) && n > 0) onSetTitleCardDuration(item.shotId, n)
                    setDurationEdit(null)
                  } else if (e.key === 'Escape') {
                    setDurationEdit(null)
                  }
                }}
                onBlur={() => {
                  const n = Number(durationEdit.value)
                  if (Number.isFinite(n) && n > 0) onSetTitleCardDuration(item.shotId, n)
                  setDurationEdit(null)
                }}
                className="absolute left-1 top-0.5 z-20 w-14 rounded border border-primary bg-black px-1 font-mono text-[9px] text-white outline-none"
              />
            ) : null}
            <span
              data-no-seek={isTitleCardShotId(item.shotId) ? true : undefined}
              onPointerDown={(e) => {
                if (isTitleCardShotId(item.shotId)) e.stopPropagation()
              }}
              onClick={(e) => {
                if (!isTitleCardShotId(item.shotId)) return
                e.stopPropagation()
                setDurationEdit({ shotId: item.shotId, value: item.durationSec.toFixed(1) })
              }}
              title={isTitleCardShotId(item.shotId) ? t('Title card length (seconds)') : undefined}
              className={cn(
                'absolute left-1.5 top-1.5 rounded-[5px] bg-chip px-[5px] py-px font-num text-[9.5px] font-semibold text-foreground',
                isTitleCardShotId(item.shotId) ? 'cursor-text hover:bg-accent' : 'pointer-events-none',
              )}
            >
              {isTitleCardShotId(item.shotId) ? clipMenuTitle({ isTitleCard: true, shotType: shot.shotType, durationSec: item.durationSec }, t) : shot.shotType}
              {clip?.speed && clip.speed !== 1 && <span className="ml-1 text-stage">{clip.speed.toFixed(2)}×</span>}
            </span>
            {/* 영상을 불러오지 못한 클립은 그 클립만 오른쪽 위에 "불러오지 못함"(QA 2026-11-03 밤). */}
            {clip?.url && unplayableUrls.includes(clip.url) ? (
              <span
                className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-[5px] bg-chip px-[5px] py-px text-[9.5px] font-semibold text-destructive"
                data-testid="timeline-clip-unplayable"
              >
                <AlertCircle className="size-3 shrink-0" aria-hidden />
                {t('Could not load')}
              </span>
            ) : null}
            {/* v3 ED1: 왼쪽 아래 길이("5초") */}
            <span className="pointer-events-none absolute bottom-1.5 left-2 font-num text-[10.5px] font-medium text-subtle-foreground">
              {t('{seconds}s', { seconds: Math.round(item.durationSec * 10) / 10 })}
            </span>
            {/* 트림 핸들 (요청): 점선 미리보기 → 드롭 시 적용. 원본 길이 초과 불가. */}
            <div
              data-no-seek
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                const base = shot.durationSeconds
                const speed = clip?.speed ?? 1
                const t0 = clip?.trimStart ?? 0
                const t1 = clip?.trimEnd ?? base
                const startSec = item.startSec
                const endSec = item.startSec + item.durationSec
                const minLeft = startSec - t0 / speed // 원본 시작까지만 확장
                const maxLeft = endSec - TRIM_MIN
                const startX = e.clientX
                let moved = false
                // 스냅이 켜져 있으면 가장자리가 경계 · 플레이헤드 · 마커에 붙는다(2단계 ③).
                const snap = snapperFor(draggedIds(item.shotId, audioClips))
                const calc = (cx: number) => Math.max(minLeft, Math.min(snap.point(clientXToSec(cx)), maxLeft))
                const move = (ev: PointerEvent) => {
                  if (!moved && Math.abs(ev.clientX - startX) > 2) moved = true
                  if (!moved) return
                  const lft = calc(ev.clientX)
                  setTrimPreview({ scope: row.scope, leftSec: lft, rightSec: endSec, label: `${(endSec - lft).toFixed(2)}s`, clientX: ev.clientX, clientY: ev.clientY })
                }
                const up = (ev: PointerEvent) => {
                  window.removeEventListener('pointermove', move)
                  window.removeEventListener('pointerup', up)
                  if (moved) {
                    const lft = calc(ev.clientX)
                    onPushHistory()
                    onSetTrim(item.shotId, Math.max(0, t0 + (lft - startSec) * speed), t1)
                  }
                  setTrimPreview(null)
                }
                window.addEventListener('pointermove', move)
                window.addEventListener('pointerup', up)
              }}
              className="group/trim absolute left-0 top-0 z-10 h-full w-1.5 cursor-ew-resize hover:bg-primary/60"
            >
              <span className="pointer-events-none absolute -top-4 left-0 z-30 hidden whitespace-nowrap rounded bg-foreground px-1 text-[8px] text-background group-hover/trim:block">
                ▕ {t('This clip start point')}
              </span>
            </div>
            <div
              data-no-seek
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                const base = shot.durationSeconds
                const speed = clip?.speed ?? 1
                const t0 = clip?.trimStart ?? 0
                const startSec = item.startSec
                const minRight = startSec + TRIM_MIN
                // 약속 J3: 타이틀 카드는 원본이 없어 끝이 없다 — 늘린 만큼 길어진다(상한 600초).
                const maxRight = isTitleCardShotId(item.shotId)
                  ? startSec + 600
                  : startSec + (base - t0) / speed // 원본 끝까지만
                const startX = e.clientX
                let moved = false
                const snap = snapperFor(draggedIds(item.shotId, audioClips))
                const calc = (cx: number) => Math.max(minRight, Math.min(snap.point(clientXToSec(cx)), maxRight))
                const move = (ev: PointerEvent) => {
                  if (!moved && Math.abs(ev.clientX - startX) > 2) moved = true
                  if (!moved) return
                  const rgt = calc(ev.clientX)
                  setTrimPreview({ scope: row.scope, leftSec: startSec, rightSec: rgt, label: `${(rgt - startSec).toFixed(2)}s`, clientX: ev.clientX, clientY: ev.clientY })
                }
                const up = (ev: PointerEvent) => {
                  window.removeEventListener('pointermove', move)
                  window.removeEventListener('pointerup', up)
                  if (moved) {
                    const rgt = calc(ev.clientX)
                    onPushHistory()
                    onSetTrim(item.shotId, t0, t0 + (rgt - startSec) * speed)
                  }
                  setTrimPreview(null)
                }
                window.addEventListener('pointermove', move)
                window.addEventListener('pointerup', up)
              }}
              className="group/trim absolute right-0 top-0 z-10 h-full w-1.5 cursor-ew-resize hover:bg-primary/60"
            >
              <span className="pointer-events-none absolute -top-4 right-0 z-30 hidden whitespace-nowrap rounded bg-foreground px-1 text-[8px] text-background group-hover/trim:block">
                {t('This clip end point')} ▏
              </span>
            </div>

            <button
              type="button"
              data-no-seek
              onPointerDown={(e) => { e.stopPropagation(); onDelete(item.shotId) }}
              className="absolute right-0.5 top-0.5 z-20 hidden rounded bg-destructive/80 p-0.5 text-destructive-foreground hover:bg-destructive group-hover:block"
              title={t('Hide clip')}
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuLabel className="text-xs">
            {targets.length > 1 ? t('{count} clips', { count: targets.length }) : clipMenuTitle({ isTitleCard: isTitleCardShotId(item.shotId), shotType: shot.shotType, durationSec: item.durationSec }, t)}
          </ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger className="text-xs"><Gauge className="size-3.5" /> {t('Playback speed')}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuRadioGroup value={String(clip?.speed ?? 1)} onValueChange={(v) => targets.forEach((id) => onSetSpeed(id, Number(v)))}>
                {CLIP_SPEEDS.map((sp) => (
                  <ContextMenuRadioItem key={sp} value={String(sp)} className="text-xs">{sp.toFixed(2)}×</ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger className="text-xs"><Blend className="size-3.5" /> {t('Dissolve (dip to black)')}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuRadioGroup
                value={clip?.transitionIn ? String(clip.transitionIn.durationSec) : 'none'}
                onValueChange={(v) => targets.forEach((id) => onSetTransitionIn(id, v === 'none' ? null : { type: 'dissolve', durationSec: Number(v) }))}
              >
                <ContextMenuRadioItem value="none" className="text-xs">{t('No dissolve')}</ContextMenuRadioItem>
                {DISSOLVE_CHOICES.map((sec) => (
                  <ContextMenuRadioItem key={sec} value={String(sec)} className="text-xs">{t('{seconds}s dissolve', { seconds: sec })}</ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem
            className="text-xs"
            onSelect={() => {
              const within = currentTime > item.startSec && currentTime < item.startSec + item.durationSec
              onSplitVideo(item.shotId, within ? currentTime : item.startSec + item.durationSec / 2)
            }}
          >
            <Scissors className="size-3.5" /> {t('Split here')}
          </ContextMenuItem>
          <ContextMenuItem variant="destructive" className="text-xs" onSelect={() => (targets.length > 1 ? onDeleteSelected() : onDelete(item.shotId))}>
            <Trash2 className="size-3.5" /> {targets.length > 1 ? t('Hide {count}', { count: targets.length }) : t('Hide clip')}
          </ContextMenuItem>
          {/* 빼고 그 자리를 당겨 메운다(Shift+Delete) — 빼기(위)는 빈 곳을 남긴다(자유 배치, 2026-11-14). */}
          <ContextMenuItem className="text-xs" onSelect={() => (targets.length > 1 ? onRippleDeleteSelected() : onRippleDelete(item.shotId))}>
            <Trash2 className="size-3.5" /> {t('Ripple delete')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  const reorderX = useMemo(() => {
    if (!reorder || reorder.placeAtSec !== undefined) return null
    const others = layout.filter((it) => it.shotId !== reorder.shotId)
    if (others.length === 0) return 0
    if (reorder.targetIndex >= others.length) {
      const last = others[others.length - 1]
      return (last.startSec + last.durationSec) * pxPerSec
    }
    return others[reorder.targetIndex].startSec * pxPerSec
  }, [reorder, layout, pxPerSec])

  // Video Source 드래그 중 삽입 위치 인디케이터 (요청 4)
  const binIndicatorX = useMemo(() => {
    if (binDragKind !== 'video' || binDropSec == null) return null
    if (layout.length === 0) return 0
    let idx = layout.length
    for (let i = 0; i < layout.length; i++) {
      const it = layout[i]
      if (binDropSec < it.startSec + it.durationSec / 2) { idx = i; break }
    }
    if (idx >= layout.length) {
      const last = layout[layout.length - 1]
      return (last.startSec + last.durationSec) * pxPerSec
    }
    return layout[idx].startSec * pxPerSec
  }, [binDragKind, binDropSec, layout, pxPerSec])

  const playheadX = currentTime * pxPerSec
  const firstTrackId = audioTracks[0]?.id

  return (
    // 시안 E1 409:4793–4808(2단계 ① 새 배치): 타임라인 머리 — "시퀀스 01" · 지금 시각(시:분:초:장) · 화면이 넣는 단추 자리 · 고른 수.
    //   소리 파일 올리기는 프로젝트 판 [가져오기…] 로 옮겼다(내 파일에 올린 뒤 끌어 놓기).
    <div className="flex h-full flex-col select-none">
      {/* 상단 바 */}
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
        <span className="text-label font-semibold text-foreground">{t('Sequence 01')}</span>
        <span className="font-num text-body font-semibold tabular-nums text-foreground">{formatTimecode(currentTime)}</span>
        {selectedShotIds.length > 1 && (
          <span className="rounded-full bg-stage/18 px-2 py-0.5 text-[11px] font-medium text-foreground">{t('{count} selected', { count: selectedShotIds.length })}</span>
        )}
        {selectedAudioIds.length > 1 && (
          <span className="rounded-full bg-stage/18 px-2 py-0.5 text-[11px] font-medium text-foreground">{t('{count} audio selected', { count: selectedAudioIds.length })}</span>
        )}
        {toolbar}
      </div>

      {/* 본문: 좌측 헤더 컬럼 + 우측 트랙(가로 스크롤) */}
      <div className="flex min-h-0 flex-1">
        {/* 헤더 컬럼 */}
        <div className="shrink-0 overflow-hidden" style={{ width: HEADER_W }}>
          <div ref={headerInnerRef}>
            <div className="h-5 border-b border-border-subtle" />
            {/* 줄 머리(시안 E1 Track Header) — 자물쇠 · 줄 이름 · 눈. V1 밖 줄은 우클릭으로 지운다(2단계 ②). */}
            {overlayTracks.map((track) => (
              <ContextMenu key={track.id}>
                <ContextMenuTrigger asChild>
                  <div className="flex h-16 items-center gap-1 border-b border-border-subtle pl-2">{videoTrackHeader(track)}</div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-40">
                  <ContextMenuItem variant="destructive" className="text-xs" disabled={!!track.locked} onSelect={() => onRemoveVideoTrack(track.id)}>
                    <Trash2 className="size-3.5" /> {t('Delete this track')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            <div className="flex h-24 items-center gap-1 pl-2">{v1Track ? videoTrackHeader(v1Track) : null}</div>
            {audioTracks.map((track, i) => (
              <ContextMenu key={track.id}>
                <ContextMenuTrigger asChild>
                  <div className="flex h-16 items-center gap-1 pl-2 text-meta font-medium text-muted-foreground hover:text-foreground">
                    {lockButton(track)}
                    <span className={cn('w-6 font-num font-semibold text-foreground', track.muted && 'opacity-60')}>{`A${i + 1}`}</span>
                    {/* 줄 음소거(M) · 그 줄만(S) — 내보내기도 같다(시안 E1 Track Header, 2단계 ②). */}
                    <button
                      type="button"
                      aria-pressed={!!track.muted}
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleAudioTrackMute(track.id)
                      }}
                      title={track.muted ? t('Unmute track') : t('Mute entire track')}
                      aria-label={track.muted ? t('Unmute track') : t('Mute entire track')}
                      className={cn('flex size-5 items-center justify-center rounded font-num text-[10px] font-semibold transition-colors hover:bg-accent', track.muted ? 'bg-accent text-foreground' : 'text-subtle-foreground')}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      aria-pressed={!!track.solo}
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleAudioTrackSolo(track.id)
                      }}
                      title={t('Play only this track')}
                      aria-label={t('Play only this track')}
                      className={cn('flex size-5 items-center justify-center rounded font-num text-[10px] font-semibold transition-colors hover:bg-accent', track.solo ? 'bg-accent text-foreground' : 'text-subtle-foreground')}
                    >
                      S
                    </button>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-40">
                  <ContextMenuItem className="text-xs" onSelect={() => onToggleAudioTrackMute(track.id)}>
                    {track.muted ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                    {track.muted ? t('Unmute track') : t('Mute entire track')}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem className="text-xs" onSelect={() => onAddAudioTrack()}>
                    <Plus className="size-3.5" /> {t('Add audio track')}
                  </ContextMenuItem>
                  <ContextMenuItem
                    variant="destructive"
                    className="text-xs"
                    disabled={audioTracks.length <= 1 || !!track.locked}
                    onSelect={() => onRemoveAudioTrack(track.id)}
                  >
                    <Trash2 className="size-3.5" /> {t('Delete this track')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        </div>

        {/* 트랙 컬럼 (래퍼 — 커스텀 스크롤바 오버레이용) */}
        <div className="relative min-w-0 flex-1">
        <div
          ref={(el) => { trackRef.current = el; scrollRef.current = el }}
          className="absolute inset-0 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onWheel={handleWheel}
          onScroll={(e) => {
            if (headerInnerRef.current) headerInnerRef.current.style.transform = `translateY(${-e.currentTarget.scrollTop}px)`
          }}
        >
          <div
            className="relative"
            style={{ width: totalWidth }}
            onPointerMove={cutMode ? (e) => setCutHoverSec(snapToPlayhead(clientXToSec(e.clientX))) : undefined}
            onPointerLeave={() => setCutHoverSec(null)}
          >
            {/* Ruler */}
            <div className="relative h-5 border-b border-border-subtle" onPointerDown={handleSeekPointerDown}>
              {ticks.map((tickSec) => (
                <div key={tickSec} className="absolute top-0 flex h-full flex-col" style={{ left: tickSec * pxPerSec }}>
                  <span className="ml-1 font-num text-[10px] font-medium leading-[12px] text-subtle-foreground">{formatTimecode(tickSec)}</span>
                  <div className="mt-auto h-1.5 w-px bg-foreground/25" />
                </div>
              ))}
              {/* 마커(2단계 ③) — 누르면 그 시각으로, 우클릭 [마커 지우기]. */}
              <RulerMarkers markers={markers} pxPerSec={pxPerSec} onSeek={onSeek} onRemove={onRemoveMarker} />
            </div>

            {/* V1 밖 영상 줄(위에서 아래로 V3 · V2) — 줄 + 시작 초, 위 줄이 아래 줄을 가린다(2단계 ②, 시안 E3). */}
            {overlayTracks.map((track) => (
              <div
                key={track.id}
                data-drop="video-track"
                data-track-id={track.id}
                data-pps={pxPerSec}
                className={cn(
                  'relative h-16 border-b border-border-subtle transition-colors',
                  track.hidden && 'opacity-40',
                  binDragKind === 'video' && !track.locked && 'bg-stage/10 ring-1 ring-inset ring-stage/40',
                )}
                onPointerDown={(e) => {
                  if (e.button === 2 || (e.target as HTMLElement).closest('[data-no-seek]')) return
                  onClearSelection()
                  setGapChip(null)
                  onSeek(clientXToSec(e.clientX))
                }}
              >
                {overlayLayout
                  .filter((item) => item.trackId === track.id)
                  .map((item) => renderVideoClip(item, { trackId: track.id, top: OVERLAY_CLIP_TOP, height: OVERLAY_CLIP_H, locked: !!track.locked, scope: track.id }))}
                {reorder?.placeAtSec !== undefined && reorder.trackId === track.id && (() => {
                  const dragged = [...layout, ...overlayLayout].find((it) => it.shotId === reorder.shotId)
                  if (!dragged) return null
                  return (
                    <div
                      className="pointer-events-none absolute z-20 rounded-[10px] border-2 border-dashed border-stage bg-stage/10"
                      style={{ left: reorder.placeAtSec * pxPerSec, width: Math.max(dragged.durationSec * pxPerSec, 8), top: OVERLAY_CLIP_TOP, height: OVERLAY_CLIP_H }}
                    />
                  )
                })()}
                {trimPreview?.scope === track.id && (
                  <div
                    className="pointer-events-none absolute z-30 rounded-[10px] border-2 border-dashed border-muted-foreground/80 bg-foreground/10"
                    style={{ left: trimPreview.leftSec * pxPerSec, width: Math.max(2, (trimPreview.rightSec - trimPreview.leftSec) * pxPerSec), top: OVERLAY_CLIP_TOP, height: OVERLAY_CLIP_H }}
                  />
                )}
              </div>
            ))}

            {/* Video track — V1(이야기 줄) */}
            <div
              ref={videoTrackRef}
              data-drop="video-track"
              data-track-id="v1"
              data-pps={pxPerSec}
              className={cn('relative h-24 transition-colors', v1Track?.hidden && 'opacity-40', binDragKind === 'video' && !v1Track?.locked && 'bg-stage/10 ring-1 ring-inset ring-stage/40')}
              onPointerDown={handleVideoTrackPointerDown}
            >
              {layout.map((item) => renderVideoClip(item, { trackId: 'v1', top: 12, height: 72, locked: !!v1Track?.locked, scope: 'video' }))}

              {/* 빈 곳에 놓을 자리 미리 보기(자유 배치) — 끄는 클립 길이만큼 점선 칸. */}
              {reorder?.placeAtSec !== undefined && (reorder.trackId ?? 'v1') === 'v1' && (() => {
                const dragged = [...layout, ...overlayLayout].find((it) => it.shotId === reorder.shotId)
                if (!dragged) return null
                return (
                  <div
                    className="pointer-events-none absolute top-3 z-20 h-[72px] rounded-[10px] border-2 border-dashed border-stage bg-stage/10"
                    style={{ left: reorder.placeAtSec * pxPerSec, width: Math.max(dragged.durationSec * pxPerSec, 8) }}
                  />
                )
              })()}
              {/* 컷과 컷 사이 빈 곳을 누르면 그 자리에 [잔물결 삭제](시안 E4 409:6873 · 규칙 R). */}
              {gapChip && (
                <button
                  type="button"
                  data-no-seek
                  data-testid="ripple-delete-gap"
                  className="absolute top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card px-3 py-1 text-meta font-medium text-foreground shadow-md ring-1 ring-border-strong hover:bg-accent"
                  style={{ left: gapChip.centerSec * pxPerSec }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    onRippleDeleteGap(gapChip.shotId)
                    setGapChip(null)
                  }}
                >
                  {t('Ripple delete')}
                </button>
              )}
              {marquee && (
                <div
                  className="pointer-events-none absolute z-20 border border-primary bg-primary/15"
                  style={{ left: Math.min(marquee.x1, marquee.x2), top: Math.min(marquee.y1, marquee.y2), width: Math.abs(marquee.x2 - marquee.x1), height: Math.abs(marquee.y2 - marquee.y1) }}
                />
              )}
              {reorderX != null && <div className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-primary" style={{ left: reorderX }} />}
              {binIndicatorX != null && (
                <div className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-primary" style={{ left: binIndicatorX }}>
                  <div className="absolute -left-[3px] -top-0.5 size-1.5 rounded-full bg-primary" />
                </div>
              )}
              {trimPreview?.scope === 'video' && (
                <div
                  className="pointer-events-none absolute top-3 z-30 h-[72px] rounded-[10px] border-2 border-dashed border-muted-foreground/80 bg-foreground/10"
                  style={{ left: trimPreview.leftSec * pxPerSec, width: Math.max(2, (trimPreview.rightSec - trimPreview.leftSec) * pxPerSec) }}
                />
              )}
              {layout.length === 0 && (
                <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-meta text-subtle-foreground">
                  {t('Drag a clip from Video Source, or right-click→Add to timeline')}
                </p>
              )}
            </div>

            {/* Audio tracks (멀티 레인) */}
            {audioTracks.map((track) => {
              const clipsOnTrack = audioClips.filter((a) => (a.trackId ?? firstTrackId) === track.id)
              return (
                <div
                  key={track.id}
                  data-drop="audio-track"
                  data-track-id={track.id}
                  data-pps={pxPerSec}
                  className={cn('relative h-16 rounded-[10px] bg-white/3 transition-colors', binDragKind === 'audio' && 'bg-stage/10 ring-1 ring-inset ring-stage/40', track.muted && 'opacity-50')}
                  onPointerDown={handleAudioLanePointerDown}
                >
                  {clipsOnTrack.map((a) => (
                    // 잠근 줄의 소리 조각은 고르거나 옮기지 않는다(2단계 ②).
                    <div key={a.id} className={cn(track.locked && 'pointer-events-none')} style={{ display: 'contents' }}>
                    <AudioClipBlock
                      key={a.id}
                      clip={a}
                      pxPerSec={pxPerSec}
                      selected={selectedAudioIds.includes(a.id)}
                      cutMode={cutMode}
                      clientXToSec={clientXToSec}
                      snapStart={snapStart}
                      snapPoint={snapPoint}
                      onToggleMute={() => onToggleAudioMute(a.id)}
                      onRemove={() => onRemoveAudio(a.id)}
                      onMove={(startSec, trackId) => onMoveAudio(a.id, startSec, trackId)}
                      onSplit={(atSec) => onSplitAudio(a.id, snapToPlayhead(atSec))}
                      onSelect={() => onSelectAudio(a.id)}
                      onToggleSelect={() => onToggleAudioSelect(a.id)}
                      onRangeSelect={() => onRangeAudioSelect(a.id)}
                      onSetVolume={(v) => onSetAudioVolume(a.id, v)}
                      onUpdate={(patch) => onUpdateAudioClip(a.id, patch)}
                      onTrimPreview={setTrimPreview}
                      rowTrackId={track.id}
                      onPushHistory={onPushHistory}
                    />
                    </div>
                  ))}
                  {trimPreview?.scope === track.id && (
                    <div
                      className="pointer-events-none absolute top-1.5 z-30 h-[52px] rounded-lg border-2 border-dashed border-muted-foreground/80 bg-foreground/10"
                      style={{ left: trimPreview.leftSec * pxPerSec, width: Math.max(2, (trimPreview.rightSec - trimPreview.leftSec) * pxPerSec) }}
                    />
                  )}
                </div>
              )
            })}

            {/* 빈 오디오 줄 안내 — 줄 간격은 글자 크기의 155%(v3 11/5 판 ED1). */}
            {audioClips.length === 0 && (
              <p className="pointer-events-none absolute left-3.5 z-10 text-meta leading-[1.55] text-subtle-foreground" style={{ top: RULER_H + overlayH + VIDEO_H + 24 }}>
                {t('Drag a file from My files, or press Import… in the Project panel')}
              </p>
            )}

            {/* Cut 미리보기 (점선) — 플레이헤드 근처면 겹침 */}
            {cutMode && cutHoverSec != null && (
              <div
                className="pointer-events-none absolute top-0 z-30 h-full border-l border-dashed border-primary/70"
                style={{ left: cutHoverSec * pxPerSec }}
              />
            )}

            {/* Audio 마퀴 선택 박스 (콘텐츠 좌표 — 여러 레인 가로지름) */}
            {audioMarquee && (
              <div
                className="pointer-events-none absolute z-30 rounded-sm border border-primary bg-primary/15"
                style={{
                  left: Math.min(audioMarquee.x1, audioMarquee.x2),
                  top: Math.min(audioMarquee.y1, audioMarquee.y2),
                  width: Math.abs(audioMarquee.x2 - audioMarquee.x1),
                  height: Math.abs(audioMarquee.y2 - audioMarquee.y1),
                }}
              />
            )}

            {/* Playhead (전체 트랙 관통) */}
            {/* v3 ED1: 2px 크림 선 + 위 10px 원 */}
            <div className="pointer-events-none absolute top-0 z-30 h-full w-0.5 -translate-x-1/2 bg-foreground" style={{ left: playheadX }}>
              <div className="absolute -left-1 -top-px size-2.5 rounded-full bg-foreground" />
            </div>
          </div>
        </div>
        <TimelineScrollbars
          targetRef={scrollRef}
          revision={`${Math.round(totalWidth)}-${audioTracks.length}-${Math.round(pxPerSec)}`}
        />
        </div>
      </div>

      {/* 트림 시간초 (마우스 옆, 실시간) */}
      {trimPreview && (
        <div
          className="pointer-events-none fixed z-50 rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] text-background shadow"
          style={{ left: trimPreview.clientX + 14, top: trimPreview.clientY + 4 }}
        >
          {trimPreview.label}
        </div>
      )}
    </div>
  )
}
