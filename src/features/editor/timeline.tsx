'use client'

import { useRef, useCallback, useMemo, useEffect, useState } from 'react'
import { Trash2, Plus, Volume2, VolumeX, Scissors, Gauge } from 'lucide-react'
import type { Shot, VideoClip, AudioTrackClip, AudioSource } from '@/types'
import { cn } from '@/lib/utils'
import { ingestAudioFile, drawWaveform } from '@/lib/audio-waveform'
import { PX_PER_SEC_MIN, PX_PER_SEC_MAX } from '@/stores/editor-store'
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

const CLIP_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
const TRIM_MIN = 0.1 // 트림 최소 길이(초)
const SNAP_PX = 8 // 스냅 임계(px)
const HEADER_W = 76 // 좌측 트랙 헤더 폭(px)

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
  selectedAudioId: string | null
  currentTime: number
  pxPerSec: number
  toolMode: 'select' | 'cut'
  binDragKind: 'video' | 'audio' | null
  binDropSec: number | null
  audioClips: AudioTrackClip[]
  audioTracks: { id: string }[]
  onSeek: (timeSec: number) => void
  onSelect: (shotId: string) => void
  onToggleSelect: (shotId: string) => void
  onRangeSelect: (shotId: string) => void
  onSetSelection: (ids: string[]) => void
  onClearSelection: () => void
  onDelete: (shotId: string) => void
  onDeleteSelected: () => void
  onMoveClipToIndex: (shotId: string, targetIndex: number) => void
  onZoom: (nextPxPerSec: number) => void
  onSplitVideo: (shotId: string, atGlobalSec: number) => void
  onSetSpeed: (shotId: string, speed: number) => void
  onAddAudioSource: (source: AudioSource) => void
  onAddAudioFromSource: (sourceId: string, atGlobalSec: number, trackId?: string) => void
  onAddAudioTrack: () => void
  onRemoveAudioTrack: (trackId: string) => void
  onToggleAudioMute: (id: string) => void
  onRemoveAudio: (id: string) => void
  onMoveAudio: (id: string, startSec: number, trackId?: string) => void
  onSetAudioVolume: (id: string, volume: number) => void
  onSplitAudio: (id: string, atGlobalSec: number) => void
  onSelectAudio: (id: string) => void
  onUpdateVideoClip: (shotId: string, patch: Partial<VideoClip>) => void
  onUpdateAudioClip: (id: string, patch: Partial<AudioTrackClip>) => void
  onPushHistory: () => void
}

function formatTimecode(sec: number, fps = 24): string {
  const total = Math.max(0, sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  const f = Math.floor((total - Math.floor(total)) * fps)
  const p = (n: number) => n.toString().padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`
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
  onToggleMute,
  onRemove,
  onMove,
  onSplit,
  onSelect,
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
  onToggleMute: () => void
  onRemove: () => void
  onMove: (startSec: number, trackId: string | undefined) => void
  onSplit: (atGlobalSec: number) => void
  onSelect: () => void
  onSetVolume: (v: number) => void
  onUpdate: (patch: Partial<AudioTrackClip>) => void
  onTrimPreview: (p: { scope: string; leftSec: number; rightSec: number; label: string; clientX: number; clientY: number } | null) => void
  rowTrackId: string
  onPushHistory: () => void
}) {
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
    if (srcDur <= 0) return peaks
    const startIdx = Math.max(0, Math.floor((peaks.length * srcOff) / srcDur))
    const endIdx = Math.min(peaks.length, Math.floor((peaks.length * (srcOff + clip.durationSec)) / srcDur))
    return endIdx > startIdx ? peaks.slice(startIdx, endIdx) : peaks
  }, [clip.peaks, clip.sourceDurationSec, clip.sourceOffsetSec, clip.durationSec])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !slice?.length) return
    cv.width = Math.floor(width)
    cv.height = 40
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
    drawWaveform(cv, slice, accent ? `oklch(${accent})` : '#888')
  }, [slice, width])

  const handleBodyPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 2) return
      e.stopPropagation()
      if (cutMode) {
        onSplit(clientXToSec(e.clientX))
        return
      }
      onSelect()
      onPushHistory()
      const blockEl = e.currentTarget as HTMLElement
      blockEl.style.pointerEvents = 'none' // elementFromPoint 가 아래 트랙 레인을 보도록
      const startX = e.clientX
      const origStart = clip.startSec
      const move = (ev: PointerEvent) => {
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
    [cutMode, clientXToSec, onSplit, onSelect, onPushHistory, clip.startSec, clip.durationSec, clip.id, clip.trackId, pxPerSec, onMove, snapStart],
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
      const srcDur = clip.sourceDurationSec ?? dur
      const minLeft = start - off // 원본 시작까지만 확장
      const maxLeft = end - TRIM_MIN
      const minRight = start + TRIM_MIN
      const maxRight = start + (srcDur - off) // 원본 끝까지만
      const startX = e.clientX
      let moved = false
      const move = (ev: PointerEvent) => {
        if (!moved && Math.abs(ev.clientX - startX) > 2) moved = true
        if (!moved) return
        if (edge === 'l') {
          const lft = Math.max(minLeft, Math.min(clientXToSec(ev.clientX), maxLeft))
          onTrimPreview({ scope: rowTrackId, leftSec: lft, rightSec: end, label: `${(end - lft).toFixed(2)}s`, clientX: ev.clientX, clientY: ev.clientY })
        } else {
          const rgt = Math.max(minRight, Math.min(clientXToSec(ev.clientX), maxRight))
          onTrimPreview({ scope: rowTrackId, leftSec: start, rightSec: rgt, label: `${(rgt - start).toFixed(2)}s`, clientX: ev.clientX, clientY: ev.clientY })
        }
      }
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        if (moved) {
          onPushHistory()
          if (edge === 'l') {
            const lft = Math.max(minLeft, Math.min(clientXToSec(ev.clientX), maxLeft))
            const dd = lft - start
            onUpdate({ startSec: Math.max(0, start + dd), durationSec: dur - dd, sourceOffsetSec: Math.max(0, off + dd) })
          } else {
            const rgt = Math.max(minRight, Math.min(clientXToSec(ev.clientX), maxRight))
            onUpdate({ durationSec: rgt - start })
          }
        }
        onTrimPreview(null)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [clip.startSec, clip.durationSec, clip.sourceOffsetSec, clip.sourceDurationSec, clientXToSec, onUpdate, onPushHistory, onTrimPreview, rowTrackId],
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-no-seek
          onPointerDown={handleBodyPointerDown}
          className={cn(
            'group absolute top-1 flex h-[52px] flex-col overflow-hidden rounded border',
            cutMode ? 'cursor-col-resize' : 'cursor-grab active:cursor-grabbing',
            selected ? 'border-primary ring-1 ring-primary' : clip.muted ? 'border-border opacity-50' : 'border-primary/50',
          )}
          style={{ left: clip.startSec * pxPerSec, width }}
        >
          <div className="flex items-center justify-between bg-card/80 px-1 py-px">
            <span className="truncate font-mono text-[8px] text-muted-foreground">{clip.name}</span>
            <button type="button" data-no-seek onPointerDown={(e) => { e.stopPropagation(); onToggleMute() }} title={clip.muted ? '음소거 해제' : '음소거'}>
              {clip.muted ? <VolumeX className="size-3 text-muted-foreground" /> : <Volume2 className="size-3 text-primary" />}
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
            title={`음량 ${Math.round(vol * 100)}% — 위/아래 드래그`}
          />

          {/* 트림 핸들 (요청): 좌=시작점, 우=끝점 + hover 라벨 */}
          <div data-no-seek onPointerDown={handleTrim('l')} className="group/trim absolute left-0 top-0 z-10 h-full w-1.5 cursor-ew-resize hover:bg-primary/60">
            <span className="pointer-events-none absolute -top-4 left-0 z-30 hidden whitespace-nowrap rounded bg-foreground px-1 text-[8px] text-background group-hover/trim:block">▕ 이 오디오 시작점</span>
          </div>
          <div data-no-seek onPointerDown={handleTrim('r')} className="group/trim absolute right-0 top-0 z-10 h-full w-1.5 cursor-ew-resize hover:bg-primary/60">
            <span className="pointer-events-none absolute -top-4 right-0 z-30 hidden whitespace-nowrap rounded bg-foreground px-1 text-[8px] text-background group-hover/trim:block">이 오디오 끝점 ▏</span>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuLabel className="text-xs">{clip.name}</ContextMenuLabel>
        <ContextMenuSeparator />
        <div className="px-2 py-1.5" onPointerDown={(e) => e.stopPropagation()}>
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>음량 (draft 반영)</span>
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
          {clip.muted ? '음소거 해제' : '음소거'}
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" className="text-xs" onSelect={() => onRemove()}>
          <Trash2 className="size-3.5" /> 오디오 삭제
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
  selectedAudioId,
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
  onZoom,
  onSplitVideo,
  onSetSpeed,
  onAddAudioSource,
  onAddAudioFromSource,
  onAddAudioTrack,
  onRemoveAudioTrack,
  onToggleAudioMute,
  onRemoveAudio,
  onMoveAudio,
  onSetAudioVolume,
  onSplitAudio,
  onSelectAudio,
  onUpdateVideoClip,
  onUpdateAudioClip,
  onPushHistory,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const videoTrackRef = useRef<HTMLDivElement>(null)
  const headerInnerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [reorder, setReorder] = useState<{ shotId: string; targetIndex: number } | null>(null)
  const [cutHoverSec, setCutHoverSec] = useState<number | null>(null) // cut 모드 미리보기 위치
  // 트림 미리보기: 드래그 중엔 실제 변경 없이 점선 박스 + 마우스 옆 시간초만 표시, 드롭 시 적용 (요청)
  const [trimPreview, setTrimPreview] = useState<
    { scope: 'video' | string; leftSec: number; rightSec: number; label: string; clientX: number; clientY: number } | null
  >(null)

  const cutMode = toolMode === 'cut'

  const videoSec = useMemo(() => layout.reduce((sum, l) => sum + l.durationSec, 0), [layout])
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

  // 오디오 드래그 스냅: 0 / 플레이헤드 / 비디오·오디오 클립 경계
  const snapStart = useCallback(
    (candidateStart: number, durationSec: number, excludeId: string) => {
      const targets = new Set<number>([0, currentTime])
      for (const it of layout) {
        targets.add(it.startSec)
        targets.add(it.startSec + it.durationSec)
      }
      for (const a of audioClips) {
        if (a.id === excludeId) continue
        targets.add(a.startSec)
        targets.add(a.startSec + a.durationSec)
      }
      const thr = SNAP_PX / pxPerSec
      let best = candidateStart
      let bestD = thr
      for (const t of targets) {
        const dStart = Math.abs(candidateStart - t)
        if (dStart < bestD) { bestD = dStart; best = t }
        const dEnd = Math.abs(candidateStart + durationSec - t)
        if (dEnd < bestD) { bestD = dEnd; best = t - durationSec }
      }
      return Math.max(0, best)
    },
    [currentTime, layout, audioClips, pxPerSec],
  )

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

  const handleAudioFile = useCallback(
    async (file: File) => {
      try {
        const source = await ingestAudioFile(file, 'audio')
        onAddAudioSource(source)
        onAddAudioFromSource(source.id, currentTime, audioTracks[0]?.id)
      } catch (err) {
        console.error('[timeline] audio ingest failed:', err)
      }
    },
    [onAddAudioSource, onAddAudioFromSource, currentTime, audioTracks],
  )

  const tickInterval = pickTickInterval(pxPerSec)
  const ticks = useMemo(() => {
    const arr: number[] = []
    for (let t = 0; t <= totalSec; t += tickInterval) arr.push(t)
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
        if (!moved) { onClearSelection(); onSeek(clientXToSec(startClientX)) }
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [cutMode, clientXToSec, onSeek, onSetSelection, onClearSelection, layout],
  )

  const handleClipPointerDown = useCallback(
    (e: React.PointerEvent, item: TimelineLayoutItem) => {
      if (e.button === 2) return
      e.stopPropagation()
      if (cutMode) { onSplitVideo(item.shotId, snapToPlayhead(clientXToSec(e.clientX))); return }
      if (e.ctrlKey || e.metaKey) { onToggleSelect(item.shotId); return }
      if (e.shiftKey) { onRangeSelect(item.shotId); return }
      onSelect(item.shotId)
      onSeek(clientXToSec(e.clientX))
      const startClientX = e.clientX
      let reordering = false
      const move = (ev: PointerEvent) => {
        if (!reordering && Math.abs(ev.clientX - startClientX) > 5) reordering = true
        if (reordering) setReorder({ shotId: item.shotId, targetIndex: computeDropIndex(clientXToSec(ev.clientX), item.shotId) })
      }
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        if (reordering) onMoveClipToIndex(item.shotId, computeDropIndex(clientXToSec(ev.clientX), item.shotId))
        setReorder(null)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [cutMode, clientXToSec, snapToPlayhead, onSplitVideo, onToggleSelect, onRangeSelect, onSelect, onSeek, computeDropIndex, onMoveClipToIndex],
  )

  const reorderX = useMemo(() => {
    if (!reorder) return null
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
    <div className="flex h-full flex-col bg-card select-none">
      {/* 상단 바 */}
      <div className="flex items-center justify-between border-b border-border px-3 py-1">
        <span className="font-mono text-xs tabular-nums text-foreground">{formatTimecode(currentTime)}</span>
        <div className="flex items-center gap-2">
          {selectedShotIds.length > 1 && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">{selectedShotIds.length}개 선택</span>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="외부 오디오 업로드 (플레이헤드 위치에 삽입)"
          >
            <Plus className="size-3" /> 오디오
          </button>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{formatTimecode(totalSec)}</span>
        </div>
        <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAudioFile(f); e.target.value = '' }} />
      </div>

      {/* 본문: 좌측 헤더 컬럼 + 우측 트랙(가로 스크롤) */}
      <div className="flex min-h-0 flex-1">
        {/* 헤더 컬럼 */}
        <div className="shrink-0 overflow-hidden border-r border-border" style={{ width: HEADER_W }}>
          <div ref={headerInnerRef}>
            <div className="h-5 border-b border-border" />
            <div className="flex h-24 items-center justify-center border-b border-border text-[10px] font-medium text-muted-foreground">
              Video
            </div>
            {audioTracks.map((t, i) => (
              <ContextMenu key={t.id}>
                <ContextMenuTrigger asChild>
                  <div className="flex h-16 items-center justify-center border-b border-border text-[10px] font-medium text-muted-foreground hover:bg-accent/40">
                    Audio {i + 1}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-40">
                  <ContextMenuItem className="text-xs" onSelect={() => onAddAudioTrack()}>
                    <Plus className="size-3.5" /> 오디오 트랙 추가
                  </ContextMenuItem>
                  <ContextMenuItem
                    variant="destructive"
                    className="text-xs"
                    disabled={audioTracks.length <= 1}
                    onSelect={() => onRemoveAudioTrack(t.id)}
                  >
                    <Trash2 className="size-3.5" /> 이 트랙 삭제
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            <button
              type="button"
              onClick={() => onAddAudioTrack()}
              className="flex h-6 w-full items-center justify-center gap-1 text-[9px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="오디오 트랙 추가"
            >
              <Plus className="size-3" /> 트랙
            </button>
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
            <div className="relative h-5 border-b border-border bg-muted/30" onPointerDown={handleSeekPointerDown}>
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 flex h-full flex-col" style={{ left: t * pxPerSec }}>
                  <div className="h-2 w-px bg-border" />
                  <span className="ml-0.5 font-mono text-[8px] leading-none text-muted-foreground">{formatTimecode(t)}</span>
                </div>
              ))}
            </div>

            {/* Video track */}
            <div
              ref={videoTrackRef}
              data-drop="video-track"
              data-pps={pxPerSec}
              className={cn('relative h-24 border-b border-border transition-colors', binDragKind === 'video' && 'bg-primary/10 ring-1 ring-inset ring-primary/40')}
              onPointerDown={handleVideoTrackPointerDown}
            >
              {layout.map((item) => {
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
                        onPointerDown={(e) => handleClipPointerDown(e, item)}
                        title={shot.actionDescription}
                        className={cn(
                          'group absolute top-1 flex h-[72px] flex-col overflow-hidden rounded border',
                          cutMode ? 'cursor-col-resize' : 'cursor-pointer',
                          isDragging && 'opacity-60 ring-1 ring-primary',
                          isSelected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-border-strong',
                        )}
                        style={{ left, width: Math.max(width, 8) }}
                      >
                        <div className="pointer-events-none flex h-full w-full items-center justify-center bg-muted text-[8px] text-muted-foreground">
                          {clip?.url ? (
                            <video src={clip.url} className="h-full w-full object-cover" muted preload="metadata" draggable={false} />
                          ) : shot.referenceImageUrl ? (
                            <img src={shot.referenceImageUrl} alt={shot.shotType} className="h-full w-full object-cover" draggable={false} />
                          ) : (
                            <span className="font-mono">{shot.shotType}</span>
                          )}
                        </div>
                        <span className="pointer-events-none absolute left-1 top-0.5 rounded bg-black/60 px-1 font-mono text-[8px] text-white">
                          {shot.shotType}
                          {clip?.speed && clip.speed !== 1 && <span className="ml-1 text-primary">{clip.speed.toFixed(2)}×</span>}
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
                            const calc = (cx: number) => Math.max(minLeft, Math.min(clientXToSec(cx), maxLeft))
                            const move = (ev: PointerEvent) => {
                              if (!moved && Math.abs(ev.clientX - startX) > 2) moved = true
                              if (!moved) return
                              const lft = calc(ev.clientX)
                              setTrimPreview({ scope: 'video', leftSec: lft, rightSec: endSec, label: `${(endSec - lft).toFixed(2)}s`, clientX: ev.clientX, clientY: ev.clientY })
                            }
                            const up = (ev: PointerEvent) => {
                              window.removeEventListener('pointermove', move)
                              window.removeEventListener('pointerup', up)
                              if (moved) {
                                const lft = calc(ev.clientX)
                                onPushHistory()
                                onUpdateVideoClip(item.shotId, { trimStart: Math.max(0, t0 + (lft - startSec) * speed), trimEnd: t1 })
                              }
                              setTrimPreview(null)
                            }
                            window.addEventListener('pointermove', move)
                            window.addEventListener('pointerup', up)
                          }}
                          className="group/trim absolute left-0 top-0 z-10 h-full w-1.5 cursor-ew-resize hover:bg-primary/60"
                        >
                          <span className="pointer-events-none absolute -top-4 left-0 z-30 hidden whitespace-nowrap rounded bg-foreground px-1 text-[8px] text-background group-hover/trim:block">
                            ▕ 이 클립 시작점
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
                            const maxRight = startSec + (base - t0) / speed // 원본 끝까지만
                            const startX = e.clientX
                            let moved = false
                            const calc = (cx: number) => Math.max(minRight, Math.min(clientXToSec(cx), maxRight))
                            const move = (ev: PointerEvent) => {
                              if (!moved && Math.abs(ev.clientX - startX) > 2) moved = true
                              if (!moved) return
                              const rgt = calc(ev.clientX)
                              setTrimPreview({ scope: 'video', leftSec: startSec, rightSec: rgt, label: `${(rgt - startSec).toFixed(2)}s`, clientX: ev.clientX, clientY: ev.clientY })
                            }
                            const up = (ev: PointerEvent) => {
                              window.removeEventListener('pointermove', move)
                              window.removeEventListener('pointerup', up)
                              if (moved) {
                                const rgt = calc(ev.clientX)
                                onPushHistory()
                                onUpdateVideoClip(item.shotId, { trimStart: t0, trimEnd: t0 + (rgt - startSec) * speed })
                              }
                              setTrimPreview(null)
                            }
                            window.addEventListener('pointermove', move)
                            window.addEventListener('pointerup', up)
                          }}
                          className="group/trim absolute right-0 top-0 z-10 h-full w-1.5 cursor-ew-resize hover:bg-primary/60"
                        >
                          <span className="pointer-events-none absolute -top-4 right-0 z-30 hidden whitespace-nowrap rounded bg-foreground px-1 text-[8px] text-background group-hover/trim:block">
                            이 클립 끝점 ▏
                          </span>
                        </div>

                        <button
                          type="button"
                          data-no-seek
                          onPointerDown={(e) => { e.stopPropagation(); onDelete(item.shotId) }}
                          className="absolute right-0.5 top-0.5 z-20 hidden rounded bg-destructive/80 p-0.5 text-destructive-foreground hover:bg-destructive group-hover:block"
                          title="클립 숨기기"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-44">
                      <ContextMenuLabel className="text-xs">
                        {targets.length > 1 ? `${targets.length}개 클립` : `${shot.shotType} · ${item.durationSec.toFixed(1)}s`}
                      </ContextMenuLabel>
                      <ContextMenuSeparator />
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="text-xs"><Gauge className="size-3.5" /> 재생 속도</ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                          <ContextMenuRadioGroup value={String(clip?.speed ?? 1)} onValueChange={(v) => targets.forEach((id) => onSetSpeed(id, Number(v)))}>
                            {CLIP_SPEEDS.map((sp) => (
                              <ContextMenuRadioItem key={sp} value={String(sp)} className="text-xs">{sp.toFixed(2)}×</ContextMenuRadioItem>
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
                        <Scissors className="size-3.5" /> 여기서 분할
                      </ContextMenuItem>
                      <ContextMenuItem variant="destructive" className="text-xs" onSelect={() => (targets.length > 1 ? onDeleteSelected() : onDelete(item.shotId))}>
                        <Trash2 className="size-3.5" /> {targets.length > 1 ? `${targets.length}개 숨기기` : '클립 숨기기'}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })}

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
                  className="pointer-events-none absolute top-1 z-30 h-[72px] rounded border-2 border-dashed border-muted-foreground/80 bg-foreground/10"
                  style={{ left: trimPreview.leftSec * pxPerSec, width: Math.max(2, (trimPreview.rightSec - trimPreview.leftSec) * pxPerSec) }}
                />
              )}
              {layout.length === 0 && (
                <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
                  Video Source에서 클립을 드래그하거나 우클릭→타임라인 추가
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
                  className={cn('relative h-16 border-b border-border bg-muted/10 transition-colors', binDragKind === 'audio' && 'bg-primary/10 ring-1 ring-inset ring-primary/40')}
                  onPointerDown={handleSeekPointerDown}
                >
                  {clipsOnTrack.map((a) => (
                    <AudioClipBlock
                      key={a.id}
                      clip={a}
                      pxPerSec={pxPerSec}
                      selected={selectedAudioId === a.id}
                      cutMode={cutMode}
                      clientXToSec={clientXToSec}
                      snapStart={snapStart}
                      onToggleMute={() => onToggleAudioMute(a.id)}
                      onRemove={() => onRemoveAudio(a.id)}
                      onMove={(startSec, trackId) => onMoveAudio(a.id, startSec, trackId)}
                      onSplit={(atSec) => onSplitAudio(a.id, snapToPlayhead(atSec))}
                      onSelect={() => onSelectAudio(a.id)}
                      onSetVolume={(v) => onSetAudioVolume(a.id, v)}
                      onUpdate={(patch) => onUpdateAudioClip(a.id, patch)}
                      onTrimPreview={setTrimPreview}
                      rowTrackId={track.id}
                      onPushHistory={onPushHistory}
                    />
                  ))}
                  {trimPreview?.scope === track.id && (
                    <div
                      className="pointer-events-none absolute top-1 z-30 h-[52px] rounded border-2 border-dashed border-muted-foreground/80 bg-foreground/10"
                      style={{ left: trimPreview.leftSec * pxPerSec, width: Math.max(2, (trimPreview.rightSec - trimPreview.leftSec) * pxPerSec) }}
                    />
                  )}
                </div>
              )
            })}

            {audioClips.length === 0 && (
              <p className="pointer-events-none absolute left-2 z-10 text-[10px] text-muted-foreground" style={{ top: 20 + 96 + 4 }}>
                Audio 소스를 드래그하거나 우상단 + 버튼으로 업로드
              </p>
            )}

            {/* Cut 미리보기 (점선) — 플레이헤드 근처면 겹침 */}
            {cutMode && cutHoverSec != null && (
              <div
                className="pointer-events-none absolute top-0 z-30 h-full border-l border-dashed border-primary/70"
                style={{ left: cutHoverSec * pxPerSec }}
              />
            )}

            {/* Playhead (전체 트랙 관통) */}
            <div className="pointer-events-none absolute top-0 z-30 h-full w-px bg-primary" style={{ left: playheadX }}>
              <div className="absolute -left-[5px] top-0 size-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-primary" />
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
