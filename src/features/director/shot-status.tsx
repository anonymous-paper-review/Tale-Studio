'use client'

// Director 샷 상태를 보이는 작은 부품들(시안 D1 406:3717 · D3 406:4931 · R 416:4941, 오너 2026-11-14) —
//   꼬리 글 · 점 · "이미지 → 영상" 줄 · 주황 "이미지 필요" 태그 · 이미지 실패 판 · 상태 고르기.
//   판정은 lib/director/shot-state.ts 한 곳. 약속: tests/director/shot-status-ui.test.ts
import type { ReactNode } from 'react'
import { Check, ChevronDown, ImageIcon, RotateCw } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SHOT_DOT_FILL,
  SHOT_DOT_RING,
  SHOT_STATUS_FILTERS,
  SHOT_STATUS_FILTER_LABEL,
  shotStageDots,
  shotTail,
  type DirectorShotState,
  type ShotStageDot,
  type ShotStateColor,
  type ShotStatusFilter,
  type ShotTailPlace,
} from '@/lib/director/shot-state'
import { useT } from '@/lib/i18n'
import { countText } from '@/lib/i18n/count-text'
import { cn } from '@/lib/utils'

/** 상태 점 — 만드는 중은 테두리만 있는 고리, 끝남은 꽉 찬 점(시안 R). */
export function ShotStateDot({ color, ring, className }: { color: ShotStateColor | null; ring: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        color === null ? 'bg-subtle-foreground/60' : ring ? cn('border-[1.5px] bg-transparent', SHOT_DOT_RING[color]) : SHOT_DOT_FILL[color],
        className,
      )}
    />
  )
}

/** 노드 아래 꼬리 줄(시안 D1 노드형 406:4051 "● 이미지 필요 러프만 있음" · "● 영상 없음") — 점 · 상태 글 · 흐린 덧말. */
export function StateTailLine({
  label,
  color,
  ring,
  note,
  children,
  className,
}: {
  label: string
  color: ShotStateColor | null
  ring: boolean
  note?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const t = useT()
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold', className)}>
      <ShotStateDot color={color} ring={ring} />
      <span className={cn('whitespace-nowrap', color === 'destructive' ? 'text-destructive' : 'text-foreground')}>{t(label)}</span>
      {children}
      {note && <span className="flex min-w-0 items-center gap-2 text-[11px] font-normal text-subtle-foreground">{note}</span>}
    </div>
  )
}

/** 샷 꼬리 — 카드는 그림 위 왼쪽 아래 알약(시안 D1 "● 대기" · D3 "● 이미지 만드는 중"), 노드는 노드 아래 줄.
 *  판정은 shot-state.ts 의 shotTail 한 곳(다시 만들기 실패 · 일괄 기다림 · 노드형 이미지 필요). */
export function ShotStateTail({
  state,
  place = 'card',
  waiting = false,
  remakeFailed = false,
  label,
  note,
  retry,
  className,
}: {
  state: DirectorShotState
  place?: ShotTailPlace
  /** 일괄이 맡았지만 아직 큐에 앉지 않았다("대기 중"). */
  waiting?: boolean
  /** 옛 그림이 남은 다시 만들기 실패("다시 만들기 실패"). */
  remakeFailed?: boolean
  /** 상태 글 대신 쓸 글(영어 키) — 예: 묶음에서 영상 차례를 기다리는 샷 "순서 기다리는 중". 주면 기다림 · 실패 글보다 먼저다. */
  label?: string
  /** 노드 꼬리 뒤 흐린 덧말(예: "러프만 있음"). */
  note?: ReactNode
  /** 다시 만들기 실패 꼬리일 때만 옆에 다는 [다시 만들기]. */
  retry?: ReactNode
  className?: string
}) {
  const t = useT()
  const tail = shotTail(state, { imageWaiting: waiting && !label, imageRemakeFailed: remakeFailed && !label }, place)
  const text = label ?? tail.label
  const action = tail.remakeFailed ? retry : null
  if (place === 'node') {
    return (
      <StateTailLine label={text} color={tail.color} ring={tail.ring} note={note} className={className}>
        {action}
      </StateTailLine>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-foreground">
        <ShotStateDot color={tail.color} ring={tail.ring} />
        <span className="whitespace-nowrap">{t(text)}</span>
      </span>
      {action}
    </span>
  )
}

function stageDotColor(dot: ShotStageDot): { color: ShotStateColor | null; ring: boolean } {
  switch (dot) {
    case 'none':
      return { color: null, ring: false }
    case 'image_progress':
      return { color: 'stage-director', ring: true }
    case 'image_done':
      return { color: 'stage-director', ring: false }
    case 'video_progress':
      return { color: 'state-video', ring: true }
    case 'video_done':
      return { color: 'success', ring: false }
    case 'failed':
      return { color: 'destructive', ring: false }
  }
}

/** 카드 아래 "● 이미지 → ● 영상" 줄(시안 D1 · D3). */
export function ShotPipelineRow({ state, className }: { state: DirectorShotState; className?: string }) {
  const t = useT()
  const dots = shotStageDots(state)
  const image = stageDotColor(dots.image)
  const video = stageDotColor(dots.video)
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg bg-card px-2.5 py-1.5 text-[11.5px] font-medium text-muted-foreground',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <ShotStateDot color={image.color} ring={image.ring} />
        {t('Image')}
      </span>
      <span aria-hidden className="text-subtle-foreground">→</span>
      <span className="inline-flex items-center gap-1.5">
        <ShotStateDot color={video.color} ring={video.ring} />
        {t('Video')}
      </span>
    </div>
  )
}

/** 이미지가 필요한 샷의 주황 태그(시안 R "주황 태그 '이미지 필요'"). */
export function ImageNeededTag({ className }: { className?: string }) {
  const t = useT()
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[6px] bg-black/45 px-1.5 py-0.5 text-[11px] font-semibold text-stage-producer',
        className,
      )}
    >
      <ImageIcon className="size-3 shrink-0" />
      <span className="whitespace-nowrap">{t('Image needed')}</span>
    </span>
  )
}

/** 이미지를 못 만든 샷의 그림 자리(시안 없음 — 결정 페이지 추천: 빨강 테두리 + 다시 만들기). */
export function ImageFailedPanel({ onRetry, detail, disabled }: { onRetry: () => void; detail?: string | null; disabled?: boolean }) {
  const t = useT()
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-destructive/10 p-3 text-center" title={detail ?? undefined}>
      <span className="text-[12px] font-semibold text-destructive">{t("Couldn't make the image")}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation()
          onRetry()
        }}
        className="inline-flex h-7 items-center gap-1.5 rounded-full bg-card px-3 text-[11.5px] font-semibold text-foreground shadow-node transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RotateCw className="size-3" />
        {t('Make again')}
      </button>
    </div>
  )
}

export interface StatusFilterRow {
  key: ShotStatusFilter
  label: string
  count: number
  checked: boolean
  color: ShotStateColor | null
  ring: boolean
}

const FILTER_TONE: Record<ShotStatusFilter, { color: ShotStateColor | null; ring: boolean }> = {
  all: { color: null, ring: false },
  image_needed: { color: 'stage-producer', ring: false },
  image_generating: { color: 'stage-director', ring: true },
  image_done: { color: 'stage-director', ring: false },
  video_generating: { color: 'state-video', ring: true },
  video_done: { color: 'success', ring: false },
  video_failed: { color: 'destructive', ring: false },
}

/** 상태 고르기 줄 — 점 · 이름 · 수 · 고름(시안 D1 드롭다운 = 범례). */
export function statusFilterRows(counts: Record<ShotStatusFilter, number>, value: ShotStatusFilter): StatusFilterRow[] {
  return SHOT_STATUS_FILTERS.map((key) => ({
    key,
    label: SHOT_STATUS_FILTER_LABEL[key],
    count: counts[key],
    checked: key === value,
    color: FILTER_TONE[key].color,
    ring: FILTER_TONE[key].ring,
  }))
}

const CHECK_TEXT: Record<ShotStateColor, string> = {
  'stage-producer': 'text-stage-producer',
  'stage-director': 'text-stage-director',
  'state-video': 'text-state-video',
  success: 'text-success',
  destructive: 'text-destructive',
}

/** 상태 고르기 줄 앞 표시 — 고른 줄은 점 자리에 체크(상태 줄은 그 상태 색, 리드 검토 c ④b), 나머지는 점. */
export function StatusFilterRowMark({ row }: { row: StatusFilterRow }) {
  if (row.checked) {
    return <Check aria-hidden className={cn('size-3.5 shrink-0', row.color === null ? 'text-foreground' : CHECK_TEXT[row.color])} />
  }
  if (row.key === 'all') return <span aria-hidden className="size-3.5 shrink-0" />
  return <ShotStateDot color={row.color} ring={row.ring} className="mx-[3px]" />
}

/** 위쪽 1줄 오른쪽 상태 고르기(시안 D1 "전체 4 ▾"). 고르면 그 상태 샷만 보인다. */
export function ShotStatusFilterMenu({
  counts,
  value,
  onChange,
  className,
}: {
  counts: Record<ShotStatusFilter, number>
  value: ShotStatusFilter
  onChange: (next: ShotStatusFilter) => void
  className?: string
}) {
  const t = useT()
  const rows = statusFilterRows(counts, value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('Show shots by status')}
        className={cn(
          'flex h-[34px] shrink-0 items-center gap-1.5 rounded-full bg-background px-3.5 text-[13px] font-semibold text-foreground shadow-node transition-colors duration-100 hover:bg-card',
          className,
        )}
      >
        <span>{t(SHOT_STATUS_FILTER_LABEL[value])}</span>
        <span className="font-num tabular-nums text-muted-foreground">{counts[value]}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        {rows.map((row) => (
          <DropdownMenuItem
            key={row.key}
            onSelect={() => onChange(row.key)}
            aria-checked={row.checked}
            role="menuitemradio"
            className={cn('flex items-center gap-2.5', row.checked && 'bg-accent')}
          >
            <StatusFilterRowMark row={row} />
            <span className="flex-1">{t(row.label)}</span>
            <span className="font-num tabular-nums text-muted-foreground">{row.count}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 2줄 왼쪽 고르기 줄(시안 D1 "☐ 전체 4개" · D2 "☑ 4개 중 4개 선택 [선택 풀기]"). */
export function PickAllBar({
  total,
  picked,
  onToggleAll,
  onClear,
}: {
  total: number
  picked: number
  onToggleAll: () => void
  onClear: () => void
}) {
  const t = useT()
  const state: boolean | 'mixed' = picked === 0 ? false : picked >= total ? true : 'mixed'
  return (
    <div className="flex shrink-0 items-center gap-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={state}
        aria-label={t('Pick every shot')}
        onClick={onToggleAll}
        disabled={total === 0}
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-[6px] border-[1.5px] transition-colors disabled:opacity-50',
          state === false ? 'border-muted-foreground/60 bg-transparent hover:border-foreground' : 'border-info bg-info text-info-foreground',
        )}
      >
        {state === true && <Check className="size-3.5" strokeWidth={3} />}
        {state === 'mixed' && <span className="h-0.5 w-2.5 rounded-full bg-current" />}
      </button>
      <span className="whitespace-nowrap text-[14px] font-semibold text-foreground">
        {picked === 0 ? countText(t, total, 'All 1 shot', 'All {count} shots', { count: total }) : t('{picked} of {total} picked', { picked, total })}
      </span>
      {picked > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="h-8 shrink-0 rounded-full border border-border px-3 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-accent"
        >
          {t('Clear picks')}
        </button>
      )}
    </div>
  )
}

/** 카드 왼쪽 위 고름 상자(시안 D2) — 고르면 파랑 체크. */
export function PickBox({ picked, onToggle, className }: { picked: boolean; onToggle: () => void; className?: string }) {
  const t = useT()
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={picked}
      aria-label={t('Pick this shot')}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        'flex size-[22px] shrink-0 items-center justify-center rounded-[6px] border-[1.5px] transition-colors',
        picked ? 'border-info bg-info text-info-foreground' : 'border-white/45 bg-black/35 hover:border-white/80',
        className,
      )}
    >
      {picked && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  )
}
