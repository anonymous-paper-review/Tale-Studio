'use client'

// 인물·배경 압축 표시(2026-10-01 오너 "인물, 배경들은 압축해서 표시해줘"). 한 줄짜리 칩 목록이 기본이고,
//   칩을 누르면 그 카드만 펼친다 — 잠기기 전에는 기존 편집 줄(renderEditor), 잠긴 뒤에는 읽기 전용 내용.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

export interface RosterItem {
  id: string
  name: string
  /** 칩의 둘째 줄(역할 등). */
  sub?: string
  imageUrl?: string
  /** 비어 있는 필수 칸 수 — 0 이면 준비됨. */
  missing: number
  /** 잠긴 뒤 펼쳤을 때 보이는 읽기 전용 내용. */
  detail: Array<{ label: string; value: string }>
}

export function CompactRoster({
  items,
  openId,
  onOpenChange,
  locked,
  renderEditor,
  unnamedLabel,
}: {
  items: RosterItem[]
  openId: string | null
  onOpenChange: (id: string | null) => void
  locked: boolean
  renderEditor: (id: string) => ReactNode
  unnamedLabel: string
}) {
  const t = useT()
  const open = items.find((item) => item.id === openId) ?? null
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active = item.id === openId
          const name = item.name.trim() || unnamedLabel
          return (
            <button
              key={item.id}
              type="button"
              aria-expanded={active}
              data-testid="roster-chip"
              onClick={() => onOpenChange(active ? null : item.id)}
              className={cn(
                'flex max-w-60 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-left text-xs transition-colors',
                active ? 'border-border-strong bg-accent' : 'border-border bg-card/70 hover:bg-accent',
              )}
            >
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 원본 그림(외부 저장소)
                <img src={item.imageUrl} alt="" className="size-6 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                  {name.slice(0, 1)}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate font-medium">{name}</span>
                {item.sub ? <span className="block truncate text-[10px] text-muted-foreground">{item.sub}</span> : null}
              </span>
              {/* 잠긴 뒤에는 Producer 에서 채울 수 없으니 빈 칸 수를 보이지 않는다. */}
              {item.missing > 0 && !locked ? (
                <span
                  className="ml-1 shrink-0 rounded-full bg-warning/15 px-1.5 text-[10px] font-medium text-warning"
                  title={t('{count} fields are empty', { count: item.missing })}
                >
                  {item.missing}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {open ? (
        locked ? (
          <dl className="space-y-2 rounded-xl border border-border bg-card/70 p-4 text-sm">
            {open.detail
              .filter((row) => row.value.trim())
              .map((row) => (
                <div key={row.label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
                  <dt className="text-xs text-muted-foreground">{row.label}</dt>
                  <dd className="whitespace-pre-wrap">{row.value}</dd>
                </div>
              ))}
          </dl>
        ) : (
          renderEditor(open.id)
        )
      ) : null}
    </div>
  )
}
