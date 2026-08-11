'use client'

// 채팅 상단 진행 알림바 (#chat-progress-pin #feedback 2026-08-07, 알림바 개편 2026-08-11).
//
// 현재 스테이지의 백그라운드 파이프라인(씬·샷 설계 / 러프보드 / 캐릭터·배경 이미지 /
//   촬영용 이미지 / 영상)이 도는 동안 채팅 헤더 아래에 "누가 무엇을 얼마나" 를 보여준다.
//   도는 게 없으면 스스로 사라진다. 해제 직후의 "작업 완료" 브리핑은 각 스테이지 뷰의
//   기존 offerSuggestion 이 맡는다.
//
// 모양(#feedback 2026-08-11): 헤더에 붙은 회색 섹션이 아니라 **떠 있는 둥근 알림바**다.
//   배경은 그 일을 하는 에이전트 색 — 어느 방에서 뭐가 도는지 색으로 먼저 읽힌다.
//   진행 분량은 별도 바가 아니라 알림바 자체가 차오르는 게이지로 표현한다.
//
// 데이터는 전부 기존 진실에서 파생(pull, architecture §0) — 셀렉터는 lib/pipeline-progress.
//   스테이지별 서브컴포넌트로 쪼갠 이유: 구독 격리 — 예컨대 director 캔버스 nodes 는 드래그마다
//   바뀌므로, director 핀만 구독해야 다른 스테이지 채팅이 따라 리렌더되지 않는다.
//   writer 는 useWriterStatus 폴러(3s)를 하나 더 띄운다 — rough-storyboard-view 의 폴러와
//   중복이지만 둘 다 진실을 pull 하는 것이고, 완료되면 둘 다 멈춘다(stopWhenCompleted).
//
// #queue-restore: 화면 상태만 보면 탭을 떠났다 오는 순간 진행 표시가 증발한다(러프보드 panelJobs 는
//   컴포넌트 로컬). 그래서 전 스테이지가 generation_jobs 의 queued 집합을 함께 읽는다 — 큐가
//   판정의 바닥이고, 전용 화면이 없는 탭(producer·editor)도 큐만으로 알림바를 세운다.

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
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
          {work.done != null ? `${work.done}/${work.total}` : `${work.total}건`}
          {work.failed ? <span className="text-destructive"> · 실패 {work.failed}</span> : null}
        </span>
      )}
    </div>
  )
}

function PinShell({
  works,
  stage,
  footer,
}: {
  works: PipelineWork[]
  stage: StageId
  footer?: string | null
}) {
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

/** Writer — 텍스트 파이프라인(씬·샷 설계, writer_runs 폴링) + 러프보드 패널(shots 파생 + 큐). */
function WriterPin({ projectId }: { projectId: string }) {
  const { status } = useWriterStatus(projectId)
  const shots = useWriterStore((s) => s.shots)
  const jobs = useActiveGenerationJobs(projectId)

  const works: PipelineWork[] = []
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
  // 프리비즈 영상은 writer 탭에 전용 표시가 없어 큐로만 보인다.
  works.push(...queueWorks({ shot_previz_video: countKind(jobs, 'shot_previz_video') }))

  // 남은 예상 시간 — 과거 완료 run 실측이 있을 때만(#c4). rough-storyboard-view 와 동일 산식.
  //   렌더 순수성(react-hooks/purity) 때문에 벽시계는 1s 틱 상태로 — 같은 뷰의 nowMs 패턴.
  const [nowMs, setNowMs] = useState(0)
  useEffect(() => {
    if (!running) return
    // 즉시 set 없이 첫 틱(1s)에 맡긴다 — set-state-in-effect 회피. 첫 1초는 footer 미표시.
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])
  let footer: string | null = null
  if (running && nowMs > 0 && status?.eta_total_ms != null && status.timings?.pipeline_started_at) {
    const elapsed = nowMs - Date.parse(status.timings.pipeline_started_at)
    if (!Number.isNaN(elapsed)) footer = formatRemaining(status.eta_total_ms - elapsed)
  }
  return <PinShell works={works} stage="writer" footer={footer} />
}

/** Artist — 서버 집계(초기 잠금 ready/total) + in-flight 재생성 개수 + 큐. */
function ArtistPin({ projectId }: { projectId: string }) {
  const imagesReady = useProjectStore((s) => s.artistImagesReady)
  const stalled = useProjectStore((s) => s.artistImagesStalled)
  const failed = useProjectStore((s) => s.artistImagesFailed)
  const progress = useProjectStore((s) => s.artistAssetProgress)
  const generatingViews = useArtistStore((s) => s.generatingViews)
  const generatingLocations = useArtistStore((s) => s.generatingLocations)
  const jobs = useActiveGenerationJobs(projectId)
  const active = activeAssetIds(jobs)
  const work = artistImageWork({
    imagesReady,
    stalled,
    failed,
    progress,
    generatingCount: generatingViews.length + generatingLocations.length,
    activeCount: active.characters.size + active.locations.size,
  })
  return <PinShell works={work ? [work] : []} stage="artist" />
}

/** Director — 캔버스 노드 파생: 촬영용 스토리보드 이미지 + 영상 테이크 (+ 큐 바닥). */
function DirectorPin({ projectId }: { projectId: string }) {
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const jobs = useActiveGenerationJobs(projectId)
  const works: PipelineWork[] = []
  const storyboard = directorShotImageWork(
    nodes,
    activeShotIds(jobs, ['shot_storyboard', 'storyboard_real_grid']),
  )
  if (storyboard) works.push(storyboard)
  const video = directorVideoWork(nodes, countKind(jobs, 'shot_video'))
  if (video) works.push(video)
  return <PinShell works={works} stage="director" />
}

/** 전용 화면이 없는 탭(producer·editor) — 큐만 보고 "다른 방에서 도는 것"을 알린다. */
function QueuePin({ projectId, stage }: { projectId: string; stage: StageId }) {
  const jobs = useActiveGenerationJobs(projectId)
  const works = queueWorks({
    character_view: countKind(jobs, 'character_view'),
    world_shot: countKind(jobs, 'world_shot'),
    shot_rough_storyboard: activeShotIds(jobs, ['shot_rough_storyboard']).size,
    shot_storyboard: activeShotIds(jobs, ['shot_storyboard', 'storyboard_real_grid']).size,
    shot_video: countKind(jobs, 'shot_video'),
    shot_previz_video: countKind(jobs, 'shot_previz_video'),
  })
  return <PinShell works={works} stage={stage} />
}

export function ChatProgressPin({ stage }: { stage: StageId }) {
  const projectId = useProjectStore((s) => s.projectId)
  if (!projectId) return null
  if (stage === 'writer') return <WriterPin projectId={projectId} />
  if (stage === 'artist') return <ArtistPin projectId={projectId} />
  if (stage === 'director') return <DirectorPin projectId={projectId} />
  return <QueuePin projectId={projectId} stage={stage} />
}
