'use client'

// 스테이지 헤더 도움말 "?" 뱃지 — 제목 옆 아이콘 + 호버 툴팁 (2026-08-06:
//   헤더 아래 상시 설명문을 이관해 헤더를 한 줄로 줄인다. 모든 탭이 공유).
import { HelpCircle } from 'lucide-react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useT } from '@/lib/i18n'

export function StageHelpBadge({ text }: { text: string }) {
  const t = useT()
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t('Help: {text}', { text })}
            className="inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
          >
            <HelpCircle className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-72 text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
