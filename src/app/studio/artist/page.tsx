'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAiBusyHold } from '@/hooks/use-ai-busy-hold'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, Check, Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChoiceChip } from '@/components/controls/choice-chip'
import { PageHeader } from '@/components/layout/page-header'
import { Slider } from '@/components/ui/slider'
import { NextStepButton } from '@/components/handoff/next-step-button'
import { CharacterPanel } from '@/features/artist/character-panel'
import { WorldPanel } from '@/features/artist/world-panel'
import { PropPanel } from '@/features/artist/prop-panel'
import { ArtistSectionHeading, SECTION_LABEL } from '@/features/artist/section-heading'
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

import { useAltArrowCycle } from '@/lib/use-alt-arrow-cycle'
import { AltArrowHint } from '@/components/alt-arrow-hint'
import { useLocale, useT } from '@/lib/i18n'
import { styleAnchorName } from '@/lib/style-anchor-name'
import { AiBusyOverlay } from '@/components/ai-busy-overlay'
import { artistPhase, artistRunStopped, assetCompletionGaps, legacyProgressHolds, makingProgress } from '@/lib/artist/breakdown'
import { artistBriefCounts, artistBriefText, offerArtistBrief } from '@/lib/artist/brief'
import { completeBlockedNote, drawContinueDecision, drawTargetCount, makingOverlayCopy, missingDrawTargets, autoGenerateOnEnter, writerStatusKnown } from '@/lib/artist/draw-continue'
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
import { StyleVersionBar } from '@/features/artist-room/style-version-bar'
import { RegenOverlayFooter } from '@/features/artist-room/regen-stopped-actions'
import { RegenerateStyleDialog } from '@/features/artist-room/regenerate-style-dialog'
import { VersionHistoryDialog } from '@/features/artist-room/version-history-dialog'
import { completeVersionBlock, useArtistVersionStore, versionsNeedRefresh } from '@/stores/artist-version-store'
import { regenOverlayDescription, regenStepLines, versionStyleLabel } from '@/lib/artist/style-versions'
import { ARTIST_SECTIONS, activeArtistSection, artistSectionCounts, artistSectionId, jumpToArtistSection, keyScrollsArtistBoard, shownArtistSection, type ArtistSection } from '@/lib/artist/card-filter'

/** 움직임 줄이기 설정 — 켜져 있으면 바로가기가 미끄러지지 않는다(D13). */
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
/** 축척 저장 — 세 묶음이 한 값을 쓴다(D13). 저장소를 못 쓰면(사생활 창 등) 이번 화면에서만 기억한다. */
const saveZoom = (v: number) => {
  try {
    localStorage.setItem('artist:zoomLevel', String(v))
  } catch {}
}

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
  const propAssets = useArtistStore((s) => s.propAssets)
  // D13(오너 2026-11-22 "한 페이지에 다 담아주고 버튼을 누르면 그 섹션으로 바로 이동") — 걸러 보기 칸(v3 A5) 대신 묶음 바로가기.
  //   마지막에 간 묶음은 스토어가 기억한다(약속 D15) — 떠났다 돌아오면 그 묶음으로 간다. 묶음은 늘 그려져 있어 카드에서 고른 것이 남는다.
  const remembered = useArtistStore((s) => s.uiTab)
  const setRemembered = useArtistStore((s) => s.setUiTab)
  const [active, setActive] = useState<ArtistSection>(remembered)
  /** 이 화면이 스토어에 적은 마지막 묶음 — 다른 화면이 정한 묶음(Director 넘기기 창의 "채우러 가기")만 가려 따라간다. */
  const written = useRef<ArtistSection>(remembered)
  const [board, setBoard] = useState<HTMLDivElement | null>(null)
  const sectionBarRef = useRef<HTMLDivElement>(null)
  // 단추 줄 높이 — 좁은 화면에서는 두 줄이 된다. 바로 간 묶음 머리가 단추 줄에 가리지 않게 묶음 위 여백과 "지금 묶음" 기준선을 이 높이로 맞춘다.
  const [barHeight, setBarHeight] = useState(48)
  useEffect(() => {
    const bar = sectionBarRef.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setBarHeight(bar.offsetHeight))
    observer.observe(bar)
    return () => observer.disconnect()
  }, [board])
  /** 누른 묶음 — 사람이 직접 스크롤하기 전까지 그 단추를 켜 둔다(짧은 페이지에서 "맨 아래" 규칙이 다른 단추를 켜지 않게). */
  const pinned = useRef<ArtistSection | null>(null)
  const jumpTo = useCallback((section: ArtistSection) => {
    if (!jumpToArtistSection(section, { getElement: (id) => document.getElementById(id), reducedMotion: prefersReducedMotion() })) return
    pinned.current = section
    setActive(section)
    written.current = section
    setRemembered(section)
  }, [setRemembered])
  // Alt+←/→ 로 앞 · 뒤 묶음(#keyboard-only 2026-08-11 의 한 페이지판).
  useAltArrowCycle(ARTIST_SECTIONS, active, jumpTo)
  // 지금 보는 묶음 — 스크롤 칸([data-ai-busy-scroll])을 따라 단추 줄 바로 아래 걸친 묶음의 단추를 켠다(lib/artist/card-filter activeArtistSection).
  useEffect(() => {
    const scroller = board?.closest<HTMLElement>('[data-ai-busy-scroll]')
    if (!scroller) return
    let frame = 0
    const measure = () => {
      frame = 0
      const base = scroller.getBoundingClientRect().top - scroller.scrollTop
      const tops = ARTIST_SECTIONS.flatMap((section) => {
        const element = document.getElementById(artistSectionId(section))
        return element ? [{ section, top: element.getBoundingClientRect().top - base }] : []
      })
      const next = shownArtistSection(pinned.current, activeArtistSection(tops, {
        scrollTop: scroller.scrollTop,
        clientHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
        offset: (sectionBarRef.current?.offsetHeight ?? 0) + 12,
      }))
      setActive(next)
      if (written.current !== next) {
        written.current = next
        setRemembered(next)
      }
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    // 사람이 직접 스크롤하면(휠 · 손가락 · 스크롤 막대 · 스크롤 키) 누른 단추 고정을 풀고 다시 잰다.
    const unpin = () => {
      pinned.current = null
    }
    const onKey = (e: KeyboardEvent) => {
      if (keyScrollsArtistBoard(e.key)) unpin()
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    scroller.addEventListener('wheel', unpin, { passive: true })
    scroller.addEventListener('touchstart', unpin, { passive: true })
    scroller.addEventListener('pointerdown', unpin, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      scroller.removeEventListener('wheel', unpin)
      scroller.removeEventListener('touchstart', unpin)
      scroller.removeEventListener('pointerdown', unpin)
      window.removeEventListener('keydown', onKey)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [board, setRemembered])
  // 카드 판이 처음 그려지면 마지막에 간 묶음으로 바로(미끄러지지 않고) 간다. 그 뒤 다른 화면이 묶음을 정하면 그리로 간다.
  const restoredBoard = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!board) return
    if (restoredBoard.current !== board) {
      restoredBoard.current = board
      written.current = remembered
      const id = requestAnimationFrame(() => {
        if (remembered !== ARTIST_SECTIONS[0] && jumpToArtistSection(remembered, { getElement: (key) => document.getElementById(key), reducedMotion: true })) pinned.current = remembered
        setActive(remembered)
      })
      return () => cancelAnimationFrame(id)
    }
    if (remembered !== written.current) jumpTo(remembered)
  }, [board, remembered, jumpTo])

  // 보드 축척(#d1 2026-07-14) — writer 러프 보드와 같은 슬라이더. 레벨 1(축소·3열) ~ 3(확대·1열), 칸 수 = 4 - 레벨.
  //   슬라이더 하나가 세 묶음(인물 · 배경 · 소품)을 함께 바꾼다(D13 — 예전 "모두" 칸 동작). 기본 레벨 2(#f5 2026-08-26 오너).
  //   저장값이 있으면 그것이 우선 — 예전 인물 칸 저장값(artist:zoomLevel:characters)도 이어 읽는다.
  const [zoom, setZoomLevel] = useState(2)
  useEffect(() => {
    const read = () => {
      try {
        for (const key of ['artist:zoomLevel', 'artist:zoomLevel:characters']) {
          const v = Number(localStorage.getItem(key))
          if (v >= 1 && v <= 3) return v
        }
      } catch {}
      return 2
    }
    // rAF 경유 — 하이드레이션 mismatch 없이 저장값 반영 + set-state-in-effect 린트 준수.
    const id = requestAnimationFrame(() => setZoomLevel(read()))
    return () => cancelAnimationFrame(id)
  }, [])
  const setZoom = (v: number) => {
    const clamped = Math.min(3, Math.max(1, v))
    setZoomLevel(clamped)
    saveZoom(clamped)
  }
  // Ctrl+휠 축척(#d1 2026-07-15) — 함수형 업데이트라 휠 연타에도 최신값 기준으로 단계 이동.
  const stepZoom = useCallback((dir: 1 | -1) => {
    setZoomLevel((prev) => {
      const next = Math.min(3, Math.max(1, prev + dir))
      saveZoom(next)
      return next
    })
  }, [])
  const boardColumns = 4 - zoom

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

  // 진입(ready) 시 비어있는 이미지 자동생성 (1회+캐시).
  //   mainReady 진입: main 은 이미 있으므로 비어있는 4방향만 i2i 생성.
  //   fallback 진입: main 도 비어있으면 main 부터 보강.
  //   브레이크다운 · [만들기] 중에 처음 준비되면 그리지 않는다 — 서버 초안과 이어 그리기가 맡는다(2026-10-27 오너 재확인, autoGenerateOnEnter).
  //   그 화면에서는 이번 진입의 자동 생성을 다시 열지 않는다(나중에 다시 들어오면 지금처럼 빈칸을 채운다).
  //   새로고침 직후에는 진행 상태를 읽은 뒤에 정한다 — 읽기 전 phase 는 기본값 'done' 이다(writerStatusKnown).
  useEffect(() => {
    if (!projectId || !ready) return
    if (autoGenTriggeredRef.current === projectId) return
    if (!writerStatusKnown({ status: writerStatus })) return
    autoGenTriggeredRef.current = projectId
    if (!autoGenerateOnEnter({ phase })) return
    void autoGenerateBaseImages()
  }, [projectId, ready, phase, writerStatus, autoGenerateBaseImages])

  // 첫 진입 브리핑(2026-08-06 간소화) — 무엇을 만들었는지 + @멘션 · Ctrl+클릭 조작법. 룩 미반영/실패는 카드 배지가 알린다.
  //   인물 · 배경 카드가 생긴 뒤(디자인이 끝난 뒤)에 그 수로 한 번만 말한다(2026-10-27 디자이너 QA 1차 관찰 49) —
  //   산문 목록 단계 · 디자인 중에는 카드 행이 없거나 일부라 '캐릭터 0명 · 배경 0곳'으로 남았다. "추가"는 말하지 않는다(#04).
  // 첫 안내는 채팅 기록을 다 읽은 뒤에만 — 읽기 전에 말하면 이미 안내한 프로젝트에 한 번 더 남는다.
  const chatHistoryLoaded = useGlobalChatStore((s) => s.messagesLoadedProjectId === projectId)
  const briefCounts = artistBriefCounts({ ready, phase, characters: characterAssets, worlds: worldAssets })
  const artistBriefContent = briefCounts ? artistBriefText(t, briefCounts) : null
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
      // 산문을 넘겨 Artist 그림을 기다리는 화면(v3 오너 2026-11-03 결정 8) — 큰 Lumi(Artist 옷). 일이 멈추면 오류 모습.
      lumi="artist"
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

  // 작품 스타일 기록(2026-10-28 오너, 프로토타입 A5 · A6 · AV · AY) — 머리 줄 버전 · [불러오기] · [재생성하기].
  //   이 화면이 열려 있을 때만 재생성 그림을 이어 그린다(떠났다 돌아오면 남은 칸부터). 데모는 읽지도 그리지도 않는다.
  const cardsShown = phase === 'cards' || phase === 'done'
  useEffect(() => {
    if (!projectId) return
    const versions = useArtistVersionStore.getState()
    versions.setScreenOpen(projectId, true)
    return () => useArtistVersionStore.getState().setScreenOpen(projectId, false)
  }, [projectId])
  useEffect(() => {
    if (projectId && cardsShown && !isDemoSession()) void useArtistVersionStore.getState().refresh()
  }, [projectId, cardsShown])
  const regen = useArtistVersionStore((s) => s.regen)
  const regenRun = useArtistVersionStore((s) => s.run)
  // 버전을 불러오는 중이거나 다 불러오지 못했으면 [완료하기]를 미리 끈다(서버도 막는다 — 2026-10-31 재검토 지적).
  const versionBlock = useArtistVersionStore((s) => (isDemoSession() ? null : completeVersionBlock(s)))
  const versionBusy = useArtistVersionStore((s) => s.busy)
  const overlayDismissedFor = useArtistVersionStore((s) => s.overlayDismissedFor)
  const regenVersion = useArtistVersionStore((s) => s.versions.find((version) => version.n === s.regen?.n) ?? null)
  // 다 그렸다고 알리기 전의 재생성 — 남은 칸을 그리거나 완료를 알린다. 그리는 동안은 [완료하기] · 머리 줄 단추가 꺼진다.
  //   모두의 자리 · 오랜 한도 기다림으로 멈추면(regenStopped) [남은 그림 다시 그리기] · [이전 버전으로 돌아가기]로 빠져나간다 —
  //   그동안 [불러오기]는 켜지고 [완료하기] · [재생성하기]는 꺼진 채다(2026-10-28 검토 지적).
  const regenOpen = !!regen && !isDemoSession() && !artistCompleted
  const regenPending = regenOpen && !regen.complete
  const regenStopped = regenPending && regenRun.stopped
  const regenDrawing = regenPending && !regenRun.stopped
  useEffect(() => {
    if (projectId && regenOpen) void useArtistVersionStore.getState().continueRegen()
  }, [projectId, regenOpen, regen?.n])
  // 그리는 동안 진행(k/N)을 몇 초마다 다시 읽는다 — 한 묶음(동시 3장)이 다 끝날 때까지 숫자가 멈춰 보이지 않게.
  //   멈춘 재생성이라도 그리던 그림이 남았거나 버전을 불러오는 중이면 계속 읽는다(2026-10-31 재검토 지적).
  const versionsPolling = useArtistVersionStore((s) => !isDemoSession() && versionsNeedRefresh(s))
  useEffect(() => {
    if (!projectId || !versionsPolling) return
    const id = setInterval(() => void useArtistVersionStore.getState().refresh(), 5000)
    return () => clearInterval(id)
  }, [projectId, versionsPolling])
  const regenOverlayOpen = regenPending && overlayDismissedFor !== regen.n
  const regenStyleLabel = regenVersion ? versionStyleLabel(regenVersion, styleAnchors, locale) : styleLabel ?? ''
  const regenNameOf = (entity: { kind: 'character' | 'location'; id: string }) =>
    entity.kind === 'character'
      ? characterAssets.find((c) => c.characterId === entity.id)?.name
      : worldAssets.find((w) => w.locationId === entity.id)?.name
  const regenOverlay = regen ? (
    <AiBusyOverlay
      open={regenOverlayOpen}
      // 11/5 시안 AR(리드 추천안 ㉠) — 화면을 덮지 않고 카드마다 상태가 보인다. 잠금은 그대로, 휠 · 끌기는 카드 칸을 스크롤한다.
      //   카드에는 Artist 옷 Lumi(오너 2026-11-09 결정 4) — 일이 멈추면 오류 모습.
      scrim="clear"
      lumi="artist"
      title={t(regenRun.stopped ? 'Some images were not drawn' : 'Redrawing the images')}
      busy={!regenRun.stopped}
      // 11/5 시안 AR 문구를 사실대로 — 이 창은 닫아도 되지만, 재생성 그림은 Artist 화면이 열려 있을 때만 그린다.
      description={regenRun.stopped ? t('Draw the rest again, or go back to the previous version.') : regenOverlayDescription(locale, { style: regenStyleLabel, n: regen.n })}
      // 11/5 시안 AR 단계 줄 — 인물 · 배경 단위(다 그림 ✓ · 그리는 중 ● · 기다리는 중 ○). 그린 수/전체 수는 막대 아래 한 줄로 남긴다.
      steps={regenStepLines(locale, { regen, stopped: regenRun.stopped, nameOf: regenNameOf })}
      progress={regen.total > 0 ? ((regen.done + regen.failed) / regen.total) * 100 : null}
      progressLabel={t('Drawing images {drawn}/{total}', { drawn: regen.done, total: regen.total })}
      footer={<RegenOverlayFooter />}
    />
  ) : null

  // 예전 흐름(리뉴얼 전) 프로젝트의 진행 화면(그리는 중)은 잠금 화면을 쓰지 않는다 — 그 동안도 왼쪽 사이드바를 막는다(2026-10-27).
  //   Writer 실행이 정말 도는 동안만 — 상태를 읽기 전 · 씬 확인 대기에는 막지 않는다(legacyProgressHolds, 검토).
  const legacyProgressBusy = legacyProgressHolds({ gateOpen, phase, status: writerStatus })
  useAiBusyHold(legacyProgressBusy)

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
  // 재생성 그림을 그리는 동안도 [완료하기]를 막는다 — 옛 스타일 그림이 섞인 채로 Storyboard 가 열리지 않게(2026-10-28).
  const completeBlocked = gaps.characters.length + gaps.locations.length > 0 || regenDrawing || regenStopped || versionBlock !== null
  // [완료하기]가 꺼진 까닭을 글로 보인다 — 마우스를 올려야 보이는 안내뿐이라 이유를 몰랐다(2026-10-27 디자이너 QA 1차 #06).
  const completeNote = phase === 'cards'
    ? completeBlockedNote({ gaps, drawing: generatingCount }) ?? (regenDrawing ? { kind: 'drawing' as const } : regenStopped ? { kind: 'regen' as const } : versionBlock === 'restoring' ? { kind: 'restoring' as const } : versionBlock === 'loadFailed' ? { kind: 'loadFailed' as const } : null)
    : null
  // 머리 줄(v3 A5) — 제목 "인물 · 배경" · 인물 N · 배경 M(보관 수), 오른쪽에 Storyboard 준비 상태.
  const storyboardPrepNote = storyboardPrep ? (
    <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground" role="status" data-testid="artist-storyboard-prep" data-state={storyboardPrep}>
      {storyboardPrep === 'ready' ? <Check className="size-3.5" aria-hidden /> : <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {t(storyboardPrep === 'splitting' ? 'Getting Storyboard ready · splitting scenes and shots' : storyboardPrep === 'drawing' ? 'Getting Storyboard ready · drawing the roughs' : 'Storyboard is ready')}
    </span>
  ) : null
  const headerRow = (
    <PageHeader
      title={t('Characters · backgrounds · props')}
      meta={
        <span data-testid="artist-header-counts">
          {t('Characters {persons} · backgrounds {places} · props {props}', { persons: headerPersons, places: headerPlaces, props: propAssets.length })}
          {headerKept > 0 ? ` · ${t('Kept {count}', { count: headerKept })}` : null}
        </span>
      }
      actions={storyboardPrepNote}
    />
  )
  // 맨 아래 다음 단계(v3 A5 [완료하기 · Storyboard로 →]) — 완료한 뒤(또는 예전 흐름으로 끝까지 만든 프로젝트)는 다시 완료하지 않고 Storyboard 로 가기만 한다.
  const nextRow = phase === 'cards' ? (
    <div className="flex flex-col items-end gap-1.5">
      <span title={gaps.characters.length + gaps.locations.length > 0 ? t('Make the images for the characters and backgrounds that have none first.') : undefined}>
        <Button onClick={() => setCompleteOpen(true)} disabled={completeBlocked} data-testid="artist-complete-open">
          {t('Complete · to Storyboard')}<ArrowRight className="size-4" />
        </Button>
      </span>
      {completeNote ? (
        <p className="max-w-xs text-right text-caption text-muted-foreground" role="status" data-testid="artist-complete-note">
          {completeNote.kind === 'drawing'
            ? t('Drawing the images. You can complete once they are done.')
            : completeNote.kind === 'regen'
              ? t('You can complete once the regenerated images are drawn.')
              : completeNote.kind === 'restoring'
                ? t('Loading the version.')
                : completeNote.kind === 'loadFailed'
                  ? t('The version could not be fully loaded. Load it again or go back to the previous version.')
                  : t('No image yet: {names}', { names: completeNote.names.join(' · ') })}
        </p>
      ) : null}
      {overlayOpen ? null : redrawButton}
    </div>
  ) : stageIndex(reachedStage) >= stageIndex('writer') ? (
    <Button onClick={() => router.push(withDemoShare('/studio/writer'))} data-testid="artist-go-storyboard">
      {t('Go to Storyboard')}<ArrowRight className="size-4" />
    </Button>
  ) : (
    <NextStepButton />
  )

  // 묶음 바로가기(D13) — 단추 · 묶음 머리의 카드 수(보관 카드 포함).
  const sectionCounts = artistSectionCounts({ characters: characterAssets.length, worlds: worldAssets.length, props: propAssets.length })

  return (
    <>
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
      {/* 투명 덮개(다시 그리는 동안) 너머로 휠 · 손가락 끌기가 이 칸을 스크롤한다(lib/ai-busy-scroll). */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-7" data-ai-busy-scroll>
        {/* v3 A5 — 화면 머리 · 작품 스타일 막대 · 묶음 단추 줄 · 인물 · 배경 · 소품 묶음 · 맨 아래 다음 단계가 860 폭 한 줄로 쌓인다(간격 16).
            D13(2026-11-22): 세 묶음이 한 페이지에 늘 함께 있고, 단추 줄은 위에 붙어 그 묶음으로 바로 간다. */}
        <div ref={setBoard} className="mx-auto flex max-w-[860px] flex-col gap-4">
          {headerRow}
          {/* 작품 스타일 막대(A5) — 견본 · 이름 · "작품 스타일 · v{n}" · [불러오기 · 기록 N] · [재생성하기].
              Storyboard 를 연 뒤 · 그리는 중에는 꺼지고 까닭이 보인다. */}
          <StyleVersionBar completed={artistCompleted} drawing={generatingCount > 0 || regenDrawing} />
          {/* 묶음 단추 줄(D13) — 스크롤해도 맨 위에 붙어 있고, 지금 보는 묶음의 단추가 켜진다. 오른쪽은 세 묶음 공용 축척. */}
          {/* -top-7 = 스크롤 칸 위 여백(pt-7)만큼 올려 맨 위에 붙인다 — 붙는 자리는 스크롤 칸의 안쪽 여백 기준이라, 그대로 두면 그 틈으로 카드가 비쳤다. */}
          <div ref={sectionBarRef} className="sticky -top-7 z-10 -mx-2 flex flex-wrap items-center justify-between gap-4 bg-background px-2 py-2" data-testid="artist-section-bar">
            <AltArrowHint>
              <nav aria-label={t('Jump to a section')} className="flex flex-wrap gap-1.5" data-testid="artist-sections-nav">
                {ARTIST_SECTIONS.map((section) => (
                  <ChoiceChip key={section} selected={active === section} onClick={() => jumpTo(section)} data-testid={`artist-jump-${section}`}>
                    {t(SECTION_LABEL[section], { count: sectionCounts[section] })}
                  </ChoiceChip>
                ))}
              </nav>
            </AltArrowHint>
            {/* 보드 축척(#d1) — writer 러프 보드와 동일 UI, 세 묶음 공용 저장 */}
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="icon"
                variant="ghost"
                className="size-7 hover-red-beam"
                aria-label={t('Zoom out (more columns)')}
                onClick={() => setZoom(zoom - 1)}
              >
                <ZoomOut className="size-4" />
              </Button>
              <Slider
                className="w-24"
                min={1}
                max={3}
                step={1}
                value={[zoom]}
                onValueChange={([v]) => setZoom(v)}
                aria-label={t('Board zoom')}
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-7 hover-red-beam"
                aria-label={t('Zoom in (fewer columns)')}
                onClick={() => setZoom(zoom + 1)}
              >
                <ZoomIn className="size-4" />
              </Button>
            </div>
          </div>

          {/* 묶음마다 이름(key)이 고정이고 늘 그려져 있다 — 단추는 스크롤만 해서 카드의 채팅 대상 · 카드 안에서 고른 모습이 남는다(검토 A M1).
              머리 위 여백(scrollMarginTop)은 붙어 있는 단추 줄 높이만큼 — 바로 간 묶음 머리가 단추 줄에 가리지 않게. */}
          {ARTIST_SECTIONS.map((section) => (
            <section
              key={section}
              id={artistSectionId(section)}
              data-artist-section={section}
              className="flex flex-col gap-3.5"
              style={{ scrollMarginTop: barHeight + 12 }}
            >
              <ArtistSectionHeading section={section} count={sectionCounts[section]} />
              {section === 'characters' ? (
                <CharacterPanel columns={boardColumns} onZoomStep={stepZoom} />
              ) : section === 'world' ? (
                <WorldPanel columns={boardColumns} onZoomStep={stepZoom} />
              ) : (
                <PropPanel columns={boardColumns} onZoomStep={stepZoom} />
              )}
            </section>
          ))}

          <div className="flex flex-wrap items-start justify-end gap-3" data-testid="artist-next-row">{nextRow}</div>
        </div>
      </div>

      {error && (
        <div className="border-t border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {/* 게이트 상태 푸터는 제거(#d5 2026-08-11 오너 지시) — 게이트 판정 자체는 그대로 살아
          Director 핸드오프 제안(#handoff-starved)과 사이드바 잠금이 쓴다. 개발용 세부는 콘솔로. */}
      <ArtistCompleteDialog open={completeOpen} onOpenChange={setCompleteOpen} summary={{ persons: personTotal, places: worldAssets.length, style: styleLabel }} />
      <RegenerateStyleDialog />
      <VersionHistoryDialog canLoad={!artistCompleted && generatingCount === 0 && !regenDrawing && versionBusy === null} />
      {makingOverlay}
      {regenOverlay}
    </>
  )
}
