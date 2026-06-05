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

const CLIP_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

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
  audioClips: AudioTrackClip[]
  onSeek: (timeSec: number) => void
  onSelect: (shotId: string) => void                 // plain click (replace)
  onToggleSelect: (shotId: string) => void           // ctrl+click
  onRangeSelect: (shotId: string) => void            // shift+click
  onSetSelection: (ids: string[]) => void            // marquee
  onClearSelection: () => void
  onDelete: (shotId: string) => void
  onDeleteSelected: () => void
  onMoveClipToIndex: (shotId: string, targetIndex: number) => void
  onZoom: (nextPxPerSec: number) => void
  onSplitVideo: (shotId: string, atGlobalSec: number) => void
  onSetSpeed: (shotId: string, speed: number) => void
  onAddAudioSource: (source: AudioSource) => void
  onAddAudioFromSource: (sourceId: string, atGlobalSec: number) => void
  onToggleAudioMute: (id: string) => void
  onRemoveAudio: (id: string) => void
  onMoveAudio: (id: string, startSec: number) => void
  onSplitAudio: (id: string, atGlobalSec: number) => void
  onSelectAudio: (id: string) => void
  onPushHistory: () => void
}

// 초 → 타임코드 HH:MM:SS:FF
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

// 오디오 클립 블록 (파형 + mute/remove + 드래그 이동 + cut + 선택)
function AudioClipBlock({
  clip,
  pxPerSec,
  selected,
  cutMode,
  clientXToSec,
  onToggleMute,
  onRemove,
  onMove,
  onSplit,
  onSelect,
  onPushHistory,
}: {
  clip: AudioTrackClip
  pxPerSec: number
  selected: boolean
  cutMode: boolean
  clientXToSec: (clientX: number) => number
  onToggleMute: () => void
  onRemove: () => void
  onMove: (startSec: number) => void
  onSplit: (atGlobalSec: number) => void
  onSelect: () => void
  onPushHistory: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const width = Math.max(clip.durationSec * pxPerSec, 12)

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
    cv.height = 48
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
      const startX = e.clientX
      const origStart = clip.startSec
      const move = (ev: PointerEvent) => {
        onMove(Math.max(0, origStart + (ev.clientX - startX) / pxPerSec))
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [cutMode, clientXToSec, onSplit, onSelect, onPushHistory, clip.startSec, pxPerSec, onMove],
  )

  return (
    <div
      data-no-seek
      onPointerDown={handleBodyPointerDown}
      className={cn(
        'group absolute top-1 flex h-[56px] flex-col overflow-hidden rounded border',
        cutMode ? 'cursor-col-resize' : 'cursor-grab active:cursor-grabbing',
        selected
          ? 'border-primary ring-1 ring-primary'
          : clip.muted
            ? 'border-border opacity-50'
            : 'border-primary/50',
      )}
      style={{ left: clip.startSec * pxPerSec, width }}
    >
      <div className="flex items-center justify-between bg-card/80 px-1 py-px">
        <span className="truncate font-mono text-[8px] text-muted-foreground">{clip.name}</span>
        <div className="flex items-center gap-0.5">
          <button type="button" data-no-seek onPointerDown={(e) => { e.stopPropagation(); onToggleMute() }} title={clip.muted ? '음소거 해제' : '음소거'}>
            {clip.muted ? <VolumeX className="size-3 text-muted-foreground" /> : <Volume2 className="size-3 text-primary" />}
          </button>
          <button type="button" data-no-seek onPointerDown={(e) => { e.stopPropagation(); onRemove() }} title="오디오 제거" className="hidden group-hover:block">
            <Trash2 className="size-3 text-destructive" />
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} className="pointer-events-none h-full w-full" />
    </div>
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
  audioClips,
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
  onToggleAudioMute,
  onRemoveAudio,
  onMoveAudio,
  onSplitAudio,
  onSelectAudio,
  onPushHistory,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const videoTrackRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 마퀴 선택 박스 (video track 로컬 좌표) / 순서변경 인디케이터
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [reorder, setReorder] = useState<{ shotId: string; targetIndex: number } | null>(null)

  const cutMode = toolMode === 'cut'

  const videoSec = useMemo(() => layout.reduce((sum, l) => sum + l.durationSec, 0), [layout])
  const totalSec = useMemo(() => {
    const audioEnd = audioClips.reduce((max, a) => Math.max(max, a.startSec + a.durationSec), 0)
    return Math.max(videoSec, audioEnd)
  }, [videoSec, audioClips])
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
        onAddAudioFromSource(source.id, currentTime)
      } catch (err) {
        console.error('[timeline] audio ingest failed:', err)
      }
    },
    [onAddAudioSource, onAddAudioFromSource, currentTime],
  )

  const tickInterval = pickTickInterval(pxPerSec)
  const ticks = useMemo(() => {
    const arr: number[] = []
    for (let t = 0; t <= totalSec; t += tickInterval) arr.push(t)
    return arr
  }, [totalSec, tickInterval])

  // ruler / 빈 영역 드래그-seek (data-no-seek 제외)
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

  // 드래그할 클립을 제외한 전역 순서에서 pointerSec 의 삽입 인덱스
  const computeDropIndex = useCallback(
    (pointerSec: number, draggedId: string) => {
      const others = layout.filter((it) => it.shotId !== draggedId)
      let idx = others.length
      for (let i = 0; i < others.length; i++) {
        const it = others[i]
        if (pointerSec < it.startSec + it.durationSec / 2) {
          idx = i
          break
        }
      }
      return idx
    },
    [layout],
  )

  // Video track 빈 영역: 마퀴 선택 (드래그) 또는 클릭-seek
  const handleVideoTrackPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 2) return
      if ((e.target as HTMLElement).closest('[data-no-seek]')) return
      if (cutMode) {
        onSeek(clientXToSec(e.clientX))
        return
      }
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
        onSetSelection(
          layout.filter((it) => it.startSec < hi && it.startSec + it.durationSec > lo).map((it) => it.shotId),
        )
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        setMarquee(null)
        if (!moved) {
          onClearSelection()
          onSeek(clientXToSec(startClientX))
        }
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [cutMode, clientXToSec, onSeek, onSetSelection, onClearSelection, layout],
  )

  // 클립 pointer down: 모디파이어 선택 / 분할 / 드래그 순서변경
  const handleClipPointerDown = useCallback(
    (e: React.PointerEvent, item: TimelineLayoutItem) => {
      if (e.button === 2) return
      e.stopPropagation()
      if (cutMode) {
        onSplitVideo(item.shotId, clientXToSec(e.clientX))
        return
      }
      if (e.ctrlKey || e.metaKey) {
        onToggleSelect(item.shotId)
        return
      }
      if (e.shiftKey) {
        onRangeSelect(item.shotId)
        return
      }
      onSelect(item.shotId)
      onSeek(clientXToSec(e.clientX))
      const startClientX = e.clientX
      let reordering = false
      const move = (ev: PointerEvent) => {
        if (!reordering && Math.abs(ev.clientX - startClientX) > 5) reordering = true
        if (reordering) {
          setReorder({ shotId: item.shotId, targetIndex: computeDropIndex(clientXToSec(ev.clientX), item.shotId) })
        }
      }
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        if (reordering) {
          onMoveClipToIndex(item.shotId, computeDropIndex(clientXToSec(ev.clientX), item.shotId))
        }
        setReorder(null)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [cutMode, clientXToSec, onSplitVideo, onToggleSelect, onRangeSelect, onSelect, onSeek, computeDropIndex, onMoveClipToIndex],
  )

  // 순서변경 인디케이터 x 좌표 (대상 위치의 클립 시작 / 끝)
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

  const playheadX = currentTime * pxPerSec

  return (
    <div className="flex h-full flex-col bg-card">
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
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleAudioFile(f)
            e.target.value = ''
          }}
        />
      </div>

      {/* 스크롤 영역 */}
      <div
        ref={(el) => {
          trackRef.current = el
          scrollRef.current = el
        }}
        className="relative flex-1 overflow-x-auto overflow-y-auto"
        onWheel={handleWheel}
      >
        <div className="relative" style={{ width: totalWidth }}>
          {/* Ruler */}
          <div className="relative h-5 border-b border-border bg-muted/30" onPointerDown={handleSeekPointerDown}>
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 flex h-full flex-col" style={{ left: t * pxPerSec }}>
                <div className="h-2 w-px bg-border" />
                <span className="ml-0.5 font-mono text-[8px] leading-none text-muted-foreground">{formatTimecode(t)}</span>
              </div>
            ))}
          </div>

          {/* Video track — bin 포인터 드롭존 (data-drop/data-pps) */}
          <div
            ref={videoTrackRef}
            data-drop="video-track"
            data-pps={pxPerSec}
            className={cn(
              // h-24: 클립(h-[72px])보다 높게 둬서 아래쪽 빈 띠에서 마퀴 선택 시작 가능
              'relative h-24 border-b border-border transition-colors',
              binDragKind === 'video' && 'bg-primary/10 ring-1 ring-inset ring-primary/40',
            )}
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
              const inSel = isSelected
              const targets = inSel && selectedShotIds.length > 1 ? selectedShotIds : [item.shotId]

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

                      <button
                        type="button"
                        data-no-seek
                        onPointerDown={(e) => { e.stopPropagation(); onDelete(item.shotId) }}
                        className="absolute right-0.5 top-0.5 hidden rounded bg-destructive/80 p-0.5 text-destructive-foreground hover:bg-destructive group-hover:block"
                        title="클립 삭제"
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
                      <ContextMenuSubTrigger className="text-xs">
                        <Gauge className="size-3.5" /> 재생 속도
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        <ContextMenuRadioGroup
                          value={String(clip?.speed ?? 1)}
                          onValueChange={(v) => targets.forEach((id) => onSetSpeed(id, Number(v)))}
                        >
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
                    <ContextMenuItem
                      variant="destructive"
                      className="text-xs"
                      onSelect={() => (targets.length > 1 ? onDeleteSelected() : onDelete(item.shotId))}
                    >
                      <Trash2 className="size-3.5" /> {targets.length > 1 ? `${targets.length}개 삭제` : '클립 삭제'}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}

            {/* 마퀴 선택 박스 */}
            {marquee && (
              <div
                className="pointer-events-none absolute z-20 border border-primary bg-primary/15"
                style={{
                  left: Math.min(marquee.x1, marquee.x2),
                  top: Math.min(marquee.y1, marquee.y2),
                  width: Math.abs(marquee.x2 - marquee.x1),
                  height: Math.abs(marquee.y2 - marquee.y1),
                }}
              />
            )}

            {/* 순서변경 삽입 인디케이터 */}
            {reorderX != null && (
              <div className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-primary" style={{ left: reorderX }} />
            )}

            {layout.length === 0 && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
                Video Source에서 클립을 드래그해 추가하세요
              </p>
            )}
          </div>

          {/* Audio track — bin 포인터 드롭존 */}
          <div
            data-drop="audio-track"
            data-pps={pxPerSec}
            className={cn(
              'relative h-16 border-b border-border bg-muted/10 transition-colors',
              binDragKind === 'audio' && 'bg-primary/10 ring-1 ring-inset ring-primary/40',
            )}
            onPointerDown={handleSeekPointerDown}
          >
            {audioClips.map((a) => (
              <AudioClipBlock
                key={a.id}
                clip={a}
                pxPerSec={pxPerSec}
                selected={selectedAudioId === a.id}
                cutMode={cutMode}
                clientXToSec={clientXToSec}
                onToggleMute={() => onToggleAudioMute(a.id)}
                onRemove={() => onRemoveAudio(a.id)}
                onMove={(startSec) => onMoveAudio(a.id, startSec)}
                onSplit={(atSec) => onSplitAudio(a.id, atSec)}
                onSelect={() => onSelectAudio(a.id)}
                onPushHistory={onPushHistory}
              />
            ))}
            {audioClips.length === 0 && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
                오디오 트랙 — Voice 소스를 드래그하거나 우상단 + 버튼으로 업로드
              </p>
            )}
          </div>

          {/* Playhead */}
          <div className="pointer-events-none absolute top-0 z-10 h-full w-px bg-primary" style={{ left: playheadX }}>
            <div className="absolute -left-[5px] top-0 size-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-primary" />
          </div>
        </div>
      </div>
    </div>
  )
}
