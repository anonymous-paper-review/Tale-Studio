'use client'

// Storyboard 실사 보기 보드(오너 2026-11-26 m1126 S1 · S2 · S4 · S5 · G3 · O7) — 지금 Storyboard 보드 모양(씬 머리 · 카드 격자 · 축척 · 끌어 넘기기 · 씬 접기) 그대로,
//   카드 그림만 실사 · 콘티(RealShotCard). 처음엔 Writer 콘티의 목각 그림이고, 머리의 [시작]이 Director [이미지 만들기]와 같은 일괄로 실사를 만든다.
//   들어오기만 해서는 실사를 만들지 않는다(8/27 오너). 러프 그리기 · 보드 잠금 · 더한 샷 그리기 · 연출 점검은 Writer 콘티(/studio/conti)가 한다 — 여기 없다.
//   실사를 만들거나 다시 그리는 동안 화면 · 채팅은 그대로고 그 카드에만 기다림이 뜬다(S5 · O7) — 기다림의 진실은 작업 큐(lib/storyboard/real-board).
//   실사 작업이 큐에서 빠지면 실사 그림을 다시 읽어 카드가 새 그림을 보인다. 카드를 누르면 샷 상세(RealShotDialog), ⌘/Ctrl+클릭은 채팅 멘션(G3).
//   약속: tests/writer/real-board-view.test.ts
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ImageIcon, Loader2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StoryboardZoomControls, storyboardColumns, useStoryboardZoom } from '@/components/generating-frame'
import { useBoardUiStore } from '@/features/writer/board-ui-store'
import { StoryboardDirectorDialog } from '@/features/writer/storyboard-director-dialog'
import { handOverToDirector } from '@/features/writer/storyboard-director'
import { RealShotCard } from '@/features/storyboard/real-shot-card'
import { RealShotDialog } from '@/features/storyboard/real-shot-dialog'
import { StoryboardHeader } from '@/features/storyboard/storyboard-header'
import { useModifierHeld } from '@/hooks/use-modifier-held'
import { sceneName, sceneShotName } from '@/lib/board-names'
import { takeCostForVideo, takeValuesShown } from '@/lib/billing/take-cost'
import { useTakeBalance } from '@/lib/billing/use-take-balance'
import { useActiveGenerationJobs, type ActiveJob } from '@/lib/generation-queue'
import { computeSettledJobs, reportUiReflected } from '@/lib/generation-ui-reflected'
import { translate, useT } from '@/lib/i18n'
import { mentionOnModifierClick, stopModifierPointerDown, storyboardMentionLabels, storyboardMentionRef } from '@/lib/storyboard/mention'
import {
  REAL_IMAGE_JOB_KINDS,
  realDrawingShotIds,
  realPanelOf,
  storyboardCardPicture,
  storyboardCardWait,
  storyboardRealProgress,
} from '@/lib/storyboard/real-board'
import { useStoryboardRealImages } from '@/lib/storyboard/real-images-store'
import { cn } from '@/lib/utils'
import { createWheelNotchStepper } from '@/lib/wheel-notch'
import { boardShots, boardTotalText, directorConfirmView, directorHandoffSummary, sceneStats, sceneStatsLabel } from '@/lib/writer/board-summary'
import { boardStoryFontSize, sceneHeadTitle } from '@/lib/writer/board-card'
import { manifestEntities, resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { DEFAULT_VIDEO_MODEL } from '@/lib/video-models'
import { useArtistStore } from '@/stores/artist-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useShallow } from 'zustand/react/shallow'

const NO_IMAGES: Readonly<Record<string, unknown>> = {}

export function RealBoardView() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const projectId = useProjectStore((s) => s.projectId)
  const sceneManifest = useWriterStore((s) => s.sceneManifest)
  const shots = useWriterStore((s) => s.shots)
  const loadProject = useWriterStore((s) => s.loadProject)
  const images = useStoryboardRealImages((s) => (s.projectId === projectId ? s.images : NO_IMAGES))
  const activeJobs = useActiveGenerationJobs(projectId)
  const batch = useDirectorCanvasStore(
    useShallow((s) => ({ busy: s.realBatchBusy, cancelled: s.realBatchCancelled, shotIds: s.realBatchShotIds })),
  )
  const detailShotId = useBoardUiStore((s) => s.shotEditId)
  const setDetailShotId = useBoardUiStore((s) => s.setShotEditId)
  const directorConfirmOpen = useBoardUiStore((s) => s.directorConfirmOpen)
  const setDirectorConfirmOpen = useBoardUiStore((s) => s.setDirectorConfirmOpen)
  const mentionedRefs = useChatUiStore((s) => s.mentionedRefs)
  const armed = useModifierHeld()
  const offerSuggestion = useGlobalChatStore((s) => s.offerSuggestion)
  const chatMessages = useGlobalChatStore((s) => s.messages)
  const chatHistoryLoaded = useGlobalChatStore((s) => s.messagesLoadedProjectId === projectId)
  const [zoomLevel, setZoomLevel] = useStoryboardZoom('storyboard:zoomLevel')
  const [collapsedScenes, setCollapsedScenes] = useState<ReadonlySet<string>>(new Set())
  const boardRef = useRef<HTMLDivElement>(null)
  const draggedRef = useRef(false)
  const briefedRef = useRef<string | null>(null)

  // 보드가 떨어지면 상세 · 넘김 창도 닫는다 — 다시 붙을 때 저절로 열리지 않게(지금 보드와 같다).
  useEffect(() => () => {
    useBoardUiStore.getState().setDirectorConfirmOpen(false)
    useBoardUiStore.getState().setShotEditId(null)
  }, [])

  // 씬 · 샷과 실사 그림을 읽는다 — 프로젝트를 열 때마다.
  useEffect(() => {
    if (!projectId) return
    void loadProject()
    void useStoryboardRealImages.getState().load(projectId)
  }, [projectId, loadProject])

  // 실사 작업(일괄 시트 · 한 샷 다시 그리기)이 큐에서 빠지면(끝남 · 실패 · 멈춤) 실사 그림을 새로 읽는다 — finalize 는 그림을 먼저 쓰고 작업을 끝내므로
  //   빠진 뒤 첫 읽기가 새 그림이다. 사물함(30초)은 낡음으로 표시하고 받는다. deps 는 작업 id 서명(원시값)만 — 배열은 ref 로 나른다.
  const realJobs = activeJobs.filter((job) => REAL_IMAGE_JOB_KINDS.includes(job.kind))
  const realSignature = realJobs.map((job) => job.id).sort().join(',')
  const realJobsRef = useRef<readonly ActiveJob[]>([])
  realJobsRef.current = realJobs
  const prevRealJobsRef = useRef<readonly ActiveJob[]>([])
  useEffect(() => {
    const prev = prevRealJobsRef.current
    const current = realJobsRef.current
    prevRealJobsRef.current = current
    if (!projectId) return
    const settled = computeSettledJobs(prev, current)
    if (settled.length === 0) return
    void useStoryboardRealImages
      .getState()
      .load(projectId, { fresh: true })
      .then(() => reportUiReflected(projectId, settled, 'storyboard-real'))
      .catch(() => {})
  }, [realSignature, projectId])

  const board = boardShots(sceneManifest, shots)
  const hasShots = board.length > 0
  const drawing = realDrawingShotIds(activeJobs)
  const progress = storyboardRealProgress({ shots: board.map((e) => e.shot), realOf: (id) => images[id], drawing, batch })

  // 첫 진입 안내(혼자 정한 것) — 실사가 아직 하나도 없고 Storyboard 채팅 기록이 없으면 [시작]과 채팅으로 고치는 법을 먼저 알린다.
  //   채팅 기록을 다 읽은 뒤에만(기록이 비어 있는 동안 같은 안내를 또 남기지 않게 — 지금 보드와 같은 규칙).
  useEffect(() => {
    if (!projectId || !chatHistoryLoaded || briefedRef.current === projectId) return
    if (!hasShots || progress.real > 0 || progress.making > 0) return
    if (chatMessages.some((m) => m.stage === 'writer')) return
    briefedRef.current = projectId
    offerSuggestion({
      id: `storyboard-real-brief:${projectId}`,
      stage: 'writer',
      dismissible: false,
      action: null,
      content: translate(locale, 'The rough sketches are ready. Press Start to turn them into real images.\n\nTo change a card, tell me in the chat (e.g. "@Shot 2 make her look back").'),
    })
  }, [projectId, chatHistoryLoaded, hasShots, progress.real, progress.making, chatMessages, offerSuggestion, locale])

  // Ctrl + 휠 = 축척(지금 보드와 같은 규칙 — 노치 한 칸 = 한 단계).
  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const step = createWheelNotchStepper((dir) => setZoomLevel((z) => Math.max(1, Math.min(6, z + dir))))
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      step(e)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [hasShots, setZoomLevel])

  // 빈 곳을 잡고 끌면 넘겨 본다(지금 보드와 같다) — 단추 · 입력 위에서 시작한 끌기는 무시.
  const handleBoardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return
    const viewport = (e.currentTarget as HTMLElement).closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null
    if (!viewport) return
    const startX = e.clientX
    const startY = e.clientY
    const startLeft = viewport.scrollLeft
    const startTop = viewport.scrollTop
    draggedRef.current = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!draggedRef.current && Math.hypot(dx, dy) > 5) {
        draggedRef.current = true
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
      }
      if (draggedRef.current) {
        viewport.scrollTop = startTop - dy
        viewport.scrollLeft = startLeft - dx
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const openDetail = (shotId: string) => {
    if (draggedRef.current) return
    setDetailShotId(shotId)
  }
  const toggleScene = (sceneId: string) =>
    setCollapsedScenes((prev) => {
      const next = new Set(prev)
      if (next.has(sceneId)) next.delete(sceneId)
      else next.add(sceneId)
      return next
    })

  // Director 넘김 창 — 머리의 [다음: Director로 →]가 연다. 러프 그리기는 콘티 일이라 [남은 컷 그리기]는 두지 않는다.
  const takeBalance = useTakeBalance()
  const artistCharacters = useArtistStore((s) => s.characterAssets.filter((c) => c.entityType !== 'object' && !!(c.portrait || c.views?.main || c.appearances?.some((a) => a.sheetUrl || a.portraitUrl))).length)
  const artistBackgrounds = useArtistStore((s) => s.worldAssets.filter((w) => !!w.wideShot).length)
  const directorSummary = directorHandoffSummary(sceneManifest, shots)
  const directorView = {
    ...directorConfirmView(directorSummary, locale, {
      characters: artistCharacters,
      backgrounds: artistBackgrounds,
      imagesToMake: directorSummary.movingShotIds.filter((id) => !realPanelOf(images[id])).length,
      takesPerShot: takeValuesShown(takeBalance) ? takeCostForVideo(DEFAULT_VIDEO_MODEL, '720p') : null,
    }),
    canDrawRemaining: false,
  }

  const header = (
    <StoryboardHeader
      description={t('Storyboard: press Start to turn the rough sketches into real images. To change a card, tell the chat.')}
      tools={hasShots ? <StoryboardZoomControls zoomLevel={zoomLevel} onZoomLevelChange={setZoomLevel} /> : null}
    />
  )
  const overlays = (
    <>
      <RealShotDialog shotId={detailShotId} onOpenChange={(open) => (open ? null : setDetailShotId(null))} />
      <StoryboardDirectorDialog
        open={directorConfirmOpen}
        view={directorView}
        onClose={() => setDirectorConfirmOpen(false)}
        onDrawRemaining={() => setDirectorConfirmOpen(false)}
        onConfirm={(choice) => {
          setDirectorConfirmOpen(false)
          void handOverToDirector({ makeImages: choice === 'makeImages' })
        }}
      />
    </>
  )

  if (!hasShots) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <ImageIcon className="size-10 text-subtle-foreground" />
          <p className="text-body font-semibold text-foreground">{t('No scenes or shots generated yet')}</p>
        </div>
        {overlays}
      </div>
    )
  }

  const cols = storyboardColumns(zoomLevel)
  const storyFontSize = boardStoryFontSize(cols)
  const entityNames = manifestEntities(sceneManifest)
  const characterNames = new Map((sceneManifest?.characters ?? []).map((c) => [c.characterId, c.name]))
  const mentionNames = [...characterNames.values()]
  const mentionLabels = storyboardMentionLabels(sceneManifest, shots, locale)
  const statsByScene = sceneStats(sceneManifest, shots)
  const shotNoById = new Map(board.map((entry) => [entry.shot.shotId, entry.shotNo]))
  const waitOf = (shotId: string) => {
    const shot = board.find((entry) => entry.shot.shotId === shotId)?.shot
    const hasReal = !!realPanelOf(images[shotId])
    const hasConti = !!shot && storyboardCardPicture(shot.roughStoryboard, null).kind === 'conti'
    return storyboardCardWait({ shotId, hasReal, hasConti, drawing, batch })
  }
  // 화면 읽기에 알리는 기다림 카드는 하나 — 보드 순서(씬 → 샷)로 첫 장, 접힌 씬은 건너뛴다(지금 보드와 같은 규칙).
  const announcedShotId = board.find((entry) => !collapsedScenes.has(entry.shot.sceneId) && waitOf(entry.shot.shotId) !== 'none')?.shot.shotId ?? null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div role="status" aria-label={t('Storyboard progress')} className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-7 pt-3 font-num text-meta tabular-nums text-subtle-foreground">
        <span className="font-medium text-muted-foreground">{boardTotalText(t, progress.total)}</span>
        <span>{t('Real')} {progress.real}</span>
        <span className="inline-flex items-center gap-1">
          {progress.making > 0 && <Loader2 className="size-3 animate-spin" />}
          {t('Making')} {progress.making}
        </span>
        <span>{t('Not real yet')} {progress.noReal}</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div
          ref={boardRef}
          className="cursor-grab space-y-[18px] px-7 pb-7 pt-4"
          tabIndex={0}
          aria-label={t('Storyboard board')}
          onPointerDown={handleBoardPointerDown}
        >
          {(sceneManifest?.scenes ?? []).map((scene, sceneIdx) => {
            const sceneShots = shots.filter((s) => s.sceneId === scene.sceneId)
            const collapsed = collapsedScenes.has(scene.sceneId)
            const title = sceneHeadTitle(scene, entityNames, locale)
            const summary = resolveEntityNames(scene.narrativeSummary, entityNames).trim()
            const statsText = sceneStatsLabel(statsByScene.get(scene.sceneId) ?? { shots: sceneShots.length, seconds: 0 }, locale)
            const sceneLabel = mentionLabels.scenes.get(scene.sceneId)
            return (
              <section key={scene.sceneId} className="space-y-3">
                <button
                  type="button"
                  onClick={() => toggleScene(scene.sceneId)}
                  // ⌘/Ctrl+클릭은 접기 대신 채팅에 "@씬 N"(G3).
                  onPointerDownCapture={stopModifierPointerDown}
                  onClickCapture={(event) => {
                    mentionOnModifierClick(event, sceneLabel)
                  }}
                  aria-expanded={!collapsed}
                  className={cn(
                    'flex min-h-8 w-full min-w-0 items-center gap-2.5 rounded-md text-left [contain:inline-size] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50',
                    mentionedRefs.includes(storyboardMentionRef('scene', scene.sceneId)) && 'mention-flash bg-sky-400/10 ring-2 ring-sky-400/70',
                    armed && sceneLabel && 'cursor-copy',
                  )}
                >
                  <ChevronDown className={cn('size-3.5 shrink-0 text-subtle-foreground transition-transform', collapsed && '-rotate-90')} aria-hidden />
                  <span className="shrink-0 font-num text-micro font-semibold text-foreground">{sceneName(locale, sceneIdx + 1)}</span>
                  {title ? <span className="min-w-0 max-w-[45%] shrink-0 truncate text-body font-semibold text-foreground">{title}</span> : null}
                  <span className="flex min-w-0 items-baseline gap-1 text-caption text-subtle-foreground">
                    {summary ? <span className="min-w-0 truncate" title={summary}>{summary}</span> : null}
                    <span className="shrink-0 tabular-nums">{summary ? `· ${statsText}` : statsText}</span>
                  </span>
                </button>
                <div
                  className={cn('grid transition-[grid-template-rows] duration-300 ease-out', collapsed ? '[grid-template-rows:0fr]' : '[grid-template-rows:1fr]')}
                  aria-hidden={collapsed}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="grid gap-3 p-0.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                      {sceneShots.map((shot, shotIdx) => {
                        const label = sceneShotName(locale, sceneIdx + 1, shotNoById.get(shot.shotId) ?? shotIdx + 1)
                        const wait = waitOf(shot.shotId)
                        return (
                          <RealShotCard
                            key={shot.shotId}
                            shot={shot}
                            label={label}
                            picture={storyboardCardPicture(shot.roughStoryboard, images[shot.shotId])}
                            wait={wait}
                            compact={cols >= 5}
                            announceWait={shot.shotId === announcedShotId}
                            storyFontSize={storyFontSize}
                            locale={locale}
                            entityNames={entityNames}
                            characterNames={characterNames}
                            mentionNames={mentionNames}
                            mentionLabel={mentionLabels.shots.get(shot.shotId)}
                            mentioned={mentionedRefs.includes(storyboardMentionRef('shot', shot.shotId))}
                            armed={armed}
                            onOpen={() => openDetail(shot.shotId)}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </ScrollArea>
      {overlays}
    </div>
  )
}
