'use client'

// 채팅으로 만들기(2안, 리뉴얼 1차 2026-10-19 · 프로토타입 EB1~EB7 · EBX): 화면 가운데가 채팅이다.
//   에이전트가 먼저 묻고 [예시 보여줘]를 둔다 → 글을 보내거나 파일을 올리면 AI가 읽고 추천한다 →
//   파일을 올린 사람은 "어떻게 쓸까요"를, 글만 쓴 사람은 장르·분위기 → 길이 → 바꿈 정도를 묻고 마지막에 화면 비율 →
//   정리 카드의 [Writer에게 써 달라고 하기]로 시작한다(확인 창 없이 1안과 같은 시작). 말로 답해도 된다.
//   화면에서 고르기 탭과 같은 초안을 쓴다 — 거기서 쓴 글 · 고른 값이 여기 그대로 보인다.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Lightbulb, Lock, Paperclip, PenLine, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { type EntryDraft } from '@/lib/entry/draft'
import {
  CHAT_QUESTION,
  EXAMPLES_PER_PAGE,
  MOODS,
  RATIOS,
  RECOMMENDED_RATIO,
  RUNTIMES,
  examplesPage,
  ideaLength,
  keepUnavailableNote,
  levelAvailable,
  levelQuestion,
  type ChatQuestionKey,
} from './options'
import {
  chatChips,
  chatSent,
  chatTranscript,
  fileReadLine,
  isScriptDraft,
  levelOptionsOf,
  type ChatItem,
  type Translator,
} from './chat-flow'
import { useEntryStore } from './entry-store'
import { AgentBubble, FileChip, RecommendedBadge, UploadingChip, UserBubble, WhyLine } from './entry-parts'
import { summaryRows } from './summary'

export function EntryChat() {
  const t = useT()
  const draft = useEntryStore((s) => s.draft)
  const chat = useEntryStore((s) => s.chat)
  const readError = useEntryStore((s) => s.readError)
  const items = chatTranscript(draft, chat, t)
  const sent = chatSent(draft)
  const threadRef = useRef<HTMLDivElement>(null)

  // 새 말이 오면 아래로 — 입력칸이 화면 아래에 붙어 있다.
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items.length, chat.hint, chat.lengthError, chat.showExamples, chat.examplePage])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {sent ? <ChipsBar draft={draft} t={t} /> : null}
      <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-6" aria-live="polite">
          {items.map((item) => (
            <ChatRow key={item.id} item={item} draft={draft} t={t} />
          ))}
          {readError && !sent ? (
            <AgentBubble alert>
              <p className="text-destructive">{t("Couldn't make recommendations. Please try again.")}</p>
            </AgentBubble>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 border-t border-border bg-background">
        <div className="mx-auto w-full max-w-2xl px-6 py-4">{sent ? <ReplyInput /> : <FirstComposer />}</div>
      </div>
    </div>
  )
}

function ChipsBar({ draft, t }: { draft: EntryDraft; t: Translator }) {
  const reask = useEntryStore((s) => s.chatReask)
  return (
    <nav aria-label={t('What we have decided so far')} className="shrink-0 border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-wrap gap-2 px-6 py-3">
        {chatChips(draft, t).map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => void reask(chip.key)}
            disabled={!chip.value}
            title={chip.value ? t('Click to choose again') : undefined}
            aria-current={chip.current ? 'step' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs outline-none transition-colors duration-100 ease-out focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default',
              chip.current ? 'border-foreground' : 'border-border',
              chip.value ? 'hover:bg-accent' : 'text-muted-foreground',
            )}
          >
            {chip.key === 'ratio' ? <Lock className="size-3" aria-hidden /> : null}
            <span className="text-muted-foreground">{chip.label}</span>
            <span className={chip.value ? 'font-medium' : ''}>{chip.value ?? t('Not yet')}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

function ChatRow({ item, draft, t }: { item: ChatItem; draft: EntryDraft; t: Translator }) {
  const showExamples = useEntryStore((s) => s.showExamples)
  if (item.kind === 'user') return <UserBubble text={item.text} fileName={item.fileName} />
  if (item.kind === 'error') return <AgentBubble alert>{<p className="text-destructive">{item.text}</p>}</AgentBubble>
  if (item.kind === 'examples') return <ExamplesBubble page={item.page} intro={item.intro} t={t} />
  if (item.kind === 'card') return <QuestionCard question={item.question} draft={draft} t={t} />
  return (
    <AgentBubble>
      <p className="whitespace-pre-wrap">{item.text}</p>
      {item.action === 'show_examples' ? (
        <div>
          <Button variant="outline" size="sm" onClick={showExamples}>
            <Lightbulb aria-hidden />
            {t('Show me examples')}
          </Button>
        </div>
      ) : null}
    </AgentBubble>
  )
}

function ExamplesBubble({ page, intro, t }: { page: number; intro: string; t: Translator }) {
  const pickExample = useEntryStore((s) => s.pickExample)
  const nextExamples = useEntryStore((s) => s.nextExamples)
  const { page: shown, items } = examplesPage(page)
  const start = shown * EXAMPLES_PER_PAGE
  return (
    <AgentBubble>
      <p>{intro}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((example, i) => (
          <button
            key={example.title}
            type="button"
            onClick={() => pickExample(start + i, t)}
            className="flex flex-col items-start gap-1 rounded-md border border-border bg-background p-3 text-left outline-none transition-colors duration-100 ease-out hover:border-border-strong hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="text-sm font-medium">{t(example.title)}</span>
            <span className="text-xs text-muted-foreground">{t(example.text)}</span>
          </button>
        ))}
      </div>
      <div>
        <Button variant="ghost" size="sm" onClick={nextExamples}>
          {t('Other examples')}
        </Button>
      </div>
    </AgentBubble>
  )
}

interface CardOption {
  value: string
  label: string
  sub?: string
  disabled?: boolean
  mono?: boolean
}

/** 카드 안 선택지 — 누르면 바로 답이 된다(지금 고른 값은 눌린 모양). 추천에는 추천 표시. */
function CardOptions({ options, current, recommended, onPick, column }: { options: CardOption[]; current: string | null; recommended: string | null; onPick: (v: string) => void; column?: boolean }) {
  return (
    <div className={cn('flex gap-2', column ? 'flex-col' : 'flex-wrap')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === current}
          disabled={o.disabled}
          onClick={() => onPick(o.value)}
          className={cn(
            'flex flex-col items-start gap-0.5 rounded-md border px-3 py-1.5 text-left text-sm outline-none transition-colors duration-100 ease-out focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
            o.value === current ? 'border-foreground bg-accent' : 'border-border bg-background hover:border-border-strong hover:bg-accent/50',
          )}
        >
          <span className="flex w-full items-center gap-2">
            <span className={cn('font-medium', o.mono && 'font-mono tabular-nums')}>{o.label}</span>
            {o.value === recommended ? <RecommendedBadge /> : null}
          </span>
          {o.sub ? <span className="text-xs text-muted-foreground">{o.sub}</span> : null}
        </button>
      ))}
    </div>
  )
}

function QuestionCard({ question, draft, t }: { question: ChatQuestionKey | 'confirm'; draft: EntryDraft; t: Translator }) {
  const answer = useEntryStore((s) => s.chatAnswer)
  const accept = useEntryStore((s) => s.chatAcceptRecommendation)
  const start = useEntryStore((s) => s.start)
  const writing = useEntryStore((s) => s.writing)
  const entryLocale = useEntryStore((s) => s.locale)
  const rec = draft.rec
  const keepOpen = levelAvailable('keep', draft.idea, draft.file)
  const acceptButton = (
    <div>
      <Button variant="outline" size="sm" onClick={() => void accept(question as ChatQuestionKey)}>
        {t('Go with the recommendation')}
      </Button>
    </div>
  )

  if (question === 'confirm') {
    const starting = writing.status === 'starting' || writing.status === 'writing'
    return (
      <AgentBubble>
        <p>{t('I will start like this.')}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-md border border-border bg-background px-3 py-2.5">
          {summaryRows(draft, { t, locale: entryLocale }).map((row) => (
            <div key={row.key} className="contents">
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                {row.locked ? <Lock className="size-3.5" aria-hidden /> : null}
                {row.label}
              </dt>
              <dd className="break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <Button data-entry-start onClick={() => void start()} disabled={starting}>
            <PenLine aria-hidden />
            {t('Ask Writer to write it')}
          </Button>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>{t('When you press it, the screen ratio is locked. To change something, click an item above or say it, like "make the length 1 minute".')}</span>
        </p>
      </AgentBubble>
    )
  }

  if (question === 'mood') {
    return (
      <AgentBubble>
        <p>{t(CHAT_QUESTION.mood)}</p>
        <CardOptions options={MOODS.map((m) => ({ value: m.key, label: t(m.label) }))} current={draft.picks.mood} recommended={rec?.mood ?? null} onPick={(v) => void answer('mood', v)} />
        <WhyLine text={rec?.moodWhy} />
        {acceptButton}
      </AgentBubble>
    )
  }

  if (question === 'runtime') {
    return (
      <AgentBubble>
        <p>{t(CHAT_QUESTION.runtime)}</p>
        <CardOptions options={RUNTIMES.map((r) => ({ value: r.key, label: t(r.label), sub: t(r.sub) }))} current={draft.picks.runtime} recommended={rec?.runtime ?? null} onPick={(v) => void answer('runtime', v)} />
        <WhyLine text={rec?.runtimeWhy} />
        {acceptButton}
      </AgentBubble>
    )
  }

  if (question === 'ratio') {
    return (
      <AgentBubble>
        <p>
          {t(CHAT_QUESTION.ratio)}{' '}
          <span className="inline-flex items-center gap-1 font-medium">
            <Lock className="size-3.5" aria-hidden />
            {t('Once chosen, it cannot be changed until the end.')}
          </span>
        </p>
        <CardOptions options={RATIOS.map((r) => ({ value: r.key, label: r.key, sub: t(r.sub), mono: true }))} current={draft.picks.ratio} recommended={RECOMMENDED_RATIO} onPick={(v) => void answer('ratio', v)} />
        {acceptButton}
      </AgentBubble>
    )
  }

  // 바꿈 정도: 글만 쓴 사람(level)과 파일을 올린 사람(file, 자료 종류에 맞춘 말).
  const levelOptions = levelOptionsOf(draft).map((l, i) => ({
    value: l.key,
    label: `${i + 1} ${t(l.label)}`,
    sub: `${t('Keeps')} ${t(l.keeps)} · ${t('Changes')} ${t(l.changes)}`,
    disabled: l.key === 'keep' && !keepOpen,
  }))
  const ocrLine = question === 'file' && draft.file?.kind === 'image' ? (draft.file.text ?? '').split('\n').find((l) => l.trim()) : null
  return (
    <AgentBubble>
      {question === 'file' ? (
        <>
          <p>{fileReadLine(draft, t)}</p>
          {ocrLine ? (
            <blockquote className="border-l-2 border-border pl-3 text-xs text-muted-foreground">
              <span className="select-text">{ocrLine}</span> <span>{t('(the first line read from the picture)')}</span>
            </blockquote>
          ) : null}
          <p className="font-medium">{t(levelQuestion(isScriptDraft(draft)))}</p>
        </>
      ) : (
        <p>{t(CHAT_QUESTION.level)}</p>
      )}
      <CardOptions column options={levelOptions} current={draft.picks.level} recommended={rec ? (levelAvailable(rec.level, draft.idea, draft.file) ? rec.level : 'polish') : null} onPick={(v) => void answer(question, v)} />
      {!keepOpen ? <p className="text-xs text-muted-foreground">{t(keepUnavailableNote('chat'))}</p> : null}
      {acceptButton}
    </AgentBubble>
  )
}

/** 처음 입력칸 — 아이디어를 적거나 📎로 파일을 올린다. Enter 보내기 · Shift+Enter 줄바꿈(한글 조합 중 Enter 는 보내지 않는다). */
function FirstComposer() {
  const t = useT()
  const draft = useEntryStore((s) => s.draft)
  const upload = useEntryStore((s) => s.upload)
  const reading = useEntryStore((s) => s.reading)
  const setIdea = useEntryStore((s) => s.setIdea)
  const send = useEntryStore((s) => s.chatSendFirst)
  const removeFile = useEntryStore((s) => s.removeFile)
  const openFileDialog = useEntryStore((s) => s.openFileDialog)
  const busy = !!reading || upload.status === 'uploading'
  const canSend = !!draft.file || draft.idea.trim().length > 0

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!busy && canSend) void send()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 rounded-xl border border-input bg-card p-3 transition-colors duration-150 ease-out focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <Textarea
          aria-label={t('Idea')}
          rows={2}
          value={draft.idea}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('Write who, where, what happens, and how it ends')}
          className="min-h-12 resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="flex flex-wrap items-center gap-2">
          {upload.status === 'uploading' ? (
            <UploadingChip name={upload.name ?? ''} />
          ) : draft.file ? (
            <FileChip file={draft.file} onRemove={() => void removeFile()} disabled={busy} />
          ) : (
            <>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Attach a file')} title={t('Attach a file')} onClick={openFileDialog} disabled={busy}>
                <Paperclip aria-hidden />
              </Button>
              <span className="text-xs text-muted-foreground">{t('Upload a file if you have one')}</span>
            </>
          )}
          <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {t('{n} characters', { n: ideaLength(draft.idea) })}
          </span>
          <Button type="submit" size="sm" disabled={busy || !canSend}>
            {t('Send')}
            <Send aria-hidden />
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('Enter to send · Shift+Enter for a new line')}</p>
    </form>
  )
}

/** 질문에 말로 답하는 입력칸 — "1분짜리로"처럼 말해도 된다. */
function ReplyInput() {
  const t = useT()
  const reply = useEntryStore((s) => s.chatReply)
  const writing = useEntryStore((s) => s.writing)
  const [text, setText] = useState('')
  const disabled = writing.status === 'starting' || writing.status === 'writing'
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const said = text.trim()
    if (!said || disabled) return
    setText('')
    void reply(said)
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        aria-label={t('Chat input')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        placeholder={t('Pick one, or just say it. E.g. make it 1 minute')}
        disabled={disabled}
        className="h-10"
      />
      <Button type="submit" size="icon-lg" aria-label={t('Send')} disabled={disabled || !text.trim()}>
        <Send aria-hidden />
      </Button>
    </form>
  )
}
