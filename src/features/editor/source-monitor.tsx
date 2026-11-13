'use client'

// 소스 탭(시안 E1 409:4650) — 프로젝트 판에서 누른 샷을 따로 본다. 프로그램 모니터는 늘 시퀀스를 보인다(2단계 ① 새 배치, 2026-11-14).
//   소스를 재생하면 시퀀스 재생은 멈추고, 시퀀스를 재생하면 소스가 멈춘다 — 두 소리가 겹치지 않게.
import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThumbImage } from '@/components/thumb-image'
import { cachedVideoUrl } from '@/features/editor/video-prefetch'
import { shotLabel } from '@/features/editor/editor-labels'
import { formatTimecode } from '@/lib/editor/sequence-info'
import { useT } from '@/lib/i18n'
import { isSyntheticShotId, useEditorStore } from '@/stores/editor-store'

export function SourceMonitor({ shotId }: { shotId: string | null }) {
  const t = useT()
  const shots = useEditorStore((s) => s.shots)
  const videoClips = useEditorStore((s) => s.videoClips)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState({ current: 0, total: 0 })

  const sourceShots = shots.filter((s) => !isSyntheticShotId(s.shotId))
  const index = shotId ? sourceShots.findIndex((s) => s.shotId === shotId) : -1
  const shot = index >= 0 ? sourceShots[index] : undefined
  const clip = shot ? videoClips.find((c) => c.shotId === shot.shotId) : undefined
  const url = clip?.url ? (cachedVideoUrl(clip.url) ?? clip.url) : null

  // 시퀀스가 재생을 시작하면 소스를 멈춘다.
  useEffect(
    () =>
      useEditorStore.subscribe((s, prev) => {
        if (s.isPlaying && !prev.isPlaying) videoRef.current?.pause()
      }),
    [],
  )
  // 다른 샷을 열면 처음부터 재생한다(누르면 바로 보는 예전 미리보기처럼).
  useEffect(() => {
    const v = videoRef.current
    if (!v || !url) return
    useEditorStore.getState().setPlaying(false)
    void v.play().catch(() => {})
  }, [url])

  if (!shot) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-label text-muted-foreground">
        {t('Click a shot in the Project panel to view it here.')}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-4 pb-3 pt-2">
      <p className="truncate text-label font-semibold text-foreground">
        {shotLabel({ number: index + 1, shotType: shot.shotType, takeNumber: url ? clip?.takeNumber : null }, t)}
      </p>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black">
        {url ? (
          <video
            ref={videoRef}
            key={url}
            src={url}
            className="h-full w-full object-contain"
            playsInline
            loop
            onPlay={() => {
              setPlaying(true)
              useEditorStore.getState().setPlaying(false)
            }}
            onPause={() => setPlaying(false)}
            onLoadedMetadata={(e) => setTime({ current: 0, total: e.currentTarget.duration || 0 })}
            onTimeUpdate={(e) => setTime({ current: e.currentTarget.currentTime, total: e.currentTarget.duration || 0 })}
          />
        ) : shot.referenceImageUrl ? (
          <ThumbImage src={shot.referenceImageUrl} alt={shot.shotType} className="h-full w-full object-contain" draggable={false} />
        ) : (
          <span className="text-meta text-subtle-foreground">{t('(No video yet. Only shots with video go into the timeline.)')}</span>
        )}
      </div>
      {url ? (
        <div className="flex items-center gap-2">
          <Button
            size="icon-sm"
            variant="ghost"
            className="rounded-full"
            onClick={() => {
              const v = videoRef.current
              if (!v) return
              if (v.paused) void v.play().catch(() => {})
              else v.pause()
            }}
            aria-label={t('Play or pause')}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <span className="font-num text-meta text-muted-foreground tabular-nums">
            {formatTimecode(time.current)} / {formatTimecode(time.total)}
          </span>
        </div>
      ) : null}
    </div>
  )
}
