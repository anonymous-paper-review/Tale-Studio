'use client'

// ⌘/Ctrl 를 누르고 있는 동안 카드 위에 뜨는 "⌘/Ctrl+클릭 멘션" 알약(D9 오너 2026-11-22 "모든 탭에서 같게") —
//   Producer 카드(features/producer/readiness-board MentionableCard)와 같은 모양 · 같은 말. 이미 채팅에 붙은 카드는 "멘션 해제".
//   카드 쪽은 relative 여야 한다(알약은 카드 왼쪽 위에 겹쳐 뜬다). 약속: tests/writer/mention-armed.test.ts
import { AtSign } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function MentionHint({ armed, mentioned, className }: { armed: boolean; mentioned: boolean; className?: string }) {
  const t = useT()
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute -top-2.5 left-3 z-10 inline-flex items-center gap-1 rounded-full border border-sky-400/50 bg-popover px-2 py-0.5 text-[10px] font-medium text-sky-300 opacity-0 shadow-sm transition-opacity',
        armed && 'opacity-100',
        className,
      )}
    >
      <AtSign className="size-3" /> {mentioned ? t('⌘/Ctrl+click to unmention') : t('⌘/Ctrl+click to mention')}
    </span>
  )
}
