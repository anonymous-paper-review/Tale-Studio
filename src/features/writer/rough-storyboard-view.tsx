'use client'

// Writer 탭 — 러프 스토리보드 보드 (2026-06-12 탭 부활).
//
// writer 파이프라인(스토리·연출 설계) 완료 후, 컨셉 아트 이전 단계에서
// 샷별 연출을 목각 인형/스틱 피겨 패널(흑백 연필 스케치)로 확인하고
// 패널 아래 스토리를 읽는 검토 화면. 카드 클릭 → 상세 팝업(수정·재생성).
//
// 생성 흐름: 진입 시 누락 패널만 자동 1회 생성 (서버가 완료본·진행중 잡을 멱등 skip —
// director 재생성 폭주 버그의 교훈: 판단은 DB 진실 fetch 후 + 서버 이중 가드).
// 완료는 webhook → shots.rough_storyboard. 클라는 jobId 폴링으로 카드만 갱신.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ImageIcon, Loader2, Plus, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Slider } from '@/components/ui/slider'
import { HandoffButton } from '@/components/layout/handoff-button'
import { ShotDetailDialog } from '@/features/writer/shot-detail-dialog'
import { AddItemDialog, type AddMode } from '@/features/writer/add-item-dialog'
import { SHOT_TYPE_DESCRIPTIONS } from '@/features/writer/shot-type-info'
import { WriterHeader } from '@/features/writer/writer-header'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { friendlyStageLabel, formatRemaining } from '@/lib/writer/stage-labels'
import { pollGenerationJob } from '@/lib/generation-jobs-client'
import { createWheelNotchStepper } from '@/lib/wheel-notch'
import { cn } from '@/lib/utils'
import type { RoughStoryboardImage, Shot } from '@/types'

type PanelJob = { status: 'generating' | 'failed'; error?: string }

// 재생성 즉시 반영: 스토리지 url 은 같은 경로 덮어쓰기(upsert)라 URL 이 동일 → 브라우저/CDN 캐시 잔상이 남는다.
//   generatedAt 을 쿼리로 붙여 매 생성마다 src 가 바뀌게 해 새 이미지를 즉시 가져온다.
function withCacheBust(url: string, v?: number): string {
  if (!v) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${v}`
}

// 3프레임 순환 라벨 — start(시작 프레임) → direction(연출 화살표/지시) → end(끝 프레임).
const FRAME_LABELS = ['START', '연출', 'END'] as const
const FRAME_CYCLE_MS = 1200

/** 러프 3프레임 순환 표시(#rough-grid 2026-07-22) — 기본은 START 정지 프레임, hover 중에만 순환
 *  (전 카드 동시 재생은 정보 과다 — 2026-07-22 피드백). 점 클릭 = 그 프레임 고정(leave 시 리셋).
 *  frames 없는 구버전 패널(단일 이미지)은 정적 표시로 폴백. */
function RoughFrameCycle({
  panel,
  alt,
}: {
  panel: RoughStoryboardImage
  alt: string
}) {
  const f = panel.frames
  const urls = f
    ? [f.start, f.direction, f.end].map((u) => withCacheBust(u, panel.generatedAt))
    : [withCacheBust(panel.url, panel.generatedAt)]
  const [idx, setIdx] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [pinned, setPinned] = useState(false)
  const multi = urls.length > 1

  useEffect(() => {
    if (!multi || !hovering || pinned) return
    const t = setInterval(() => setIdx((i) => (i + 1) % urls.length), FRAME_CYCLE_MS)
    return () => clearInterval(t)
  }, [multi, hovering, pinned, urls.length])

  const current = idx % urls.length
  return (
    <div
      className="absolute inset-0"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => {
        // 카드를 떠나면 START 정지 상태로 복귀 — 보드 전체가 조용해진다.
        setHovering(false)
        setPinned(false)
        setIdx(0)
      }}
    >
      {/* 프레임 전환 시 로딩 깜빡임 방지 — 3장을 모두 마운트하고 opacity 로 스위치 */}
      {urls.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={u}
          src={u}
          alt={i === current ? alt : ''}
          aria-hidden={i !== current}
          className={cn(
            'absolute inset-0 size-full object-cover transition-opacity duration-150',
            i === current ? 'opacity-100' : 'opacity-0',
          )}
          loading="lazy"
          draggable={false}
        />
      ))}
      {/* 인디케이터는 hover 중에만 — 기본 상태의 시각 노이즈 제거 */}
      {multi && hovering ? (
        <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-background/70 px-2 py-0.5 backdrop-blur-sm">
          {urls.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${FRAME_LABELS[i]} 프레임 고정`}
              onClick={(e) => {
                e.stopPropagation()
                setIdx(i)
                setPinned(true)
              }}
              className={cn(
                'size-1.5 rounded-full transition-colors',
                i === current ? 'bg-primary' : 'bg-muted-foreground/40 hover:bg-muted-foreground',
              )}
            />
          ))}
          <span className="ml-0.5 font-mono text-[9px] tabular-nums text-muted-foreground">
            {FRAME_LABELS[current]}
          </span>
        </div>
      ) : null}
    </div>
  )
}

// 표시 번호는 "순서(위치)" 기준으로 렌더 지점에서 계산 — 불변 id 접미사가 아니라(중간 삽입 시 번호
//   뒤죽박죽 방지, #5). 샷 타입 설명(SHOT_TYPE_DESCRIPTIONS)은 shot-type-info 로 공용화(#2).

// 샷에 생성할 "정보"가 있는가 — 액션(스토리)이 비면 러프 패널을 만들 근거가 없음. (#5)
function shotHasInfo(actionDescription?: string | null): boolean {
  return !!actionDescription?.trim()
}

export function RoughStoryboardView() {
  const projectId = useProjectStore((s) => s.projectId)
  const sceneManifest = useWriterStore((s) => s.sceneManifest)
  const shots = useWriterStore((s) => s.shots)
  const loadProject = useWriterStore((s) => s.loadProject)
  const { status } = useWriterStatus(projectId)
  const offerSuggestion = useGlobalChatStore((s) => s.offerSuggestion)
  const chatMessages = useGlobalChatStore((s) => s.messages)
  const briefedRef = useRef(false)

  // 패널 단위 생성 상태(jobId 폴링) + 완료 즉시 반영용 로컬 오버라이드.
  // DB 진실은 shots.rough_storyboard — 오버라이드는 다음 loadProject 전까지의 캐시.
  const [panelJobs, setPanelJobs] = useState<Record<string, PanelJob>>({})
  const [overrides, setOverrides] = useState<Record<string, RoughStoryboardImage>>({})
  const [detailShotId, setDetailShotId] = useState<string | null>(null)
  // 추가 팝업(#3) — 어느 버튼으로 열렸는지(mode) + 맥락 씬. null=닫힘.
  const [addDialog, setAddDialog] = useState<{
    mode: AddMode
    contextSceneId: string | null
  } | null>(null)
  // 진행 중 단계 경과시간 라이브 표시(긴 단계에서 "멈춤" 오인 방지) — 1s 틱.
  const [nowMs, setNowMs] = useState(0)
  // 보드 축척: zoomLevel 1(축소·6열)~6(확대·1열). 가로 열 수 cols = 7 - zoomLevel. 기본 4 → 3열(기존 동작).
  //   탭 전환(리마운트)에도 유지 — localStorage 영속(#4, 2026-07-09).
  const [zoomLevel, setZoomLevel] = useState(4)
  useEffect(() => {
    const saved = Number(localStorage.getItem('writer:zoomLevel'))
    if (saved >= 1 && saved <= 6) setZoomLevel(saved)
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem('writer:zoomLevel', String(zoomLevel))
    } catch {}
  }, [zoomLevel])
  const boardRef = useRef<HTMLDivElement>(null)
  const autoTriggeredRef = useRef(false)
  const reloadedAfterCompleteRef = useRef(false)
  // drag-to-scroll 직후의 click 이 카드 팝업을 여는 오발 방지
  const draggedRef = useRef(false)

  useEffect(() => {
    if (projectId) void loadProject()
  }, [projectId, loadProject])

  // 첫 진입 브리핑 — 씬/샷이 준비됐고 writer 채팅 기록이 없으면 Writer가 먼저 "이렇게 나눴어요"라고 알린다.
  //   Producer 웰컴과 같은 방식: dismissible:false(넘김 버튼 없음), 유저가 말을 걸면 자동으로 사라짐.
  useEffect(() => {
    if (!projectId || briefedRef.current) return
    const sceneCount = sceneManifest?.scenes.length ?? 0
    if (sceneCount === 0) return
    if (chatMessages.some((m) => m.stage === 'writer')) return
    briefedRef.current = true
    offerSuggestion({
      id: `writer-brief:${projectId}`,
      stage: 'writer',
      dismissible: false,
      action: null,
      content:
        '스토리를 구체화할 수 있는 틀을 마련했어요.\n\n' +
        `· 씬 ${sceneCount}개, 샷 ${shots.length}개로 나눴어요\n` +
        '· 각 샷은 러프 스토리보드(연필 스케치)로 미리 그려놨어요\n\n' +
        '카드를 누르면 확인·수정·재생성할 수 있어요.\n' +
        '바꾸고 싶은 부분이 있으면 편하게 말씀해 주세요.',
    })
  }, [projectId, sceneManifest, shots.length, chatMessages, offerSuggestion])

  // 파이프라인이 이 화면을 보는 중에 완료되면 씬/샷을 1회 재로드.
  useEffect(() => {
    if (status?.pipeline_completed && !reloadedAfterCompleteRef.current) {
      reloadedAfterCompleteRef.current = true
      void loadProject()
    }
  }, [status?.pipeline_completed, loadProject])

  const generate = useCallback(
    async (
      shotIds?: string[],
      force?: boolean,
      auto?: boolean,
      styleHints?: string[],
    ): Promise<{ submitted: number; remaining: number; quota: boolean; done: Promise<unknown> } | null> => {
      if (!projectId) return null
      if (shotIds?.length) {
        // 클릭 즉시 피드백 — 서버가 in_flight skip 으로 응답하면 아래에서 정리됨
        setPanelJobs((prev) => ({
          ...prev,
          ...Object.fromEntries(shotIds.map((id) => [id, { status: 'generating' } as PanelJob])),
        }))
      }
      try {
        const res = await fetch('/api/writer/rough-storyboard', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId, shotIds, force, styleHints }),
        })
        // 쿼터 초과(429)는 실패가 아니라 "큐가 빌 때까지 대기" 신호 — 펌프가 재시도한다(#c1).
        if (res.status === 429) {
          if (shotIds?.length) {
            setPanelJobs((prev) => {
              const next = { ...prev }
              for (const id of shotIds) delete next[id]
              return next
            })
          }
          return { submitted: 0, remaining: 0, quota: true, done: Promise.resolve() }
        }
        const j = await res.json().catch(() => null)
        if (!res.ok || !j?.ok) {
          throw new Error(j?.error?.message ?? `HTTP ${res.status}`)
        }
        const submitted = (j.data?.submitted ?? []) as Array<{
          shotId: string
          jobId: string
        }>
        // give-up 게이트로 건너뛴 샷 안내 — 진입 자동 생성(auto)에는 매번 뜨지 않도록 억제.
        if (!auto) {
          const gaveUp = (
            (j.data?.skipped ?? []) as Array<{ reason: string }>
          ).filter((x) => x.reason === 'gave_up')
          if (gaveUp.length) {
            toast.info(
              `패널 ${gaveUp.length}개는 반복 실패로 자동 생성을 멈췄어요. 카드의 "다시 시도"로 재생성할 수 있어요.`,
            )
          }
        }
        setPanelJobs((prev) => ({
          ...prev,
          ...Object.fromEntries(
            submitted.map((s) => [s.shotId, { status: 'generating' } as PanelJob]),
          ),
        }))
        // 서버가 정보 없음(no_info)으로 건너뛴 샷은 낙관적 'generating' 을 지운다 — 안 지우면 제출 안 된
        //   샷의 스피너가 영구히 돈다(in_flight 등 '실제 생성 중' 사유는 그대로 두어야 하므로 no_info 만).
        const noInfoSkipped = (
          (j.data?.skipped ?? []) as Array<{ shotId: string; reason: string }>
        )
          .filter((x) => x.reason === 'no_info')
          .map((x) => x.shotId)
        if (noInfoSkipped.length) {
          setPanelJobs((prev) => {
            const next = { ...prev }
            for (const id of noInfoSkipped) delete next[id]
            return next
          })
        }
        // 잡 단위 dedupe(#rough-grid): 그리드 잡 1개가 샷 최대 4개를 커버 — 같은 jobId 를 샷 수만큼
        //   중복 폴링하지 않는다. 완료 시 result_url 은 "그리드 원본"(4샷 공용)이라 카드에 쓰면
        //   크롭 전 전체 그리드가 그대로 보인다(2026-07-22 실측) → URL 대신 크롭이 끝난 DB 진실
        //   (shots.rough_storyboard.frames)을 리로드하고, stale override 를 지워 그 진실이 보이게 한다.
        const shotIdsByJob = new Map<string, string[]>()
        for (const { shotId, jobId } of submitted) {
          shotIdsByJob.set(jobId, [...(shotIdsByJob.get(jobId) ?? []), shotId])
        }
        const polls = [...shotIdsByJob.entries()].map(([jobId, jobShotIds]) =>
          pollGenerationJob(jobId)
            .then(async () => {
              await loadProject()
              setOverrides((prev) => {
                const next = { ...prev }
                for (const id of jobShotIds) delete next[id]
                return next
              })
              setPanelJobs((prev) => {
                const next = { ...prev }
                for (const id of jobShotIds) delete next[id]
                return next
              })
            })
            .catch((e: unknown) => {
              setPanelJobs((prev) => {
                const next = { ...prev }
                for (const id of jobShotIds) {
                  next[id] = {
                    status: 'failed',
                    error: e instanceof Error ? e.message : String(e),
                  }
                }
                return next
              })
            }),
        )
        return {
          submitted: submitted.length,
          remaining: (j.data?.remaining as number | undefined) ?? 0,
          quota: false,
          // 이번 라운드 잡들의 종결(성공/실패 모두 위에서 상태 반영) — 펌프의 라운드 배리어.
          done: Promise.allSettled(polls),
        }
      } catch (e) {
        if (shotIds?.length) {
          setPanelJobs((prev) => {
            const next = { ...prev }
            for (const id of shotIds) delete next[id]
            return next
          })
        }
        toast.error(e instanceof Error ? e.message : '러프 스토리보드 생성 요청 실패')
        return null
      }
    },
    [projectId, loadProject],
  )

  // 누락 패널 전체 생성 펌프(#c1·#c2·#c3 2026-07-15) — 서버가 호출당 6샷으로 캡하므로(504·쿼터
  //   독점 방지) remaining 이 0이 될 때까지 라운드를 이어간다. 라운드 배리어(이전 잡 완료 대기)로
  //   쿼터를 넘지 않고, 429(다른 생성이 큐 점유)는 8초 대기 후 재시도. 실패 샷은 다음 라운드가
  //   자연 재제출하고 반복 실패는 서버 give-up 게이트가 멈춘다 → 수렴 보장.
  const pumpRunningRef = useRef(false)
  const pumpAbortRef = useRef(false)
  useEffect(() => {
    pumpAbortRef.current = false
    return () => {
      pumpAbortRef.current = true
    }
  }, [])
  const generateAllMissing = useCallback(
    async (auto: boolean) => {
      if (pumpRunningRef.current) return
      pumpRunningRef.current = true
      let quotaToasted = false
      try {
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
        const MAX_ROUNDS = 40 // 76샷=13라운드 + 429 대기 여유. 폭주 방지 상한.
        for (let round = 0; round < MAX_ROUNDS; round++) {
          if (pumpAbortRef.current) return
          // give-up 안내 토스트는 수동 1라운드에서만 (라운드마다 반복 방지)
          const r = await generate(undefined, false, auto || round > 0)
          if (!r) return // 요청 실패 — generate 가 이미 토스트
          if (r.quota) {
            if (!auto && !quotaToasted) {
              quotaToasted = true
              toast.info('다른 생성 작업이 대기열을 쓰고 있어요. 자리가 나는 대로 이어서 생성할게요.')
            }
            await sleep(8000)
            continue
          }
          if (r.submitted === 0) return // 전부 완료/제외 — 수렴
          await r.done
          // remaining<=0 이어도 바로 끝내지 않는다 — 다음 라운드가 이번 라운드 실패분을
          //   재제출할 기회(그 라운드 submitted 0 이면 그때 종료). give-up 게이트가 무한 재시도를 막는다.
        }
      } finally {
        pumpRunningRef.current = false
      }
    },
    [generate],
  )

  const running = !!(
    status?.started &&
    !status.pipeline_completed &&
    !status.pipeline_failed
  )
  const hasShots = shots.length > 0
  const panelOf = (shot: Shot): RoughStoryboardImage | null =>
    overrides[shot.shotId] ?? shot.roughStoryboard ?? null
  // #5: 정보(액션)가 없는 샷은 자동 생성 대상에서 제외 — 근거 없는 빈 패널 생성 방지.
  const missingIds = shots
    .filter((s) => !panelOf(s) && !panelJobs[s.shotId] && shotHasInfo(s.actionDescription))
    .map((s) => s.shotId)
  const generatingCount = Object.values(panelJobs).filter(
    (j) => j.status === 'generating',
  ).length
  // 제목 아래 설명문은 제거(#c2 2026-07-14) — 카드 사용법은 첫 진입 브리핑 채팅이 안내한다.
  const headerDescription = undefined
  const storyboardActions = hasShots ? (
    <>
      {/* 축척 — 가로 열 수 조절 (Ctrl+wheel 로도 가능) */}
      <div className="flex items-center gap-1.5">
        <Button
          size="icon"
          variant="ghost"
          className="size-7 hover-red-beam"
          aria-label="축소 (열 늘리기)"
          onClick={() => setZoomLevel((z) => Math.max(1, z - 1))}
        >
          <ZoomOut className="size-4" />
        </Button>
        <Slider
          className="w-24"
          min={1}
          max={6}
          step={1}
          value={[zoomLevel]}
          onValueChange={([v]) => setZoomLevel(v)}
          aria-label="러프보드 축척"
        />
        <Button
          size="icon"
          variant="ghost"
          className="size-7 hover-red-beam"
          aria-label="확대 (열 줄이기)"
          onClick={() => setZoomLevel((z) => Math.min(6, z + 1))}
        >
          <ZoomIn className="size-4" />
        </Button>
      </div>
      {generatingCount > 0 && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          패널 {generatingCount}개 생성 중
        </span>
      )}
      {missingIds.length > 0 && generatingCount === 0 && (
        <Button
          size="sm"
          variant="secondary"
          className="hover-red-beam"
          onClick={() => void generateAllMissing(false)}
        >
          <RefreshCw className="size-3.5" />
          누락 패널 {missingIds.length}개 생성
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="hover-red-beam"
        onClick={() => setAddDialog({ mode: 'scene', contextSceneId: null })}
      >
        <Plus className="size-3.5" />
        씬 추가
      </Button>
    </>
  ) : null

  // 진입 자동 생성: 샷이 로드됐고 파이프라인이 돌고 있지 않을 때, 누락 패널 전체를 1회씩 —
  //   펌프가 6샷 라운드로 나눠 remaining 0 까지 이어간다(#c1). auto=true → give-up 토스트 억제.
  useEffect(() => {
    if (autoTriggeredRef.current) return
    if (!hasShots || running) return
    if (missingIds.length === 0) return
    autoTriggeredRef.current = true
    void generateAllMissing(true)
  }, [hasShots, running, missingIds.length, generateAllMissing])

  // Ctrl + wheel → 보드 축척(zoom). 브라우저 페이지 줌을 막아야 하므로 native wheel 리스너(passive:false)로
  //   붙인다(React onWheel 은 passive 라 preventDefault 가 안 먹을 수 있음). up=확대(열↓), down=축소(열↑).
  //   (#a1 2026-07-15) 굴림 판정은 공용 스텝퍼(wheel-notch) — 스무스 스크롤 드라이버가 노치
  //   1칸을 여러 이벤트로 쪼개도 burst = 1단계로 정규화(옛 이벤트당 쿨다운은 2단계+ 튐).
  //   board div 는 hasShots 일 때만 렌더되므로 deps 에 hasShots 를 넣어 마운트 후 재바인딩한다.
  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const step = createWheelNotchStepper((dir) =>
      setZoomLevel((z) => Math.max(1, Math.min(6, z + dir))),
    )
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      step(e)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [hasShots])

  // 진행 중일 때만 1초마다 현재 시각 갱신 → 현재 단계 경과시간 라이브 표시(shotCheck 등 100s+ 단계가 "멈춘" 듯 보이는 오인 방지).
  useEffect(() => {
    if (hasShots || !running) return
    setNowMs(Date.now())
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [hasShots, running])

  // 보드 drag-to-scroll (빈 영역을 잡고 끌면 패닝). 버튼/입력 위에서 시작한 드래그는 무시.
  const handleBoardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return
    const viewport = (e.currentTarget as HTMLElement).closest(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement | null
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

  // ── 파이프라인 진행 중 (샷이 아직 없음) ─────────────────────────────────
  if (!hasShots && running) {
    const pct = Math.max(0, Math.min(100, status?.progress_percent ?? 0))
    // 진행(경과) 시간은 계산만 하고 표시하지 않는다(#c4) — 남은 예상 시간 산출에만 사용.
    //   실측 자체는 writer_runs(created_at/updated_at + state._timings)에 이미 영속된다.
    const startedAtMs = status?.timings?.pipeline_started_at
      ? Date.parse(status.timings.pipeline_started_at)
      : null
    const elapsedMs = startedAtMs != null ? Math.max(0, nowMs - startedAtMs) : null
    const etaTotalMs = status?.eta_total_ms ?? null
    const remainingMs =
      etaTotalMs != null && elapsedMs != null ? etaTotalMs - elapsedMs : null
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <WriterHeader description={headerDescription} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-busy="true" />
          <p className="text-base font-medium">{friendlyStageLabel(status?.current_stage)}</p>

          {/* 진행률 바(#c3) — 우측에 % 병기 */}
          <div className="flex w-full max-w-md items-center gap-3">
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
              {pct}%
            </span>
          </div>

          {/* 남은 예상 시간 — 과거 실행 실측이 있을 때만(#c4, 기록 없으면 비움) */}
          {remainingMs != null ? (
            <p className="text-sm text-muted-foreground">{formatRemaining(remainingMs)}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            샷 설계·검증 같은 복잡한 단계는 1~2분 걸릴 수 있어요.
          </p>
        </div>
      </div>
    )
  }

  // ── 빈 상태 (파이프라인 미실행 + 산출물 없음) ───────────────────────────
  if (!hasShots) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <WriterHeader description={headerDescription} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <ImageIcon className="size-12 text-muted-foreground" />
          <p className="text-base font-medium">아직 생성된 씬·샷이 없어요</p>
          <p className="text-sm text-muted-foreground">
            {status?.pipeline_failed
              ? 'Writer 실행이 실패했어요. Producer에서 다시 실행해주세요.'
              : 'Producer에서 스토리를 핸드오프하면 씬·샷이 생성됩니다.'}
          </p>
        </div>
      </div>
    )
  }

  // ── 보드 ────────────────────────────────────────────────────────────────
  const detailShot = detailShotId ? shots.find((s) => s.shotId === detailShotId) : undefined
  const detailPanel = detailShot ? panelOf(detailShot) : null
  const cols = 7 - zoomLevel // zoomLevel 1~6 → 6~1열

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WriterHeader description={headerDescription} actions={storyboardActions} />

      <ScrollArea className="min-h-0 flex-1">
        <div
          ref={boardRef}
          className="cursor-grab space-y-8 p-6"
          onPointerDown={handleBoardPointerDown}
        >
          {(sceneManifest?.scenes ?? []).map((scene, sceneIdx) => {
            const sceneShots = shots.filter((s) => s.sceneId === scene.sceneId)
            return (
              <section key={scene.sceneId} className="space-y-3">
                {/* 씬 구분선 — id 만 노출(사용자 결정 2026-06-12). 장소·분위기는 편집 팝업에서.
                    CRUD(2026-06-24): id 클릭/편집 → 씬 상세, 샷 추가 버튼. 빈 씬도 표시. */}
                <div className="flex items-center gap-2">
                  {/* #2: 씬 이름 클릭 편집 제거 — 비상호작용 라벨(편집 버튼도 삭제). */}
                  <span className="text-xs font-medium text-muted-foreground">
                    Scene {sceneIdx + 1}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover-red-beam"
                    onClick={() =>
                      setAddDialog({ mode: 'shot', contextSceneId: scene.sceneId })
                    }
                  >
                    <Plus className="size-3.5" />
                    샷 추가
                  </Button>
                </div>

                <div
                  className="grid gap-4"
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                >
                  {sceneShots.length === 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setAddDialog({ mode: 'shot', contextSceneId: scene.sceneId })
                      }
                      className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground transition-colors hover:bg-accent/40 hover-red-beam"
                    >
                      <Plus className="size-6" />
                      <span className="text-sm">샷 추가</span>
                    </button>
                  )}
                  {sceneShots.map((shot, shotIdx) => {
                    const panel = panelOf(shot)
                    const job = panelJobs[shot.shotId]
                    return (
                      <article
                        key={shot.shotId}
                        role="button"
                        tabIndex={0}
                        onClick={() => openDetail(shot.shotId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openDetail(shot.shotId)
                          }
                        }}
                        className="group cursor-pointer overflow-hidden rounded-xl border bg-card transition-colors duration-100 hover:bg-accent/40 hover-red-beam focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
                      >
                        <div className="relative aspect-video bg-muted">
                          {panel?.url && job?.status !== 'generating' ? (
                            <>
                              {/* absolute inset-0: aspect-video 컨테이너 박스를 무조건 채운다. in-flow
                                  size-full 은 일부 브라우저/배율에서 h-full(=%)이 aspect-ratio 높이로 안 풀려
                                  이미지가 위쪽만 채우고 아래 bg-muted 회색이 남던 버그(2026-07-11).
                                  3프레임 세트(#rough-grid)는 순환 재생 — 구버전 단일 패널은 정적 폴백. */}
                              <RoughFrameCycle
                                panel={panel}
                                alt={`${shot.shotId} rough storyboard`}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="absolute right-2 top-2 size-7 bg-background/80 opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover-red-beam"
                                aria-label="패널 재생성"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void generate([shot.shotId], true)
                                }}
                              >
                                <RefreshCw className="size-3.5" />
                              </Button>
                            </>
                          ) : job?.status === 'generating' ? (
                            <div className="absolute inset-0" aria-busy="true">
                              <div className="size-full animate-pulse bg-muted-foreground/10" />
                              <Loader2 className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                            </div>
                          ) : job?.status === 'failed' ? (
                            <div className="flex size-full flex-col items-center justify-center gap-2 p-4">
                              <AlertCircle className="size-5 text-destructive" />
                              <p className="line-clamp-2 text-center text-xs text-destructive">
                                {job.error ?? '생성 실패'}
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void generate([shot.shotId], true)
                                }}
                              >
                                다시 시도
                              </Button>
                            </div>
                          ) : (
                            <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center">
                              <ImageIcon className="size-8 text-muted-foreground" />
                              {/* #5: 정보(액션) 없으면 생성 불가 — 카드 클릭해 스토리부터 입력하게 유도. */}
                              {shotHasInfo(shot.actionDescription) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="hover-red-beam"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    // 사람의 명시적 클릭 → force(give-up 게이트 통과).
                                    void generate([shot.shotId], true)
                                  }}
                                >
                                  패널 생성
                                </Button>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  스토리(액션)를 입력하면 생성할 수 있어요
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 p-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">
                              Scene {sceneIdx + 1} · Shot {shotIdx + 1}
                            </span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="cursor-help text-xs">
                                    {shot.shotType}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {SHOT_TYPE_DESCRIPTIONS[shot.shotType] ?? shot.shotType}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                              {shot.durationSeconds}s
                            </span>
                          </div>
                          <p className="line-clamp-3 text-sm leading-relaxed">
                            {shot.actionDescription}
                          </p>
                          {/* #8: 대사 표시 제거 — 파이프라인이 대사 슬롯에 상황 요약을 채워 실제 대사가 아님(2026-07-09). */}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </ScrollArea>

      <HandoffButton label="Hand over to Concept Artist" targetStage="artist" />

      <ShotDetailDialog
        shotId={detailShotId}
        panelUrl={detailPanel ? withCacheBust(detailPanel.url, detailPanel.generatedAt) : null}
        generating={!!(detailShotId && panelJobs[detailShotId]?.status === 'generating')}
        onOpenChange={(open) => {
          if (!open) setDetailShotId(null)
        }}
        onRegenerate={(id, hints) => void generate([id], true, false, hints)}
      />

      {addDialog && (
        <AddItemDialog
          open={!!addDialog}
          mode={addDialog.mode}
          contextSceneId={addDialog.contextSceneId}
          onOpenChange={(open) => {
            if (!open) setAddDialog(null)
          }}
        />
      )}
    </div>
  )
}
