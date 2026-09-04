'use client'

// 채팅 상단 진행 알림바 (#chat-progress-pin #feedback 2026-08-07, 알림바 개편 2026-08-11, 약속 D 2026-09-04).
//
// **어느 탭에 있든** 프로젝트에서 도는 백그라운드 작업을 줄줄이 보여준다. 숫자는 서버 큐(generation_jobs) 하나에서
//   파생한 배치(lib/generation-batches)만 쓴다 — 화면 상태(생성 중 플래그·진행 집계)는 세지 않는다(약속 D5).
//   그래서 탭을 바꾸거나 다른 채팅을 하거나 새로고침해도 숫자가 그대로고(D2), 도는 잡이 없으면 스스로 사라진다(D4).
//   writer 텍스트 파이프라인(writer_runs)은 잡 큐가 아니라 별도 진실이라 그 줄만 따로 얹는다.
//
// 모양: 떠 있는 둥근 알림바. 배경은 그 일을 하는 에이전트 색, 진행 분량은 알림바 자체가 차오른다.

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useLocale, useT } from '@/lib/i18n'
import { useProjectStore } from '@/stores/project-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { formatRemaining } from '@/lib/writer/stage-labels'
import { STAGE_FACE_COLOR } from '@/lib/constants'
import { useGenerationBatches } from '@/lib/generation-queue'
import { batchWorks, writerPipelineWork, type PipelineWork } from '@/lib/pipeline-progress'
import { withStoryboardBacklog } from '@/lib/generation-batches'
import type { StageId } from '@/types'

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

function UnifiedPin({ projectId, stage }: { projectId: string; stage: StageId }) {
  const { status } = useWriterStatus(projectId)
  const locale = useLocale()
  const batches = useGenerationBatches(projectId)
  // #batch-backlog(2026-08-25 오너 피드백 유지): 일괄 생성 러너가 아직 제출 못 한 잔여 샷은 곧 큐에 들어갈 일이라
  //   실사 레인 분모에 더한다 — 핀과 Director 버튼이 같은 합을 쓴다(withStoryboardBacklog).
  const realBatchRemaining = useDirectorCanvasStore((s) => s.realBatchRemaining)

  const works: PipelineWork[] = []
  // writer 텍스트 파이프라인(writer_runs 폴링) — 잡 큐 밖의 진실.
  const running = !!(
    status?.started &&
    !status.pipeline_completed &&
    !status.pipeline_failed &&
    status.current_status !== 'awaiting_confirmation'
  )
  const writerPipeline = writerPipelineWork(status, locale)
  if (writerPipeline) works.push(writerPipeline)
  // 나머지는 전부 서버 배치(약속 D1·D3·D6): 레인마다 done/total(+실패).
  works.push(...batchWorks(withStoryboardBacklog(batches, realBatchRemaining ?? 0), locale))

  // 남은 예상 시간 — 과거 완료 run 실측이 있을 때만(#c4). 렌더 순수성 때문에 벽시계는 1s 틱 상태로.
  const [nowMs, setNowMs] = useState(0)
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])
  let footer: string | null = null
  if (running && nowMs > 0 && status?.eta_total_ms != null && status.timings?.pipeline_started_at) {
    const elapsed = nowMs - Date.parse(status.timings.pipeline_started_at)
    if (!Number.isNaN(elapsed)) footer = formatRemaining(status.eta_total_ms - elapsed, locale)
  }

  if (works.length === 0) return null
  return (
    <div className="shrink-0 space-y-1.5 border-t border-border/60 px-3 pb-1 pt-2">
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
