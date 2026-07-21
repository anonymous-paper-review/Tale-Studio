'use client'

// Writer 실행 중 화면(#story-stream 2026-07-21).
//   메인 = 점진적 스토리 뷰어(WriterStoryStream), 하단 = 진행 바(문구+진행률+남은 시간).
//   기존엔 중앙 로더+진행바였던 것을, 대기 시간을 스토리 읽기로 채우도록 재구성.
//   상태(단계/진행률/ETA + keepalive)는 useWriterStatus, 콘텐츠는 useWriterPreview 가 담당.

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { WriterStoryStream } from '@/features/writer/writer-story-stream'
import type { WriterStatus } from '@/lib/writer/use-writer-status'
import { useWriterPreview } from '@/lib/writer/use-writer-preview'
import { friendlyStageLabel, formatRemaining } from '@/lib/writer/stage-labels'

// status 는 상위(WriterWorkspace)가 폴링해 내려준다 — 중복 status 폴링 방지.
export function WriterGenerationView({
  projectId,
  status,
}: {
  projectId: string
  status: WriterStatus | null
}) {
  const { preview } = useWriterPreview(projectId)

  // 남은 시간 카운트다운용 1s 틱.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const pct = Math.max(0, Math.min(100, status?.progress_percent ?? 0))
  const startedAtMs = status?.timings?.pipeline_started_at
    ? Date.parse(status.timings.pipeline_started_at)
    : null
  const elapsedMs = startedAtMs != null ? Math.max(0, nowMs - startedAtMs) : null
  const etaTotalMs = status?.eta_total_ms ?? null
  const remainingMs =
    etaTotalMs != null && elapsedMs != null ? etaTotalMs - elapsedMs : null
  const phrase = friendlyStageLabel(status?.current_stage)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 슬림 헤더 (실행 중엔 탭 전환이 무의미 → 컨텍스트 문구만) */}
      <header className="shrink-0 border-b border-border px-6 py-3">
        <h1 className="text-lg font-semibold">Writers&apos; Room</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          이야기를 생성하는 중이에요 — 완성되는 씬부터 아래에서 바로 읽어볼 수 있어요.
        </p>
      </header>

      {/* 메인 스크롤 뷰어 */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <WriterStoryStream preview={preview} />
      </div>

      {/* 하단 바 — 문구 + 진행바 + 남은 예상시간 */}
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
              {formatRemaining(remainingMs)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
