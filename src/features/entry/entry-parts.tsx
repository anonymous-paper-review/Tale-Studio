'use client'

// Producer 시작 화면 공용 부품(리뉴얼 1차 2026-10-19): 고르기 묶음(라디오) · 추천 표시 · 이유 한 줄 · 파일 칩 · 말풍선 · 잠금 화면 띄우기.
//   두 탭(화면에서 고르기 · 채팅으로 만들기)이 같은 부품을 써서 같은 값이 같은 모양으로 보인다. 색은 토큰만(design.md §2).
import { useId, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FileText, ImageIcon, Loader2, Sparkles, X } from 'lucide-react'
import { AiBusyOverlay, type AiBusyStep } from '@/components/ai-busy-overlay'
import { STAGE_BADGE_CLASS, STAGE_LABEL } from '@/lib/constants'
import { useLocale, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { EntryFileMeta } from '@/lib/entry/draft'
import { fileProblemMessage } from './options'
import type { UploadError } from './entry-store'

export interface OptionItem {
  value: string
  label: string
  sub?: string
  disabled?: boolean
  /** 꺼진 까닭 — 마우스를 올리면 보이고, 화면 읽기 프로그램도 읽는다. */
  disabledReason?: string
  mono?: boolean
}

/** 추천 표시 — 작은 배지(design.md §7.3: pill 은 배지 · 칩만). */
/** 추천 표시. label 을 주면 그 말을 쓴다(시리즈 다음 화의 화면 비율은 "앞 화"). */
export function RecommendedBadge({ label }: { label?: string } = {}) {
  const t = useT()
  return <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 text-xs font-medium leading-5 text-muted-foreground">{label ?? t('Recommended')}</span>
}

/** AI가 고른 이유 한 줄. */
export function WhyLine({ text }: { text?: string | null }) {
  if (!text) return null
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  )
}

/**
 * 하나만 고르는 묶음(role=radiogroup). 화살표 키로 옮기며 고르고, 탭 키는 고른 칸(없으면 첫 칸)에만 멈춘다.
 *   꺼진 칸은 aria-disabled + 까닭(title) — 포커스는 건너뛴다.
 */
export function OptionGroup({
  label,
  hideLabel,
  options,
  value,
  recommended,
  recommendedLabel,
  onChange,
  className,
  size = 'md',
}: {
  label: string
  hideLabel?: boolean
  options: OptionItem[]
  value: string | null
  recommended?: string | null
  /** 추천 표시의 말(기본 "추천"). */
  recommendedLabel?: string
  onChange: (value: string) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  const labelId = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const enabled = options.flatMap((o, i) => (o.disabled ? [] : [i]))
  const selected = options.findIndex((o) => o.value === value && !o.disabled)
  const tabStop = selected >= 0 ? selected : enabled[0]

  const move = (from: number, dir: 1 | -1) => {
    if (!enabled.length) return
    const at = enabled.indexOf(from)
    const next = enabled[(at + dir + enabled.length) % enabled.length]
    refs.current[next]?.focus()
    onChange(options[next].value)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      move(i, 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      move(i, -1)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className={hideLabel ? 'sr-only' : 'text-sm font-medium'}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className={cn('grid gap-2', className)}>
        {options.map((o, i) => {
          const checked = o.value === value
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-disabled={o.disabled || undefined}
              title={o.disabled ? o.disabledReason : undefined}
              tabIndex={i === tabStop ? 0 : -1}
              onClick={() => {
                if (!o.disabled) onChange(o.value)
              }}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-md border text-left text-sm outline-none transition-colors duration-100 ease-out focus-visible:ring-[3px] focus-visible:ring-ring/50',
                size === 'sm' ? 'px-3 py-1.5' : 'min-h-10 px-3 py-2',
                checked ? 'border-foreground bg-accent text-foreground' : 'border-border bg-background hover:border-border-strong hover:bg-accent/50',
                o.disabled && 'cursor-not-allowed opacity-50 hover:border-border hover:bg-background',
              )}
            >
              {/* 이름은 낱말 단위로만 줄을 바꾼다(좁은 칸에서 옆 칸 밑으로 잘리던 nowrap 대신) — 추천 표시는 자리가 모자라면 다음 줄로(2026-10-27 오너). */}
              <span className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className={cn('break-keep text-pretty font-medium', o.mono && 'font-mono tabular-nums')}>{o.label}</span>
                {o.value === recommended ? <RecommendedBadge label={recommendedLabel} /> : null}
              </span>
              {o.sub ? <span className="break-keep text-pretty text-xs text-muted-foreground">{o.sub}</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 올린 파일 한 줄 — 이름 · 읽은 글자 수 · 빼기. */
export function FileChip({ file, onRemove, disabled }: { file: EntryFileMeta; onRemove?: () => void; disabled?: boolean }) {
  const t = useT()
  const Icon = file.kind === 'image' ? ImageIcon : FileText
  const status = file.noText
    ? t('No text found')
    : file.kind === 'text' || file.chars > 0
      ? t('{n} characters read', { n: file.chars })
      : t('Text is read from the image')
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background py-1 pl-2.5 pr-1 text-xs">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate font-medium">{file.name}</span>
      <span className="shrink-0 text-muted-foreground">{status}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={t('Remove the file')}
          title={t('Remove the file')}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </span>
  )
}

export function UploadingChip({ name }: { name: string }) {
  const t = useT()
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1 text-xs" role="status">
      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
      <span className="truncate">{name}</span>
      <span className="shrink-0 text-muted-foreground">{t('Uploading…')}</span>
    </span>
  )
}

export function useUploadErrorMessage(): (error: UploadError) => string {
  const t = useT()
  const locale = useLocale()
  return (error) => {
    if (error.code === 'bad_ext' || error.code === 'too_large' || error.code === 'empty') return fileProblemMessage({ code: error.code }, error.name, locale)
    if (error.code === 'unreadable') return t("Couldn't read this file. It may be damaged or protected with a password.")
    return t("Couldn't upload the file. Please try again.")
  }
}

/** Producer 에이전트 말풍선 — 단계 색은 이름 배지에만(design.md §2.9). */
export function AgentBubble({ children, alert }: { children: ReactNode; alert?: boolean }) {
  return (
    <div className="flex max-w-[88%] flex-col items-start gap-1.5">
      <span className={cn('rounded-full border px-1.5 text-xs font-medium leading-5', STAGE_BADGE_CLASS.entry)}>{STAGE_LABEL.entry}</span>
      <div
        role={alert ? 'alert' : undefined}
        className={cn('flex w-full flex-col gap-3 rounded-xl border bg-card px-4 py-3 text-sm', alert ? 'border-destructive/40' : 'border-border')}
      >
        {children}
      </div>
    </div>
  )
}

export function UserBubble({ text, fileName }: { text: string; fileName?: string }) {
  return (
    <div className="ml-auto flex max-w-[88%] flex-col items-end gap-2 rounded-xl bg-chat-user-bubble px-4 py-2.5 text-sm text-chat-user-bubble-foreground">
      {text ? <p className="select-text whitespace-pre-wrap break-words">{text}</p> : null}
      {fileName ? (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-chat-user-bubble-foreground/30 px-2 py-0.5 text-xs">
          <FileText className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{fileName}</span>
        </span>
      ) : null}
    </div>
  )
}

const noopSubscribe = () => () => {}

/** 브라우저에 붙은 뒤에만 true(서버 그리기 · 첫 그리기는 false). */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

/**
 * 전체 잠금 화면을 문서 끝에 띄운다 — AiBusyOverlay 는 열리는 동안 단계 화면([data-stage-content])을 inert 로 만드는데,
 *   이 화면이 그 안에 있으면 실패 때의 [다시 시도] 버튼까지 눌리지 않는다.
 */
export function BusyOverlayPortal(props: {
  open: boolean
  title: string
  description?: string
  steps?: AiBusyStep[]
  footer?: ReactNode
  /** false = 실패 안내(경고 표시 · 왼쪽 레일 단계 이동을 다시 연다). 기본 true. */
  busy?: boolean
}) {
  const mounted = useMounted()
  if (!mounted || !props.open) return null
  return createPortal(<AiBusyOverlay {...props} />, document.body)
}

export function stepsFrom(labels: string[], current: number, t: (key: string) => string): AiBusyStep[] {
  return labels.map((label, i) => ({ label: t(label), state: i < current ? 'done' : i === current ? 'current' : 'todo' }))
}
