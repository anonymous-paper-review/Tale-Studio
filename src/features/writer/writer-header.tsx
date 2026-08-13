'use client'

// Writer 공용 헤더 — 타이틀, 인라인 탭, 뷰별 액션 슬롯.

import type { ReactNode } from 'react'
import { StageHelpBadge } from '@/components/stage-help-badge'
import { WriterTabs } from '@/features/writer/writer-tabs'
import { WriterEnginePicker } from '@/features/writer/writer-engine-picker'
import { useProjectStore } from '@/stores/project-store'

interface WriterHeaderProps {
  description?: string
  actions?: ReactNode
}

export function WriterHeader({ description, actions }: WriterHeaderProps) {
  const projectId = useProjectStore((state) => state.projectId)

  // 탭은 타이틀 아래 행으로 — artist 헤더(제목 → TabsList) 구조와 통일(#c1 2026-07-13).
  // 액션(씬 추가 등)은 탭과 같은 행 우측 — 수직 위치를 탭과 맞춘다(#c8 2026-07-14).
  // 도움말은 상시 설명문 대신 "?" 뱃지 호버로 (2026-08-06).
  return (
    <header className="shrink-0 border-b border-border px-6 py-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <h1 className="text-lg font-semibold">Writers&apos; Room</h1>
        {description ? <StageHelpBadge text={description} /> : null}
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <WriterTabs />
        <div className="flex shrink-0 items-center gap-3">
          <WriterEnginePicker projectId={projectId} />
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      </div>
    </header>
  )
}
