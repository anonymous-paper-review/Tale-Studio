'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Loader2,
  Send,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentFace } from '@/components/agent-face'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useProducerStore } from '@/stores/producer-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useArtistStore } from '@/stores/artist-store'
import { useDirectorCanvasWarmStarting } from '@/features/director/hooks/use-director-warm-starting'
import { handoffToStage } from '@/lib/stage-nav'
import { cn } from '@/lib/utils'
import { MarkdownText } from '@/components/layout/markdown-text'
import { MentionTextarea, type MentionItem } from '@/components/layout/mention-textarea'
import { castMentions, backgroundMentions, activeMentionRefs, FOUNDATION_MENTIONS } from '@/lib/card-mention'
import {
  STAGE_BADGE,
  STAGE_LABEL,
  STAGE_BADGE_CLASS,
  STAGE_FACE_COLOR,
  STAGE_PLACEHOLDER,
  CHAT_SUPPORTED_STAGES,
} from '@/lib/constants'

/** 말풍선 우상단 호버 복사 버튼. 클립보드 복사 후 1.5초간 체크 표시. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('복사에 실패했어요.')
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="메시지 복사"
      aria-label="메시지 복사"
      className="absolute right-1 top-1 rounded-md border border-border bg-card/80 p-1 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
    >
      {copied ? (
        <Check className="size-3 text-success" />
      ) : (
        <Copy className="size-3" />
      )}
    </button>
  )
}

export function GlobalChat() {
  const messages = useGlobalChatStore((s) => s.messages)
  const loading = useGlobalChatStore((s) => s.loading)
  const error = useGlobalChatStore((s) => s.error)
  const sendMessage = useGlobalChatStore((s) => s.sendMessage)
  const clearError = useGlobalChatStore((s) => s.clearError)
  const loadMessages = useGlobalChatStore((s) => s.loadMessages)
  const suggestion = useGlobalChatStore((s) => s.suggestion)
  const dismissSuggestion = useGlobalChatStore((s) => s.dismissSuggestion)
  const pendingProposal = useGlobalChatStore((s) => s.pendingProposal)
  const approvePendingProposal = useGlobalChatStore((s) => s.approvePendingProposal)
  const dismissPendingProposal = useGlobalChatStore((s) => s.dismissPendingProposal)

  const router = useRouter()
  const currentStage = useProjectStore((s) => s.currentStage)
  const projectId = useProjectStore((s) => s.projectId)
  // Artist는 카드 UI로 롤백되어 노드 전용 warm tip 훅 제거. 정적 안내로 대체.
  const directorWarmTip = useDirectorCanvasWarmStarting()
  const warmStartingTip =
    currentStage === 'artist'
      ? '캐릭터/장소 시트를 생성한 뒤 Register로 Director에 넘기세요.'
      : currentStage === 'director'
        ? directorWarmTip
        : null

  // 폭 리사이즈 + 접기 (chat-ui-store, persist)
  const chatWidth = useChatUiStore((s) => s.chatWidth)
  const collapsed = useChatUiStore((s) => s.collapsed)
  const setChatWidth = useChatUiStore((s) => s.setChatWidth)
  const toggleCollapsed = useChatUiStore((s) => s.toggleCollapsed)
  const setMentionedRefs = useChatUiStore((s) => s.setMentionedRefs)
  const mentionInsert = useChatUiStore((s) => s.mentionInsert)
  const consumeMentionInsert = useChatUiStore((s) => s.consumeMentionInsert)
  const [dragging, setDragging] = useState(false)

  // @멘션 후보 — 현재 stage에서 UI에 표기되는 카드/오브젝트
  const producerCast = useProducerStore((s) => s.cast)
  const producerBackgrounds = useProducerStore((s) => s.backgrounds)
  const artistCharacters = useArtistStore((s) => s.characterAssets)
  const artistWorlds = useArtistStore((s) => s.worldAssets)
  const mentionItems = useMemo<MentionItem[]>(() => {
    if (currentStage === 'producer') {
      return [
        ...FOUNDATION_MENTIONS.map((m) => ({ id: m.ref, label: m.label, hint: m.hint })),
        ...castMentions(producerCast).map((m) => ({ id: m.ref, label: m.label, hint: m.hint })),
        ...backgroundMentions(producerBackgrounds).map((m) => ({ id: m.ref, label: m.label, hint: m.hint })),
      ]
    }
    if (currentStage === 'artist') {
      return [
        ...artistCharacters
          .filter((c) => c.name?.trim())
          .map((c) => ({ id: c.characterId, label: c.name, hint: '캐릭터' })),
        ...artistWorlds
          .filter((w) => w.name?.trim())
          .map((w) => ({ id: w.locationId, label: w.name, hint: '장소' })),
      ]
    }
    return []
  }, [currentStage, producerCast, producerBackgrounds, artistCharacters, artistWorlds])
  const [input, setInput] = useState('')
  // 위/아래 화살표로 호출할 전송 메시지 히스토리(유저 발화만, 오래된→최신).
  const userHistory = useMemo(
    () => messages.filter((m) => m.role === 'user').map((m) => m.content),
    [messages],
  )
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (projectId) loadMessages(projectId)
  }, [projectId, loadMessages])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, loading])

  // 입력창의 @멘션 ↔ 카드 하이라이트 동기화 (입력에서 지우면 자동 해제)
  useEffect(() => {
    setMentionedRefs(activeMentionRefs(input, mentionItems.map((m) => ({ ref: m.id, label: m.label }))))
  }, [input, mentionItems, setMentionedRefs])

  // Cmd/Ctrl+클릭으로 카드 → 입력창에 @멘션 삽입
  useEffect(() => {
    if (!mentionInsert) return
    const token = `@${mentionInsert.label}`
    setInput((prev) =>
      prev.includes(token)
        ? prev
        : `${prev.replace(/\s*$/, prev.trim() ? ' ' : '')}${token} `,
    )
    consumeMentionInsert(mentionInsert.id)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [mentionInsert, consumeMentionInsert])

  const stageSupported = CHAT_SUPPORTED_STAGES.has(currentStage)
  const inputDisabled = !stageSupported || loading

  const handleSend = async () => {
    if (!input.trim() || inputDisabled) return
    const msg = input
    setInput('')
    await sendMessage(msg)
  }

  // 프로액티브 제안 승인 — 'navigate'(stage 이동) / 'artist-refresh-look'(초안 일괄 재생성, 유저 클릭).
  const handleSuggestionAction = async () => {
    const action = suggestion?.action
    if (!action) {
      dismissSuggestion()
      return
    }
    if (action.kind === 'artist-refresh-look') {
      dismissSuggestion()
      await useArtistStore.getState().refreshLookPendingDrafts()
      return
    }
    const path = await handoffToStage(action.targetStage)
    dismissSuggestion()
    if (path) router.push(path)
  }

  const handlePendingProposalApprove = async () => {
    if (!pendingProposal) return
    await approvePendingProposal(pendingProposal.id)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  // 좌측 경계 드래그 → 폭 조절 (aside는 우측 고정이라 viewport 우측에서 역산)
  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }
  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setChatWidth(window.innerWidth - e.clientX) // clamp은 store에서
  }
  const handleResizePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setDragging(false)
  }

  const expression = loading ? 'thinking' : 'idle'

  return (
    <>
      <aside
        className={cn(
          'fixed right-0 top-0 z-sidebar flex h-full flex-col border-l border-border bg-card transition-transform duration-350 ease-out',
          collapsed && 'translate-x-full',
        )}
        style={{ width: chatWidth }}
      >
        {/* 좌측 리사이즈 핸들 */}
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerEnd}
          onPointerCancel={handleResizePointerEnd}
          className={cn(
            'absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize touch-none transition-colors hover:bg-border-strong',
            dragging && 'bg-border-strong',
          )}
        />

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
                {currentStage === 'producer' ? 'AI' : STAGE_BADGE[currentStage]} · {STAGE_LABEL[currentStage]}
              </span>
            </div>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={toggleCollapsed}
            title="채팅 접기"
            aria-label="채팅 접기"
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="min-h-0 flex-1 px-4 py-3">
          <div className="space-y-2">

            {messages.map((msg) => {
              const badgeClass = STAGE_BADGE_CLASS[msg.stage]
              return (
                <div
                  key={msg.id}
                  className={cn(
                    'group relative select-text rounded-lg px-3 py-2 pr-8 text-xs whitespace-pre-wrap',
                    msg.role === 'user'
                      ? 'ml-4 bg-primary/10 text-foreground'
                      : 'mr-4 bg-muted text-foreground',
                  )}
                >
                  {msg.role !== 'user' && (
                    <span
                      className={cn(
                        'mr-1.5 inline-flex items-center rounded-full border px-1.5 py-0 align-middle text-[9px] font-medium select-none',
                        badgeClass,
                      )}
                    >
                      {msg.stage === 'producer' ? 'AI Producer' : STAGE_BADGE[msg.stage]}
                    </span>
                  )}
                  <MarkdownText text={msg.content} />
                  <CopyButton text={msg.content} />
                </div>
              )
            })}

            {loading && (
              <div className="mr-4 flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                생각 중…
              </div>
            )}

            {/* 프로액티브 제안 (chat-proactive-copilot Phase 1) — 시스템이 먼저 거는 actionable 넛지 */}
            {suggestion && suggestion.stage === currentStage && (
              <div className="mr-4 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-foreground">
                <div className="flex items-start gap-1.5">
                  <span
                    className={cn(
                      'mt-px inline-flex items-center rounded-full border px-1.5 py-0 align-middle text-[9px] font-medium',
                      STAGE_BADGE_CLASS[suggestion.stage],
                    )}
                  >
                    {STAGE_BADGE[suggestion.stage]}
                  </span>
                  <MarkdownText className="whitespace-pre-wrap" text={suggestion.content} />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {suggestion.action && (
                    <Button size="sm" onClick={handleSuggestionAction}>
                      {suggestion.action.label}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={dismissSuggestion}>
                    나중에
                  </Button>
                </div>
              </div>
            )}

            {pendingProposal && pendingProposal.stage === currentStage && (
              <div className="mr-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                <div className="flex items-start gap-1.5">
                  <span
                    className={cn(
                      'mt-px inline-flex items-center rounded-full border px-1.5 py-0 align-middle text-[9px] font-medium',
                      STAGE_BADGE_CLASS[pendingProposal.stage],
                    )}
                  >
                    제안
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium"><MarkdownText text={pendingProposal.target} /></p>
                    <p className="mt-0.5 text-muted-foreground"><MarkdownText text={pendingProposal.action} /></p>
                    {pendingProposal.impact.length > 0 && (
                      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-muted-foreground">
                        {pendingProposal.impact.map((item) => (
                          <li key={item}><MarkdownText text={item} /></li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" onClick={handlePendingProposalApprove}>
                    승인
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => dismissPendingProposal(pendingProposal.id)}
                  >
                    나중에
                  </Button>
                </div>
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

        {(currentStage === 'artist' || currentStage === 'director') &&
          warmStartingTip && (
            <div className="shrink-0 border-t border-warning/30 bg-warning/10 px-4 py-1.5 text-[11px] text-warning">
              {warmStartingTip}
            </div>
          )}

        {/* Input footer — Textarea가 입력 길이에 따라 자동 확장 (한 줄 min-h-9 → 최대 max-h-40).
            Enter 전송 / Shift+Enter 개행. 버튼은 items-end로 입력창 하단에 정렬. */}
        <div className="shrink-0 border-t border-border p-4">
          <div className="flex items-end gap-2">
            <MentionTextarea
              ref={textareaRef}
              value={input}
              onChange={setInput}
              onSubmit={handleSend}
              items={mentionItems}
              history={userHistory}
              disabled={inputDisabled}
              placeholder={STAGE_PLACEHOLDER[currentStage]}
              className="max-h-40 min-h-9 w-full resize-none py-2"
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
                  size="icon-lg"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  title="스크립트 파일 업로드 (.txt)"
                >
                  <Upload className="size-4" />
                </Button>
              </>
            )}
            <Button
              size="icon-lg"
              onClick={handleSend}
              disabled={inputDisabled || !input.trim()}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* 접힌 상태 — 다시 여는 버튼 */}
      {collapsed && (
        <Button
          size="icon-sm"
          variant="secondary"
          onClick={toggleCollapsed}
          title="채팅 열기"
          aria-label="채팅 열기"
          className="fixed right-2 top-1/2 z-sidebar -translate-y-1/2 border border-border shadow-md"
        >
          <ChevronsLeft className="size-4" />
        </Button>
      )}
    </>
  )
}
