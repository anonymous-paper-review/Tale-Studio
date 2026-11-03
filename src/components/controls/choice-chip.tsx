'use client'

// 고르기 칩 · 추천 배지 · 선택 카드(v3 Control/Choice Chip · Control/Badge · Control/Option Card).
//   고른 것 = 지금 단계 색 1.5px 테두리 + 그 색 18% 바탕(Lumi 가이드 .quick-reply[aria-pressed="true"]).
//   지금 단계 색은 위에서 정한다(스튜디오 레이아웃의 data-stage) — 단계 밖에서는 크림.
//   고름은 색만으로 알리지 않는다 — 눌러 켜고 끄는 단추는 aria-pressed, 하나만 고르는 묶음(role="radiogroup" 안 role="radio")은 aria-checked.
//   약속: tests/producer/choice-radio.test.ts
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

/** "추천" 배지 — 지금 단계 색 바탕, 어두운 글씨(v3 10px 600). */
export function RecommendBadge({ className, children }: { className?: string; children?: ReactNode }) {
  const t = useT()
  return (
    <span
      className={cn(
        'inline-flex h-4 shrink-0 items-center rounded-full bg-stage px-1.5 text-tag font-semibold leading-none text-on-stage',
        className,
      )}
    >
      {children ?? t('Recommended')}
    </span>
  )
}

/** 고름 알림 — role="radio" 면 aria-checked, 아니면 aria-pressed. role 바로 뒤에 붙인다(서버 그리기에서 role="radio" aria-checked="…" 순서). */
function selectionState(role: ComponentProps<'button'>['role'], selected: boolean) {
  return role === 'radio' ? { role, 'aria-checked': selected } : { role, 'aria-pressed': selected }
}

type ChipProps = Omit<ComponentProps<'button'>, 'aria-pressed' | 'aria-checked'> & {
  selected?: boolean
  /** 추천 배지를 붙인다(Lumi 가 미리 고른 값). */
  recommended?: boolean
  /** 채팅 안 빠른 답은 한 단 밝은 칩 바탕(v3 채팅 칩 #3A3936), 화면 안은 카드 바탕(#30302E). */
  tone?: 'screen' | 'chat'
}

/** 고르기 칩 — 장르 · 필터 · 빠른 답. 32px 알약. */
export function ChoiceChip({ selected = false, recommended = false, tone = 'screen', className, children, type = 'button', role, ...props }: ChipProps) {
  return (
    <button
      type={type}
      {...selectionState(role, selected)}
      className={cn(
        'inline-flex min-h-8 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-1 text-label text-foreground transition-colors duration-100 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'border-stage bg-stage/18 font-semibold'
          : cn('border-transparent font-medium hover:bg-accent', tone === 'chat' ? 'bg-chat-chip' : 'bg-card'),
        className,
      )}
      {...props}
    >
      {children}
      {recommended ? <RecommendBadge /> : null}
    </button>
  )
}

type OptionCardProps = Omit<ComponentProps<'button'>, 'aria-pressed' | 'aria-checked' | 'title'> & {
  title: ReactNode
  /** 한 줄 설명(예: "광고 · 티저"). */
  description?: ReactNode
  selected?: boolean
  recommended?: boolean
}

/** 선택 카드 — 길이 · 화면 비율처럼 제목 + 한 줄 설명을 고를 때. 모서리 14. */
export function OptionCard({ title, description, selected = false, recommended = false, className, type = 'button', role, ...props }: OptionCardProps) {
  return (
    <button
      type={type}
      {...selectionState(role, selected)}
      className={cn(
        'flex min-w-0 flex-col items-start gap-1 rounded-[14px] border-[1.5px] px-4 py-3.5 text-left transition-colors duration-100 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        selected ? 'border-stage bg-stage/18' : 'border-transparent bg-card hover:bg-accent',
        className,
      )}
      {...props}
    >
      <span className="flex items-center gap-1.5 text-body font-semibold text-foreground">
        {title}
        {recommended ? <RecommendBadge /> : null}
      </span>
      {description ? (
        <span className={cn('text-caption', selected ? 'text-foreground' : 'text-muted-foreground')}>{description}</span>
      ) : null}
    </button>
  )
}
