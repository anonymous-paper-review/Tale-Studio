'use client'

// Writer 공용 헤더 — 타이틀, 인라인 탭, 뷰별 액션 슬롯.

import type { ReactNode } from 'react'
import { WriterTabs } from '@/features/writer/writer-tabs'

interface WriterHeaderProps {
  description?: string
  actions?: ReactNode
}

export function WriterHeader({ description, actions }: WriterHeaderProps) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-4">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="shrink-0 text-lg font-semibold">Writers&apos; Room</h1>
          <WriterTabs />
        </div>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
