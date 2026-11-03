// 화면 머리(v3 Title Row) — 큰 제목(28px 700) · 작은 꼬리표 · 메타(Inter 12px, 흐린 글자) · 오른쪽 단추(주요 단추는 크림).
//   예: <PageHeader title="산문" meta="씬 2 · 약 15초" actions={<NextStepButton />} />
//   위 막대(StudioTopBar) 아래, 작업 영역(px-8 pt-7) 맨 위에 둔다. design.md §13.1.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  tag,
  meta,
  actions,
  className,
}: {
  title: ReactNode
  /** 제목 옆 작은 꼬리표(예: "이름 미정", "초안"). */
  tag?: ReactNode
  /** 숫자 메타(예: "씬 2 · 샷 6 · 16초"). */
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-2', className)}>
      <h1 className="text-title font-bold text-foreground">{title}</h1>
      {tag ? (
        <span className="rounded-[6px] bg-card px-[7px] py-0.5 text-micro font-semibold text-muted-foreground">{tag}</span>
      ) : null}
      {meta ? <span className="font-num text-meta font-medium text-subtle-foreground">{meta}</span> : null}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}
