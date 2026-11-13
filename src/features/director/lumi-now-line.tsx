'use client'

// Director 채팅 맨 위 "지금 할 일" 줄(11/13 시안 D5) — 패널 머리 바로 아래에 붙어 말이 쌓여도 밀려 올라가지 않고, 보드 상태가 바뀌면 같이 바뀐다.
//   샷 상태는 보드와 같은 훅(use-shot-states), 끝난 수는 위쪽 진행과 같은 서버 배치, Take 는 버튼 확인창과 같은 계산. 글은 lib/director/lumi-now-line.
//   약속: tests/director/lumi-now-line-ui.test.ts
import { useT } from '@/lib/i18n'
import { useTakeBalance } from '@/lib/billing/use-take-balance'
import { withStoryboardBacklog } from '@/lib/generation-batches'
import { useGenerationBatches } from '@/lib/generation-queue'
import { lumiNowLine } from '@/lib/director/lumi-now-line'
import { directorHasFinishedVideo } from '@/lib/director/shot-state'
import { videoBatchTakeCosts } from '@/lib/director/video-batch-plan'
import { videoBatchShotSettings } from '@/lib/director/video-batch-take'
import { DEFAULT_VIDEO_MODEL } from '@/lib/video-models'
import { useDirectorShotStates } from '@/features/director/hooks/use-shot-states'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useProjectStore } from '@/stores/project-store'

export function LumiNowLine() {
  const t = useT()
  const states = useDirectorShotStates()
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const realBatchBusy = useDirectorCanvasStore((s) => s.realBatchBusy)
  const videoBatchBusy = useDirectorCanvasStore((s) => s.videoBatchBusy)
  const videoBatchProgress = useDirectorCanvasStore((s) => s.videoBatchProgress)
  const realBatchRemaining = useDirectorCanvasStore((s) => s.realBatchRemaining)
  const chain = useDirectorCanvasStore((s) => s.chainVideoAfterImage)
  const projectId = useProjectStore((s) => s.projectId)
  const batches = useGenerationBatches(projectId ?? null)
  const takes = useTakeBalance()

  // 끝난 수 / 전체 — 위쪽 진행(Director 툴바)과 같은 근거: 이미지 일괄 판 + 영상 묶음(서버 배치가 아직 없으면 화면이 아는 진행).
  const imageBatch = withStoryboardBacklog(batches, realBatchRemaining ?? 0).find((b) => b.lane === 'director-storyboard') ?? null
  const videoBatch = batches.find((b) => b.lane === 'director-video') ?? null
  const done = (imageBatch?.done ?? 0) + (videoBatch?.done ?? (videoBatchProgress?.done ?? 0))
  const total = (imageBatch?.total ?? 0) + (videoBatch?.total ?? (videoBatchProgress?.total ?? 0))

  const line = lumiNowLine({
    states,
    imageBusy: realBatchBusy,
    videoBusy: videoBatchBusy,
    progress: total > 0 ? { done, total } : null,
    canHandOff: directorHasFinishedVideo(nodes),
    chain,
    modelOf: (id) => videoBatchShotSettings(nodes, id)?.model ?? DEFAULT_VIDEO_MODEL,
    takesFor: (ids) => videoBatchTakeCosts(nodes, ids).reduce((sum, n) => sum + n, 0),
    takesShown: takes.mode !== 'off',
  }, t)
  if (!line) return null
  return (
    <div className="shrink-0 px-5 pb-1">
      <p data-testid="lumi-now-line" className="rounded-xl bg-chat-lumi-bubble px-3.5 py-2.5 text-chat text-foreground">
        {line}
      </p>
    </div>
  )
}
