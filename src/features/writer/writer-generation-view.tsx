'use client'

// Writer 실행 중 화면(#story-stream 2026-07-21).
//   메인 = 점진적 스토리 뷰어(WriterStoryStream), 하단 = 진행 바(문구+진행률+남은 시간).
//   기존엔 중앙 로더+진행바였던 것을, 대기 시간을 스토리 읽기로 채우도록 재구성.
//   상태(단계/진행률/ETA + keepalive)는 useWriterStatus, 콘텐츠는 useWriterPreview 가 담당.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WriterStoryStream } from '@/features/writer/writer-story-stream'
import { withDemoShare } from '@/lib/demo/context'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { WriterCharacterPanel } from '@/features/writer/writer-character-panel'
import type { WriterStatus } from '@/lib/writer/use-writer-status'
import { useWriterPreview } from '@/lib/writer/use-writer-preview'
import { writerProgressView } from '@/lib/writer/progress-view'
import { useLocale, useT } from '@/lib/i18n'

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
        if (typeof v.x === 'number' && typeof v.y === 'number') {
          const position = { x: v.x, y: v.y }
          // 브라우저에 저장된 위치는 첫 프레임에서 복원하고, 이탈하면 예약을 해제한다.
          const frame = requestAnimationFrame(() => setCardPos(position))
          return () => cancelAnimationFrame(frame)
        }
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

  const locale = useLocale()
  const progress = writerProgressView(status, locale)
  const pct = progress.percent
  const phrase = progress.detail
  // #s3-gate: storyCheck 후 씬 확정 대기 — 진행 바 대신 게이트 패널.
  const awaiting = status?.current_status === 'awaiting_confirmation'

  // 씬 스토리 확정은 Producer 메인에서 한다(2026-10-01 오너 "writer 생성 중 페이지에서는 상호 작용 없이 진행").
  //   예전에는 여기서 채팅에 확정 안내(confirmScenes)를 띄웠다 — 이제 이 화면은 진행만 보여 주고,
  //   확정을 기다리는 동안에는 Producer 로 가라는 안내만 둔다. 안내는 Producer 의 씬 스토리가 띄운다.
  const router = useRouter()
  // 새로고침 등으로 이 화면에 남은 확정 안내는 내린다 — 확정은 Producer 메인에서만 받는다(Producer 가 다시 띄운다).
  const gateSuggestionShown = useGlobalChatStore((s) => s.suggestion?.action?.kind === 'confirmScenes')
  useEffect(() => {
    if (gateSuggestionShown) useGlobalChatStore.getState().dismissSuggestion({ implicit: true })
  }, [gateSuggestionShown])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 슬림 헤더 (실행 중엔 탭 전환이 무의미 → 컨텍스트 문구만) */}
      <header className="shrink-0 border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Writers&apos; Room</h1>
          {debug ? (
            <span className="rounded-full border border-warning/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning">
              Debug preview
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {debug
            ? t('Debug preview: showing the generation screen using output from the last run.')
            : awaiting
              ? t('The scene story draft is ready. Review and confirm it on the Producer screen to continue.')
              : t("Generating the story. Read finished scenes below as they're ready.")}
        </p>
      </header>

      {/* 메인 줄글 스토리 + 우측 캐릭터 사이드바 */}
      <div ref={dashRef} className="relative flex min-h-0 flex-1">
        {/* 진행 카드(#f2 2026-08-26 → 2026-08-27 오너): 기본은 대시보드 중앙, 카드를 잡아 끌면
            원하는 자리로 이동(가려지는 글을 유저가 치울 수 있게). 위치는 localStorage 에 기억.
            게이트 대기 중엔 채팅이 조작을 맡으므로 숨김. */}
        {awaiting ? (
          <div className="absolute left-1/2 top-1/2 z-10 w-full max-w-md -translate-x-1/2 -translate-y-1/2" data-testid="scene-gate-producer-notice">
            <div className="rounded-2xl border border-border bg-background/95 px-5 py-4 shadow-lg">
              <div className="flex items-center gap-2">
                <ScrollText className="size-4 shrink-0 text-warning" aria-hidden />
                <span className="text-sm font-medium">{t('Waiting for scene draft confirmation')}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('Review the scene story on the Producer screen and confirm it. Generation continues here after that.')}
              </p>
              <Button size="sm" className="mt-3" onClick={() => router.push(withDemoShare('/studio/producer'))}>
                {t('Go to Producer')}
              </Button>
            </div>
          </div>
        ) : (
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
                <span className="text-sm font-medium">{progress.label}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{phrase}</p>
              <div className="mt-3 flex items-center gap-3">
                <div
                  role="progressbar"
                  aria-label={progress.label}
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
              </div>
            </div>
          </div>
        )}
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <WriterStoryStream preview={preview} awaiting={awaiting} />
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
