'use client'

// Camera 이력 판 카드(오너 2026-11-22 D2~D5, 시안 없음) — 판 하나 = 그림 판(시작 그림, 마우스를 올리면 시작 → 연출 → 끝) 또는 Take(포스터, 올리면 소리 없이 재생).
//   판 이름 · 지금 쓰는 표시(지금 그림 = 이미지 파랑, ★ = 완성 초록 — design.md §2.5 생성 상태 색, Camera 로 넓힘) · 무엇이 바뀌었나 한두 줄 · 할 수 있는 일.
//   안 쓴 판은 점선 · 흐림(참고 페이지의 "시도했지만 안 쓴 판"). 규칙은 shot-history.ts.
import { useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { mediaFrameStyle } from '@/lib/project-aspect'
import { STAGE_PERSONA } from '@/lib/lumi'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { RoughFrameCycle } from '@/components/rough-frame-cycle'
import { GeneratedImage } from '@/components/generating-frame'
import { Lumi } from '@/components/lumi/lumi'
import { historyActions, type HistoryEntry, type HistoryPhrase } from './shot-history'

const PILL = 'inline-flex h-6 items-center rounded-full px-2.5 text-micro font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50'

export function HistoryCard({ entry, shotNodeId, shotName }: { entry: HistoryEntry; shotNodeId: string; shotName: string }) {
  const t = useT()
  const format = useProjectFormatStore((s) => s.format)
  const frame = mediaFrameStyle(format)
  const [busy, setBusy] = useState(false)
  const summary = entry.summary.map((phrase: HistoryPhrase) => t(phrase.key, phrase.params)).join(' · ')
  const title = entry.kind === 'image' ? t('Image v{n}', { n: entry.n }) : entry.kind === 'take' ? t('Take {n}', { n: entry.takeNumber }) : t('New image')

  const border =
    entry.kind === 'image-pending'
      ? entry.phase === 'failed' ? 'border-destructive' : 'border-dashed border-stage-director'
      : entry.kind === 'image'
        ? entry.current ? 'border-stage-director' : 'border-dashed border-border opacity-60 hover:opacity-100'
        : entry.final ? 'border-success'
          : entry.phase === 'making' ? 'border-state-video'
            : entry.phase === 'failed' ? 'border-dashed border-destructive/60 opacity-60 hover:opacity-100'
              : 'border-dashed border-border opacity-60 hover:opacity-100'

  const chooseImage = async () => {
    if (entry.kind !== 'image' || busy) return
    setBusy(true)
    try {
      const ok = await useDirectorCanvasStore.getState().selectStoryboardImageVersion(shotNodeId, entry.id)
      if (!ok) toast.error(t('Could not change the current image. Please try again.'))
    } finally {
      setBusy(false)
    }
  }
  const markFinal = async (next: boolean) => {
    if (entry.kind !== 'take' || busy) return
    setBusy(true)
    try {
      await useDirectorCanvasStore.getState().setVideoFinal(entry.id, next)
    } catch {
      toast.error(t('Failed to set Final.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article
      className={cn('flex w-[184px] shrink-0 flex-col gap-2 rounded-[14px] border-[1.5px] bg-card p-2 transition-opacity duration-100', border)}
      data-history-kind={entry.kind}
      data-used={entry.used ? 'true' : 'false'}
    >
      <div className={cn('relative overflow-hidden rounded-[10px] bg-art-placeholder', !frame && 'aspect-video')} style={frame ?? undefined}>
        <Thumb entry={entry} alt={`${shotName} · ${title}`} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="font-num text-caption font-semibold text-foreground">{title}</span>
        {entry.kind === 'image' && entry.current ? (
          <span className="rounded-full bg-stage-director/18 px-1.5 text-micro font-semibold text-stage-director">{t('Current image')}</span>
        ) : null}
      </div>
      {summary ? (
        <p className="line-clamp-2 text-micro leading-snug text-muted-foreground" title={summary}>{summary}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-1.5">
        {historyActions(entry).map((action) =>
          action === 'useImage' ? (
            <button key={action} type="button" disabled={busy} onClick={() => void chooseImage()} className={cn(PILL, 'bg-background text-foreground hover:bg-accent')}>
              {t('Use this image')}
            </button>
          ) : entry.kind === 'take' ? (
            <button
              key={action}
              type="button"
              disabled={busy}
              aria-pressed={entry.final === 'manual'}
              onClick={() => void markFinal(action === 'setFinal')}
              className={cn(PILL, entry.final ? 'border border-success text-success hover:bg-success/10' : 'bg-background text-foreground hover:bg-accent')}
            >
              {entry.final === 'manual' ? t('★ Final') : entry.final === 'auto' ? t('★ Final (auto)') : t('☆ Set as final')}
            </button>
          ) : null,
        )}
      </div>
    </article>
  )
}

function Thumb({ entry, alt }: { entry: HistoryEntry; alt: string }) {
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  if (entry.kind === 'image-pending') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
        {entry.phase === 'drawing' ? <Lumi persona={STAGE_PERSONA.camera} state="loading" size="xs" still /> : null}
        <span className={cn('text-micro font-semibold', entry.phase === 'failed' ? 'text-destructive' : 'text-foreground')}>
          {entry.phase === 'failed' ? t('Remake failed') : t('Drawing the image')}
        </span>
      </div>
    )
  }
  if (entry.kind === 'image') {
    const version = entry.version
    return version.frames ? (
      <RoughFrameCycle panel={{ url: version.url, generatedAt: version.generatedAt, frames: version.frames }} alt={alt} pauseOnClick={false} />
    ) : (
      <GeneratedImage src={version.url} alt={alt} className="size-full object-cover" />
    )
  }
  const data = entry.take.data
  if (data.videoUrl) {
    return (
      <video
        ref={videoRef}
        src={data.videoUrl}
        poster={data.thumbnailUrl ?? undefined}
        muted
        loop
        playsInline
        preload={data.thumbnailUrl ? 'none' : 'metadata'}
        aria-label={alt}
        className="size-full object-cover"
        onMouseEnter={() => void videoRef.current?.play().catch(() => {})}
        onMouseLeave={() => videoRef.current?.pause()}
      />
    )
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center text-micro text-muted-foreground">
      {entry.phase === 'making' ? <Lumi persona={STAGE_PERSONA.camera} state="loading" size="xs" still /> : <Play className="size-4" />}
      <span>{t(entry.phase === 'making' ? 'Making the video' : entry.phase === 'stopped' ? 'Stopped' : entry.phase === 'failed' ? 'Failed' : 'Not made yet')}</span>
    </div>
  )
}
