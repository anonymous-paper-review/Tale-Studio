'use client'

// Director 툴바 오른쪽 끝의 Lumi 알약(v3 D1 "Lumi Chat 접힘", 2026-11-03) — 채팅이 닫혀 있을 때만 보이고, 누르면 채팅이 열린다.
//   Lumi 는 멈춘 그림(채팅 아바타와 같은 Director 옷). 약속: tests/director/chat-closed.test.ts
import { ExpandIcon } from '@/components/icons/v3-icons'
import { LumiAvatar } from '@/components/lumi/lumi'
import { useT } from '@/lib/i18n'
import { STAGE_PERSONA } from '@/lib/lumi'
import { cn } from '@/lib/utils'
import { useChatUiStore } from '@/stores/chat-ui-store'

export function LumiChatPill({ className }: { className?: string } = {}) {
  const t = useT()
  const collapsed = useChatUiStore((s) => s.collapsed)
  if (!collapsed) return null
  return (
    <button
      type="button"
      onClick={() => useChatUiStore.getState().setCollapsed(false)}
      title={t('Open chat')}
      aria-label={t('Open chat')}
      className={cn(
        'flex h-[31px] shrink-0 items-center gap-2 rounded-full bg-card pl-2.5 pr-3 text-[13px] font-semibold text-foreground shadow-node transition-colors duration-100 hover:bg-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <LumiAvatar persona={STAGE_PERSONA.director} size={22} bare />
      Lumi
      <ExpandIcon className="size-4 text-muted-foreground" />
    </button>
  )
}
