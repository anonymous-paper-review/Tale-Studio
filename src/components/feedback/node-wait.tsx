'use client'

// 노드 · 카드 위에서 기다릴 때(11/5 Figma SYS "노드 · 카드 위" · DG Loading Card) — 그 노드 크기에 맞춰 덮고,
//   여백 18 · Lumi S(만드는 중) · 단계 색 테두리 1.5 · 진행 막대. 한 번에 하나씩 덮고 나머지 노드는 그대로 둔다(붙이는 쪽이 정한다).
//   완성 표시: 단계 그라데이션 "✓ 완성" 배지(DoneBadge) + 단계 색 테두리(STAGE_FRAME).
//   색은 lumi 옷(data-stage) — 놓인 화면이 다른 단계여도 Lumi 와 테두리 · 막대가 같은 단계를 말한다. 약속: tests/project/node-wait.test.ts
import { Lumi } from '@/components/lumi/lumi'
import { useT } from '@/lib/i18n'
import { lumiStageTheme, type LumiPersona } from '@/lib/lumi'
import { cn } from '@/lib/utils'

/** 기다림 · 완성 노드의 테두리 — 둘 다 단계 색 1.5(SYS). 노드의 원래 테두리 class 자리에 넣고, 완성은 DoneBadge 를 함께 단다. */
export const STAGE_FRAME = 'border-[1.5px] border-stage'

export interface NodeWaitCardProps {
  /** 기다리는 단계 옷 — 테두리 · 막대 색도 이 단계. */
  lumi: LumiPersona
  title: string
  description?: string
  /** 0~100. 없으면 막대를 그리지 않는다. */
  progress?: number
  /** 맨 아래 작은 줄(예: "다음 차례: 새 샷 → 샷 2"). */
  note?: string
  className?: string
}

/** 놓인 노드(부모 relative)를 꽉 채우는 기다림 카드. */
export function NodeWaitCard({ lumi, title, description, progress, note, className }: NodeWaitCardProps) {
  const pct = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : null
  return (
    <div
      data-stage={lumiStageTheme(lumi)}
      role="status"
      aria-live="polite"
      className={cn(
        'absolute inset-0 z-10 flex flex-col items-center justify-center gap-[15px] rounded-[inherit] bg-side p-[18px] text-center shadow-dialog',
        STAGE_FRAME,
        className,
      )}
    >
      <Lumi persona={lumi} state="loading" size="s" />
      <div className="flex flex-col items-center gap-1">
        <p className="text-[14px] font-bold leading-[1.2] text-foreground">{title}</p>
        {description ? <p className="text-caption leading-[1.55] text-subtle-foreground">{description}</p> : null}
      </div>
      {pct !== null ? (
        <div className="h-1 w-full overflow-hidden rounded-[2px] bg-progress-track" aria-hidden>
          <div className="h-full rounded-[2px] bg-stage-gradient transition-[width] duration-350 ease-out" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {note ? <p className="text-micro font-medium text-subtle-foreground">{note}</p> : null}
    </div>
  )
}

/** 완성 배지 — 단계 그라데이션 알약 "✓ 완성". lumi 를 주면 그 단계 색, 안 주면 놓인 화면의 단계 색. */
export function DoneBadge({ lumi, className }: { lumi?: LumiPersona; className?: string }) {
  const t = useT()
  return (
    <span
      data-stage={lumi ? lumiStageTheme(lumi) : undefined}
      className={cn('inline-flex h-5 items-center rounded-full bg-stage-gradient px-2 text-tag font-semibold leading-none text-on-stage', className)}
    >
      {t('✓ Complete')}
    </span>
  )
}
