'use client'

import { useEffect, useRef, useState } from 'react'
import { FlaskConical, ZoomIn, ZoomOut } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { StageHelpBadge } from '@/components/stage-help-badge'
import { handoffFrom } from '@/lib/handoff-intent'
import { shouldOfferHandoffNudge } from '@/lib/handoff-nudge'
import { CharacterPanel } from '@/features/artist/character-panel'
import { WorldPanel } from '@/features/artist/world-panel'
import { InventoryGrid } from '@/features/artist/inventory-grid'
import { AssetShotBoard } from '@/features/artist/asset-shot-board'
import { useArtistBoardStore } from '@/stores/artist-board-store'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { WriterProgress } from '@/components/layout/writer-progress'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import {
  evaluateArtistGate,
  evaluateDirectorGate,
  type WriterGateStatus,
} from '@/lib/lifecycle'
import { cn } from '@/lib/utils'

import { useAltArrowCycle } from '@/lib/use-alt-arrow-cycle'
import { AltArrowHint } from '@/components/alt-arrow-hint'

type ArtistTab = 'characters' | 'world' | 'inventory'

// 탭 순서 — 전환 슬라이드 방향의 기준 (#d3 2026-08-03, writer 탭과 동일 패턴).
const ARTIST_TAB_ORDER: readonly ArtistTab[] = ['characters', 'world', 'inventory']

export default function VisualPage() {
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
  const [tab, setTab] = useState<ArtistTab>('characters')
  // Alt+←/→ 로 인물 ↔ 배경 순환(#keyboard-only 2026-08-11) — 오너 지정 범위는 두 탭.
  //   인벤토리에 있다가 누르면 인물로 복귀한다(두 탭 순환에 합류).
  useAltArrowCycle(['characters', 'world'] as const, tab === 'inventory' ? 'world' : tab, setTab)
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
  const [zoomByTab, setZoomByTab] = useState<{ characters: number; world: number }>({
    characters: 3,
    world: 3,
  })
  useEffect(() => {
    const read = (key: string) => {
      const v = Number(localStorage.getItem(`artist:zoomLevel:${key}`))
      return v >= 1 && v <= 3 ? v : 3
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
  const newUi = useArtistBoardStore((s) => s.boardMode)
  const setBoardMode = useArtistBoardStore((s) => s.setBoardMode)
  const toggleNewUi = () => setBoardMode(!newUi)

  // writer-pipeline 진행상황 (producer→artist 직행 시 백그라운드 생성 진행 표시용, decisions #37)
  const { status: writerStatus } = useWriterStatus(projectId)
  const setLifecycleStatus = useProjectStore((s) => s.setLifecycleStatus)

  // 프로젝트당 1회만 자동생성 트리거 (마운트/재진입 중복 방지)
  const autoGenTriggeredRef = useRef<string | null>(null)
  // 시간측정 로그 1회 가드 (프로젝트당)
  const timingLoggedRef = useRef<string | null>(null)
  // 프로액티브 넛지 1회 가드 (프로젝트당) — chat-proactive-copilot Phase 1
  const nudgeOfferedRef = useRef<string | null>(null)
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
          blockers: [{ field: 'writer:failed', label: writerStatus.error ?? 'Writer 실행 실패' }],
        }
      : writerStatus?.started
        ? {
            state: 'active',
            blockers: [{ field: 'writer:active', label: 'Writer가 아직 실행 중입니다.' }],
          }
        : {
            state: 'unknown',
            blockers: [{ field: 'writer:status', label: 'Writer 상태를 아직 확인할 수 없음' }],
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
  //   1.5s 안정되면 채팅에 "Director로 넘어갈까요?" 다음-단계 제안을 1회 띄운다.
  //   debounce 로 생성 시작 전 조기발사 + 생성 중 깜빡임을 방지. 비용 지출 없는 넛지(자동생성은 별도 진행).
  const generatingCount = generatingViews.length + generatingLocations.length
  const offerSuggestion = useGlobalChatStore((s) => s.offerSuggestion)
  // #handoff-starved(2026-08-11, producer 와 동일 계열): 옛 코드는 offer 를 부르기 **전에**
  //   원샷 ref 를 세팅했다 — 제안 슬롯이 차 있으면(특히 dismissible:false 브리핑) offer 가
  //   조용히 버려지는데 ref 는 이미 소모돼 영영 재시도되지 않았다. 그래서 Director 핸드오프가
  //   안 떴다. 처방: ① preempt 로 브리핑을 밀어내고 ② 실제로 표면화된 것을 확인한 뒤에만
  //   ref 를 고정하며 ③ 슬롯이 바뀔 때마다(activeSuggestion dep) 재시도한다.
  const activeSuggestion = useGlobalChatStore((s) => s.suggestion)
  // 이미 수락된 핸드오프는 다시 권하지 않는다(#handoff-once) — 진실은 DB 의 reachedStage.
  const reachedStageForNudge = useProjectStore((s) => s.reachedStage)
  useEffect(() => {
    if (!projectId || !ready || !writerReady || !artistGate.ready) return
    if (!shouldOfferHandoffNudge('artist', reachedStageForNudge)) return
    if (nudgeOfferedRef.current === projectId) return
    if (characterAssets.length === 0 || generatingCount > 0) return
    const t = setTimeout(() => {
      // 월드 유무에 따라 주어+조사를 자연스럽게 (명+이 / 개+가).
      const subject =
        worldAssets.length > 0
          ? `캐릭터 ${characterAssets.length}명·배경 ${worldAssets.length}개가`
          : `캐릭터 ${characterAssets.length}명이`
      // 탭 하단의 'Approve & Direct' 버튼을 걷어내고 이 제안이 그 자리를 대신한다(#handoff-to-chat).
      //   버튼은 직접 이동하지 않고 문장을 채팅에 입력해 보낸다 — 직접 타이핑과 같은 경로.
      const spec = handoffFrom('artist')
      const id = `artist-ready-${projectId}`
      offerSuggestion(
        {
          id,
          stage: 'artist',
          content: `${subject} 모두 준비됐어요. 마음에 들면 Director로 넘어가 콘티를 짜볼까요?`,
          action: spec
            ? { kind: 'handoff', utterance: spec.utterance, label: spec.label }
            : null,
        },
        { preempt: true },
      )
      const chat = useGlobalChatStore.getState()
      if (chat.suggestion?.id === id || chat.dismissedSuggestionIds.includes(id)) {
        nudgeOfferedRef.current = projectId
      }
    }, 1500)
    return () => clearTimeout(t)
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
    activeSuggestion,
    reachedStageForNudge,
  ])

  // 첫 진입 브리핑(2026-08-06 간소화) — "최종 룩으로 정리" 상태 온보딩 제안은 제거(피드백:
  //   긴 버블이 채팅을 점유하고, 초안이 남아 있는 동안 Director 핸드오프 제안을 가렸다).
  //   룩 미반영/실패는 카드 배지가 알리고, 일괄 정리는 채팅으로 요청할 수 있다.
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
      content:
        `인물과 배경의 컨셉을 준비했어요 — 캐릭터 ${characterAssets.length}명 · 배경 ${worldAssets.length}곳.\n` +
        '수정하거나 추가하고 싶은 인물이나 배경을 알려주세요.\n' +
        '"@"를 누르면 인물·배경을 골라 붙일 수 있어요 (Ctrl+카드 클릭도 같은 동작이에요).',
      action: null,
      // dismissible(2026-08-11): false → true. false 면 선점 불가라, 유저가 말을 안 걸고 에셋만
      //   보다가 준비가 끝나면 Director 핸드오프 제안이 이 브리핑에 막혀 영영 못 떴다(#handoff-starved).
      dismissible: true,
    })
    // 실제 표면화(같은 id 활성)됐거나 이미 dismiss 된 경우만 1회 가드 고정.
    if (dismissed || useGlobalChatStore.getState().suggestion?.id === id) {
      artistBriefedRef.current = projectId
    }
  }, [projectId, ready, offerSuggestion, characterAssets.length, worldAssets.length])

  // 진입 전 = 백그라운드 생성/ main 준비 진행 중 → progress bar 블로킹.
  //   단, 한 번이라도 진입한 프로젝트면(gateOpen) 탭 전환 후에도 다시 막지 않는다.
  if (!gateOpen) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        {writerStatus?.pipeline_failed ? (
          <div className="mx-auto w-full max-w-md text-center">
            <h1 className="text-xl font-bold text-destructive">
              AI 자동 생성 실패
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {writerStatus.error ?? '백그라운드 생성에 실패했습니다. Producer로 돌아가 다시 시도하세요.'}
            </p>
          </div>
        ) : (
          <WriterProgress
            status={writerStatus}
            note={
              pipelineDone && !mainReady
                ? '대표 이미지 생성 중… 잠시만요'
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
          text={
            newUi
              ? '샷마다 어떤 인물·배경이 쓰이는지 연결합니다 — 에셋을 드래그해 참조를 구성하세요.'
              : '캐릭터·월드의 컨셉 이미지를 만들고 다듬어 다음 단계로 넘깁니다.'
          }
        />
      </div>
      <Button
        size="sm"
        variant={newUi ? 'secondary' : 'outline'}
        onClick={toggleNewUi}
        className="shrink-0"
      >
        <FlaskConical className="size-3.5" />
        {newUi ? '기존 UI' : 'New UI'}
      </Button>
    </div>
  )

  return (
    <>
      {newUi ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-border px-6 py-3">{headerRow}</div>
          <AssetShotBoard />
        </div>
      ) : (
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
                <TabsTrigger value="characters">인물</TabsTrigger>
                <TabsTrigger value="world">배경</TabsTrigger>
                {/* Inventory는 준비 중(#d4 2026-07-15) — writer 대사 탭과 동일한 비활성 패턴 */}
                <TabsTrigger value="inventory" disabled>
                  <span>인벤토리</span>
                  <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[10px]">
                    준비 중
                  </Badge>
                </TabsTrigger>
              </TabsList>
              </AltArrowHint>
              {/* 보드 축척(#d1) — writer 러프 보드와 동일 UI, 인물/배경 탭별 저장 */}
              {(tab === 'characters' || tab === 'world') && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 hover-red-beam"
                    aria-label="축소 (열 늘리기)"
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
                    aria-label="보드 축척"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 hover-red-beam"
                    aria-label="확대 (열 줄이기)"
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

          <TabsContent
            value="inventory"
            className="flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <InventoryGrid />
          </TabsContent>
        </Tabs>
      )}

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
