'use client'

// Camera 샷 줄(오너 2026-11-22 D2~D5, 시안 없음) — 왼쪽에 샷 번호 · 샷 크기 · 길이 · 상태 · 샷 스토리 · 대사, 오른쪽에 그 샷의 이력 줄
//   (그림 판 · Take 가 만든 차례대로, 오래된 것 왼쪽 → 새것 오른쪽, 처음엔 맨 오른쪽이 보이게 — 리드 11/22). 대사는 읽기만(고치기는 콘티, D1).
//   줄 테두리 = 샷 상태 색(design.md §2.5 생성 상태 색, Camera 로 넓힘). 규칙: shot-history.ts.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageIcon, Maximize2, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { shotDetailTakes } from '@/lib/director/shot-detail'
import { detailTabForShot, imageRemakeFailed, shotStateTone, type DirectorShotState } from '@/lib/director/shot-state'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useWriterStore } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { isShotData, type DirectorNode } from '@/types/director'
import { useActiveGenerationJobs } from '@/lib/generation-queue'
import { useStoryboardImageGeneration } from '@/features/director/hooks/use-storyboard-image-generation'
import { ShotPipelineRow } from '@/features/director/shot-status'
import { HistoryCard } from './history-card'
import { ImageFixPanel, VideoMakePanel } from './fix-panel'
import { dialogueRowLines, shotHistory, type ImageWork } from './shot-history'
import { cameraMentionLabel, mentionOnModifierClick, stopModifierPointerDown } from './mention'

const FIX_BUTTON = 'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-micro font-semibold transition-colors'

export function CameraShotRow({ node, label, state }: { node: DirectorNode; label: string; state: DirectorShotState }) {
  const t = useT()
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const openShotDetail = useDirectorCanvasStore((s) => s.openShotDetail)
  const data = isShotData(node.data) ? node.data : null
  const writerShotId = data?.writerShotId ?? null
  const writerShot = useWriterStore((s) => (writerShotId ? s.shots.find((shot) => shot.shotId === writerShotId) ?? null : null))
  const characters = useWriterStore((s) => s.sceneManifest?.characters)
  const nameById = useMemo(() => new Map((characters ?? []).map((c) => [c.characterId, c.name])), [characters])
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const activeJobs = useActiveGenerationJobs(projectId && projectId !== 'default' ? projectId : null)
  const imageGeneration = useStoryboardImageGeneration(data)
  // 실사 일괄이 이 샷을 맡아 차례를 기다리는 중(스토리보드 카드의 "이미지 생성 대기 중"과 같은 판정) — [모두 멈추기] 뒤에는 기다리지 않는다.
  const realBatchBusy = useDirectorCanvasStore((s) => s.realBatchBusy)
  const realBatchCancelled = useDirectorCanvasStore((s) => s.realBatchCancelled ?? false)
  const realBatchShotIds = useDirectorCanvasStore((s) => s.realBatchShotIds ?? null)
  // 영상 묶음에서 이 샷의 차례(0 = 다음 차례, -1 = 기다리지 않음) — 멈추는 중이면 남은 샷은 만들지 않는다.
  const videoLine = useDirectorCanvasStore((s) => (writerShotId && !s.videoBatchCancelled ? s.videoBatchQueue?.pendingShotIds.indexOf(writerShotId) ?? -1 : -1))
  const [open, setOpen] = useState<'image' | 'video' | null>(null)
  const { takes, final } = shotDetailTakes(nodes, node.id)
  const image = data?.storyboardImage ?? null
  const hasImage = !!image?.url
  const batchWaiting = realBatchBusy && !realBatchCancelled && image?.status !== 'failed' &&
    (realBatchShotIds === null ? !hasImage : !!writerShotId && realBatchShotIds.includes(writerShotId))
  const imageWork: ImageWork | null = imageGeneration.generating
    ? { phase: 'drawing' }
    : batchWaiting ? { phase: 'waiting' }
      : image?.status === 'failed' ? { phase: 'failed', message: image.errorMessage } : null
  const entries = data ? shotHistory({ image, takes, final, shot: data, imageWork, videoLine }) : []
  const lines = dialogueRowLines(writerShot?.dialogueLines ?? [], nameById)
  const description = writerShot?.actionDescription?.trim() || null
  const seconds = typeof data?.durationSeconds === 'number' && data.durationSeconds > 0 ? Math.round(data.durationSeconds) : null
  const tone = shotStateTone(state)
  // ⌘/Ctrl+클릭 = 이 샷을 채팅에 @멘션(D9) — 이름은 채팅 고르기 목록과 같은 "실사 샷 N".
  const locale = useLocaleStore((s) => s.locale)
  const mentionLabel = cameraMentionLabel({ kind: 'shot', label }, locale)

  // 처음 열 때와 판이 늘 때 맨 오른쪽(새 판)이 보이게 — 사람이 옆으로 넘겨 둔 자리는 판 수가 그대로면 건드리지 않는다.
  const stripRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const strip = stripRef.current
    if (strip) strip.scrollLeft = strip.scrollWidth
  }, [entries.length])

  if (!data) return null
  return (
    <article
      className={cn('flex gap-4 rounded-2xl border-[1.5px] bg-background p-3 shadow-node', tone.frame ?? 'border-transparent', imageRemakeFailed(image) && 'border-destructive')}
      data-shot-state={state}
      data-testid="camera-shot-row"
    >
      {/* 왼쪽 칸만 샷 멘션을 받는다 — 판 카드는 자기 이름(· 그림 vN · Take N)으로 멘션한다(캡처는 바깥이 먼저라 줄 전체에 걸면 카드를 덮는다). */}
      <div
        className="flex w-60 shrink-0 flex-col gap-2"
        onPointerDownCapture={stopModifierPointerDown}
        onClickCapture={(event) => mentionOnModifierClick(event, mentionLabel)}
      >
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate text-label font-semibold text-foreground">
            {label}
            {writerShot?.shotType ? ` · ${writerShot.shotType}` : ''}
            {seconds ? ` · ${t('{seconds}s', { seconds })}` : ''}
          </h3>
          <button
            type="button"
            onClick={() => openShotDetail(node.id, detailTabForShot(state))}
            aria-label={t('Open details')}
            title={t('Open details')}
            className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-card px-1.5 py-0.5 text-micro font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Maximize2 className="size-3" />
            {t('Details')}
          </button>
        </div>
        <ShotPipelineRow state={state} />
        {description ? <p className="line-clamp-4 text-caption leading-snug text-muted-foreground" title={description}>{description}</p> : null}
        {lines.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {lines.map((line, i) => (
              <li key={i} className="text-caption leading-snug text-foreground">
                <span className="mr-1.5 font-num text-micro font-semibold uppercase tracking-wide text-subtle-foreground">{line.speaker}</span>
                {line.text}
              </li>
            ))}
          </ul>
        ) : null}
        {/* 고치기(오너 D2~D5 "버튼으로 수정") — 한 번에 한 칸. 누른 단추를 다시 누르면 닫는다. */}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          <button
            type="button"
            aria-expanded={open === 'image'}
            onClick={() => setOpen(open === 'image' ? null : 'image')}
            className={cn(FIX_BUTTON, open === 'image' ? 'bg-accent text-foreground' : 'bg-card text-foreground hover:bg-accent')}
          >
            <ImageIcon className="size-3" />
            {t('Fix the image')}
          </button>
          <button
            type="button"
            aria-expanded={open === 'video'}
            onClick={() => setOpen(open === 'video' ? null : 'video')}
            className={cn(FIX_BUTTON, open === 'video' ? 'bg-accent text-foreground' : 'bg-card text-foreground hover:bg-accent')}
          >
            <Play className="size-3 fill-current" />
            {t('Make video')}
          </button>
        </div>
        {open === 'image' ? <ImageFixPanel shotNodeId={node.id} data={data} /> : null}
        {open === 'video' ? <VideoMakePanel shotNodeId={node.id} data={data} /> : null}
      </div>
      <ol ref={stripRef} className="flex min-w-0 flex-1 items-start gap-3 overflow-x-auto pb-1" aria-label={t('{shot} history', { shot: label })}>
        {entries.length === 0 ? (
          <li className="flex items-center text-caption text-subtle-foreground">{t('No image or video yet.')}</li>
        ) : (
          entries.map((entry) => (
            <li key={`${entry.kind}:${entry.id}`} className="flex">
              <HistoryCard entry={entry} shotNodeId={node.id} shotName={label} writerShotId={writerShotId} activeJobs={activeJobs} />
            </li>
          ))
        )}
      </ol>
    </article>
  )
}
