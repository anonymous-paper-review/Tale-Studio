'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Send, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentFace } from '@/components/agent-face'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore } from '@/stores/producer-store'
import { useCanvasWarmStarting } from '@/features/artist/hooks/use-canvas-warm-starting'
import { cn } from '@/lib/utils'
import type { StageId } from '@/types'

const STAGE_BADGE: Record<StageId, string> = {
  producer: 'P1',
  writer: 'P2',
  artist: 'P3',
  director: 'P4',
  editor: 'P5',
}

const STAGE_LABEL: Record<StageId, string> = {
  producer: 'Producer',
  writer: 'Writer',
  artist: 'Artist',
  director: 'Director',
  editor: 'Editor',
}

const STAGE_BADGE_CLASS: Record<StageId, string> = {
  producer: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
  writer: 'bg-violet-500/15 text-violet-500 border-violet-500/30',
  artist: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  director: 'bg-rose-500/15 text-rose-500 border-rose-500/30',
  editor: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
}

const STAGE_FACE_COLOR: Record<StageId, string> = {
  producer: '#8B5CF6',
  writer: '#3B82F6',
  artist: '#F59E0B',
  director: '#E50914',
  editor: '#10B981',
}

const STAGE_PLACEHOLDER: Record<StageId, string> = {
  producer: '스토리에 대해 말해주세요…',
  writer: '씬과 샷에 대해 물어보세요…',
  artist: '예: Kai 캐릭터 만들어줘, 갈색머리 검은코트',
  director: '촬영 기법에 대해 물어보세요…',
  editor: '아직 이 단계에서는 채팅을 쓸 수 없어요.',
}

const SUPPORTED_STAGES: ReadonlySet<StageId> = new Set<StageId>([
  'producer',
  'writer',
  'artist',
  'director',
])

export function GlobalChat() {
  const messages = useGlobalChatStore((s) => s.messages)
  const loading = useGlobalChatStore((s) => s.loading)
  const error = useGlobalChatStore((s) => s.error)
  const sendMessage = useGlobalChatStore((s) => s.sendMessage)
  const clearError = useGlobalChatStore((s) => s.clearError)
  const loadMessages = useGlobalChatStore((s) => s.loadMessages)

  const currentStage = useProjectStore((s) => s.currentStage)
  const projectId = useProjectStore((s) => s.projectId)
  const warmStartingTip = useCanvasWarmStarting()

  const [input, setInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (projectId) loadMessages(projectId)
  }, [projectId, loadMessages])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, loading])

  const stageSupported = SUPPORTED_STAGES.has(currentStage)
  const inputDisabled = !stageSupported || loading

  const handleSend = async () => {
    if (!input.trim() || inputDisabled) return
    const msg = input
    setInput('')
    await sendMessage(msg)
  }

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      useProducerStore.getState().setStoryText(text)
      await sendMessage(
        `스크립트 파일을 업로드했어요. 내용은 다음과 같아요:\n\n${text}`,
      )
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const expression = loading ? 'thinking' : 'idle'

  return (
    <aside className="fixed right-0 top-0 z-30 flex h-full w-80 flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <AgentFace
          expression={expression}
          color={STAGE_FACE_COLOR[currentStage]}
          size={32}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">채팅</span>
            <span
              className={cn(
                'rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                STAGE_BADGE_CLASS[currentStage],
              )}
            >
              {STAGE_BADGE[currentStage]} · {STAGE_LABEL[currentStage]}
            </span>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            모든 단계 통합
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="min-h-0 flex-1 px-4 py-3">
        <div className="space-y-2">
          {messages.length === 0 && (
            <div className="mr-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              대화를 시작해보세요. 모든 단계(P1–P5)의 메시지가 시간순으로 표시됩니다.
            </div>
          )}

          {messages.map((msg) => {
            const badgeClass = STAGE_BADGE_CLASS[msg.stage]
            return (
              <div
                key={msg.id}
                className={cn(
                  'rounded-lg px-3 py-2 text-xs whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'ml-4 bg-primary/10 text-foreground'
                    : 'mr-4 bg-muted text-foreground',
                )}
              >
                <span
                  className={cn(
                    'mr-1.5 inline-flex items-center rounded-full border px-1.5 py-0 align-middle text-[9px] font-medium',
                    badgeClass,
                  )}
                >
                  {STAGE_BADGE[msg.stage]}
                </span>
                {msg.content}
              </div>
            )
          })}

          {loading && (
            <div className="mr-4 flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              생각 중…
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      {error && (
        <button
          type="button"
          onClick={clearError}
          className="shrink-0 border-t border-destructive/30 bg-destructive/10 px-4 py-1.5 text-left text-[11px] text-destructive"
        >
          {error}
        </button>
      )}

      {currentStage === 'artist' && warmStartingTip && (
        <div className="shrink-0 border-t border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-700">
          {warmStartingTip}
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-border p-3">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
            placeholder={STAGE_PLACEHOLDER[currentStage]}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={inputDisabled}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          {currentStage === 'producer' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                title="스크립트 파일 업로드 (.txt)"
              >
                <Upload className="size-4" />
              </Button>
            </>
          )}
          <Button
            size="icon"
            className="size-8"
            onClick={handleSend}
            disabled={inputDisabled || !input.trim()}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
