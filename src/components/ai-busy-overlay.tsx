'use client'

// AI 작업 중 전체 잠금 (리뉴얼 1차 2026-10-19, 프로토타입 원칙 "AI가 일하는 동안은 전체 잠금").
//   AI 에이전트가 일을 시작하면 단계 화면과 채팅을 덮고 입력을 막는다 — 끝나야 고칠 수 있고, 동시 작업은 없다.
//   왼쪽 단계 레일은 덮지 않는다(다른 단계로 나가는 것은 막지 않는다 — 작업은 서버에서 계속 돈다).
//   document.body 로 띄운다 — 단계 화면 안에 그리면 뒤를 inert 로 막을 때 이 창의 버튼(다시 그리기 · 닫기)까지 막힌다.
import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SHELL_INSET, SHELL_RAIL_WIDTH } from '@/lib/constants'
import { useT } from '@/lib/i18n'

export interface AiBusyStep {
  label: string
  state: 'done' | 'current' | 'todo'
}

interface AiBusyOverlayProps {
  open: boolean
  /** 이미 번역된 제목(예: "산문 초안을 쓰고 있어요"). */
  title: string
  /** 이미 번역된 설명. 없으면 잠금 안내를 쓴다. */
  description?: string
  steps?: AiBusyStep[]
  /** 0~100. 없으면 막대를 그리지 않는다. */
  progress?: number | null
  /** 이미 번역된 진행 문구(예: "러프 3/8 · 40%"). */
  progressLabel?: string
  /** 실패 시 다시 하기 같은 버튼 자리. */
  footer?: React.ReactNode
  /** false = 일이 멈췄다(실패 안내) — 도는 원 대신 경고 표시를 두고 aria-busy 를 끈다. 기본 true. */
  busy?: boolean
  /** 'dialog' = 열린 팝업 위를 덮는다(팝업에서 시작한 AI 작업, 2026-10-20 Artist 상세 · 샷 고치기). 기본은 단계 화면만 덮는다. */
  layer?: 'stage' | 'dialog'
}

const subscribeNothing = () => () => {}

export function AiBusyOverlay({ open, title, description, steps, progress, progressLabel, footer, busy = true, layer = 'stage' }: AiBusyOverlayProps) {
  const t = useT()
  // 서버 렌더에는 body 가 없다 — 브라우저에서만 띄운다(하이드레이션이 어긋나지 않게).
  const inBrowser = useSyncExternalStore(subscribeNothing, () => true, () => false)

  // 덮는 동안 단계 화면과 채팅을 inert 로 — 키보드 포커스도 뒤로 들어가지 못한다.
  useEffect(() => {
    if (!open) return
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-stage-content], [data-chat-panel]'))
    for (const el of targets) el.setAttribute('inert', '')
    return () => {
      for (const el of targets) el.removeAttribute('inert')
    }
  }, [open])

  if (!open || !inBrowser) return null
  const pct = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : null

  return createPortal(
    <div
      className={layer === 'dialog'
        ? 'fixed inset-0 z-popover flex items-center justify-center bg-background/85 p-6'
        : 'fixed inset-y-0 right-0 z-overlay flex items-center justify-center bg-background/85 p-6'}
      style={layer === 'dialog' ? undefined : { left: SHELL_INSET * 2 + SHELL_RAIL_WIDTH }}
      role="status"
      aria-live="polite"
      aria-busy={busy}
      data-testid="ai-busy-overlay"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-start gap-3">
          {busy ? (
            <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
          ) : (
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          )}
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium leading-7">{title}</h2>
            <p className="text-sm text-muted-foreground">
              {description ?? t('While AI is working, the whole screen is locked. You can edit once it finishes.')}
            </p>
          </div>
        </div>
        {pct !== null || progressLabel ? (
          <div className="flex flex-col gap-1.5">
            {pct !== null ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-primary transition-[width] duration-350 ease-out" style={{ width: `${pct}%` }} />
              </div>
            ) : null}
            {progressLabel ? <p className="font-mono text-xs tabular-nums text-muted-foreground">{progressLabel}</p> : null}
          </div>
        ) : null}
        {steps && steps.length > 0 ? (
          <ol className="flex flex-col gap-1.5 text-sm">
            {steps.map((step, i) => (
              <li
                key={`${i}-${step.label}`}
                className={cn(
                  'flex items-center gap-2',
                  step.state === 'todo' && 'text-muted-foreground opacity-70',
                  step.state === 'current' && 'font-medium',
                )}
              >
                {step.state === 'done' ? (
                  <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : step.state === 'current' ? (
                  <Loader2 className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <span className="mx-1 size-2 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
                )}
                <span>{step.label}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {footer ? <div className="flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
