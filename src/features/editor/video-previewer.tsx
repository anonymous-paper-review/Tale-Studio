'use client'

import { Play, Pause, Volume2, VolumeX } from 'lucide-react'
import { useRef, useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useEditorStore, selectTimelineLayout } from '@/stores/editor-store'

function formatTime(sec: number) {
  const t = Math.max(0, Number.isFinite(sec) ? sec : 0)
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Editor 프리뷰. 두 모드:
 *   1) 타임라인 모드 (default): 전역 currentTime 아래 클립을 골라 trim/speed 반영해 일렬 재생.
 *   2) 소스 미리보기 모드 (previewSourceShotId 설정 시): Video Source 에서 클릭한 단일 클립을
 *      원본 그대로(트림/속도 무시, loop) 재생. 타임라인 클릭하면 해제되어 1)로 복귀.
 * 마스터 클럭은 use-editor-playback rAF(타임라인 모드에서만 currentTime 진행).
 */
export function VideoPreviewer() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const activeIdRef = useRef<string | null>(null)

  const [activeShotId, setActiveShotId] = useState<string | null>(null)
  const [actualDuration, setActualDuration] = useState<number | null>(null)

  const shots = useEditorStore((s) => s.shots)
  const videoClips = useEditorStore((s) => s.videoClips)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const previewSourceShotId = useEditorStore((s) => s.previewSourceShotId)
  const masterVolume = useEditorStore((s) => s.masterVolume)
  const togglePlay = useEditorStore((s) => s.togglePlay)
  const seek = useEditorStore((s) => s.seek)
  const setMasterVolume = useEditorStore((s) => s.setMasterVolume)

  // ── 동기화 루프 ──
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const st = useEditorStore.getState()
      const v = videoRef.current
      const preview = st.previewSourceShotId

      if (preview) {
        // 소스 미리보기 모드: 단일 클립을 원본 그대로 재생 (loop)
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
          if (timeRef.current) timeRef.current.textContent = `${formatTime(v.currentTime)} / ${formatTime(dur)}`
        }
        raf = requestAnimationFrame(tick)
        return
      }

      // 타임라인 모드
      const layout = selectTimelineLayout(st)
      const total = layout.reduce((sum, l) => sum + l.durationSec, 0)
      const t = st.currentTime

      let item = layout.find((l) => t >= l.startSec && t < l.startSec + l.durationSec)
      if (!item && layout.length > 0 && t >= total) item = layout[layout.length - 1]
      const id = item?.shotId ?? null
      if (id !== activeIdRef.current) {
        activeIdRef.current = id
        setActiveShotId(id)
        setActualDuration(null)
      }

      if (fillRef.current) fillRef.current.style.width = total > 0 ? `${Math.min(100, (t / total) * 100)}%` : '0%'
      if (timeRef.current) timeRef.current.textContent = `${formatTime(t)} / ${formatTime(total)}`

      if (v && item) {
        const clip = st.videoClips.find((c) => c.shotId === item!.shotId)
        if (clip?.url) {
          v.loop = false
          const trimStart = clip.trimStart ?? 0
          const speed = clip.speed ?? 1.0
          const local = trimStart + (t - item.startSec) * speed
          if (v.playbackRate !== speed) v.playbackRate = speed
          if (st.isPlaying) {
            if (v.paused) void v.play().catch(() => {})
            if (Math.abs(v.currentTime - local) > 0.3) v.currentTime = local
          } else {
            if (!v.paused) v.pause()
            if (Math.abs(v.currentTime - local) > 0.02) v.currentTime = local
          }
        }
      } else if (v && !v.paused) {
        v.pause()
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
      const layout = selectTimelineLayout(st)
      const total = layout.reduce((sum, l) => sum + l.durationSec, 0)
      seek(ratio * total)
    },
    [seek],
  )

  const activeShot = shots.find((s) => s.shotId === activeShotId)
  const activeClip = videoClips.find((c) => c.shotId === activeShotId)

  if (!activeShot) {
    return (
      <div className="flex h-full items-center justify-center bg-black/40">
        <p className="text-sm text-muted-foreground">타임라인에 클립이 없습니다</p>
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col items-center justify-center bg-black">
      {activeClip?.url ? (
        <video
          key={activeShotId ?? 'none'}
          ref={videoRef}
          src={activeClip.url}
          muted
          playsInline
          preload="auto"
          className="max-h-full max-w-full rounded"
          onLoadedMetadata={() => {
            if (videoRef.current) setActualDuration(videoRef.current.duration)
          }}
        />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-48 w-80 items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10">
            <div className="text-center">
              <p className="text-lg font-semibold text-muted-foreground">{activeShot.shotType}</p>
              <p className="mt-1 max-w-[260px] text-xs text-muted-foreground/70">
                {activeShot.actionDescription}
              </p>
              <p className="mt-2 text-[10px] text-muted-foreground/50">
                {activeClip?.status === 'generating' ? 'Generating...' : 'No video generated yet'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 재생 컨트롤 */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-8">
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-white hover:bg-white/20 hover:text-white"
          onClick={togglePlay}
        >
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>

        <div
          className="group relative flex h-5 flex-1 cursor-pointer items-center"
          onClick={onProgressClick}
        >
          <div className="h-1 w-full rounded-full bg-white/20 transition-all group-hover:h-1.5">
            <div ref={fillRef} className="h-full rounded-full bg-white" style={{ width: '0%' }} />
          </div>
        </div>

        <span ref={timeRef} className="shrink-0 text-xs tabular-nums text-white/70">
          0:00 / 0:00
        </span>

        {/* 전역 재생 볼륨 (재생 전용 — draft 무관) */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMasterVolume(masterVolume > 0 ? 0 : 1)}
            className="text-white/80 hover:text-white"
            title={masterVolume > 0 ? '음소거' : '음소거 해제'}
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
            className="h-1 w-20 cursor-pointer accent-primary"
            title={`전체 볼륨 ${Math.round(masterVolume * 100)}%`}
          />
        </div>
      </div>

      {/* 모드 뱃지 + 길이 뱃지 (실제 생성 영상 길이 우선 — 요청 6) */}
      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        {previewSourceShotId && (
          <span className="rounded bg-primary/80 px-2 py-0.5 text-xs font-medium text-primary-foreground">
            소스 미리보기
          </span>
        )}
        <span className="rounded bg-black/60 px-2 py-0.5 text-xs text-white">
          {(actualDuration ?? activeShot.durationSeconds).toFixed(1)}s
        </span>
      </div>
    </div>
  )
}
