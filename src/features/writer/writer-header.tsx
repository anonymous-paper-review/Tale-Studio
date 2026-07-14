'use client'

// Writer 공용 헤더 — 타이틀, 인라인 탭, 뷰별 액션 슬롯.

import type { ReactNode } from 'react'
import { WriterTabs } from '@/features/writer/writer-tabs'

interface WriterHeaderProps {
  description?: string
  actions?: ReactNode
}

export function WriterHeader({ description, actions }: WriterHeaderProps) {
  // 탭은 타이틀 아래 행으로 — artist 헤더(제목 → TabsList) 구조와 통일(#c1 2026-07-13).
  // 액션(씬 추가 등)은 탭과 같은 행 우측 — 수직 위치를 탭과 맞춘다(#c8 2026-07-14).
  return (
    <header className="shrink-0 border-b border-border px-6 py-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold">Writers&apos; Room</h1>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <WriterTabs />
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
