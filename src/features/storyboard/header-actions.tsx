'use client'

// Storyboard 머리 오른쪽 단추(오너 2026-11-26 m1126 S2) — [시작] 또는 일괄이 도는 동안 [멈추기], 그리고 [다음: Director로 →].
//   크림은 화면에 하나(design §1 규칙 2): 실사로 바꿀 콘티가 있으면 [시작]이 크림이고 [다음]은 보조, 그 밖에는 [다음]이 크림(혼자 정한 것 b · c).
//   [시작] = 화면이 센 샷(실사 없음 · 콘티 있음)만 Director [이미지 만들기]와 같은 일괄로(lib/storyboard/start-real). 콘티 그림 없는 샷은 빼고 먼저 알린다(f).
//   두 칸(스토리보드 · 대사) 머리에 같이 단다 — 무엇을 보일지는 lib/storyboard/real-board storyboardStartView. 약속: tests/writer/real-header.test.ts
import { ArrowRight, Square } from 'lucide-react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { useBoardUiStore } from '@/features/writer/board-ui-store'
import { shotName } from '@/lib/board-names'
import { useActiveGenerationJobs } from '@/lib/generation-queue'
import { useLocale, useT } from '@/lib/i18n'
import { noContiNotice, realDrawingShotIds, storyboardStartView } from '@/lib/storyboard/real-board'
import { useStoryboardRealImages } from '@/lib/storyboard/real-images-store'
import { startStoryboardReal, stopStoryboardReal } from '@/lib/storyboard/start-real'
import { boardShots } from '@/lib/writer/board-summary'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

const NO_IMAGES: Readonly<Record<string, unknown>> = {}

export function StoryboardHeaderActions() {
  const t = useT()
  const locale = useLocale()
  const projectId = useProjectStore((state) => state.projectId)
  const sceneManifest = useWriterStore((state) => state.sceneManifest)
  const shots = useWriterStore((state) => state.shots)
  const images = useStoryboardRealImages((state) => (state.projectId === projectId ? state.images : NO_IMAGES))
  const activeJobs = useActiveGenerationJobs(projectId)
  const batch = useDirectorCanvasStore(
    useShallow((state) => ({ busy: state.realBatchBusy, cancelled: state.realBatchCancelled, shotIds: state.realBatchShotIds })),
  )
  const chatBusy = useGlobalChatStore((state) => state.loading)
  const handoffRunning = useGlobalChatStore(
    (state) => state.directorHandoff?.phase === 'checking' || state.directorHandoff?.phase === 'navigating',
  )
  const openDirectorConfirm = useBoardUiStore((state) => state.setDirectorConfirmOpen)

  const board = boardShots(sceneManifest, shots)
  const view = storyboardStartView({
    shots: board.map((entry) => entry.shot),
    realOf: (shotId) => images[shotId],
    drawing: realDrawingShotIds(activeJobs),
    batch,
  })
  const noByShot = new Map(board.map((entry) => [entry.shot.shotId, entry.shotNo]))
  const nameOf = (shotId: string) => shotName(locale, noByShot.get(shotId) ?? shotId)
  const start = () => {
    if (!projectId) return
    const notice = noContiNotice(locale, view.noConti.map(nameOf))
    if (notice) toast.info(notice)
    void startStoryboardReal(projectId, view.targets)
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {view.mode === 'start' ? (
        <Button
          onClick={start}
          disabled={!projectId}
          title={t('Turn the rough sketches into real images · {count} · No Takes used', { count: view.targets.length })}
          data-testid="storyboard-start"
        >
          {t('Start')}
        </Button>
      ) : null}
      {view.mode === 'stop' || view.mode === 'stopping' ? (
        <Button
          variant="secondary"
          disabled={view.mode === 'stopping' || !projectId}
          onClick={() => {
            if (projectId) void stopStoryboardReal(projectId)
          }}
          data-testid="storyboard-stop"
        >
          <Square className="size-3.5" aria-hidden />
          {view.mode === 'stopping' ? t('Stopping') : t('Stop making')}
        </Button>
      ) : null}
      <Button
        variant={view.nextIsPrimary ? 'default' : 'secondary'}
        disabled={board.length === 0 || chatBusy || handoffRunning}
        onClick={() => openDirectorConfirm(true)}
        data-testid="storyboard-next-director"
      >
        {t('Next: Director')}
        <ArrowRight className="size-4" />
      </Button>
    </div>
  )
}
