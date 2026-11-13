'use client'

// 샷 상세의 영상 탭(디자이너 11/13 시안 D7, 오너 2026-11-14) — Take 는 덮어쓰지 않고 새것부터 쌓이고 ★ 로 최종을 고른다
//   (고르지 않았으면 가장 최근 완성 Take 가 "★ 최종 (자동)" — Editor 로 가는 것과 같은 규칙).
//   이미지 고치기(장면 · 인물 · 구도)와 영상 고치기(움직임 · 카메라 · 길이)를 한 화면에 둔다. 영상 고치기의 단추는 늘 새 Take 를
//   만들고 보고 있던 Take 의 설정을 이어받는다 — 같은 Take 를 덮던 다시 만들기는 여기서 쓰지 않는다.
//   규칙: lib/director/shot-detail · 약속: tests/director/shot-detail.test.ts · shot-detail-view.test.ts · shot-detail-take.test.ts
import { useState } from 'react'
import { Loader2, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useTakeBalance } from '@/lib/billing/use-take-balance'
import { takeCostForVideo } from '@/lib/billing/take-cost'
import {
  FAL_VIDEO_MODEL_ORDER,
  VIDEO_MODELS,
  clampDuration,
  effectiveVideoResolution,
  type VideoModelKey,
  type VideoResolution,
} from '@/lib/video-models'
import {
  imageChangedSinceTake,
  newTakeRequest,
  shotDetailFrames,
  shotDetailTakes,
  takePhaseOf,
  takeSettings,
  type ShotDetailTake,
  type TakePhase,
} from '@/lib/director/shot-detail'
import { mediaFrameStyle } from '@/lib/project-aspect'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { effectivePrompt, useDirectorCanvasStore } from '@/stores/director-store'
import { aspectRatioFromFormat } from '@/types/project'
import type { ShotNodeData } from '@/types/director'
import { StoryboardImageButton } from '@/features/director/storyboard-image-button'
import { VideoResolutionButtons } from '@/features/director/video-resolution-buttons'
import { LockedFrame, smallFrameStyle } from './locked-frame'

const takePhase = takePhaseOf

const PHASE_LABEL: Record<TakePhase, string> = { done: 'Done', making: 'Making', failed: 'Failed', idle: 'Not made yet' }

export function ShotVideoTab({ shotNodeId, data, layout, initialTakeId }: {
  shotNodeId: string
  data: ShotNodeData
  layout: 'popup' | 'panel'
  initialTakeId?: string | null
}) {
  const t = useT()
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const setVideoFinal = useDirectorCanvasStore((s) => s.setVideoFinal)
  const projectFormat = useProjectFormatStore((s) => s.format)
  const { takes, final } = shotDetailTakes(nodes, shotNodeId)
  const [picked, setPicked] = useState<string | null>(initialTakeId ?? null)
  const [finalError, setFinalError] = useState<string | null>(null)
  const current = takes.find((take) => take.id === picked) ?? takes.find((take) => take.id === final?.id) ?? takes[0] ?? null
  const busy = takes.some((take) => takePhase(take.data) === 'making')
  const [w, h] = aspectRatioFromFormat(projectFormat ?? 'horizontal_16:9').split(':').map(Number)
  const portrait = !!w && !!h && w < h

  const markFinal = async (take: ShotDetailTake, next: boolean) => {
    setFinalError(null)
    try {
      await setVideoFinal(take.id, next)
    } catch (error) {
      setFinalError(error instanceof Error ? error.message : t('Failed to set Final.'))
    }
  }

  const takesBlock = (
    <div className={cn('gap-4', portrait ? (layout === 'popup' ? 'grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]' : 'grid grid-cols-[120px_minmax(0,1fr)]') : 'flex flex-col')}>
      <TakePreview take={current} isFinal={!!current && final?.id === current.id} />
      <section className="min-w-0 space-y-2">
        <h3 className="text-body font-semibold">{t('Takes')}</h3>
        {takes.length === 0 ? (
          <p className="text-caption text-subtle-foreground">{t('No video for this shot yet.')}</p>
        ) : (
          <ol className="space-y-2" data-testid="shot-detail-takes" aria-label={t('Takes')}>
            {takes.map((take) => {
              const phase = takePhase(take.data)
              const isFinal = final?.id === take.id
              const setup = takeSettings(data, take.data)
              const resolution = take.data.videoResolution ?? effectiveVideoResolution(setup.model, setup.resolution)
              return (
                <li key={take.id} className={cn('space-y-2 rounded-[14px] border-[1.5px] p-3', isFinal ? 'border-success' : current?.id === take.id ? 'border-foreground/60' : 'border-border')}>
                  <p className="text-body font-semibold">{t('Take {n}', { n: take.data.takeNumber })}</p>
                  {phase === 'making' ? (
                    <div className="space-y-1.5">
                      <p className="text-caption text-state-video">{t('Making')}</p>
                      <span className="block h-1 overflow-hidden rounded-full bg-progress-track">
                        <span className="block h-full w-1/3 animate-pulse rounded-full bg-state-video" />
                      </span>
                    </div>
                  ) : phase === 'done' ? (
                    <p className="text-caption text-subtle-foreground">{`${VIDEO_MODELS[setup.model].label} · ${resolution}`}</p>
                  ) : phase === 'failed' ? (
                    <p className="line-clamp-2 text-caption text-destructive">
                      {t('Failed')}{take.data.lastAttemptError || take.data.errorMessage ? ` · ${(take.data.lastAttemptError || take.data.errorMessage || '').split('\n')[0]}` : ''}
                    </p>
                  ) : (
                    <p className="text-caption text-subtle-foreground">{t(PHASE_LABEL[phase])}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" size="pill" variant="secondary" aria-pressed={current?.id === take.id} onClick={() => setPicked(take.id)}>{t('View')}</Button>
                    {phase === 'done' ? (
                      isFinal ? (
                        <Button type="button" size="pill" variant="outline" aria-pressed={!final?.auto} className="border-success text-success hover:text-success"
                          onClick={() => void markFinal(take, !!final?.auto)}>
                          {final?.auto ? t('★ Final (auto)') : t('★ Final')}
                        </Button>
                      ) : (
                        <Button type="button" size="pill" variant="ghost" onClick={() => void markFinal(take, true)}>{t('☆ Set as final')}</Button>
                      )
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
        {finalError ? <p className="text-caption text-destructive">{finalError}</p> : null}
      </section>
    </div>
  )

  const fixBlock = (
    <div className="flex min-w-0 flex-col gap-4">
      <FixImage nodeId={shotNodeId} data={data} />
      <FixVideo key={current?.id ?? 'first'} shotNodeId={shotNodeId} data={data} current={current} busy={busy} />
    </div>
  )

  return (
    <div className={cn(layout === 'popup' ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-6' : 'flex flex-col gap-4')} data-testid="shot-detail-video-tab">
      {takesBlock}
      {fixBlock}
    </div>
  )
}

function TakePreview({ take, isFinal }: { take: ShotDetailTake | null; isFinal: boolean }) {
  const t = useT()
  const projectFormat = useProjectFormatStore((s) => s.format)
  const frame = mediaFrameStyle(projectFormat, 360)
  const phase = take ? takePhase(take.data) : null
  return (
    <figure className={cn('relative overflow-hidden rounded-[14px] bg-art-placeholder', !frame && 'aspect-video w-full')} style={frame ?? undefined} data-testid="shot-detail-take-preview">
      {take?.data.videoUrl ? (
        <video key={take.id} src={take.data.videoUrl} poster={take.data.thumbnailUrl ?? undefined} controls playsInline className="size-full object-cover" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 p-3 text-center text-caption text-muted-foreground">
          {phase === 'making' ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />}
          {phase ? <span>{t(PHASE_LABEL[phase])}</span> : null}
        </div>
      )}
      {take ? (
        <figcaption className={cn('pointer-events-none absolute left-2 top-2 rounded-full px-2 py-0.5 text-micro font-semibold', isFinal ? 'bg-success text-success-foreground' : 'bg-background/80')}>
          {t('Take {n}', { n: take.data.takeNumber })}{isFinal ? ' ★' : ''}
        </figcaption>
      ) : null}
    </figure>
  )
}

function SectionTitle({ dot, title, hint }: { dot: string; title: string; hint: string }) {
  return (
    <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body font-semibold">
      <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden />
      {title}
      <span className="text-caption font-normal text-subtle-foreground">{hint}</span>
    </h3>
  )
}

/** 이미지 고치기 — 시작 · 끝을 함께 다시 만든다(1단계, 오너 답 5번). 바꾸고 싶은 점은 이번 생성에만 붙는다. */
function FixImage({ nodeId, data }: { nodeId: string; data: ShotNodeData }) {
  const t = useT()
  const projectFormat = useProjectFormatStore((s) => s.format)
  const [change, setChange] = useState('')
  const frames = shotDetailFrames(data.storyboardImage)
  const style = smallFrameStyle(projectFormat)
  return (
    <section className="space-y-3 rounded-[16px] bg-card p-4" data-testid="shot-detail-fix-image">
      <SectionTitle dot="bg-stage-director" title={t('Fix the image')} hint={t('When the scene, people or framing are off')} />
      <div className="flex flex-wrap gap-3">
        <div className="flex shrink-0 gap-2">
          <LockedFrame which="start" url={frames.start} style={style} small />
          <LockedFrame which="end" url={frames.end} style={style} small />
        </div>
        <div className="min-w-[180px] flex-1 space-y-2">
          <Textarea value={change} onChange={(e) => setChange(e.target.value)} rows={2}
            placeholder={t('Write only what you want to change in the start and end images (e.g. show the umbrella handle)')} />
          <StoryboardImageButton nodeId={nodeId} data={data} changeNote={change}
            idleLabel={t(frames.start ? 'Remake start and end images · Takes 0' : 'Make start and end images · Takes 0')} />
        </div>
      </div>
    </section>
  )
}

/** 영상 고치기 — 늘 새 Take 를 만든다. 보고 있던 Take 의 설정을 이어받고, 여기서 바꾼 것만 새 Take 에 얹는다. */
function FixVideo({ shotNodeId, data, current, busy }: { shotNodeId: string; data: ShotNodeData; current: ShotDetailTake | null; busy: boolean }) {
  const t = useT()
  const videoBatchBusy = useDirectorCanvasStore((s) => s.videoBatchBusy)
  const generateVideoForShot = useDirectorCanvasStore((s) => s.generateVideoForShot)
  const openDeleteConfirm = useDirectorCanvasStore((s) => s.openDeleteConfirm)
  const takeBalance = useTakeBalance()
  const base = takeSettings(data, current?.data ?? null)
  const [provider, setProvider] = useState<VideoModelKey>(base.model)
  const [resolution, setResolution] = useState<VideoResolution>(base.resolution)
  const [change, setChange] = useState('')
  const [sending, setSending] = useState(false)
  const hasImage = !!shotDetailFrames(data.storyboardImage).start
  const image = data.storyboardImage
  const imageChanged = !!current && image?.status === 'completed' && imageChangedSinceTake(image.generatedAt, current.data)
  const showCost = takeBalance.mode !== 'off'
  const count = takeCostForVideo(provider, resolution)
  const label = !current
    ? (showCost ? t('Make the video · {count} Take', { count }) : t('Make the video'))
    : imageChanged
      ? (showCost ? t('Make a new Take with the changed image · {count} Take', { count }) : t('Make a new Take with the changed image'))
      : (showCost ? t('Make a new Take · {count} Take', { count }) : t('Make a new Take'))
  const videoSeconds = clampDuration(VIDEO_MODELS[provider], data.durationSeconds)
  const disabled = !hasImage || busy || videoBatchBusy || sending

  const make = async () => {
    if (disabled) return
    setSending(true)
    try {
      const made = await generateVideoForShot(shotNodeId, newTakeRequest({
        takeId: current?.id ?? null,
        take: current?.data ?? null,
        shotPrompt: effectivePrompt(data),
        change,
        provider: provider !== base.model ? provider : undefined,
        resolution: resolution !== base.resolution ? resolution : undefined,
      }))
      if (made) setChange('')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="space-y-3 rounded-[16px] bg-card p-4" data-testid="shot-detail-fix-video">
      <SectionTitle dot="bg-state-video" title={t('Fix the video')} hint={t('When the motion, camera or length are off')} />
      {imageChanged ? (
        <p className="rounded-[10px] bg-warning/15 px-3 py-2 text-caption font-medium text-warning">{t('The start and end images changed · A new Take will use them')}</p>
      ) : null}
      {current ? (
        <Textarea value={change} onChange={(e) => setChange(e.target.value)} rows={2}
          placeholder={t("What to change in the motion or camera · Leave it empty to keep this Take's prompt")} />
      ) : null}
      <div className="space-y-1.5">
        <p className="text-caption text-subtle-foreground">{t('Video model')}</p>
        <div className="flex flex-wrap gap-2">
          {FAL_VIDEO_MODEL_ORDER.map((key) => (
            <button key={key} type="button" aria-pressed={provider === key} onClick={() => setProvider(key)}
              className={cn('rounded-[10px] border px-3 py-1.5 text-body transition-colors', provider === key ? 'border-info bg-info/15' : 'border-border hover:bg-accent')}>
              {VIDEO_MODELS[key].label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="text-caption text-subtle-foreground">{t('Resolution')}</p>
        <div className="w-44">
          <VideoResolutionButtons model={provider} resolution={resolution} onSelect={setResolution} />
        </div>
        {videoSeconds !== data.durationSeconds ? (
          <p className="text-caption text-warning">{t('Length: shot {shot}s → video {video}s', { shot: data.durationSeconds, video: videoSeconds })}</p>
        ) : null}
      </div>
      {!hasImage ? (
        <p className="text-caption text-subtle-foreground">{t('Make the start and end images first.')}</p>
      ) : busy ? (
        <p className="text-caption text-subtle-foreground">{t('A Take is being made. You can make a new one when it is done.')}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void make()}>{label}</Button>
        {current ? (
          <Button type="button" size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => openDeleteConfirm(current.id)}>
            <Trash2 className="size-3.5" />{t('Delete this Take')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
