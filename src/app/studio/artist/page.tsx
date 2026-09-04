'use client'

import { useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { StageHelpBadge } from '@/components/stage-help-badge'
import { handoffFrom } from '@/lib/handoff-intent'
import { shouldOfferHandoffNudge } from '@/lib/handoff-nudge'
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
import { useT } from '@/lib/i18n'

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

  // 프로액티브 넛지 (chat-proactive-copilot Phase 1): 자동생성이 모두 끝나고(생성 중 0 + main 준비)
  //   1.5s 안정되면 채팅에 "Director로 넘어갈까요?" 다음-단계 제안을 띄운다.
  //   debounce 로 생성 시작 전 조기발사 + 생성 중 깜빡임을 방지. 비용 지출 없는 넛지(자동생성은 별도 진행).
  const generatingCount = generatingViews.length + generatingLocations.length
  const offerSuggestion = useGlobalChatStore((s) => s.offerSuggestion)
  // 재시도 이력(#handoff-starved 8/11 → #handoff-suggestion-drop 8/25): 원샷 래치는 두 번의
  //   기아를 만들었다 — ① 슬롯 점유 중 offer 유실(8/11, ref 선소모), ② 유저 발화로 암묵
  //   dismiss 된 뒤 재발사 불가(8/25). 래치를 걷어내고 슬롯이 바뀔 때마다(activeSuggestion dep)
  //   재시도한다 — 중복·거절 방어는 offerSuggestion 의 id 가드가 전담한다.
  const activeSuggestion = useGlobalChatStore((s) => s.suggestion)
  // 이미 수락된 핸드오프는 다시 권하지 않는다(#handoff-once) — 진실은 DB 의 reachedStage.
  const reachedStageForNudge = useProjectStore((s) => s.reachedStage)
  // effect 안에서 t() 를 직접 부르지 않는다 — t 는 매 렌더 새 참조라 deps 에 넣으면 1500ms
  //   디바운스가 렌더마다 리셋된다(#i18n-s5-batch4). 문자열 값으로 미리 뽑아 deps 에 넣는다.
  const artistReadyContentWithWorlds = t(
    '{count} characters and {worldCount} backgrounds are all ready. If you like them, shall we move to Director and start the storyboard?',
    { count: characterAssets.length, worldCount: worldAssets.length },
  )
  const artistReadyContentNoWorlds = t(
    '{count} characters are all ready. If you like them, shall we move to Director and start the storyboard?',
    { count: characterAssets.length },
  )
  // handoffFrom() 은 정적 배열 .find() 라 렌더 본문에서 불러도 안전 — spec.utterance/label 도
  //   여기서 미리 번역해 문자열 상수로 뽑는다. effect 안에서 t() 를 부르거나 t 자체를 deps 에
  //   넣으면 1500ms 디바운스가 렌더마다 리셋된다(#i18n-s5-batch4, 위 content 상수와 동일 이유).
  const artistHandoffSpec = handoffFrom('artist')
  const artistHandoffUtterance = artistHandoffSpec ? t(artistHandoffSpec.utterance) : null
  const artistHandoffLabel = artistHandoffSpec ? t(artistHandoffSpec.label) : null
  // 게이트 차단 사유를 안정 문자열로 — deps 에 객체(artistGate, 매 렌더 새 참조)를 넣으면
  //   1500ms 타이머가 렌더마다 리셋돼 멘트가 영영 못 뜬다. 문자열 값은 내용이 같으면 dep 안정.
  const artistGateBlockSummary = artistGate.blockers.map((b) => b.field).join(',')
  useEffect(() => {
    if (!projectId) return
    const timer = setTimeout(() => {
      // #nudge-diagnosis(2026-08-26, 화개장터_3 실측): 서버 진실(런 완료·뷰 완비·stage=artist)이
      //   전부 충족인데 멘트가 침묵 — 어느 클라 플래그가 막았는지 관측 수단이 없었다. 판정을
      //   발사 시점으로 옮기고(휘발성 값은 스토어에서 라이브로 읽는다), 막히면 사유를 콘솔에
      //   남긴다. 조건 충족을 기다리는 재시도는 종전대로 deps 재실행이 맡는다.
      const artistLive = useArtistStore.getState()
      const liveGenerating =
        artistLive.generatingViews.length + artistLive.generatingLocations.length
      const liveReached = useProjectStore.getState().reachedStage
      const blocked = !ready
        ? 'enter-not-ready'
        : !writerReady
          ? 'writer-not-ready'
          : !artistGate.ready
            ? `artist-gate:${artistGateBlockSummary}`
            : characterAssets.length === 0
              ? 'no-character-assets'
              : liveGenerating > 0
                ? `generating:${liveGenerating}`
                : !shouldOfferHandoffNudge('artist', liveReached)
                  ? `handoff-once:reached=${liveReached}`
                  : null
      if (blocked) {
        console.info('[artist-ready-nudge] blocked:', blocked)
        return
      }
      // 탭 하단의 'Approve & Direct' 버튼을 걷어내고 이 제안이 그 자리를 대신한다(#handoff-to-chat).
      //   버튼은 직접 이동하지 않고 문장을 채팅에 입력해 보낸다 — 직접 타이핑과 같은 경로.
      // #handoff-suggestion-drop(2026-08-25, producer 8/7 수리의 artist 판): 옛 원샷 래치
      //   (nudgeOfferedRef)는 버그였다 — 유저가 아티스트 챗에 아무 말이나 하면 제안이 암묵
      //   dismiss(id 미기록)되는데 래치는 이미 잠겨, 그 세션에선 준비 완료 멘트가 영영 다시
      //   안 떴다(웹툰 테스트 실측). 슬롯이 빌 때마다(activeSuggestion dep) 재시도한다.
      //   스팸 방지는 offerSuggestion 의 가드 몫 — 같은 id 표시 중이면 no-op, 명시적
      //   "나중에"(dismissedSuggestionIds)면 재발사 안 함, 자동 내림 뒤에는 다시 뜬다.
      const id = `artist-ready-${projectId}`
      offerSuggestion(
        {
          id,
          stage: 'artist',
          content: worldAssets.length > 0 ? artistReadyContentWithWorlds : artistReadyContentNoWorlds,
          action:
            artistHandoffUtterance && artistHandoffLabel
              ? { kind: 'handoff', utterance: artistHandoffUtterance, label: artistHandoffLabel }
              : null,
        },
        { preempt: true },
      )
    }, 1500)
    return () => clearTimeout(timer)
  }, [
    projectId,
    ready,
    mainReady,
    generatingCount,
    characterAssets.length,
    worldAssets.length,
    offerSuggestion,
    writerReady,
    artistGate.ready,
    artistGateBlockSummary,
    activeSuggestion,
    reachedStageForNudge,
    artistReadyContentWithWorlds,
    artistReadyContentNoWorlds,
    artistHandoffUtterance,
    artistHandoffLabel,
  ])

  // 첫 진입 브리핑(2026-08-06 간소화) — "최종 룩으로 정리" 상태 온보딩 제안은 제거(피드백:
  //   긴 버블이 채팅을 점유하고, 초안이 남아 있는 동안 Director 핸드오프 제안을 가렸다).
  //   룩 미반영/실패는 카드 배지가 알리고, 일괄 정리는 채팅으로 요청할 수 있다.
  const artistBriefContent = t(
    'I have concepts ready for the characters and backgrounds — {count} characters · {worldCount} backgrounds.\n' +
      "Let me know which character or background you'd like to revise or add.\n" +
      'Press "@" to pick a character or background (Ctrl+click a card does the same).',
    { count: characterAssets.length, worldCount: worldAssets.length },
  )
  useEffect(() => {
    if (!projectId || !ready) return
    const hasArtistChat = useGlobalChatStore.getState().messages.some((m) => m.stage === 'artist')
    if (hasArtistChat || artistBriefedRef.current === projectId) return

    const id = `artist-brief:${projectId}`
    const dismissed = useGlobalChatStore.getState().dismissedSuggestionIds.includes(id)
    offerSuggestion({
      id,
      stage: 'artist',
      // #feedback 2026-08-07: 온보딩 강화 — 무엇을 만들었는지 + @멘션·Ctrl+클릭 조작법 명시
      //   (8/6 간소화 유지 — 상태 분기 없이 첫 브리핑 한 종류만).
      content: artistBriefContent,
      action: null,
      // dismissible(2026-08-11): false → true. false 면 선점 불가라, 유저가 말을 안 걸고 에셋만
      //   보다가 준비가 끝나면 Director 핸드오프 제안이 이 브리핑에 막혀 영영 못 떴다(#handoff-starved).
      dismissible: true,
    })
    // 실제 표면화(같은 id 활성)됐거나 이미 dismiss 된 경우만 1회 가드 고정.
    if (dismissed || useGlobalChatStore.getState().suggestion?.id === id) {
      artistBriefedRef.current = projectId
    }
  }, [projectId, ready, offerSuggestion, characterAssets.length, worldAssets.length, artistBriefContent])

  // 진입 전 = 백그라운드 생성/ main 준비 진행 중 → progress bar 블로킹.
  //   단, 한 번이라도 진입한 프로젝트면(gateOpen) 탭 전환 후에도 다시 막지 않는다.
  if (!gateOpen) {
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

  // 메인 헤더 — 사이드바 호버에 뜨는 스테이지 이름(STAGES.artist.name)을 여기 노출(#1).
  //   오른쪽 New UI 버튼 = 실험 에셋·샷 보드 토글(#12). 두 모드가 같은 헤더를 공유한다.
  const headerRow = (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex items-center gap-1.5">
        {/* writer 헤더(Writers' Room)와 타이포 통일(#d7 2026-08-03) — semibold.
            설명문은 "?" 뱃지 호버로 이관(2026-08-06). */}
        <h1 className="text-lg font-semibold">The Visual Studio</h1>
        <StageHelpBadge
          text={t('Create and refine concept images for characters and worlds, then hand off to the next stage.')}
        />
      </div>
    </div>
  )

  return (
    <>
      <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as ArtistTab)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
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
    </>
  )
}
