'use client'

// Writer 채팅 탭(리뉴얼 1차 2026-10-19, 프로토타입 2안 writerB). Producer 와 같은 채팅방 — 산문은 채팅 안의 카드로 오고,
//   고치기 버튼([다시 써줘] [직접 고치기] [브레이크다운하기])은 카드에 붙는다. 말로 고쳐 달라고 해도 된다.
//   이 탭에서는 오른쪽 채팅 패널을 닫고(레이아웃) 가운데가 채팅이다. 채팅 기록 · 수정안 · 다음 단계 카드는 화면 탭과 같다.
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Lock, Pencil, SendHorizontal, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownText } from '@/components/layout/markdown-text'
import { SceneStoryProposalCard } from '@/components/layout/scene-story-proposal-card'
import { translate, useLocale, useT } from '@/lib/i18n'
import { useContentLocale } from '@/lib/i18n/content'
import { cn } from '@/lib/utils'
import { runtimeLabel } from '@/lib/prose/conditions'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'
import { ProseDocument } from '@/features/prose/prose-document'
import { RewriteOptions } from '@/features/prose/rewrite-options'
import { VariantsPicker } from '@/features/prose/variants-picker'
import { WriterNextCard } from '@/features/prose/writer-next-card'
import type { ProseState } from '@/features/prose/use-prose'

const SUGGESTIONS = ['Rewrite it', 'Make it shorter', 'Make the dialogue funnier'] as const
const LEVEL_LABEL: Record<string, string> = { keep: 'Keep as is', polish: 'Polish', grow: 'Grow it new' }

function ratioOf(format: string | undefined): string | null {
  if (!format) return null
  const ratio = format.split('_')[1]
  return ratio || null
}

function Bubble({ who, mine, children, testId }: { who?: string; mine?: boolean; children: React.ReactNode; testId?: string }) {
  return (
    <div className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')} data-testid={testId}>
      {who ? <span className="px-1 text-[11px] font-medium text-stage-writer">{who}</span> : null}
      <div className={cn('max-w-full rounded-xl px-3.5 py-2.5 text-sm leading-6', mine ? 'bg-muted text-foreground' : 'w-full border border-border bg-card')}>
        {children}
      </div>
    </div>
  )
}

export function ProseChatTab({ prose, title }: { prose: ProseState; title: string }) {
  const t = useT()
  const locale = useLocale()
  const projectId = useProjectStore((s) => s.projectId)
  const messages = useGlobalChatStore((s) => s.messages)
  const loading = useGlobalChatStore((s) => s.loading)
  const suggestion = useGlobalChatStore((s) => s.suggestion)
  const rewriteOpen = useWriterRoomStore((s) => s.rewriteOpen)
  const focusRequest = useWriterRoomStore((s) => s.chatFocusRequest)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  // Writer 첫 한 줄(announceProseReady)은 위 산문 카드가 같은 말을 하므로 채팅 탭에서는 다시 보이지 않는다.
  const contentLocale = useContentLocale()
  const greeting = translate(contentLocale, 'I wrote the prose in {count} scenes. If you do not like it, say "Rewrite it" or change the conditions and rewrite it.', { count: prose.paragraphs.length })
  const thread = messages.filter((message) => message.stage === 'producer' && !(message.role === 'model' && message.content === greeting))
  const writerNext = suggestion?.stage === 'producer' && suggestion.action?.kind === 'writerNext' ? suggestion.action.step : null
  const proposal = prose.proposal
  const manualOpen = !!prose.editing
  const canChat = !manualOpen && !prose.locked && !prose.preserved && !prose.busy
  const currentScenes = (prose.preview?.scenes ?? []).filter((scene) => scene.beats.length > 0).map((scene) => ({ sceneId: scene.sceneId, text: prose.sceneText(scene.beats) }))

  useEffect(() => {
    if (focusRequest) inputRef.current?.focus()
  }, [focusRequest])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [thread.length, writerNext, rewriteOpen, proposal?.status])

  const send = async (value: string) => {
    const said = value.trim()
    if (!said || !canChat || loading) return
    setText('')
    await useGlobalChatStore.getState().sendMessage(said)
  }

  // 프로토타입 w-sys "Producer와 정한 것 · 1~5분 · 코미디 · 다듬기 · 🔒 16:9".
  const setting = [
    prose.conditions.runtimeSeconds ? runtimeLabel(prose.conditions.runtimeSeconds, locale) : null,
    prose.conditions.genre,
    prose.changeLevel ? t(LEVEL_LABEL[prose.changeLevel] ?? 'Polish') : null,
    ratioOf(prose.format),
  ].filter(Boolean)

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="prose-chat-tab">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-6">
          {setting.length ? (
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              {t('Set with Producer')} · {setting.join(' · ')} <Lock className="size-3" aria-label={t('Locked')} />
            </p>
          ) : null}

          <Bubble who="Writer" testId="prose-chat-card">
            <p className="text-sm">
              {prose.preserved
                ? t('I carried the script over as written. Check it, then run the breakdown.')
                : t('I wrote the prose. If you do not like it, say "Rewrite it" or tell me what to change.')}
            </p>
            <div className="mt-3 rounded-lg border border-border bg-background/60 p-4">
              <h3 className="mb-3 text-base font-semibold">{title}</h3>
              <ProseDocument prose={prose} compact />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {prose.tools.rewrite ? (
                <Button size="sm" variant="outline" onClick={() => useWriterRoomStore.getState().openRewrite()} data-testid="prose-chat-rewrite">
                  <Sparkles className="size-4" />{t('Rewrite it')}
                </Button>
              ) : null}
              {prose.tools.manual ? (
                <Button size="sm" variant="outline" onClick={() => useWriterRoomStore.getState().requestManual()} data-testid="prose-chat-manual">
                  <Pencil className="size-4" />{t('Edit it myself')}
                </Button>
              ) : null}
              {!prose.locked ? (
                <Button size="sm" onClick={() => useWriterRoomStore.getState().openConfirm()} disabled={!prose.canBreakdown} data-testid="prose-chat-breakdown">
                  {t('Run breakdown')}<ArrowRight className="size-4" />
                </Button>
              ) : null}
            </div>
          </Bubble>

          {thread.map((message) => (
            <Bubble key={message.id} who={message.role === 'model' ? 'Writer' : undefined} mine={message.role === 'user'}>
              <span className="whitespace-pre-wrap"><MarkdownText text={message.content} polish={message.role === 'model'} /></span>
            </Bubble>
          ))}

          {rewriteOpen && prose.tools.rewrite ? (
            <Bubble who="Writer" testId="prose-chat-rewrite-card">
              <p className="mb-3 font-medium">{t('I will rewrite it. Pick the conditions.')}</p>
              <RewriteOptions conditions={prose.conditions} onClose={() => useWriterRoomStore.getState().closeRewrite()} submitLabel={t('Rewrite')} />
            </Bubble>
          ) : null}

          {projectId && proposal && !proposal.variants?.length ? <SceneStoryProposalCard key={proposal.id} projectId={projectId} proposal={proposal} /> : null}
          {projectId && proposal?.variants?.length && proposal.status !== 'generating' ? (
            <Bubble who="Writer" testId="prose-chat-variants">
              <p className="mb-3 font-medium">{t('Here are three versions. Pick one.')}</p>
              <VariantsPicker proposal={proposal} current={currentScenes} sceneText={prose.sceneText} />
            </Bubble>
          ) : null}

          {writerNext ? (
            <div className="-mt-2">
              <WriterNextCard step={writerNext} onChatFocus={() => useWriterRoomStore.getState().requestChatFocus()} />
            </div>
          ) : null}
          {loading ? <p className="px-1 text-xs text-muted-foreground" role="status">{t('Writer is thinking…')}</p> : null}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background/80 px-6 py-3">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {canChat && !writerNext && !rewriteOpen && !proposal ? (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((label) => (
                <button key={label} type="button" onClick={() => void send(t(label))} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground">
                  {t(label)}
                </button>
              ))}
            </div>
          ) : null}
          {canChat ? (
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                value={text}
                rows={1}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    void send(text)
                  }
                }}
                placeholder={t('Tell Writer. E.g. rewrite it, or make the ending funnier')}
                aria-label={t('Chat input')}
                className="max-h-40 min-h-10 resize-none text-sm"
                data-testid="prose-chat-input"
              />
              <Button onClick={() => void send(text)} disabled={!text.trim() || loading} aria-label={t('Send')}>
                <SendHorizontal className="size-4" />
              </Button>
            </div>
          ) : (
            <p className="py-2 text-center text-xs text-muted-foreground" data-testid="prose-chat-locked">
              {manualOpen
                ? t('You can chat again once you close the window.')
                : prose.busy ? t('Writer is working. You can chat once it finishes.') : t('You cannot change the prose in the chat here.')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
