'use client'

// 채팅 상단 진행 알림바 (#chat-progress-pin #feedback 2026-08-07, 알림바 개편 2026-08-11).
//
// **어느 탭에 있든** 프로젝트에서 도는 모든 백그라운드 작업(씬·샷 설계 / 러프보드 / 캐릭터·배경
//   이미지 / 촬영용 이미지 / 영상)을 줄줄이 보여준다 — 작업이 2개면 바도 2개다(#feedback
//   2026-08-11: 옛 구조는 스테이지별 핀을 스위치해서, 탭을 옮기면 다른 방의 진행이 안 보였다).
//   도는 게 없으면 스스로 사라진다. 해제 직후의 "작업 완료" 브리핑은 각 스테이지 뷰의
//   기존 offerSuggestion 이 맡는다.
//
// 모양: 헤더에 붙은 회색 섹션이 아니라 **떠 있는 둥근 알림바**. 배경은 그 일을 하는 에이전트
//   색 — 어느 방에서 뭐가 도는지 색으로 먼저 읽힌다. 진행 분량은 알림바 자체가 차오른다.
//
// 데이터는 전부 기존 진실에서 파생(pull, architecture §0) — 셀렉터는 lib/pipeline-progress.
//   화면 상태(스토어)가 있는 작업은 그것을 쓰고, 화면 상태가 아직 없는 작업(다른 탭이라 스토어가
//   비었거나, 전용 화면이 없는 previz 영상)은 generation_jobs 큐(#queue-restore)가 바닥을 받친다.
//   같은 작업이 두 줄로 겹치지 않게 종류(kind) 단위로 dedupe 한다.

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useArtistStore } from '@/stores/artist-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { friendlyStageLabel, formatRemaining } from '@/lib/writer/stage-labels'
import { STAGE_FACE_COLOR } from '@/lib/constants'
import {
  useActiveGenerationJobs,
  activeShotIds,
  activeAssetIds,
  type ActiveJob,
} from '@/lib/generation-queue'
import {
  writerRoughWork,
  artistImageWork,
  directorShotImageWork,
  directorVideoWork,
  queueWorks,
  type PipelineWork,
} from '@/lib/pipeline-progress'
import type { GenerationJobKind } from '@/lib/generation-jobs'
import type { StageId } from '@/types'

function countKind(jobs: readonly ActiveJob[], kind: GenerationJobKind): number {
  return jobs.filter((j) => j.kind === kind).length
}

/** 둥근 알림바 한 줄 — 에이전트 색을 배경으로 쓰고, 진행 분량만큼 스스로 차오른다. */
function WorkPill({ work, fallbackStage }: { work: PipelineWork; fallbackStage: StageId }) {
  const t = useT()
  const stage = work.stage ?? fallbackStage
  const color = STAGE_FACE_COLOR[stage]
  const pct =
    work.total != null && work.total > 0 && work.done != null
      ? Math.round((work.done / work.total) * 100)
      : null
  return (
    <div
      role={pct != null ? 'progressbar' : 'status'}
      aria-valuenow={pct ?? undefined}
      aria-valuemin={pct != null ? 0 : undefined}
      aria-valuemax={pct != null ? 100 : undefined}
      aria-label={work.label}
      className="relative flex items-center gap-2 overflow-hidden rounded-full border px-3 py-1.5 text-[11px] animate-in fade-in-0 slide-in-from-top-1 duration-150 ease-out motion-reduce:animate-none"
      style={{
        borderColor: `color-mix(in oklab, ${color} 38%, transparent)`,
        background: `color-mix(in oklab, ${color} 12%, var(--card))`,
      }}
    >
      {/* 게이지 — 알림바 안쪽이 좌→우로 차오른다(별도 진행 바 없음) */}
      {pct != null && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: `color-mix(in oklab, ${color} 22%, transparent)`,
          }}
        />
      )}
      <Loader2
        className="relative size-3 shrink-0 animate-spin motion-reduce:animate-none"
        style={{ color }}
        aria-hidden
      />
      <span className="relative min-w-0 flex-1 truncate text-foreground">{work.label}</span>
      {work.total != null && (
        <span className="relative shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {work.done != null ? `${work.done}/${work.total}` : t('{count} items', { count: work.total })}
          {work.failed ? <span className="text-destructive"> · {t('Failed {count}', { count: work.failed })}</span> : null}
        </span>
      )}
    </div>
  )
}

/** 한 작업(work)이 대변하는 큐 종류 — 같은 작업이 화면 상태 줄과 큐 줄로 겹치지 않게 하는 지도. */
const WORK_COVERS: Record<string, GenerationJobKind[]> = {
  'writer-rough': ['shot_rough_storyboard'],
  'artist-images': ['character_view', 'world_shot'],
  'artist-regen': ['character_view', 'world_shot'],
  'director-storyboard': ['shot_storyboard', 'storyboard_real_grid'],
  'director-video': ['shot_video'],
}

function UnifiedPin({ projectId, stage }: { projectId: string; stage: StageId }) {
  const { status } = useWriterStatus(projectId)
  const shots = useWriterStore((s) => s.shots)
  const imagesReady = useProjectStore((s) => s.artistImagesReady)
  const stalled = useProjectStore((s) => s.artistImagesStalled)
  const failed = useProjectStore((s) => s.artistImagesFailed)
  const progress = useProjectStore((s) => s.artistAssetProgress)
  const generatingViews = useArtistStore((s) => s.generatingViews)
  const generatingLocations = useArtistStore((s) => s.generatingLocations)
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const jobs = useActiveGenerationJobs(projectId)

  const works: PipelineWork[] = []

  // ── writer: 텍스트 파이프라인(writer_runs 폴링) + 러프보드 ──
  const running = !!(
    status?.started &&
    !status.pipeline_completed &&
    !status.pipeline_failed
  )
  if (running && status) {
    const total = status.total_units ?? 0
    works.push({
      key: 'writer-pipeline',
      label: friendlyStageLabel(status.current_stage),
      done: total > 0 ? status.completed_units ?? 0 : undefined,
      total: total > 0 ? total : undefined,
      stage: 'writer',
    })
  }
  const rough = writerRoughWork(shots, activeShotIds(jobs, ['shot_rough_storyboard']))
  if (rough) works.push(rough)

  // ── artist: 초기 잠금 집계 + in-flight + 큐 바닥 ──
  const activeAssets = activeAssetIds(jobs)
  const artist = artistImageWork({
    imagesReady,
    stalled,
    failed,
    progress,
    generatingCount: generatingViews.length + generatingLocations.length,
    activeCount: activeAssets.characters.size + activeAssets.locations.size,
  })
  if (artist) works.push(artist)

  // ── director: 캔버스 노드 파생 + 큐 바닥 ──
  const storyboard = directorShotImageWork(
    nodes,
    activeShotIds(jobs, ['shot_storyboard', 'storyboard_real_grid']),
  )
  if (storyboard) works.push(storyboard)
  const video = directorVideoWork(nodes, countKind(jobs, 'shot_video'))
  if (video) works.push(video)

  // ── 화면 상태가 못 받친 나머지는 큐만으로 세운다 (다른 탭이라 스토어가 빈 경우 포함) ──
  const covered = new Set<GenerationJobKind>(works.flatMap((w) => WORK_COVERS[w.key] ?? []))
  const remaining: Partial<Record<GenerationJobKind, number>> = {}
  const kindCounts: Array<[GenerationJobKind, number]> = [
    ['character_view', countKind(jobs, 'character_view')],
    ['world_shot', countKind(jobs, 'world_shot')],
    ['shot_rough_storyboard', activeShotIds(jobs, ['shot_rough_storyboard']).size],
    ['shot_storyboard', activeShotIds(jobs, ['shot_storyboard', 'storyboard_real_grid']).size],
    ['shot_video', countKind(jobs, 'shot_video')],
    ['shot_previz_video', countKind(jobs, 'shot_previz_video')],
  ]
  for (const [kind, count] of kindCounts) {
    if (!covered.has(kind) && count > 0) remaining[kind] = count
  }
  works.push(...queueWorks(remaining))

  // 남은 예상 시간 — 과거 완료 run 실측이 있을 때만(#c4). rough-storyboard-view 와 동일 산식.
  //   렌더 순수성(react-hooks/purity) 때문에 벽시계는 1s 틱 상태로.
  const [nowMs, setNowMs] = useState(0)
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])
  let footer: string | null = null
  if (running && nowMs > 0 && status?.eta_total_ms != null && status.timings?.pipeline_started_at) {
    const elapsed = nowMs - Date.parse(status.timings.pipeline_started_at)
    if (!Number.isNaN(elapsed)) footer = formatRemaining(status.eta_total_ms - elapsed)
  }

  if (works.length === 0) return null
  return (
    <div className="shrink-0 space-y-1.5 px-3 pb-1 pt-2">
      {works.map((w) => (
        <WorkPill key={w.key} work={w} fallbackStage={stage} />
      ))}
      {footer ? <p className="px-3 text-[10px] text-muted-foreground">{footer}</p> : null}
    </div>
  )
}

export function ChatProgressPin({ stage }: { stage: StageId }) {
  const projectId = useProjectStore((s) => s.projectId)
  if (!projectId) return null
  return <UnifiedPin projectId={projectId} stage={stage} />
}
