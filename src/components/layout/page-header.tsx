// 화면 머리(v3 Title Row) — 큰 제목(28px 700) · 작은 꼬리표 · 메타(Inter 12px, 흐린 글자) · 오른쪽 단추(주요 단추는 크림).
//   예: <PageHeader title="산문" meta="씬 2 · 약 15초" actions={<NextStepButton />} />
//   위 막대(StudioTopBar) 아래, 작업 영역(px-8 pt-7) 맨 위에 둔다. design.md §13.1.
//   variant="stacked"(11/5 시안 R2 프로젝트 목록): 제목 30px 700, 메타는 다음 줄(8 아래, 13px 500), 오른쪽 단추는 두 줄의 가운데.
//   예: <PageHeader variant="stacked" title="프로젝트" meta="전체 6" actions={<ListTools />} />
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  tag,
  meta,
  actions,
  variant = 'inline',
  className,
}: {
  title: ReactNode
  /** 제목 옆 작은 꼬리표(예: "이름 미정", "초안"). */
  tag?: ReactNode
  /** 숫자 메타(예: "씬 2 · 샷 6 · 16초"). */
  meta?: ReactNode
  actions?: ReactNode
  /** inline = 제목 · 꼬리표 · 메타 한 줄(작업 화면), stacked = 큰 제목 아래 줄에 메타(프로젝트 목록). */
  variant?: 'inline' | 'stacked'
  className?: string
}) {
  const tagChip = tag ? (
    <span className="rounded-[6px] bg-card px-[7px] py-0.5 text-micro font-semibold text-muted-foreground">{tag}</span>
  ) : null
  const actionRow = actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null

  if (variant === 'stacked') {
    return (
      <div className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-3', className)}>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[30px] leading-[1.2] font-bold text-foreground">{title}</h1>
            {tagChip}
          </div>
          {meta ? <p className="text-[13px] leading-[1.2] font-medium text-subtle-foreground">{meta}</p> : null}
        </div>
        {actionRow}
      </div>
    )
  }

  return (
    <div className={cn('flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-2', className)}>
      <h1 className="text-title font-bold text-foreground">{title}</h1>
      {tagChip}
      {meta ? <span className="font-num text-meta font-medium text-subtle-foreground">{meta}</span> : null}
      {actionRow}
    </div>
  )
}
