'use client'

// 산문 도구 줄(리뉴얼 1차 2026-10-19, 프로토타입 W1 condBar). "지금 산문 · 1~5분 · 코미디 · 소재 그대로" +
//   [직접 작성] + [✦ AI 다시 쓰기 ▾](아래로 펼치는 조건). 조건은 다시 쓴 안을 적용할 때만 바뀐다.
import { ChevronDown, Pencil, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useLocale, useT } from '@/lib/i18n'
import { proseConditionLine } from '@/lib/prose/conditions'
import { useWriterRoomStore } from '@/stores/writer-room-store'
import { RewriteOptions } from '@/features/prose/rewrite-options'
import type { ProseState } from '@/features/prose/use-prose'

export function ConditionBar({ prose }: { prose: ProseState }) {
  const t = useT()
  const locale = useLocale()
  const rewriteOpen = useWriterRoomStore((s) => s.rewriteOpen)
  const open = rewriteOpen && prose.tools.rewrite
  return (
    <div role="toolbar" aria-label={t('Prose tools')} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card/60 px-3 py-2" data-testid="prose-condition-bar">
      <span className="text-[11px] font-medium text-muted-foreground">{t('Current prose')}</span>
      <span className="min-w-0 text-sm" data-testid="prose-condition-line">{proseConditionLine(prose.conditions, locale)}</span>
      <span className="flex-1" />
      <Button size="sm" variant="outline" onClick={() => useWriterRoomStore.getState().requestManual()} disabled={!prose.tools.manual} data-testid="prose-manual-open">
        <Pencil className="size-4" />{t('Write directly')}
      </Button>
      <Popover open={open} onOpenChange={(next) => (next ? useWriterRoomStore.getState().openRewrite() : useWriterRoomStore.getState().closeRewrite())}>
        <PopoverTrigger asChild>
          <Button size="sm" disabled={!prose.tools.rewrite} aria-expanded={open} data-testid="prose-rewrite-open">
            <Sparkles className="size-4" />{t('AI rewrite')}<ChevronDown className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(28rem,calc(100vw-2rem))]" aria-label={t('Rewrite options')}>
          {open ? <RewriteOptions conditions={prose.conditions} onClose={() => useWriterRoomStore.getState().closeRewrite()} /> : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
