'use client'

// [적용] 카드의 한 줄(리드 2026-11-23 D③) — 전 · 후 글은 자르지 않는다. 길면(160자 넘음) 세 줄로 접어 두고 [더 보기]로 펼친다.
//   예전에는 160자에서 끊겨 [적용]하면 무엇이 빠지는지 볼 수 없었다. 약속: tests/chat/full-prompt.test.ts
import { useState } from 'react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { MarkdownText } from '@/components/layout/markdown-text'

/** 이보다 긴 줄은 접어 둔다. */
export const IMPACT_FOLD_AT = 160

export function ProposalImpactLine({ text, defaultOpen = false }: { text: string; defaultOpen?: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(defaultOpen)
  const long = text.length > IMPACT_FOLD_AT
  return (
    <li>
      <div className={cn('break-words', long && !open && 'line-clamp-3')}>
        <MarkdownText text={text} />
      </div>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="mt-0.5 text-caption font-semibold text-foreground underline-offset-2 hover:underline"
        >{open ? t('Collapse') : t('See more')}</button>
      ) : null}
    </li>
  )
}
