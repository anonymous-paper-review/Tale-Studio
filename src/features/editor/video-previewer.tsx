'use client'

import { Play, Pause } from 'lucide-react'
import { useRef, useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import type { Shot, VideoClip } from '@/types'

interface VideoPreviewerProps {
  shot: Shot | undefined
  clip: VideoClip | undefined
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function VideoPreviewer({ shot, clip }: VideoPreviewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return
    if (playing) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setPlaying(!playing)
  }, [playing])

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return
    setCurrentTime(videoRef.current.currentTime)
  }, [])

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !progressRef.current) return
    const rect = progressRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    videoRef.current.currentTime = ratio * videoRef.current.duration
  }, [])

  // Reset state when clip changes
  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [clip?.shotId])

  if (!shot) {
    return (
      <div className="flex h-full items-center justify-center bg-black/40">
        <p className="text-sm text-muted-foreground">Select a clip to preview</p>
      </div>
    )
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="relative flex h-full flex-col items-center justify-center bg-black">
      {clip?.url ? (
        <>
          <video
            ref={videoRef}
            src={clip.url}
            className="max-h-[65vh] max-w-full rounded"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => {
              if (videoRef.current) setDuration(videoRef.current.duration)
            }}
            onEnded={() => setPlaying(false)}
          />

          {/* Custom controls */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-8">
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0 text-white hover:bg-white/20 hover:text-white"
              onClick={togglePlay}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>

            {/* Progress bar */}
            <div
              ref={progressRef}
              className="group relative flex h-5 flex-1 cursor-pointer items-center"
              onClick={handleSeek}
            >
              <div className="h-1 w-full rounded-full bg-white/20 transition-all group-hover:h-1.5">
                <div
                  className="h-full rounded-full bg-white transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {/* Thumb */}
              <div
                className="absolute size-3 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
                style={{ left: `calc(${progress}% - 6px)` }}
              />
            </div>

            <span className="shrink-0 text-xs tabular-nums text-white/70">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-48 w-80 items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10">
            <div className="text-center">
              <p className="text-lg font-semibold text-muted-foreground">
                {shot.shotType}
              </p>
              <p className="mt-1 max-w-[260px] text-xs text-muted-foreground/70">
                {shot.actionDescription}
              </p>
              <p className="mt-2 text-[10px] text-muted-foreground/50">
                {clip?.status === 'generating'
                  ? 'Generating...'
                  : 'No video generated yet'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Duration badge */}
      <div className="absolute right-3 top-3 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {shot.durationSeconds}s
      </div>
    </div>
  )
}
