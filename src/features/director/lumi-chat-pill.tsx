'use client'

// Director 툴바 오른쪽 끝의 Lumi 알약(v3 D1 "Lumi Chat 접힘", 2026-11-03) — 채팅이 닫혀 있을 때만 보이고, 누르면 채팅이 열린다.
//   Lumi 는 멈춘 그림(채팅 아바타와 같은 Director 옷)이고 채팅 Lumi 와 같은 모습(생각 중 · 오류)을 한다(접힌 레일과 같은 출처).
//   채팅이 닫혀 있는 동안 새로 온 Lumi 말 수를 시안의 파란 숫자로 보인다 — 예전 대화(불러온 기록)는 세지 않고, 채팅을 열면 0 에서 다시 센다(검토 B B2).
//   약속: tests/director/chat-closed.test.ts
import { useEffect } from 'react'
import { ExpandIcon } from '@/components/icons/v3-icons'
import { LumiAvatar } from '@/components/lumi/lumi'
import { useT } from '@/lib/i18n'
import { STAGE_PERSONA, chatLumiState } from '@/lib/lumi'
import { cn } from '@/lib/utils'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'

export function LumiChatPill({ className }: { className?: string } = {}) {
  const t = useT()
  const collapsed = useChatUiStore((s) => s.collapsed)
  const seen = useChatUiStore((s) => s.closedSeen)
  const projectId = useProjectStore((s) => s.projectId)
  const messages = useGlobalChatStore((s) => s.messages)
  const loadedFor = useGlobalChatStore((s) => s.messagesLoadedProjectId)
  const historyLoaded = !!projectId && loadedFor === projectId
  const loading = useGlobalChatStore((s) => s.loading)
  const error = useGlobalChatStore((s) => s.error)

  // 닫힌 채 대화 기록을 다 읽으면 그때까지의 말을 본 것으로 친다. 채팅을 열면 비운다 — 다시 닫으면 그때부터 센다.
  useEffect(() => {
    if (!collapsed) {
      if (seen) useChatUiStore.getState().setClosedSeen(null)
      return
    }
    if (projectId && historyLoaded && seen?.projectId !== projectId) {
      useChatUiStore.getState().setClosedSeen({ projectId, ids: messages.map((message) => message.id) })
    }
  }, [collapsed, seen, projectId, historyLoaded, messages])
  useEffect(() => () => useChatUiStore.getState().setClosedSeen(null), [])

  if (!collapsed) return null
  const seenIds = seen && seen.projectId === projectId ? new Set(seen.ids) : null
  const unseen = seenIds ? messages.filter((message) => message.role === 'model' && !seenIds.has(message.id)).length : 0
  return (
    <button
      type="button"
      onClick={() => useChatUiStore.getState().setCollapsed(false)}
      title={t('Open chat')}
      aria-label={unseen === 0 ? t('Open chat') : unseen === 1 ? t('Open chat · 1 new message') : t('Open chat · {count} new messages', { count: unseen })}
      className={cn(
        'flex h-[31px] shrink-0 items-center gap-2 rounded-full bg-card pl-2.5 pr-3 text-[13px] font-semibold text-foreground shadow-node transition-colors duration-100 hover:bg-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <LumiAvatar persona={STAGE_PERSONA.director} state={chatLumiState({ loading, error: !!error })} size={22} />
      Lumi
      {unseen > 0 ? (
        // 시안 D1 "New" — 지금 단계 색 알약 · 어두운 숫자.
        <span className="flex h-[15px] min-w-[18px] items-center justify-center rounded-full bg-stage px-1 font-num text-[10.5px] font-semibold leading-none text-on-stage" data-testid="lumi-pill-unseen">
          {unseen}
        </span>
      ) : null}
      <ExpandIcon className="size-4 text-muted-foreground" />
    </button>
  )
}
