'use client'

// Producer 시작 화면 공용 부품(리뉴얼 1차 2026-10-19): 고르기 묶음(라디오) · 추천 표시 · 이유 한 줄 · 파일 칩 · 말풍선 · 잠금 화면 띄우기.
//   두 탭(화면에서 고르기 · 채팅으로 만들기)이 같은 부품을 써서 같은 값이 같은 모양으로 보인다. 색은 토큰만(design.md §2).
//   v3(2026-11-03): 고르기 칸은 controls 의 고르기 칩 · 선택 카드(고른 것 = 지금 단계 색), 말풍선은 채팅과 같은 Lumi 말풍선.
import { useId, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FileText, ImageIcon, Loader2, X } from 'lucide-react'
import { AiBusyOverlay, type AiBusyStep } from '@/components/ai-busy-overlay'
import { ChoiceChip, OptionCard, RecommendBadge } from '@/components/controls/choice-chip'
import { LumiAvatar } from '@/components/lumi/lumi'
import { STAGE_PERSONA, type LumiPersona } from '@/lib/lumi'
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

/** 꺼진 칸(aria-disabled) — 까닭 툴팁이 보이도록 진짜 disabled 대신 쓴다. 흐리게 · 눌러도 바뀌지 않는 모양. */
export const OPTION_OFF_CLASS = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-card'

/**
 * 꺼진 선택 카드의 까닭 — 선택 카드(OptionCard)의 title 은 카드 제목 칸이라 버튼에 말풍선(title 속성)을 못 단다.
 *   마우스 말풍선은 감싼 칸(상자 없는 contents)의 title 로, 화면 읽기는 숨긴 글로 — 카드에 aria-describedby={id} 를 준다.
 *   까닭이 없으면 카드만 그린다. 약속: tests/producer/entry-settings-controls.test.ts
 */
export function WithOffReason({ reason, id, children }: { reason?: string; id: string; children: ReactNode }) {
  if (!reason) return <>{children}</>
  return (
    <span title={reason} className="contents">
      {children}
      <span id={id} className="sr-only">
        {reason}
      </span>
    </span>
  )
}

/** 추천 표시(v3 Control/Badge, 지금 단계 색). label 을 주면 그 말을 쓴다(시리즈 다음 화의 화면 비율은 "앞 화"). */
export function RecommendedBadge({ label }: { label?: string } = {}) {
  return <RecommendBadge>{label}</RecommendBadge>
}

/** AI가 고른 이유 한 줄(✦ + 보조 글자). */
export function WhyLine({ text, className }: { text?: string | null; className?: string }) {
  if (!text) return null
  return (
    <p className={cn('flex items-start gap-1.5 text-caption text-muted-foreground', className)}>
      <span aria-hidden>✦</span>
      <span>{text}</span>
    </p>
  )
}

/**
 * 하나만 고르는 묶음(role=radiogroup). 화살표 키로 옮기며 고르고, 탭 키는 고른 칸(없으면 첫 칸)에만 멈춘다.
 *   꺼진 칸은 aria-disabled + 까닭(title) — 포커스는 건너뛴다.
 *   v3: variant="chip" = 고르기 칩(장르처럼 줄바꿈하며 늘어선 알약), "card" = 선택 카드(제목 + 한 줄 설명).
 *   aside = 묶음 이름 오른쪽(AI가 고른 이유 한 줄 등, 시안 E3).
 */
export function OptionGroup({
  label,
  hideLabel,
  aside,
  options,
  value,
  recommended,
  recommendedLabel,
  onChange,
  className,
  variant = 'card',
}: {
  label: string
  hideLabel?: boolean
  aside?: ReactNode
  options: OptionItem[]
  value: string | null
  recommended?: string | null
  /** 추천 표시의 말(기본 "추천"). */
  recommendedLabel?: string
  onChange: (value: string) => void
  className?: string
  variant?: 'chip' | 'card'
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
    <div className="flex flex-col gap-3">
      {hideLabel ? (
        <span id={labelId} className="sr-only">
          {label}
        </span>
      ) : (
        <div className="flex items-start gap-2.5">
          <span id={labelId} className="shrink-0 text-body font-semibold">
            {label}
          </span>
          {aside ? <div className="ml-auto min-w-0 text-right">{aside}</div> : null}
        </div>
      )}
      <div role="radiogroup" aria-labelledby={labelId} className={cn(variant === 'chip' ? 'flex flex-wrap gap-2' : 'grid gap-2.5', className)}>
        {options.map((o, i) => {
          const checked = o.value === value
          const isRecommended = o.value === recommended
          // 추천 표시의 말을 바꾼 칸(시리즈 "앞 화")은 이름 옆에 그 배지를 직접 단다 — 칸 부품의 추천 배지는 늘 "추천"이다.
          const name = (
            <>
              {/* 이름은 낱말 단위로만 줄을 바꾼다(좁은 칸에서 옆 칸 밑으로 잘리던 nowrap 대신)(2026-10-27 오너). */}
              <span className={cn('break-keep text-pretty', o.mono && 'font-num tabular-nums')}>{o.label}</span>
              {isRecommended && recommendedLabel ? <RecommendedBadge label={recommendedLabel} /> : null}
            </>
          )
          const reason = o.disabled ? o.disabledReason : undefined
          const reasonId = `${labelId}-off-${i}`
          const common = {
            ref: (el: HTMLButtonElement | null) => {
              refs.current[i] = el
            },
            role: 'radio' as const,
            selected: checked,
            recommended: isRecommended && !recommendedLabel,
            'aria-disabled': o.disabled || undefined,
            tabIndex: i === tabStop ? 0 : -1,
            onClick: () => {
              if (!o.disabled) onChange(o.value)
            },
            onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => onKeyDown(e, i),
            className: OPTION_OFF_CLASS,
          }
          return variant === 'chip' ? (
            <ChoiceChip key={o.value} {...common} title={reason}>
              {name}
            </ChoiceChip>
          ) : (
            <WithOffReason key={o.value} reason={reason} id={reasonId}>
              <OptionCard
                {...common}
                aria-describedby={reason ? reasonId : undefined}
                title={name}
                description={o.sub ? <span className="break-keep text-pretty">{o.sub}</span> : undefined}
              />
            </WithOffReason>
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
    <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-chip py-1 pl-2.5 pr-1 text-caption">
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
    <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-chip px-2.5 py-1 text-caption" role="status">
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

/**
 * Producer 에이전트 말풍선 — 오른쪽 채팅과 같은 Lumi 말풍선(v3: Lumi 얼굴 · 단계 색 이름 · 왼쪽 위 모서리 6).
 *   11/5 시안(P1 · P2): 얼굴과 말풍선 사이 12 · 안쪽 18/22 · 줄 사이 12 · 모서리 18. roomy = 정리 카드처럼 표가 든 말풍선(안쪽 20/30 · 사이 15).
 */
export function AgentBubble({ children, alert, roomy }: { children: ReactNode; alert?: boolean; roomy?: boolean }) {
  return (
    <div className="flex max-w-[88%] items-start gap-3">
      <LumiAvatar persona={STAGE_PERSONA.entry} state={alert ? 'error' : 'idle'} size={28} />
      <div
        role={alert ? 'alert' : undefined}
        className={cn(
          'flex min-w-0 flex-1 flex-col rounded-[18px] rounded-tl-[6px] bg-chat-lumi-bubble text-chat text-foreground',
          roomy ? 'gap-[15px] px-[30px] py-5' : 'gap-3 px-[22px] py-[18px]',
          alert && 'ring-1 ring-destructive/40',
        )}
      >
        <p className="text-micro font-semibold leading-none text-stage">Lumi</p>
        {children}
      </div>
    </div>
  )
}

/** 내 말풍선 — 11/5 시안(P2): 안쪽 14/20 · 모서리 18(오른쪽 위 6). */
export function UserBubble({ text, fileName }: { text: string; fileName?: string }) {
  return (
    <div className="ml-auto flex max-w-[88%] flex-col items-end gap-2 rounded-[18px] rounded-tr-[6px] bg-chat-user-bubble px-5 py-3.5 text-chat text-chat-user-bubble-foreground">
      {text ? <p className="select-text whitespace-pre-wrap break-words">{text}</p> : null}
      {fileName ? (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-chip px-2 py-0.5 text-caption">
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
  /** 큰 Lumi 의 옷(v3) — 기다리는 동안 넘어가는 단계. AiBusyOverlay 의 lumi. */
  lumi?: LumiPersona
}) {
  const mounted = useMounted()
  if (!mounted || !props.open) return null
  return createPortal(<AiBusyOverlay {...props} />, document.body)
}

export function stepsFrom(labels: string[], current: number, t: (key: string) => string): AiBusyStep[] {
  return labels.map((label, i) => ({ label: t(label), state: i < current ? 'done' : i === current ? 'current' : 'todo' }))
}
