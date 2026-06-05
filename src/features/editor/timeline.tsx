'use client'

import { useRef, useCallback, useMemo, useEffect } from 'react'
import { Trash2, Plus, Volume2, VolumeX } from 'lucide-react'
import type { Shot, VideoClip, AudioTrackClip } from '@/types'
import { cn } from '@/lib/utils'
import { decodeAudioPeaks, drawWaveform } from '@/lib/audio-waveform'
import {
  PX_PER_SEC_MIN,
  PX_PER_SEC_MAX,
} from '@/stores/editor-store'

interface TimelineLayoutItem {
  shotId: string
  startSec: number
  durationSec: number
}

interface TimelineProps {
  layout: TimelineLayoutItem[]   // selectTimelineLayout(store)
  shots: Shot[]
  videoClips: VideoClip[]
  selectedShotId: string | null
  currentTime: number
  pxPerSec: number
  audioClips: AudioTrackClip[]
  onSeek: (timeSec: number) => void
  onSelect: (shotId: string) => void
  onDelete: (shotId: string) => void
  onZoom: (nextPxPerSec: number) => void
  onAddAudio: (clip: { name: string; url: string; startSec: number; durationSec: number; peaks: number[] }) => void
  onToggleAudioMute: (id: string) => void
  onRemoveAudio: (id: string) => void
}

// 초 → 타임코드 HH:MM:SS:FF (24fps 가정, frame은 표기용)
function formatTimecode(sec: number, fps = 24): string {
  const total = Math.max(0, sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  const f = Math.floor((total - Math.floor(total)) * fps)
  const p = (n: number) => n.toString().padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`
}

// ruler 눈금 간격: zoom에 따라 1/2/5/10/30/60초 중 ~80px 이상 되는 값 선택
function pickTickInterval(pxPerSec: number): number {
  const candidates = [1, 2, 5, 10, 30, 60, 120, 300]
  for (const c of candidates) {
    if (c * pxPerSec >= 80) return c
  }
  return 600
}

// 오디오 클립 블록 (파형 canvas + mute/remove)
function AudioClipBlock({
  clip,
  pxPerSec,
  onToggleMute,
  onRemove,
}: {
  clip: AudioTrackClip
  pxPerSec: number
  onToggleMute: () => void
  onRemove: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const width = Math.max(clip.durationSec * pxPerSec, 12)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !clip.peaks?.length) return
    cv.width = Math.floor(width)
    cv.height = 48
    // primary 색으로 파형 (one-accent 규칙: 토큰 사용)
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--primary')
      .trim()
    drawWaveform(cv, clip.peaks, accent ? `oklch(${accent})` : '#888')
  }, [clip.peaks, width])

  return (
    <div
      data-no-seek
      className={cn(
        'group absolute top-1 flex h-[56px] flex-col overflow-hidden rounded border',
        clip.muted ? 'border-border opacity-50' : 'border-primary/50',
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
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  )
}

export function Timeline({
  layout,
  shots,
  videoClips,
  selectedShotId,
  currentTime,
  pxPerSec,
  audioClips,
  onSeek,
  onSelect,
  onDelete,
  onZoom,
  onAddAudio,
  onToggleAudioMute,
  onRemoveAudio,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const videoSec = useMemo(
    () => layout.reduce((sum, l) => sum + l.durationSec, 0),
    [layout],
  )
  // 전체 길이 = 비디오 끝 vs 오디오 클립 끝 중 큰 값
  const totalSec = useMemo(() => {
    const audioEnd = audioClips.reduce((max, a) => Math.max(max, a.startSec + a.durationSec), 0)
    return Math.max(videoSec, audioEnd)
  }, [videoSec, audioClips])
  const totalWidth = Math.max(totalSec * pxPerSec, 320)

  // hover 중 마우스휠 → 커서 위치 기준 zoom in/out
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return // 가로 스크롤은 통과
      e.preventDefault()
      const el = scrollRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cursorX = e.clientX - rect.left + el.scrollLeft
      const cursorSec = cursorX / pxPerSec
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const next = Math.max(PX_PER_SEC_MIN, Math.min(PX_PER_SEC_MAX, pxPerSec * factor))
      onZoom(next)
      // 커서 아래 지점이 그대로 머물도록 스크롤 보정
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = cursorSec * next - (e.clientX - rect.left)
        }
      })
    },
    [pxPerSec, onZoom],
  )

  const handleAudioFile = useCallback(
    async (file: File) => {
      const url = URL.createObjectURL(file)
      try {
        const { durationSec, peaks } = await decodeAudioPeaks(url)
        onAddAudio({ name: file.name, url, startSec: 0, durationSec, peaks })
      } catch (err) {
        console.error('[timeline] audio decode failed:', err)
        URL.revokeObjectURL(url)
      }
    },
    [onAddAudio],
  )
  const tickInterval = pickTickInterval(pxPerSec)
  const ticks = useMemo(() => {
    const arr: number[] = []
    for (let t = 0; t <= totalSec; t += tickInterval) arr.push(t)
    return arr
  }, [totalSec, tickInterval])

  // 클릭/드래그 → 시간으로 변환 후 seek
  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = clientX - rect.left + el.scrollLeft
      onSeek(Math.max(0, x / pxPerSec))
    },
    [pxPerSec, onSeek],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 클립 위 삭제 버튼 등은 제외 (data-no-seek)
      if ((e.target as HTMLElement).closest('[data-no-seek]')) return
      seekFromClientX(e.clientX)
      const move = (ev: PointerEvent) => seekFromClientX(ev.clientX)
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [seekFromClientX],
  )

  const playheadX = currentTime * pxPerSec

  return (
    <div className="flex h-full flex-col bg-card">
      {/* 상단 바: 현재 타임코드 / 전체 길이 + 오디오 업로드 */}
      <div className="flex items-center justify-between border-b border-border px-3 py-1">
        <span className="font-mono text-xs tabular-nums text-foreground">
          {formatTimecode(currentTime)}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="외부 오디오 업로드"
          >
            <Plus className="size-3" /> 오디오
          </button>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {formatTimecode(totalSec)}
          </span>
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

      {/* 스크롤 영역 (ruler + 트랙 공유 스크롤) */}
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
          <div
            className="relative h-5 border-b border-border bg-muted/30"
            onPointerDown={handlePointerDown}
          >
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 flex h-full flex-col"
                style={{ left: t * pxPerSec }}
              >
                <div className="h-2 w-px bg-border" />
                <span className="ml-0.5 font-mono text-[8px] leading-none text-muted-foreground">
                  {formatTimecode(t)}
                </span>
              </div>
            ))}
          </div>

          {/* Video track (붙어있는 클립 블록) */}
          <div
            className="relative h-20 border-b border-border"
            onPointerDown={handlePointerDown}
          >
            {layout.map((item) => {
              const shot = shots.find((s) => s.shotId === item.shotId)
              const clip = videoClips.find((c) => c.shotId === item.shotId)
              if (!shot) return null
              const isSelected = selectedShotId === item.shotId
              const left = item.startSec * pxPerSec
              const width = item.durationSec * pxPerSec

              return (
                <div
                  key={item.shotId}
                  data-no-seek
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onSelect(item.shotId)
                  }}
                  title={shot.actionDescription}
                  className={cn(
                    'group absolute top-1 flex h-[72px] cursor-pointer flex-col overflow-hidden rounded border',
                    isSelected
                      ? 'border-primary ring-1 ring-primary'
                      : 'border-border hover:border-border-strong',
                  )}
                  style={{ left, width: Math.max(width, 8) }}
                >
                  {/* 썸네일 배경 */}
                  <div className="flex h-full w-full items-center justify-center bg-muted text-[8px] text-muted-foreground">
                    {clip?.url ? (
                      <video src={clip.url} className="h-full w-full object-cover" muted preload="metadata" />
                    ) : shot.referenceImageUrl ? (
                      <img src={shot.referenceImageUrl} alt={shot.shotType} className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-mono">{shot.shotType}</span>
                    )}
                  </div>

                  {/* 클립 라벨 (좌상단) */}
                  <span className="pointer-events-none absolute left-1 top-0.5 rounded bg-black/60 px-1 font-mono text-[8px] text-white">
                    {shot.shotType}
                  </span>

                  {/* 삭제 버튼 (hover) */}
                  <button
                    type="button"
                    data-no-seek
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      onDelete(item.shotId)
                    }}
                    className="absolute right-0.5 top-0.5 hidden rounded bg-destructive/80 p-0.5 text-destructive-foreground hover:bg-destructive group-hover:block"
                    title="클립 삭제"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              )
            })}

            {layout.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
                타임라인에 클립이 없습니다
              </p>
            )}
          </div>

          {/* Audio track (독립, 외부 업로드, 파형) */}
          <div className="relative h-16 border-b border-border bg-muted/10" onPointerDown={handlePointerDown}>
            {audioClips.map((a) => (
              <AudioClipBlock
                key={a.id}
                clip={a}
                pxPerSec={pxPerSec}
                onToggleMute={() => onToggleAudioMute(a.id)}
                onRemove={() => onRemoveAudio(a.id)}
              />
            ))}
            {audioClips.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
                오디오 트랙 — 우하단 + 버튼으로 외부 오디오 업로드
              </p>
            )}
          </div>

          {/* Playhead (ruler + 트랙 전체 관통) */}
          <div
            className="pointer-events-none absolute top-0 z-10 h-full w-px bg-primary"
            style={{ left: playheadX }}
          >
            <div className="absolute -left-[5px] top-0 size-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-primary" />
          </div>
        </div>
      </div>
    </div>
  )
}
