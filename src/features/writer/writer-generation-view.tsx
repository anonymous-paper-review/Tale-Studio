'use client'

// Writer 실행 중 화면(#story-stream 2026-07-21).
//   메인 = 점진적 스토리 뷰어(WriterStoryStream), 하단 = 진행 바(문구+진행률+남은 시간).
//   기존엔 중앙 로더+진행바였던 것을, 대기 시간을 스토리 읽기로 채우도록 재구성.
//   상태(단계/진행률/ETA + keepalive)는 useWriterStatus, 콘텐츠는 useWriterPreview 가 담당.

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { WriterStoryStream } from '@/features/writer/writer-story-stream'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { WriterCharacterPanel } from '@/features/writer/writer-character-panel'
import type { WriterStatus } from '@/lib/writer/use-writer-status'
import { useWriterPreview } from '@/lib/writer/use-writer-preview'
import { friendlyStageLabel, formatRemaining } from '@/lib/writer/stage-labels'
import { useLocale, useT } from '@/lib/i18n'

// 확정 게이트 재등록 주기(#fix-scene-gate-suggestion-resurface 2026-08-25) — status 폴링(3s)과
//   맞물려, 닫힘/선점/implicit dismiss 로 사라진 게이트를 한 틱 안에 되살린다. offerSuggestion 이
//   idempotent(같은 id 가 떠 있으면 no-op)라 매 틱 호출해도 상태를 흔들지 않는다.
const SCENE_GATE_REOFFER_MS = 3000

// status 는 상위(WriterWorkspace)가 폴링해 내려준다 — 중복 status 폴링 방지.
//   debug: admin 디버그 진입(#gen-debug) — 실행 중이 아닌데 강제 렌더된 상태 표시.
export function WriterGenerationView({
  projectId,
  status,
  debug = false,
}: {
  projectId: string
  status: WriterStatus | null
  debug?: boolean
}) {
  const t = useT()
  const { preview } = useWriterPreview(projectId)

  // 남은 시간 카운트다운용 1s 틱.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // #f2 드래그(2026-08-27 오너): 포인터 캡처 방식(에디터 DnD 관례) — 카드 아무 곳이나 잡고 이동,
  //   컨테이너 안으로 클램프, 위치는 localStorage('writer:progressCardPos') 에 기억한다.
  const dashRef = useRef<HTMLDivElement>(null)
  const [cardPos, setCardPos] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('writer:progressCardPos')
      if (raw) {
        const v = JSON.parse(raw) as { x?: number; y?: number }
        if (typeof v.x === 'number' && typeof v.y === 'number') setCardPos({ x: v.x, y: v.y })
      }
    } catch {
      /* 저장값 없음/파손 → 중앙 기본 */
    }
  }, [])
  const onCardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const container = dashRef.current
    if (!drag || !container) return
    const crect = container.getBoundingClientRect()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(e.clientX - crect.left - drag.dx, 0), Math.max(0, crect.width - rect.width))
    const y = Math.min(Math.max(e.clientY - crect.top - drag.dy, 0), Math.max(0, crect.height - rect.height))
    setCardPos({ x, y })
  }
  const onCardPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    setCardPos((pos) => {
      if (pos) {
        try {
          localStorage.setItem('writer:progressCardPos', JSON.stringify(pos))
        } catch {
          /* 무시 */
        }
      }
      return pos
    })
  }

  const pct = Math.max(0, Math.min(100, status?.progress_percent ?? 0))
  // 단계 문구·ETA 는 UI 언어 (#c-locale — locale 미지정 시 ko 폴백이라 en UI 에서 한국어가 샜다)
  const locale = useLocale()
  const startedAtMs = status?.timings?.pipeline_started_at
    ? Date.parse(status.timings.pipeline_started_at)
    : null
  const elapsedMs = startedAtMs != null ? Math.max(0, nowMs - startedAtMs) : null
  const etaTotalMs = status?.eta_total_ms ?? null
  const remainingMs =
    etaTotalMs != null && elapsedMs != null ? etaTotalMs - elapsedMs : null
  const phrase = friendlyStageLabel(status?.current_stage, locale)
  // #s3-gate: storyCheck 후 씬 확정 대기 — 진행 바 대신 게이트 패널.
  const awaiting = status?.current_status === 'awaiting_confirmation'

  // #s3-gate P3b → #gate-to-chat(2026-08-11): 확정/수정은 채팅 제안 블록이 **유일한** 자리다.
  //   화면 하단 바에도 같은 버튼을 두면 답할 곳이 둘로 갈린다. 다른 단계의 "다음으로 넘어갈까요"가
  //   전부 채팅에 있으므로 여기도 채팅으로 모았다(하단 바는 진행률 전용). 선점(preempt): 러프보드
  //   브리핑 등 다른 제안이 떠 있어도 게이트는 사용자를 기다리게 하는 결정이라 먼저 보여야 한다.
  // content/label 은 global-chat(범위 밖)이 t() 없이 그대로 렌더하므로, 여기서 미리 t() 로
  //   번역해 넘긴다(#i18n-s5-batch3) — 문자열 값 비교라 로케일이 안 바뀌면 effect 재실행 없음.
  const sceneGateMessage = t(
    "The scene story draft is ready. Please review it on the screen.\nIf there's anything you'd like to change, type it in the input box below — or press Enter with it empty to confirm and move to the next step.",
  )
  const confirmAsIsLabel = t('Confirm as-is')
  // 확정 게이트는 blocking 제안(dismissible:false) — 파이프라인이 멈춰 사용자 확정을 반드시
  //   받아야 진행된다. 그래서 Esc·다른 제안 선점으로 닫히지 않고(store 가 dismissible:false 를
  //   존중), 어떤 경로로 사라져도(수정 피드백 전송의 implicit dismiss·확정 실패) 서버가 awaiting
  //   인 한 되살아나야 한다. useEffect 는 awaiting 전이 때 1회만 도므로, awaiting 동안 폴링 주기로
  //   재등록해 self-heal 한다(#fix-scene-gate-suggestion-resurface 2026-08-25).
  useEffect(() => {
    if (!awaiting || !projectId) return
    const offer = () =>
      useGlobalChatStore.getState().offerSuggestion(
        {
          id: `scene-gate:${projectId}`,
          stage: 'writer',
          dismissible: false,
          content: sceneGateMessage,
          action: { kind: 'confirmScenes', label: confirmAsIsLabel },
        },
        { preempt: true },
      )
    offer()
    const iv = setInterval(offer, SCENE_GATE_REOFFER_MS)
    return () => {
      clearInterval(iv)
      // 확정 성공 후 상태 폴링이 이 컴포넌트를 내릴 때, 마지막으로 남은 게이트 제안도 함께 제거한다.
      // 성공 응답과 다음 폴링이 거의 동시에 도착해 재등록된 경우까지 정리한다.
      const current = useGlobalChatStore.getState().suggestion
      if (current?.id === `scene-gate:${projectId}`) {
        useGlobalChatStore.getState().dismissSuggestion({ implicit: true })
      }
    }
  }, [awaiting, projectId, sceneGateMessage, confirmAsIsLabel])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 슬림 헤더 (실행 중엔 탭 전환이 무의미 → 컨텍스트 문구만) */}
      <header className="shrink-0 border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Writers&apos; Room</h1>
          {debug ? (
            <span className="rounded-full border border-warning/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning">
              debug preview
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {debug
            ? t('Debug preview — showing the generation screen using output from the last run.')
            : awaiting
              ? t(
                  'The scene story draft is ready — review it, then request changes or confirm to move on.',
                )
              : t("Generating the story — read finished scenes below as they're ready.")}
        </p>
      </header>

      {/* 메인 줄글 스토리 + 우측 캐릭터 사이드바 */}
      <div ref={dashRef} className="relative flex min-h-0 flex-1">
        {/* 진행 카드(#f2 2026-08-26 → 2026-08-27 오너): 기본은 대시보드 중앙, 카드를 잡아 끌면
            원하는 자리로 이동(가려지는 글을 유저가 치울 수 있게). 위치는 localStorage 에 기억.
            게이트 대기 중엔 채팅이 조작을 맡으므로 숨김. */}
        {awaiting ? null : (
          <div
            className={cardPos ? 'absolute z-10 w-full max-w-md' : 'absolute left-1/2 top-1/2 z-10 w-full max-w-md -translate-x-1/2 -translate-y-1/2'}
            style={cardPos ? { left: cardPos.x, top: cardPos.y } : undefined}
            onPointerDown={onCardPointerDown}
            onPointerMove={onCardPointerMove}
            onPointerUp={onCardPointerUp}
          >
            <div
              className="cursor-move touch-none select-none rounded-2xl border border-border bg-background/95 px-5 py-4 shadow-lg backdrop-blur-sm"
              title={t('Drag to move')}
            >
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-busy="true" />
                <span className="truncate text-sm font-medium">{phrase}</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
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
              {remainingMs != null ? (
                <p className="mt-2 text-right text-xs text-muted-foreground">
                  {formatRemaining(remainingMs, locale)}
                </p>
              ) : null}
            </div>
          </div>
        )}
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <WriterStoryStream preview={preview} />
        </div>
        <WriterCharacterPanel
          characters={preview?.characters ?? []}
          worlds={preview?.worlds ?? []}
          className="hidden min-h-0 md:block"
        />
      </div>

    </div>
  )
}
