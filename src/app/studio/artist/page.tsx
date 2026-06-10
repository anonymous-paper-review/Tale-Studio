'use client'

import { useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HandoffButton } from '@/components/layout/handoff-button'
import { CharacterPanel } from '@/features/artist/character-panel'
import { WorldPanel } from '@/features/artist/world-panel'
import { InventoryGrid } from '@/features/artist/inventory-grid'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { WriterProgress } from '@/components/layout/writer-progress'
import { useWriterStatus } from '@/lib/writer/use-writer-status'

type ArtistTab = 'characters' | 'world' | 'inventory'

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

  // writer-pipeline 진행상황 (producer→artist 직행 시 백그라운드 생성 진행 표시용, decisions #37)
  const { status: writerStatus } = useWriterStatus(projectId)

  // 프로젝트당 1회만 자동생성 트리거 (마운트/재진입 중복 방지)
  const autoGenTriggeredRef = useRef<string | null>(null)
  // 시간측정 로그 1회 가드 (프로젝트당)
  const timingLoggedRef = useRef<string | null>(null)
  // 프로액티브 넛지 1회 가드 (프로젝트당) — chat-proactive-copilot Phase 1
  const nudgeOfferedRef = useRef<string | null>(null)
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
  const ready = mainReady || enterFallback

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

  // 프로액티브 넛지 (chat-proactive-copilot Phase 1): 자동생성이 모두 끝나고(생성 중 0 + main 준비)
  //   1.5s 안정되면 채팅에 "Director로 넘어갈까요?" 다음-단계 제안을 1회 띄운다.
  //   debounce 로 생성 시작 전 조기발사 + 생성 중 깜빡임을 방지. 비용 지출 없는 넛지(자동생성은 별도 진행).
  const generatingCount = generatingViews.length + generatingLocations.length
  const offerSuggestion = useGlobalChatStore((s) => s.offerSuggestion)
  useEffect(() => {
    if (!projectId || !ready) return
    if (nudgeOfferedRef.current === projectId) return
    if (characterAssets.length === 0 || !mainReady || generatingCount > 0) return
    const t = setTimeout(() => {
      nudgeOfferedRef.current = projectId
      // 월드 유무에 따라 주어+조사를 자연스럽게 (명+이 / 개+가).
      const subject =
        worldAssets.length > 0
          ? `캐릭터 ${characterAssets.length}명·배경 ${worldAssets.length}개가`
          : `캐릭터 ${characterAssets.length}명이`
      offerSuggestion({
        id: `artist-ready-${projectId}`,
        stage: 'artist',
        content: `${subject} 모두 준비됐어요. 마음에 들면 Director로 넘어가 콘티를 짜볼까요?`,
        action: { kind: 'navigate', targetStage: 'director', label: 'Director로 가기' },
      })
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
  ])

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

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as ArtistTab)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="border-b border-border px-6 py-3">
          <TabsList>
            <TabsTrigger value="characters">Characters</TabsTrigger>
            <TabsTrigger value="world">World</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="characters"
          className="flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <CharacterPanel />
        </TabsContent>

        <TabsContent
          value="world"
          className="flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <WorldPanel />
        </TabsContent>

        <TabsContent
          value="inventory"
          className="flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <InventoryGrid />
        </TabsContent>
      </Tabs>

      {error && (
        <div className="border-t border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <HandoffButton
        label="Approve & Direct"
        targetStage="director"
        disabled={characterAssets.length === 0}
      />
    </>
  )
}
