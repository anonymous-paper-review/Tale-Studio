'use client'

// 산문 조건 칩 · 고치기 단추(리뉴얼 1차 2026-10-19 프로토타입 W1 condBar → v3 W1 2026-11-03).
//   v3: 화면 머리 오른쪽에 [직접 작성] · [✦ AI 다시 쓰기](아래로 펼치는 조건) · 크림 [브레이크다운하기], 머리 아래에
//   "지금 산문 조건 · 길이 15초 이하 · 장르 코미디 · 소재 그대로" 칩 줄. 칩은 정해진 값만 보인다(proseConditionChips).
//   조건은 다시 쓴 안을 적용할 때만 바뀐다.
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DrawIcon } from '@/components/icons/v3-icons'
import { useLocale, useT } from '@/lib/i18n'
import { proseConditionChips } from '@/lib/prose/conditions'
import { useWriterRoomStore } from '@/stores/writer-room-store'
import { RewriteOptions } from '@/features/prose/rewrite-options'
import type { ProseState } from '@/features/prose/use-prose'

/** "지금 산문 조건" 칩 줄 — 이름(흐린 글자) · 값(굵은 글자)인 알약. */
export function ProseConditionChips({ prose }: { prose: ProseState }) {
  const t = useT()
  const locale = useLocale()
  const chips = proseConditionChips(prose.conditions, locale)
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="prose-condition-bar">
      <span className="text-micro font-semibold text-subtle-foreground">{t('Current prose conditions')}</span>
      <span className="contents" data-testid="prose-condition-line">
        {chips.map((chip) => (
          <span key={chip.key} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-card pl-2.5 pr-3">
            <span className="text-caption text-subtle-foreground">{chip.label}</span>
            <span className="text-label font-semibold text-foreground">{chip.value}</span>
          </span>
        ))}
      </span>
    </div>
  )
}

/** 화면 머리의 [직접 작성] · [✦ AI 다시 쓰기] — 직접 작성은 손으로 고치는 창, AI 다시 쓰기는 조건을 고르는 팝오버를 연다. */
export function ProseEditActions({ prose }: { prose: ProseState }) {
  const t = useT()
  const rewriteOpen = useWriterRoomStore((s) => s.rewriteOpen)
  const open = rewriteOpen && prose.tools.rewrite
  return (
    <div role="toolbar" aria-label={t('Prose tools')} className="flex items-center gap-2">
      <Button variant="secondary" onClick={() => useWriterRoomStore.getState().requestManual()} disabled={!prose.tools.manual} data-testid="prose-manual-open">
        <DrawIcon className="size-4" />{t('Write directly')}
      </Button>
      <Popover open={open} onOpenChange={(next) => (next ? useWriterRoomStore.getState().openRewrite() : useWriterRoomStore.getState().closeRewrite())}>
        <PopoverTrigger asChild>
          <Button variant="secondary" disabled={!prose.tools.rewrite} aria-expanded={open} data-testid="prose-rewrite-open">
            <Sparkles className="size-4" />{t('AI rewrite')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(28rem,calc(100vw-2rem))]" aria-label={t('Rewrite options')}>
          {open ? <RewriteOptions conditions={prose.conditions} onClose={() => useWriterRoomStore.getState().closeRewrite()} /> : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
