'use client'

// Camera 위쪽 만들기 줄(오너 2026-11-22 D2~D5 · 리드 답 a, 시안 없음 — Director 1110 확정 툴바 2줄의 생김새를 따른다):
//   진행(Lumi · 이미지 · 영상 끝난 수/전체 · 실패) · [모두 멈추기] … 영상까지 이어서 · [이미지 만들기 · N] · [영상 만들기 · N] · 꺼진 까닭 한 줄 · 예상 칸 ·
//   위 막대 [다음: Director](만들 것이 없을 때만 가장 밝게). 규칙 · 러너는 Director 툴바와 같은 함수를 그대로 쓴다
//   (lib/director/toolbar-work · stop-work · stop-all-client · real-batch-client · video-batch-client · video-batch-plan) — Director 파일은 건드리지 않는다.
//   세는 범위는 work-scope 한 곳 — 지금 보는 씬의 샷만(오너 2026-11-22 E2, [전체] 없음). 확인 창 제목에 씬 이름. [모두 멈추기]는 씬과 상관없이 전부.
//   고른 샷 · 상태 고르기는 없다.
//   약속: tests/camera/work-bar.test.ts
import { useEffect, useState } from 'react'
import { ImageIcon, Loader2, Play, Square } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { countText } from '@/lib/i18n/count-text'
import { STAGE_PERSONA } from '@/lib/lumi'
import { LumiAvatar } from '@/components/lumi/lumi'
import { TopBarActions } from '@/components/layout/studio-top-bar'
import { NextStepButton } from '@/components/handoff/next-step-button'
import { RegenerateConfirmDialog } from '@/features/director/regenerate-confirm-dialog'
import { TAKES_UNKNOWN_TEXT, takesReadable } from '@/features/director/takes-check'
import { useDirectorShotStates } from '@/features/director/hooks/use-shot-states'
import { refetchTakeBalance, useTakeBalance } from '@/lib/billing/use-take-balance'
import { takeValuesShown } from '@/lib/billing/take-cost'
import { useActiveGenerationJobs, useGenerationBatches } from '@/lib/generation-queue'
import { withStoryboardBacklog } from '@/lib/generation-batches'
import { DEFAULT_VIDEO_MODEL } from '@/lib/video-models'
import { afterStoppedRealBatch, cancelRealBatchResume, cancelWaitingRealBatch, runRealBatch, startSingleImage } from '@/lib/director/real-batch-client'
import { runVideoBatch } from '@/lib/director/video-batch-client'
import { videoBatchShotSettings } from '@/lib/director/video-batch-take'
import { describeVideoBatchPlan, planVideoBatch, videoBatchTakeCosts } from '@/lib/director/video-batch-plan'
import { stoppableJobs, stoppedCounts, stopNotice, videoBatchLive } from '@/lib/director/stop-work'
import { freshActiveJobs } from '@/lib/director/stop-all-client'
import {
  chainMissed,
  chainStep,
  imageButtonMode,
  imageWorkBlock,
  imageWorkShotIds,
  makingLabel,
  primaryWorkAction,
  videoWorkBlock,
  videoWorkShotIds,
  workBlockLine,
  workEstimateText,
  workScopeStates,
} from '@/lib/director/toolbar-work'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useBoardLoadStatus } from '@/stores/board-load-store'
import { boardLoadBlockText } from '@/lib/director/board-load'
import { useProjectStore } from '@/stores/project-store'
import { isShotData } from '@/types/director'
import { scopeShotStates } from './work-scope'

// Camera 는 아직 샷 고르기가 없다 — 단추는 범위 안의 샷을 모두 센다.
const NO_PICKS: ReadonlySet<string> = new Set()

const PILL = 'flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-background px-3 text-[13px] font-medium text-foreground shadow-node transition-colors duration-100 hover:bg-card'

/** 만들기 단추 — 지금 할 일이면 크림(메인 하나), 아니면 보조. 만들 게 없으면 꺼짐(design.md §2.7, Director 툴바와 같은 생김새). */
function workButtonClass(primary: boolean): string {
  return cn(
    'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50',
    primary ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-card text-foreground hover:bg-accent',
  )
}

export function CameraWorkBar({ scope, sceneLabel }: { scope: readonly string[] | null; sceneLabel?: string | null }) {
  const t = useT()
  // 확인 창 제목에 붙일 지금 씬 이름(오너 E2 — "씬 2의 영상 5개를 만들까요?"). 씬이 없으면(샷도 없어 창이 열리지 않는다) 씬 없는 옛 제목.
  const sceneName = sceneLabel ?? null
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const realBatchBusy = useDirectorCanvasStore((s) => s.realBatchBusy)
  const videoBatchBusy = useDirectorCanvasStore((s) => s.videoBatchBusy)
  const videoBatchCancelled = useDirectorCanvasStore((s) => s.videoBatchCancelled)
  const realBatchCancelled = useDirectorCanvasStore((s) => s.realBatchCancelled)
  const videoBatchProgress = useDirectorCanvasStore((s) => s.videoBatchProgress)
  // 진행 숫자는 핀과 같은 서버 배치에서 온다(약속 D7).
  const projectId = useProjectStore((s) => s.projectId)
  const generationBatches = useGenerationBatches(projectId ?? null)
  const realBatchRemaining = useDirectorCanvasStore((s) => s.realBatchRemaining)
  const storyboardBatch = withStoryboardBacklog(generationBatches, realBatchRemaining ?? 0).find((b) => b.lane === 'director-storyboard') ?? null
  const videoBatch = generationBatches.find((b) => b.lane === 'director-video') ?? null

  // 샷 상태 · 남은 일 — 단추 숫자 · 가장 밝은 단추 · 예상 칸이 같은 판정을 쓴다(Director 툴바와 같다). 범위는 work-scope 한 곳.
  const shotStates = useDirectorShotStates()
  const workStates = workScopeStates(scopeShotStates(shotStates, scope), 'all')
  const picked = NO_PICKS
  const imageMode = imageButtonMode(workStates, picked)
  const imageWork = imageMode.mode === 'make' ? imageMode.shotIds : []
  const videoWork = videoWorkShotIds(workStates, picked)
  const stateList = [...shotStates.values()]
  const makingImages = stateList.filter((s) => s === 'image_generating').length
  const makingVideos = stateList.filter((s) => s === 'video_generating').length
  // 멈춘 일괄은 도는 것으로 세지 않는다(오너 7번). 멈춘 영상 묶음은 화면에서 멈추지 않은 영상이 남았을 때만 돈다.
  const activeJobs = useActiveGenerationJobs(projectId ?? null)
  const videoQueueJobKey = useDirectorCanvasStore((s) => (s.videoBatchQueue?.jobIds ?? []).join('|'))
  const imageBatchLive = realBatchBusy && !realBatchCancelled
  const videoLive = videoBatchLive(
    { busy: videoBatchBusy, cancelled: videoBatchCancelled, jobIds: videoQueueJobKey ? videoQueueJobKey.split('|') : [] },
    activeJobs,
  )
  const making = makingImages + makingVideos > 0 || imageBatchLive || videoLive
  // 꺼진 단추와 까닭 — 일괄이 도는 동안은 눌러도 새 판이 서지 않으니 끈다. 멈춘 이미지 판은 정리 중일 뿐이라 끄지 않는다.
  const imageBlock = imageWorkBlock(workStates, picked, realBatchBusy && !realBatchCancelled, false)
  const videoBlock = videoWorkBlock(workStates, picked, videoLive, false)
  // 판을 DB 에서 다 읽기 전 · 못 읽었으면 만들기 단추를 끄고 그 까닭만 보인다 — 읽기 전 숫자로 세면 있는 그림을 "없음"으로 센다(fb-blur QA 2026-11-23).
  const boardProjectId = useDirectorCanvasStore((s) => s.projectId)
  const boardLoadLine = boardLoadBlockText(useBoardLoadStatus(boardProjectId))
  const boardOff = boardLoadLine !== null
  // Take 잔액 — 못 읽었으면 Take 를 쓰는 단추가 시작하지 않고 단추 아래 까닭을 보인다(리드 11/14).
  const takeState = useTakeBalance()
  const [takesUnknown, setTakesUnknown] = useState(false)
  const blockLine = boardLoadLine ? t(boardLoadLine) : takesUnknown && takeState.failed ? t(TAKES_UNKNOWN_TEXT) : workBlockLine(imageBlock, videoBlock, t)
  // [다음: Director]를 크림으로 칠하는 것은 보드 전체에 만들 것이 없고 만드는 중이 아닐 때만 — Director 로는 조건 없이 넘긴다(리드 11/22 f).
  const boardWorkLeft = imageWorkShotIds(shotStates, null).length + videoWorkShotIds(shotStates, null).length
  const primary = primaryWorkAction({
    imageCount: imageBlock === null && !boardOff ? imageWork.length : 0,
    videoCount: videoBlock === null && !boardOff ? videoWork.length : 0,
    canHandOff: !boardOff && !making && boardWorkLeft === 0,
  })
  // 확인 창에 만들 영상 수 · 필요한 Take · 가진 Take(약속 E1 · E2) — 채팅 승인 카드와 같은 계산.
  const videoPlan = planVideoBatch(videoBatchTakeCosts(nodes, videoWork), takeState.balance, takeState.mode)
  const modelOf = (id: string) => videoBatchShotSettings(nodes, id)?.model ?? DEFAULT_VIDEO_MODEL
  const videoModels = videoWork.map(modelOf)
  // 영상까지 이어서(시안 D4 · 오너 답 6): 켜면 이미지 단추가 "이미지+영상 만들기", 이미지를 만든 샷은 이 화면이 영상을 이어 보낸다.
  const chainVideoAfterImage = useDirectorCanvasStore((s) => s.chainVideoAfterImage)
  const setChainVideoAfterImage = useDirectorCanvasStore((s) => s.setChainVideoAfterImage)
  const chainWaitingShotIds = useDirectorCanvasStore((s) => s.chainWaitingShotIds)
  const setChainWaitingShots = useDirectorCanvasStore((s) => s.setChainWaitingShots)
  const chainOn = chainVideoAfterImage && imageMode.mode === 'make' && imageWork.length > 0
  const chainPlan = planVideoBatch(videoBatchTakeCosts(nodes, chainOn ? imageWork : []), takeState.balance, takeState.mode)
  const estimate = workEstimateText({
    images: primary === 'image' ? imageWork.length : primary !== 'video' && imageMode.mode === 'remake' ? imageMode.shotIds.length : 0,
    videoModels: primary === 'video' ? videoModels : primary === 'image' && chainOn ? imageWork.map(modelOf) : [],
    videoTakes: primary === 'image' && chainOn ? chainPlan.requiredTakes : videoPlan.requiredTakes,
    takesShown: takeValuesShown(takeState),
    making,
    chain: primary === 'image' && chainOn,
  }, t)
  const [confirmVideoBatch, setConfirmVideoBatch] = useState(false)
  const [confirmRemake, setConfirmRemake] = useState(false)
  const [confirmChain, setConfirmChain] = useState(false)

  // 화면을 떠나면 "영상까지 이어서"를 끄고 기다림을 비운다 — "이 화면을 닫으면 영상은 시작되지 않아요".
  useEffect(() => () => useDirectorCanvasStore.getState().setChainVideoAfterImage(false), [])

  // Writer 샷은 4샷 한 장 일괄로, 손으로 더한 샷(Writer 샷 없음)은 한 장씩.
  const writerShotIdOf = (id: string): string | null => {
    const node = nodes.find((n) => n.id === id)
    return node && isShotData(node.data) ? node.data.writerShotId : null
  }
  // [이미지 만들기 · N]: 빈 샷은 일괄, 실패한 샷 · 손으로 더한 샷은 한 장씩. Take 를 쓰지 않아 확인 없이 바로.
  const runImages = async () => {
    if (boardOff) return
    if (imageMode.mode === 'remake') {
      setConfirmRemake(true)
      return
    }
    if (chainOn) {
      if (!(await takesReadable())) {
        setTakesUnknown(true)
        return
      }
      setTakesUnknown(false)
      setConfirmChain(true)
      return
    }
    startImages()
  }
  // 멈춘 판이 정리 중이면 정리가 끝난 뒤 그대로 시작한다. chain = 영상까지 이어 보낼 샷(실제로 시작할 때 기다림에 올린다).
  const startImages = (chain: readonly string[] = []) => {
    const pid = useDirectorCanvasStore.getState().projectId
    if (!pid || imageWork.length === 0) return
    const singles: string[] = []
    const batch: string[] = []
    for (const id of imageWork) {
      const writerShotId = writerShotIdOf(id)
      if (shotStates.get(id) === 'image_failed' || !writerShotId) singles.push(id)
      else batch.push(writerShotId)
    }
    void afterStoppedRealBatch(() => {
      if (chain.length > 0) {
        const now = useDirectorCanvasStore.getState()
        now.setChainWaitingShots([...now.chainWaitingShotIds, ...chain])
      }
      for (const id of singles) startSingleImage(id)
      // 센 목록을 그대로 싣는다 — 서버가 따로 고르지 않게.
      if (batch.length > 0) void runRealBatch(pid, { shotIds: batch })
    }, JSON.stringify(['make', singles, batch, chain]))
  }
  const remakePicked = () => {
    setConfirmRemake(false)
    const pid = useDirectorCanvasStore.getState().projectId
    if (!pid || imageMode.mode !== 'remake') return
    const singles: string[] = []
    const batch: string[] = []
    for (const id of imageMode.shotIds) {
      const writerShotId = writerShotIdOf(id)
      if (writerShotId) batch.push(writerShotId)
      else singles.push(id)
    }
    void afterStoppedRealBatch(() => {
      for (const id of singles) startSingleImage(id)
      if (batch.length > 0) void runRealBatch(pid, { force: true, shotIds: batch })
    }, JSON.stringify(['remake', singles, batch]))
  }
  // [영상 만들기 · N]: Take 를 쓰니 확인 창을 거친다(약속 E) — 누를 때 잔액을 다시 읽고, 못 읽으면 창을 열지 않는다.
  const runVideos = async () => {
    if (boardOff) return
    if (videoWork.length === 0) return
    if (!(await takesReadable())) {
      setTakesUnknown(true)
      return
    }
    setTakesUnknown(false)
    refetchTakeBalance()
    setConfirmVideoBatch(true)
  }
  // [모두 멈추기](오너 7번): 아직 보내지 않은 것은 보내지 않고, 이미 만드는 그림 · 영상은 화면에서 멈춘다(Take 는 돌려주지 않는다).
  const [stopping, setStopping] = useState(false)
  const stopAll = async () => {
    const run = useDirectorCanvasStore.getState()
    cancelRealBatchResume(run.projectId)
    run.setChainWaitingShots([])
    const imageBatchWasLive = realBatchBusy && !realBatchCancelled
    if (realBatchBusy && !realBatchCancelled) run.cancelRealBatch()
    cancelWaitingRealBatch()
    const stillCurrent = () => useDirectorCanvasStore.getState().projectId === run.projectId
    setStopping(true)
    try {
      if (videoBatchBusy && !videoBatchCancelled) await run.cancelVideoBatch()
      const asked = stoppableJobs(await freshActiveJobs(run.projectId))
      const stopped = new Set(asked.length > 0 ? await run.cancelRunningJobs(asked.map((job) => job.id)) : [])
      if (stillCurrent()) toast.info(t(stopNotice(stoppedCounts(asked, stopped, imageBatchWasLive))))
    } catch (error) {
      console.error('[camera] stop all failed:', error)
      if (stillCurrent()) toast.error(t('Could not stop it. Try again.'))
    } finally {
      setStopping(false)
    }
  }
  // 이어 보내기 지켜보기: 이미지가 끝난 샷은 영상을 시작하고, 그림이 없게 된 샷은 기다림에서 뺀다. 러프 · 시트를 기다리는 샷은 놓지 않는다.
  const realBatchResumeShotIds = useDirectorCanvasStore((s) => s.realBatchResumeShotIds)
  const resumeWaitingNodeIds = new Set(
    nodes.flatMap((n) => (isShotData(n.data) && n.data.writerShotId && realBatchResumeShotIds.includes(n.data.writerShotId) ? [n.id] : [])),
  )
  const chainKey = chainWaitingShotIds
    .map((id) => `${id}:${shotStates.get(id) ?? '-'}:${resumeWaitingNodeIds.has(id) ? 'r' : ''}`)
    .join('|')
  useEffect(() => {
    if (chainWaitingShotIds.length === 0) return
    const step = chainStep(chainWaitingShotIds, shotStates, realBatchBusy, resumeWaitingNodeIds, videoBatchBusy)
    if (step.start.length === 0 && step.drop.length === 0) return
    setChainWaitingShots(step.keep)
    const missed = chainMissed(step.drop, shotStates)
    if (missed.length > 0) {
      toast.info(countText(t, missed.length, "1 video didn't start because its image wasn't made.", "{count} videos didn't start because their images weren't made.", { count: missed.length }))
    }
    const pid = useDirectorCanvasStore.getState().projectId
    if (pid && step.start.length > 0) void runVideoBatch(pid, { shotIds: step.start })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chainKey 가 기다리는 샷과 그 상태를 함께 담는다
  }, [chainKey, realBatchBusy, videoBatchBusy])
  const progressDone = (storyboardBatch?.done ?? 0) + (videoBatch?.done ?? (videoBatchProgress?.done ?? 0))
  const progressTotal = (storyboardBatch?.total ?? 0) + (videoBatch?.total ?? (videoBatchProgress?.total ?? 0))
  const progressLabel =
    makingImages > 0 && makingVideos > 0
      ? makingLabel(makingImages, makingVideos, t)
      : makingVideos > 0 || videoLive
        ? makingVideos > 1 ? t('Making {count} videos', { count: makingVideos }) : makingVideos === 1 ? t('Making 1 video') : t('Making videos')
        : makingImages > 1 ? t('Making {count} images', { count: makingImages }) : makingImages === 1 ? t('Making 1 image') : t('Making images')

  return (
    <div className="@container flex flex-col gap-2" data-testid="camera-work-bar">
      <TopBarActions>
        <NextStepButton emphasis={primary === 'editor' ? 'primary' : 'secondary'} />
      </TopBarActions>
      <div className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-background px-4 py-2 shadow-node">
        <div className="flex min-w-0 items-center gap-3">
          {making ? (
            <div className="flex min-w-0 items-center gap-2.5" aria-live="polite">
              <LumiAvatar persona={STAGE_PERSONA.camera} state="loading" size={22} />
              <span className="truncate text-[13px] font-medium text-foreground">{progressLabel}</span>
              {progressTotal > 0 && (
                <span
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={progressTotal}
                  aria-valuenow={progressDone}
                  aria-label={t('Finished {done} of {total}', { done: progressDone, total: progressTotal })}
                  className="hidden h-1 w-40 shrink-0 overflow-hidden rounded-full bg-progress-track @5xl:block"
                >
                  <span
                    className={cn('block h-full transition-[width]', makingVideos > 0 || videoBatchBusy ? 'bg-state-video' : 'bg-stage-director')}
                    style={{ width: `${(progressDone / progressTotal) * 100}%` }}
                  />
                </span>
              )}
              {storyboardBatch && (
                <span className="shrink-0 font-num text-[12px] tabular-nums text-muted-foreground">
                  {t('Image')} {storyboardBatch.done}/{storyboardBatch.total}
                  {storyboardBatch.failed > 0 && <span className="text-destructive"> · {t('{count} failed', { count: storyboardBatch.failed })}</span>}
                </span>
              )}
              {videoBatch && (
                <span className="shrink-0 font-num text-[12px] tabular-nums text-muted-foreground">
                  {t('Video')} {videoBatch.done}/{videoBatch.total}
                  {videoBatch.failed > 0 && <span className="text-destructive"> · {t('{count} failed', { count: videoBatch.failed })}</span>}
                </span>
              )}
              <button type="button" onClick={() => void stopAll()} disabled={stopping} className={cn(PILL, 'disabled:cursor-not-allowed disabled:opacity-60')}>
                {stopping ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3 fill-current" />}
                <span>{stopping ? t('Stopping') : t('Stop all')}</span>
              </button>
            </div>
          ) : estimate && !boardOff ? (
            <span data-testid="camera-estimate" className="truncate text-[12.5px] font-medium text-muted-foreground">{estimate}</span>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={chainVideoAfterImage}
              aria-label={t('Also make videos')}
              onClick={() => setChainVideoAfterImage(!chainVideoAfterImage)}
              disabled={(imageMode.mode !== 'make' || imageWork.length === 0) && chainWaitingShotIds.length === 0}
              className="flex shrink-0 items-center gap-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', chainVideoAfterImage ? 'bg-info' : 'bg-card')}>
                <span className={cn('absolute top-0.5 size-4 rounded-full bg-foreground transition-[left]', chainVideoAfterImage ? 'left-[18px]' : 'left-0.5')} />
              </span>
              <span className="hidden whitespace-nowrap @4xl:inline">{t('Also make videos')}</span>
            </button>
            <button
              type="button"
              onClick={() => void runImages()}
              disabled={imageBlock !== null || boardOff}
              aria-describedby={imageBlock !== null || boardOff ? 'camera-work-block' : undefined}
              className={workButtonClass(primary === 'image')}
            >
              <ImageIcon className="size-3.5" />
              <span>{imageMode.mode === 'remake' ? t('Make images again') : chainVideoAfterImage ? t('Make images + videos') : t('Make images')}</span>
              {/* 다 읽기 전 · 못 읽었으면 숫자를 적지 않는다 — 읽기 전 판으로 센 숫자라 사실과 다르다. */}
              {!boardOff && (
                <>
                  <span aria-hidden className="opacity-60">·</span>
                  <span className="font-num tabular-nums">{imageMode.shotIds.length}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => void runVideos()}
              disabled={videoBlock !== null || boardOff}
              aria-describedby={videoBlock !== null || boardOff ? 'camera-work-block' : undefined}
              className={workButtonClass(primary === 'video')}
            >
              <Play className="size-3.5 fill-current" />
              <span>{t('Make videos')}</span>
              {!boardOff && (
                <>
                  <span aria-hidden className="opacity-60">·</span>
                  <span className="font-num tabular-nums">{videoWork.length}</span>
                </>
              )}
            </button>
          </div>
          {blockLine && (
            <p id="camera-work-block" className="text-[11.5px] leading-tight text-muted-foreground">
              {blockLine}
            </p>
          )}
        </div>
      </div>

      <RegenerateConfirmDialog
        open={confirmChain}
        onOpenChange={setConfirmChain}
        title={sceneName ? t('Make the images in {scene}, then their videos?', { scene: sceneName }) : t('Make images, then their videos?')}
        description={countText(t, imageWork.length, 'Makes 1 image, and its video starts by itself when the image is done.', 'Makes {count} images, and each video starts by itself when its image is done.', { count: imageWork.length })}
        impact={[
          countText(t, chainPlan.total, 'Costs money for every generated video: 1 video.', 'Costs money for every generated video: {count} videos.', { count: chainPlan.total }),
          ...describeVideoBatchPlan(chainPlan, t),
          t("If you close this screen, the videos won't start."),
        ]}
        confirmLabel={t('Make images + videos')}
        onConfirm={() => {
          setConfirmChain(false)
          if (takeState.failed) {
            setTakesUnknown(true)
            return
          }
          // Take 가 없으면 영상은 못 만들어도 이미지는 만든다 — 이미지는 Take 를 쓰지 않는다.
          if (chainPlan.runCount === 0) {
            toast.warning(t('No videos can be made until you add Takes.'))
            startImages()
            return
          }
          startImages(imageWork.slice(0, chainPlan.runCount))
          toast.info(t("If you close this screen, the videos won't start."))
        }}
      />
      <RegenerateConfirmDialog
        open={confirmRemake}
        onOpenChange={setConfirmRemake}
        title={countText(t, imageMode.shotIds.length, 'Make 1 image again?', 'Make {count} images again?', { count: imageMode.shotIds.length })}
        description={countText(t, imageMode.shotIds.length, 'Remakes the image for the 1 picked shot. No Takes are used.', 'Remakes the image for the {count} picked shots. No Takes are used.', { count: imageMode.shotIds.length })}
        impact={[countText(t, imageMode.shotIds.length, 'The new image becomes the current one. The current image stays in the versions.', 'The new images become the current ones. The current images stay in the versions.')]}
        confirmLabel={t('Make again')}
        onConfirm={remakePicked}
      />
      <RegenerateConfirmDialog
        open={confirmVideoBatch}
        onOpenChange={setConfirmVideoBatch}
        title={sceneName ? countText(t, videoPlan.total, 'Make 1 video in {scene}?', 'Make {count} videos in {scene}?', { count: videoPlan.total, scene: sceneName }) : t('Generate videos for eligible shots?')}
        description={countText(t, videoPlan.total, 'Generate a video for 1 eligible shot.', 'Generate videos for {count} eligible shots.', { count: videoPlan.total })}
        impact={[
          countText(t, videoPlan.runCount, 'Costs money for every generated video: 1 video.', 'Costs money for every generated video: {count} videos.', { count: videoPlan.runCount }),
          ...describeVideoBatchPlan(videoPlan, t),
          t('Only shots without a completed video or active generation will be included.'),
        ]}
        confirmLabel={t('Generate videos')}
        busy={videoBatchBusy}
        onConfirm={() => {
          setConfirmVideoBatch(false)
          // 창을 연 뒤 잔액을 못 읽게 됐으면 시작하지 않고 단추 아래 까닭 — 열린 창의 계획은 Take 줄이 빠져 있다.
          if (takeState.failed) {
            setTakesUnknown(true)
            return
          }
          if (videoPlan.runCount === 0) {
            toast.warning(t('No videos can be made until you add Takes.'))
            return
          }
          const pid = useDirectorCanvasStore.getState().projectId
          if (pid) void runVideoBatch(pid, { limit: videoPlan.runCount, shotIds: videoWork })
        }}
      />
    </div>
  )
}
