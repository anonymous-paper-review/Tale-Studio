// 단계 칩(v3 Nav/Stage Header 의 Stage Badge) — 그 단계 배지 그라데이션 위에 단계 이름. 위 막대 · 단계 표시에 쓴다.
//   색은 data-stage(화면 이름)로 정한다 — 단계 id 는 옛 이름이라 STAGE_PERSONA 로 바꿔 붙인다.
import { STAGE_LABEL } from '@/lib/constants'
import { STAGE_PERSONA } from '@/lib/lumi'
import { cn } from '@/lib/utils'
import type { StageId } from '@/types'

export function StageChip({ stage, className }: { stage: StageId; className?: string }) {
  return (
    <span
      data-stage={STAGE_PERSONA[stage]}
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center rounded-full bg-stage-badge px-2.5 text-micro font-semibold leading-none text-stage-badge-foreground',
        className,
      )}
    >
      {STAGE_LABEL[stage]}
    </span>
  )
}
