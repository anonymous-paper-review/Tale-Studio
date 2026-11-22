'use client'

// Camera 샷 줄(오너 2026-11-22 D2~D5, 시안 없음) — 왼쪽에 샷 번호 · 샷 크기 · 길이 · 상태 · 샷 스토리 · 대사, 오른쪽에 그 샷의 이력 줄
//   (그림 판 · Take 가 만든 차례대로, 오래된 것 왼쪽 → 새것 오른쪽, 처음엔 맨 오른쪽이 보이게 — 리드 11/22). 대사는 읽기만(고치기는 콘티, D1).
//   줄 테두리 = 샷 상태 색(design.md §2.5 생성 상태 색, Camera 로 넓힘). 규칙: shot-history.ts.
import { useEffect, useMemo, useRef } from 'react'
import { Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { shotDetailTakes } from '@/lib/director/shot-detail'
import { detailTabForShot, imageRemakeFailed, shotStateTone, type DirectorShotState } from '@/lib/director/shot-state'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useWriterStore } from '@/stores/writer-store'
import { isShotData, type DirectorNode } from '@/types/director'
import { useStoryboardImageGeneration } from '@/features/director/hooks/use-storyboard-image-generation'
import { ShotPipelineRow } from '@/features/director/shot-status'
import { HistoryCard } from './history-card'
import { dialogueRowLines, shotHistory, type ImageWork } from './shot-history'

export function CameraShotRow({ node, label, state }: { node: DirectorNode; label: string; state: DirectorShotState }) {
  const t = useT()
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const openShotDetail = useDirectorCanvasStore((s) => s.openShotDetail)
  const data = isShotData(node.data) ? node.data : null
  const writerShotId = data?.writerShotId ?? null
  const writerShot = useWriterStore((s) => (writerShotId ? s.shots.find((shot) => shot.shotId === writerShotId) ?? null : null))
  const characters = useWriterStore((s) => s.sceneManifest?.characters)
  const nameById = useMemo(() => new Map((characters ?? []).map((c) => [c.characterId, c.name])), [characters])
  const imageGeneration = useStoryboardImageGeneration(data)
  const { takes, final } = shotDetailTakes(nodes, node.id)
  const image = data?.storyboardImage ?? null
  const imageWork: ImageWork | null = imageGeneration.generating
    ? { phase: 'drawing' }
    : image?.status === 'failed' ? { phase: 'failed', message: image.errorMessage } : null
  const entries = data ? shotHistory({ image, takes, final, shot: data, imageWork }) : []
  const lines = dialogueRowLines(writerShot?.dialogueLines ?? [], nameById)
  const description = writerShot?.actionDescription?.trim() || null
  const seconds = typeof data?.durationSeconds === 'number' && data.durationSeconds > 0 ? Math.round(data.durationSeconds) : null
  const tone = shotStateTone(state)

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
      <div className="flex w-60 shrink-0 flex-col gap-2">
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
      </div>
      <ol ref={stripRef} className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-1" aria-label={t('{shot} history', { shot: label })}>
        {entries.length === 0 ? (
          <li className="flex items-center text-caption text-subtle-foreground">{t('No image or video yet.')}</li>
        ) : (
          entries.map((entry) => (
            <li key={`${entry.kind}:${entry.id}`} className="flex">
              <HistoryCard entry={entry} shotNodeId={node.id} shotName={label} />
            </li>
          ))
        )}
      </ol>
    </article>
  )
}
