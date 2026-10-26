'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, Check, Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { NextStepButton } from '@/components/handoff/next-step-button'
import { CharacterPanel } from '@/features/artist/character-panel'
import { WorldPanel } from '@/features/artist/world-panel'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { WriterProgress } from '@/components/layout/writer-progress'
import { WriterResumeButton } from '@/components/layout/writer-resume-button'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import {
  evaluateArtistGate,
  evaluateDirectorGate,
  type WriterGateStatus,
} from '@/lib/lifecycle'
import { cn } from '@/lib/utils'

import { useAltArrowCycle } from '@/lib/use-alt-arrow-cycle'
import { AltArrowHint } from '@/components/alt-arrow-hint'
import { useLocale, useT } from '@/lib/i18n'
import { styleAnchorName } from '@/lib/style-anchor-name'
import { AiBusyOverlay } from '@/components/ai-busy-overlay'
import { artistPhase, artistRunStopped, assetCompletionGaps, makingProgress } from '@/lib/artist/breakdown'
import { ARTIST_BRIEF_TEXT, artistBriefCounts, offerArtistBrief } from '@/lib/artist/brief'
import { completeBlockedNote, drawContinueDecision, drawTargetCount, makingOverlayCopy, missingDrawTargets } from '@/lib/artist/draw-continue'
import { backgroundRoughReady, storyboardPrepView } from '@/lib/artist/background-roughs'
import { isDemoSession } from '@/lib/demo/context'
import { useBackgroundRoughs } from '@/features/artist-room/use-background-roughs'
import { withDemoShare } from '@/lib/demo/context'
import { stageIndex } from '@/lib/stage-gate'
import { useProducerStore } from '@/stores/producer-store'
import { BreakdownList } from '@/features/artist-room/breakdown-list'
import { StyleMakeDialog } from '@/features/artist-room/style-make-dialog'
import { ArtistCompleteDialog } from '@/features/artist-room/artist-complete-dialog'
import { groupSeriesAssets, seriesMakingTitle } from '@/features/series/artist-series'
import { useSeriesInfo } from '@/features/series/use-series-info'
import { styleIdOf } from '@/lib/series/snapshot'

type ArtistTab = 'characters' | 'world'

// 탭 순서 — 전환 슬라이드 방향의 기준 (#d3 2026-08-03, writer 탭과 동일 패턴).
const ARTIST_TAB_ORDER: readonly ArtistTab[] = ['characters', 'world']

export default function VisualPage() {
  const t = useT()
  const {
    characterAssets,
    worldAssets,
    generatingViews,
    generatingLocations,
    error,
    loadData,
    autoGenerateBaseImages,
  } = useArtistStore()

  const projectId = useProjectStore((s) => s.projectId)
  // 약속 D15(2026-09-04): 보던 탭은 스토어가 기억한다 — 떠났다 돌아와도 그대로.
  const tab = useArtistStore((s) => s.uiTab)
  const setTab = useArtistStore((s) => s.setUiTab)
  // Alt+←/→ 로 인물 ↔ 배경 순환(#keyboard-only 2026-08-11) — 오너 지정 범위는 두 탭.
  //   인벤토리에 있다가 누르면 인물로 복귀한다(두 탭 순환에 합류).
  useAltArrowCycle(['characters', 'world'] as const, tab, setTab)
  // 탭 전환 슬라이드(#d3) — 방향은 탭 순서 기준(왼→오른쪽 = forward). set-state-in-render 패턴.
  const [prevTab, setPrevTab] = useState<ArtistTab>(tab)
  const [tabSlide, setTabSlide] = useState<'forward' | 'back' | 'none'>('none')
  if (tab !== prevTab) {
    setTabSlide(
      ARTIST_TAB_ORDER.indexOf(tab) > ARTIST_TAB_ORDER.indexOf(prevTab) ? 'forward' : 'back',
    )
    setPrevTab(tab)
  }
  const tabSlideClass =
    tabSlide === 'forward'
      ? 'animate-in fade-in-25 slide-in-from-right-6 duration-500 ease-out motion-reduce:animate-none'
      : tabSlide === 'back'
        ? 'animate-in fade-in-25 slide-in-from-left-6 duration-500 ease-out motion-reduce:animate-none'
        : undefined

  // 보드 축척(#d1 2026-07-14) — writer 러프 보드와 같은 슬라이더. 인물/배경 탭별로 저장.
  //   레벨 1(축소·3열) ~ 3(확대·1열, 기존 모습), cols = 4 - level. localStorage 탭별 키.
  // 기본 레벨 2(#f5 2026-08-26 오너): 3(최대 확대)은 오너가 항상 최소로 줄여 썼다 — 중간이 기본.
  //   저장값이 있으면 그것이 우선(아래 read).
  const [zoomByTab, setZoomByTab] = useState<{ characters: number; world: number }>({
    characters: 2,
    world: 2,
  })
  useEffect(() => {
    const read = (key: string) => {
      const v = Number(localStorage.getItem(`artist:zoomLevel:${key}`))
      return v >= 1 && v <= 3 ? v : 2
    }
    // rAF 경유 — 하이드레이션 mismatch 없이 저장값 반영 + set-state-in-effect 린트 준수.
    const id = requestAnimationFrame(() =>
      setZoomByTab({ characters: read('characters'), world: read('world') }),
    )
    return () => cancelAnimationFrame(id)
  }, [])
  const setZoom = (key: 'characters' | 'world', v: number) => {
    const clamped = Math.min(3, Math.max(1, v))
    setZoomByTab((prev) => ({ ...prev, [key]: clamped }))
    try {
      localStorage.setItem(`artist:zoomLevel:${key}`, String(clamped))
    } catch {}
  }
  // Ctrl+휠 축척(#d1 2026-07-15) — 함수형 업데이트라 휠 연타에도 최신값 기준으로 단계 이동.
  const stepZoom = (key: 'characters' | 'world', dir: 1 | -1) => {
    setZoomByTab((prev) => {
      const next = Math.min(3, Math.max(1, prev[key] + dir))
      try {
        localStorage.setItem(`artist:zoomLevel:${key}`, String(next))
      } catch {}
      return { ...prev, [key]: next }
    })
  }

  // 실험 New UI(에셋·샷 보드) 토글 — 스토어 보관으로 탭 전환(remount)에도 유지.

  // writer-pipeline 진행상황 (producer→artist 직행 시 백그라운드 생성 진행 표시용, decisions #37)
  const { status: writerStatus, restart: restartWriterStatus } = useWriterStatus(projectId)
  const setLifecycleStatus = useProjectStore((s) => s.setLifecycleStatus)

  // 프로젝트당 1회만 자동생성 트리거 (마운트/재진입 중복 방지)
  const autoGenTriggeredRef = useRef<string | null>(null)
  // 시간측정 로그 1회 가드 (프로젝트당)
  const timingLoggedRef = useRef<string | null>(null)
  // 프로액티브 넛지 1회 가드 (프로젝트당) — chat-proactive-copilot Phase 1
  // 첫 진입 브리핑(캐릭터·장소 요약) 1회 가드 — 프로젝트별.
  const artistBriefedRef = useRef<string | null>(null)
  // 진입 fallback: main 이 너무 오래 안 차도 일정 시간 뒤 진입 (이후 client 가 보강).
  //   프로젝트별로 기록 → projectId 변경 시 파생값이 자동 false (effect 내 동기 setState 회피).
  const [fallbackProject, setFallbackProject] = useState<string | null>(null)

  useEffect(() => {
    if (projectId) loadData()
  }, [projectId, loadData])

  // 진입 조건 (B4): main(view_main)이 핸드오프 progress bar 뒤에서 채워질 때까지 대기.
  //   - 캐릭터가 로드되고 모든 캐릭터의 main 이 준비되면 진입.
  //   - 너무 오래 걸리면(enterFallback) 그냥 진입 — autoGenerateBaseImages 가 client 에서 main 보강.
  const charsLoaded = characterAssets.length > 0
  const mainReady =
    charsLoaded && characterAssets.every((c) => c.views.main != null)
  const enterFallback = fallbackProject === projectId
  const writerGateStatus: WriterGateStatus = writerStatus?.pipeline_completed
    ? { state: 'ready' }
    : writerStatus?.pipeline_failed
      ? {
          state: 'failed',
          blockers: [{ field: 'writer:failed', label: writerStatus.error ?? t('Writer run failed') }],
        }
      : writerStatus?.started
        ? {
            state: 'active',
            blockers: [{ field: 'writer:active', label: t('Writer is still running.') }],
          }
        : {
            state: 'unknown',
            blockers: [{ field: 'writer:status', label: t('Writer status not yet available') }],
          }

  const artistGate = evaluateArtistGate({
    characters: characterAssets.map((c) => ({
      characterId: c.characterId,
      name: c.name,
      entityType: c.entityType,
      appearance: c.fixedPrompt,
      mainImageUrl: c.views.main,
    })),
    worlds: worldAssets.map((w) => ({
      locationId: w.locationId,
      name: w.name,
      wideShot: w.wideShot,
    })),
  })
  const directorGate = evaluateDirectorGate({ writer: writerGateStatus, artist: artistGate })
  const writerReady = writerGateStatus.state === 'ready'

  // Producer handoff 직후 characters가 먼저 들어오면 Writer가 계속 도는 동안에도 Artist 작업을 시작한다.
  const ready = charsLoaded || !!writerStatus?.pipeline_completed || enterFallback

  // 진입 게이트 영속화: 한 번 진입(ready)한 projectId 는 탭 전환(route remount)으로
  //   fallbackProject(useState)/타이머가 리셋돼도 다시 progress 게이트에 걸리지 않는다.
  //   gateOpen = 이번 마운트의 ready || 과거에 한 번이라도 진입함. (store 가 remount 에도 유지)
  const enteredProjects = useArtistStore((s) => s.enteredProjects)
  const markEntered = useArtistStore((s) => s.markEntered)
  const alreadyEntered = projectId ? !!enteredProjects[projectId] : false
  const gateOpen = ready || alreadyEntered
  useEffect(() => {
    if (projectId && ready) markEntered(projectId)
  }, [projectId, ready, markEntered])

  // fallback (B4): 파이프라인이 "도는 동안"엔 절대 진입하지 않고 main 을 기다린다.
  //   - 텍스트 파이프라인 완료(pipeline_completed) 후에도 main 이 안 차면 image-gen tail 로 보고
  //     90s grace 후 진입(이후 client 가 보강). 파이프라인 진행 중 조기 진입 버그 방지.
  const pipelineDone = !!writerStatus?.pipeline_completed
  useEffect(() => {
    if (!projectId || !pipelineDone) return
    const t = setTimeout(() => setFallbackProject(projectId), 90_000)
    return () => clearTimeout(t)
  }, [projectId, pipelineDone])

  // 절대 안전망: 상태 폴링이 영영 완료를 못 알리는 경우라도 6분 뒤엔 진입.
  useEffect(() => {
    if (!projectId) return
    const t = setTimeout(() => setFallbackProject(projectId), 360_000)
    return () => clearTimeout(t)
  }, [projectId])

  // 백그라운드 파이프라인이 DB(scenes/characters/locations + view_main)를 채울 때까지 폴링 재로드.
  // loadData는 idempotent — 데이터/이미지가 들어오면 빈 화면(progress)에서 카드 UI로 자동 전환.
  useEffect(() => {
    if (!projectId || ready) return
    const id = setInterval(() => loadData(), 3000)
    return () => clearInterval(id)
  }, [projectId, ready, loadData])

  // writer 완료 이벤트(writerReady flip) → 데이터 1회 재로드(룩/writer-추가 캐릭터 반영). 폴링 아님.
  const writerReadyReloadRef = useRef<string | null>(null)
  useEffect(() => {
    if (!projectId || !writerReady) return
    if (writerReadyReloadRef.current === projectId) return
    writerReadyReloadRef.current = projectId
    void loadData()
  }, [projectId, writerReady, loadData])

  // 진입(ready) 시 비어있는 이미지 자동생성 (1회+캐시).
  //   mainReady 진입: main 은 이미 있으므로 비어있는 4방향만 i2i 생성.
  //   fallback 진입: main 도 비어있으면 main 부터 보강.
  useEffect(() => {
    if (!projectId || !ready) return
    if (autoGenTriggeredRef.current === projectId) return
    autoGenTriggeredRef.current = projectId
    void autoGenerateBaseImages()
  }, [projectId, ready, autoGenerateBaseImages])

  // 시간측정: artist 진입(=main 준비/진입 가능) 순간 1회 로깅.
  //   end_to_end_ms = 핸드오프 클릭(producer) → 지금 (sessionStorage 기준 wall-clock)
  //   서버 timings 도 함께 출력 (pipeline 내부 구간).
  useEffect(() => {
    if (!projectId || !ready) return
    if (timingLoggedRef.current === projectId) return
    timingLoggedRef.current = projectId
    let endToEndMs: number | null = null
    try {
      const t0 = sessionStorage.getItem(`handoffStartedAt:${projectId}`)
      if (t0) endToEndMs = Date.now() - Number(t0)
    } catch {}
    const endToEndS = endToEndMs != null ? +(endToEndMs / 1000).toFixed(1) : null
    // 헤드라인에 숫자를 평탄하게 — 콘솔에서 Object 펼치지 않아도 바로 읽히도록.
    console.log(
      `[handoff timing] artist 진입 (main 준비) — ${endToEndS}s · via_fallback=${!mainReady}`,
      {
        end_to_end_ms: endToEndMs,
        end_to_end_s: endToEndS,
        via_fallback: !mainReady,
        server: writerStatus?.timings ?? null,
      },
    )
  }, [projectId, ready, mainReady, writerStatus])

  useEffect(() => {
    setLifecycleStatus({
      producerSourceHash: null,
      writer: writerGateStatus,
      artist: artistGate,
      director: directorGate,
    })
  }, [setLifecycleStatus, writerGateStatus, artistGate, directorGate])

  // 리뉴얼 1차(2026-10-19): "Director로 넘어갈까요?" 준비 완료 넛지는 없다 — Artist 다음은 [완료하기]로 여는 Storyboard 다.
  const generatingCount = generatingViews.length + generatingLocations.length

  // 리뉴얼 1차(2026-10-19, 프로토타입 A1 · A2 · A4 · A5 · A9): 확정 산문의 글 목록 → [만들기] → 디자인 · 그림 → 카드 → [완료하기].
  const router = useRouter()
  const proseLocked = useProjectStore((s) => s.producerLocked)
  const treatmentDraftFlag = useProjectStore((s) => s.treatmentDraft)
  const reachedStage = useProjectStore((s) => s.reachedStage)
  const draftRun = writerStatus ? writerStatus.draft === true : treatmentDraftFlag
  const hasAssets = characterAssets.length > 0 || worldAssets.length > 0
  // [완료하기]를 해 Storyboard 가 열렸다(예전 흐름으로 끝까지 만든 프로젝트 포함) — 다시 완료하지 않는다.
  const artistCompleted = stageIndex(reachedStage) >= stageIndex('writer')
  const phase = artistPhase({ proseLocked, draftRun, status: writerStatus, hasAssets, artistCompleted })

  // 첫 진입 브리핑(2026-08-06 간소화) — 무엇을 만들었는지 + @멘션 · Ctrl+클릭 조작법. 룩 미반영/실패는 카드 배지가 알린다.
  //   인물 · 배경 카드가 생긴 뒤(디자인이 끝난 뒤)에 그 수로 한 번만 말한다(2026-10-27 디자이너 QA 1차 관찰 49) —
  //   산문 목록 단계 · 디자인 중에는 카드 행이 없거나 일부라 '캐릭터 0명 · 배경 0곳'으로 남았다. "추가"는 말하지 않는다(#04).
  // 첫 안내는 채팅 기록을 다 읽은 뒤에만 — 읽기 전에 말하면 이미 안내한 프로젝트에 한 번 더 남는다.
  const chatHistoryLoaded = useGlobalChatStore((s) => s.messagesLoadedProjectId === projectId)
  const briefCounts = artistBriefCounts({ ready, phase, characters: characterAssets, worlds: worldAssets })
  const artistBriefContent = briefCounts ? t(ARTIST_BRIEF_TEXT, briefCounts) : null
  useEffect(() => {
    if (!projectId || !artistBriefContent || !chatHistoryLoaded || artistBriefedRef.current === projectId) return
    if (offerArtistBrief(projectId, artistBriefContent)) artistBriefedRef.current = projectId
  }, [projectId, artistBriefContent, chatHistoryLoaded])

  const gaps = assetCompletionGaps(characterAssets, worldAssets)
  const personTotal = characterAssets.filter((c) => c.entityType === 'person').length
  const progress = makingProgress(writerStatus, {
    charsReady: personTotal - gaps.characters.length,
    charsTotal: personTotal,
    worldsReady: worldAssets.length - gaps.locations.length,
    worldsTotal: worldAssets.length,
  })
  const [styleOpen, setStyleOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [makingDismissed, setMakingDismissed] = useState<string | null>(null)
  const styleAnchors = useProducerStore((s) => s.styleAnchors)
  const styleKey = useProducerStore((s) => s.styleAnchorKey)
  const customStyle = useProducerStore((s) => s.customStyleAnchor)
  // 스타일 이름은 화면 언어로(2026-10-21). 직접 올린 그림체는 붙인 이름 그대로.
  const locale = useLocale()
  const pickedStyle = styleAnchors.find((anchor) => anchor.key === styleKey)
  const styleLabel = customStyle?.label ?? (pickedStyle ? styleAnchorName(pickedStyle, locale) : null)
  // 시리즈 다음 화(2026-10-26, 프로토타입 A4s · A4r): 만드는 동안 새로 나온 것만 그리는지, 앞 화 그림을 참고해 다시 그리는지 제목으로 알린다.
  const { view: series } = useSeriesInfo(projectId)
  const makingTitle = seriesMakingTitle(series, styleIdOf({ style_anchor_key: styleKey, custom_style_anchor: customStyle }))
  // 머리 줄은 이번 화에 그릴 카드만 센다(2026-10-27 오너 승인) — 맨 아래 "보관" 묶음 카드는 빼고 그 수를 뒤에 붙인다.
  const seriesGroups = series
    ? groupSeriesAssets(series, {
        characters: characterAssets.filter((c) => c.entityType === 'person').map((c) => c.characterId),
        locations: worldAssets.map((w) => w.locationId),
      })
    : null
  const headerKept = (seriesGroups?.keptCharacters.length ?? 0) + (seriesGroups?.keptLocations.length ?? 0)
  const headerPersons = personTotal - (seriesGroups?.keptCharacters.length ?? 0)
  const headerPlaces = worldAssets.length - (seriesGroups?.keptLocations.length ?? 0)
  const loadProducer = useProducerStore((s) => s.loadProject)
  useEffect(() => {
    // 브레이크다운 목록 · 스타일은 Producer 값이다(산문이 만든 인물 · 장소) — Artist 에서도 읽는다.
    if (projectId) void loadProducer()
  }, [projectId, loadProducer])
  useEffect(() => {
    if (styleAnchors.length === 0) void useProducerStore.getState().loadStyleAnchors()
  }, [styleAnchors.length])
  // 만드는 동안은 디자인 · 그림이 들어오는 대로 다시 읽는다.
  const making = phase === 'making' || (phase === 'cards' && !progress.done)
  useEffect(() => {
    if (!projectId || !making) return
    const id = setInterval(() => void loadData(), 4000)
    return () => clearInterval(id)
  }, [projectId, making, loadData])
  const overlayOpen = making && makingDismissed !== projectId
  // 2026-10-20 오너 "Artist 만들면서 Storyboard 도 같이": 씬 · 샷이 다 나뉘고 Artist 그림을 다 그렸으면 이 화면에 있는 동안 러프를 미리 그린다.
  const roughs = useBackgroundRoughs(
    projectId,
    backgroundRoughReady({ status: writerStatus, making: overlayOpen || phase === 'list' || phase === 'making', demo: isDemoSession(), artistCompleted }),
    progress.drawn,
  )
  const storyboardPrep = storyboardPrepView({ status: writerStatus, drawing: roughs.drawing, outcome: roughs.outcome, artistCompleted })
  // 그림 그리는 단계의 이어 그리기 · 안 나온 그림 다시 그리기(2026-10-27 디자이너 QA 1차 #05 #06).
  //   "그리는 중"은 화면이 보낸 것 + 서버가 그리는 것(생성 상태의 대기 작업)이다 — 하나라도 그리는 중이면 기다리고 단추를 숨긴다.
  //   앞의 그림이 다 끝났는데 실패 기록 없이 빈 칸이 남았으면(내 한도에 막혀 건너뛴 그림) 이어서 그린다. 거절되면 멈추고 단추로 남긴다.
  const viewFailures = useArtistStore((s) => s.viewFailures)
  const worldFailures = useArtistStore((s) => s.worldFailures)
  const serverDrawCheckedAt = useArtistStore((s) => s.serverDrawCheckedAt)
  const drawingBeganAt = useArtistStore((s) => s.drawingBeganAt)
  const drawContinue = useArtistStore((s) => s.drawContinue)
  const capacitySkips = useArtistStore((s) => s.capacitySkips)
  const drawInput = { characters: characterAssets, worlds: worldAssets, drawingViews: generatingViews, drawingLocations: generatingLocations, failedViews: viewFailures, failedLocations: worldFailures, capacitySkips }
  const continueMine = drawContinue.projectId === projectId
  const missingCount = drawTargetCount(missingDrawTargets(drawInput))
  const drawDecision = drawContinueDecision({
    // 만드는 중(완료하기 전)에만 — 완료한 프로젝트를 열었다고 빈 칸을 저절로 그리지 않는다. 데모는 그리지 않는다.
    step: making && !isDemoSession() ? progress.step : 0,
    done: progress.done,
    drawing: generatingCount,
    checkedSinceDrawingBegan: !!projectId && drawingBeganAt?.projectId === projectId && serverDrawCheckedAt !== null && serverDrawCheckedAt > drawingBeganAt.at,
    autoTargets: drawTargetCount(missingDrawTargets(drawInput, { skipFailed: true })),
    stopped: continueMine && drawContinue.stopped,
    // 한 바퀴가 도는 동안 · 잠시 쉬는 동안은 기다린다 — 끝나면 판단이 바뀌어 남은 빈칸을 다시 본다.
    running: continueMine && drawContinue.running,
    paused: continueMine && drawContinue.paused,
  })
  useEffect(() => {
    if (projectId && making && progress.step === 2 && !progress.done) useArtistStore.getState().markDrawingBegan(projectId)
  }, [projectId, making, progress.step, progress.done])
  useEffect(() => {
    if (drawDecision === 'continue') void useArtistStore.getState().continueMissingImages()
  }, [drawDecision])
  const redrawButton = drawDecision === 'stop' && missingCount > 0 ? (
    <Button size="sm" onClick={() => void useArtistStore.getState().redrawMissingImages()} data-testid="artist-redraw-missing">
      {t('Draw the {count} missing images', { count: missingCount })}
    </Button>
  ) : null
  const overlayCopy = makingOverlayCopy({ decision: drawDecision, gapCount: gaps.characters.length + gaps.locations.length, missingCount })
  const makingOverlay = (
    <AiBusyOverlay
      open={overlayOpen}
      // 그리는 중인 그림이 없고 빈칸이 남았으면 일이 멈춘 것이다 — 제목 · 도는 원 대신 멈춤 표시와 다시 그리기 단추(없으면 카드로 안내).
      title={overlayCopy.title ? t(overlayCopy.title) : t(makingTitle ?? 'Making the images')}
      busy={!overlayCopy.stopped}
      description={overlayCopy.description ? t(overlayCopy.description) : undefined}
      steps={[
        { label: t('Designing the characters and backgrounds'), state: progress.step > 0 ? 'done' : 'current' },
        { label: t('Starting to draw'), state: progress.step > 1 ? 'done' : progress.step === 1 ? 'current' : 'todo' },
        { label: progress.total > 0 ? t('Drawing images {drawn}/{total}', { drawn: progress.drawn, total: progress.total }) : t('Drawing images'), state: progress.step === 2 ? 'current' : 'todo' },
      ]}
      progress={progress.total > 0 && progress.step === 2 ? (progress.drawn / progress.total) * 100 : null}
      // 카드가 생긴 뒤에는 그리는 중에도 닫을 수 있다 — 오래 걸리거나 상태를 못 읽어도 이 화면에 갇히지 않게(검토 지적 1 · 3 · 14).
      footer={hasAssets ? (
        <>
          <Button size="sm" variant="outline" onClick={() => setMakingDismissed(projectId)}>{t('Close')}</Button>
          {redrawButton}
        </>
      ) : undefined}
    />
  )

  if (phase === 'list') {
    return (
      <>
        <BreakdownList onMake={() => setStyleOpen(true)} />
        <StyleMakeDialog open={styleOpen} onOpenChange={setStyleOpen} onStarted={() => restartWriterStatus()} />
      </>
    )
  }
  if (phase === 'making' && !hasAssets) {
    return <div className="flex-1" data-testid="artist-making">{makingOverlay}</div>
  }

  // 진입 전 = 백그라운드 생성/ main 준비 진행 중 → progress bar 블로킹.
  //   단, 한 번이라도 진입한 프로젝트면(gateOpen) 탭 전환 후에도 다시 막지 않는다.
  if (!gateOpen && phase === 'done') {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        {writerStatus?.pipeline_failed ? (
          <div className="mx-auto w-full max-w-md space-y-4 text-center">
            <h1 className="text-xl font-bold text-destructive">
              {t('AI generation stopped')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {writerStatus.error ?? t('Background generation stopped.')}
            </p>
            <WriterResumeButton projectId={projectId} onResumed={restartWriterStatus} />
          </div>
        ) : (
          <WriterProgress
            status={writerStatus}
            note={
              pipelineDone && !mainReady
                ? t('Generating the main image… just a moment')
                : undefined
            }
          />
        )}
      </div>
    )
  }

  // 메인 헤더(리뉴얼 1차, 프로토타입 A5) — "Artist · 인물 N · 배경 M", 작품 스타일, 오른쪽 [완료하기 →].
  //   완료한 뒤(또는 예전 흐름으로 끝까지 만든 프로젝트)는 다시 완료하지 않고 Storyboard 로 가기만 한다.
  const completeBlocked = gaps.characters.length + gaps.locations.length > 0
  // [완료하기]가 꺼진 까닭을 글로 보인다 — 마우스를 올려야 보이는 안내뿐이라 이유를 몰랐다(2026-10-27 디자이너 QA 1차 #06).
  const completeNote = phase === 'cards' ? completeBlockedNote({ gaps, drawing: generatingCount }) : null
  const headerRow = (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold">Artist</h1>
        <span className="text-xs text-muted-foreground" data-testid="artist-header-counts">
          {t('Characters {persons} · backgrounds {places}', { persons: headerPersons, places: headerPlaces })}
          {headerKept > 0 ? ` · ${t('Kept {count}', { count: headerKept })}` : null}
        </span>
        {styleLabel ? (
          <span className="rounded-md border border-border px-2 py-0.5 text-xs" data-testid="artist-style-bar">
            <span className="text-muted-foreground">{t('Work style')}</span> · <b className="font-medium">{styleLabel}</b>
          </span>
        ) : null}
        {storyboardPrep ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status" data-testid="artist-storyboard-prep" data-state={storyboardPrep}>
            {storyboardPrep === 'ready' ? <Check className="size-3.5" aria-hidden /> : <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {t(storyboardPrep === 'splitting' ? 'Getting Storyboard ready · splitting scenes and shots' : storyboardPrep === 'drawing' ? 'Getting Storyboard ready · drawing the roughs' : 'Storyboard is ready')}
          </span>
        ) : null}
      </div>
      {phase === 'cards' ? (
        <div className="flex flex-col items-end gap-1.5">
          <span title={completeBlocked ? t('Make the images for the characters and backgrounds that have none first.') : undefined}>
            <Button onClick={() => setCompleteOpen(true)} disabled={completeBlocked} data-testid="artist-complete-open">
              {t('Complete')}<ArrowRight className="size-4" />
            </Button>
          </span>
          {completeNote ? (
            <p className="max-w-xs text-right text-xs text-muted-foreground" role="status" data-testid="artist-complete-note">
              {completeNote.kind === 'drawing'
                ? t('Drawing the images. You can complete once they are done.')
                : t('No image yet: {names}', { names: completeNote.names.join(' · ') })}
            </p>
          ) : null}
          {overlayOpen ? null : redrawButton}
        </div>
      ) : stageIndex(reachedStage) >= stageIndex('writer') ? (
        <Button variant="outline" onClick={() => router.push(withDemoShare('/studio/writer'))} data-testid="artist-go-storyboard">
          {t('Go to Storyboard')}<ArrowRight className="size-4" />
        </Button>
      ) : (
        <NextStepButton />
      )}
    </div>
  )

  return (
    <>
      <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as ArtistTab)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {artistRunStopped({ draftRun, status: writerStatus }) ? (
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-6 py-2.5 text-sm" role="alert" data-testid="artist-run-stopped">
              <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t('AI generation stopped')}</p>
                <p className="break-words text-xs text-muted-foreground">{writerStatus?.error ?? t('Background generation stopped.')}</p>
              </div>
              <WriterResumeButton projectId={projectId} onResumed={restartWriterStatus} />
            </div>
          ) : null}
          <div className="border-b border-border px-6 py-3">
            {headerRow}
            <div className="flex items-center justify-between gap-4">
              <AltArrowHint>
              <TabsList>
                {/* 탭 한글화(#d3 2026-08-03) — writer 탭(러프 스토리보드…)과 표기 통일 */}
                <TabsTrigger value="characters">{t('Characters')}</TabsTrigger>
                <TabsTrigger value="world">{t('Background')}</TabsTrigger>
              </TabsList>
              </AltArrowHint>
              {/* 보드 축척(#d1) — writer 러프 보드와 동일 UI, 인물/배경 탭별 저장 */}
              {(tab === 'characters' || tab === 'world') && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 hover-red-beam"
                    aria-label={t('Zoom out (more columns)')}
                    onClick={() => setZoom(tab, zoomByTab[tab] - 1)}
                  >
                    <ZoomOut className="size-4" />
                  </Button>
                  <Slider
                    className="w-24"
                    min={1}
                    max={3}
                    step={1}
                    value={[zoomByTab[tab]]}
                    onValueChange={([v]) => setZoom(tab, v)}
                    aria-label={t('Board zoom')}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 hover-red-beam"
                    aria-label={t('Zoom in (fewer columns)')}
                    onClick={() => setZoom(tab, zoomByTab[tab] + 1)}
                  >
                    <ZoomIn className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <TabsContent
            value="characters"
            className={cn(
              'flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden',
              tabSlideClass,
            )}
          >
            <CharacterPanel
              columns={4 - zoomByTab.characters}
              onZoomStep={(dir) => stepZoom('characters', dir)}
            />
          </TabsContent>

          <TabsContent
            value="world"
            className={cn(
              'flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden',
              tabSlideClass,
            )}
          >
            <WorldPanel
              columns={4 - zoomByTab.world}
              onZoomStep={(dir) => stepZoom('world', dir)}
            />
          </TabsContent>
        </Tabs>

      {error && (
        <div className="border-t border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {/* 게이트 상태 푸터는 제거(#d5 2026-08-11 오너 지시) — 게이트 판정 자체는 그대로 살아
          Director 핸드오프 제안(#handoff-starved)과 사이드바 잠금이 쓴다. 개발용 세부는 콘솔로. */}
      <ArtistCompleteDialog open={completeOpen} onOpenChange={setCompleteOpen} summary={{ persons: personTotal, places: worldAssets.length, style: styleLabel }} />
      {makingOverlay}
    </>
  )
}
