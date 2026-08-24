'use client'

// Writer 실행 중 화면(#story-stream 2026-07-21).
//   메인 = 점진적 스토리 뷰어(WriterStoryStream), 하단 = 진행 바(문구+진행률+남은 시간).
//   기존엔 중앙 로더+진행바였던 것을, 대기 시간을 스토리 읽기로 채우도록 재구성.
//   상태(단계/진행률/ETA + keepalive)는 useWriterStatus, 콘텐츠는 useWriterPreview 가 담당.

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { WriterStoryStream } from '@/features/writer/writer-story-stream'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { WriterCharacterPanel } from '@/features/writer/writer-character-panel'
import type { WriterStatus } from '@/lib/writer/use-writer-status'
import { useWriterPreview } from '@/lib/writer/use-writer-preview'
import { friendlyStageLabel, formatRemaining } from '@/lib/writer/stage-labels'
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

  // 남은 시간 카운트다운용 1s 틱.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

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
  useEffect(() => {
    if (!awaiting || !projectId) return
    useGlobalChatStore.getState().offerSuggestion(
      {
        id: `scene-gate:${projectId}`,
        stage: 'writer',
        dismissible: true,
        content: sceneGateMessage,
        action: { kind: 'confirmScenes', label: confirmAsIsLabel },
      },
      { preempt: true },
    )
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
      <div className="flex min-h-0 flex-1">
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <WriterStoryStream preview={preview} />
        </div>
        <WriterCharacterPanel
          characters={preview?.characters ?? []}
          worlds={preview?.worlds ?? []}
          className="hidden min-h-0 md:block"
        />
      </div>

      {/* 하단 바 — 진행률 전용. 게이트 대기 중엔 조작이 채팅에 있으므로(#gate-to-chat) 감춘다. */}
      {awaiting ? null : (
      <div className="shrink-0 border-t border-border bg-background/95 px-6 py-3 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-busy="true" />
            <span className="truncate text-sm font-medium">{phrase}</span>
          </div>
          <div className="flex flex-1 items-center gap-3">
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
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {formatRemaining(remainingMs, locale)}
            </span>
          ) : null}
        </div>
      </div>
      )}
    </div>
  )
}
