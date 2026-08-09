'use client'

// 채팅 상단 고정 진행도 핀 (#chat-progress-pin #feedback 2026-08-07).
//
// 현재 스테이지의 백그라운드 파이프라인(씬·샷 설계 / 러프보드 / 캐릭터·배경 이미지 /
//   촬영용 이미지 / 영상)이 도는 동안 채팅 헤더 바로 아래 고정으로 "무엇이 얼마나"를
//   보여준다. 대시보드 progressbar 의 디테일 버전 — 도는 게 없으면 스스로 사라진다.
//   해제 직후의 "작업 완료" 브리핑은 각 스테이지 뷰의 기존 offerSuggestion 이 맡는다.
//
// 데이터는 전부 기존 진실에서 파생(pull, architecture §0) — 셀렉터는 lib/pipeline-progress.
//   스테이지별 서브컴포넌트로 쪼갠 이유: 구독 격리 — 예컨대 director 캔버스 nodes 는 드래그마다
//   바뀌므로, director 핀만 구독해야 다른 스테이지 채팅이 따라 리렌더되지 않는다.
//   writer 는 useWriterStatus 폴러(3s)를 하나 더 띄운다 — rough-storyboard-view 의 폴러와
//   중복이지만 둘 다 진실을 pull 하는 것이고, 완료되면 둘 다 멈춘다(stopWhenCompleted).

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useArtistStore } from '@/stores/artist-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { friendlyStageLabel, formatRemaining } from '@/lib/writer/stage-labels'
import {
  writerRoughWork,
  artistImageWork,
  directorShotImageWork,
  directorVideoWork,
  type PipelineWork,
} from '@/lib/pipeline-progress'
import type { StageId } from '@/types'

function WorkRow({ work }: { work: PipelineWork }) {
  const pct =
    work.total != null && work.total > 0
      ? Math.round(((work.done ?? 0) / work.total) * 100)
      : null
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex min-w-0 items-center gap-1.5 text-foreground">
          <Loader2
            className="size-3 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
            aria-hidden
          />
          <span className="truncate">{work.label}</span>
        </span>
        {work.total != null && (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
            {work.done ?? 0}/{work.total}
            {work.failed ? (
              <span className="text-destructive"> · 실패 {work.failed}</span>
            ) : null}
          </span>
        )}
      </div>
      {pct != null && (
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

function PinShell({ works, footer }: { works: PipelineWork[]; footer?: string | null }) {
  if (works.length === 0) return null
  return (
    <div className="shrink-0 space-y-2 border-b border-border bg-muted/30 px-4 py-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-150 ease-out motion-reduce:animate-none">
      {works.map((w) => (
        <WorkRow key={w.key} work={w} />
      ))}
      {footer ? <p className="text-[10px] text-muted-foreground">{footer}</p> : null}
    </div>
  )
}

/** Writer — 텍스트 파이프라인(씬·샷 설계, writer_runs 폴링) + 러프보드 패널(shots 파생). */
function WriterPin({ projectId }: { projectId: string }) {
  const { status } = useWriterStatus(projectId)
  const shots = useWriterStore((s) => s.shots)

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
    })
  }
  const rough = writerRoughWork(shots)
  if (rough) works.push(rough)

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
  return <PinShell works={works} footer={footer} />
}

/** Artist — 서버 집계(초기 잠금 ready/total) + in-flight 재생성 개수. */
function ArtistPin() {
  const imagesReady = useProjectStore((s) => s.artistImagesReady)
  const stalled = useProjectStore((s) => s.artistImagesStalled)
  const failed = useProjectStore((s) => s.artistImagesFailed)
  const progress = useProjectStore((s) => s.artistAssetProgress)
  const generatingViews = useArtistStore((s) => s.generatingViews)
  const generatingLocations = useArtistStore((s) => s.generatingLocations)
  const work = artistImageWork({
    imagesReady,
    stalled,
    failed,
    progress,
    generatingCount: generatingViews.length + generatingLocations.length,
  })
  return <PinShell works={work ? [work] : []} />
}

/** Director — 캔버스 노드 파생: 촬영용 스토리보드 이미지 + 영상 테이크. */
function DirectorPin() {
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const works: PipelineWork[] = []
  const storyboard = directorShotImageWork(nodes)
  if (storyboard) works.push(storyboard)
  const video = directorVideoWork(nodes)
  if (video) works.push(video)
  return <PinShell works={works} />
}

export function ChatProgressPin({ stage }: { stage: StageId }) {
  const projectId = useProjectStore((s) => s.projectId)
  if (!projectId) return null
  if (stage === 'writer') return <WriterPin projectId={projectId} />
  if (stage === 'artist') return <ArtistPin />
  if (stage === 'director') return <DirectorPin />
  return null
}
