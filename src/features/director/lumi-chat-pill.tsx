'use client'

// 접힌 채팅의 Lumi 아이콘(11/13 시안 "Lumi · 접힘 (아이콘만)" — v3 D1 Lumi 알약에서 바뀜) — 채팅이 닫혀 있을 때만 보이고, 누르면 채팅이 열린다.
//   Director 는 툴바 1줄 오른쪽 끝(놓는 곳은 Director 화면), Editor 는 위 막대 오른쪽 끝(global-chat 이 놓는다)에 있다 — 시안 D1 42×33 · E1 38×38.
//   Lumi 는 멈춘 그림(채팅 아바타와 같은 그 단계 옷)이고 채팅 Lumi 와 같은 모습(생각 중 · 오류)을 한다(접힌 레일과 같은 출처).
//   이 프로젝트에서 그림 · 영상을 만드는 중이거나 Lumi 가 답을 쓰는 중이면 살짝 위아래로 움직인다(시안 R).
//   채팅이 닫혀 있는 동안 새로 온 Lumi 말이 있으면 귀퉁이에 작은 점을 보이고, 수는 화면 읽기 이름에 싣는다 — 예전 대화(불러온 기록)는 세지 않고,
//   채팅을 열면 0 에서 다시 센다(검토 B B2 → 오너 11/14 "귀퉁이 작은 점").
//   약속: tests/director/chat-closed.test.ts
import { useEffect } from 'react'
import { LumiAvatar } from '@/components/lumi/lumi'
import { useT } from '@/lib/i18n'
import { STAGE_PERSONA, chatLumiState } from '@/lib/lumi'
import { directorMaking } from '@/lib/director/making'
import { cn } from '@/lib/utils'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'

export function LumiChatPill({ stage = 'director', className }: { stage?: 'director' | 'editor'; className?: string } = {}) {
  const t = useT()
  const collapsed = useChatUiStore((s) => s.collapsed)
  const seen = useChatUiStore((s) => s.closedSeen)
  const projectId = useProjectStore((s) => s.projectId)
  const messages = useGlobalChatStore((s) => s.messages)
  const loadedFor = useGlobalChatStore((s) => s.messagesLoadedProjectId)
  const historyLoaded = !!projectId && loadedFor === projectId
  const loading = useGlobalChatStore((s) => s.loading)
  const error = useGlobalChatStore((s) => s.error)
  // Editor 에는 만드는 일이 없다 — Lumi 가 답을 쓰는 동안만 움직인다.
  const making = useDirectorCanvasStore((s) => stage === 'director' && directorMaking(s, projectId))

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
  const moving = making || loading
  return (
    <button
      type="button"
      onClick={() => useChatUiStore.getState().setCollapsed(false)}
      title={t('Open chat')}
      aria-label={unseen === 0 ? t('Open chat') : unseen === 1 ? t('Open chat · 1 new message') : t('Open chat · {count} new messages', { count: unseen })}
      data-testid="lumi-chat-icon"
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full bg-card shadow-node transition-colors duration-100 hover:bg-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        stage === 'editor' ? 'size-[38px]' : 'h-[33px] w-[42px]',
        className,
      )}
    >
      <span className={cn('inline-flex', moving && 'animate-lumi-bob')} data-making={moving}>
        <LumiAvatar persona={STAGE_PERSONA[stage]} state={chatLumiState({ loading, error: !!error })} size={26} />
      </span>
      {unseen > 0 ? (
        // 새 말이 있다는 점(지금 단계 색) — 수는 위 화면 읽기 이름에 있다.
        <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-stage ring-2 ring-card" aria-hidden data-testid="lumi-icon-unseen" />
      ) : null}
    </button>
  )
}
