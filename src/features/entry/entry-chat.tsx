'use client'

// 채팅으로 만들기(2안, 리뉴얼 1차 2026-10-19 · 프로토타입 EB1~EB7 · EBX): 화면 가운데가 채팅이다.
//   에이전트가 먼저 묻고 [예시 보여줘]를 둔다 → 글을 보내거나 파일을 올리면 AI가 읽고 추천한다 →
//   파일을 올린 사람은 "어떻게 쓸까요"를, 글만 쓴 사람은 장르·분위기 → 길이 → 바꿈 정도를 묻고 마지막에 화면 비율 →
//   정리 카드의 [Writer에게 써 달라고 하기]로 시작한다(확인 창 없이 1안과 같은 시작). 말로 답해도 된다.
//   화면에서 고르기 탭과 같은 초안을 쓴다 — 거기서 쓴 글 · 고른 값이 여기 그대로 보인다.
//   v3(2026-11-03): 말풍선 · 빠른 답 칩 · 입력 알약은 오른쪽 채팅(global-chat)과 같은 모양, 선택지는 controls 의 칩 · 선택 카드.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Lock, Paperclip, Send } from 'lucide-react'
import { ChoiceChip, OptionCard } from '@/components/controls/choice-chip'
import { StageConfirm } from '@/components/controls/stage-confirm'
import { Lumi } from '@/components/lumi/lumi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { STAGE_LABEL } from '@/lib/constants'
import { useT } from '@/lib/i18n'
import { STAGE_PERSONA } from '@/lib/lumi'
import { cn } from '@/lib/utils'
import { type EntryDraft } from '@/lib/entry/draft'
import {
  CHAT_QUESTION,
  EXAMPLES_PER_PAGE,
  MOODS,
  RATIOS,
  RUNTIMES,
  examplesPage,
  ideaLength,
  keepUnavailableNote,
  levelAvailable,
  levelQuestion,
  type ChatQuestionKey,
} from './options'
import {
  CHAT_QUICK,
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
import { moodRecommendation, ratioRecommendation } from './series'
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
      {/* 보내기 전에도 보인다(11/5 시안 P1, 리드 결정) — 칸 이름 · "아직"은 그대로, 지금 묻는 칸 표시는 보낸 뒤부터. */}
      <ChipsBar draft={draft} sent={sent} t={t} />
      <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto">
        {/* 대화 줄 사이 28(11/5 시안 P1 · P2) */}
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-7 px-6 py-6" aria-live="polite">
          <ChatHero t={t} />
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
      <div className="shrink-0 bg-background">
        <div className="mx-auto w-full max-w-2xl px-6 pb-5 pt-3">{sent ? <ReplyInput /> : <FirstComposer />}</div>
      </div>
    </div>
  )
}

/** 첫 인사 위 머리(11/5 시안 P1) — 큰 Lumi(Producer 옷, XL) · 단계 칩 · "Lumi와 기획해요". 대화가 길어지면 위로 밀려 올라간다. */
function ChatHero({ t }: { t: Translator }) {
  return (
    <div data-testid="entry-chat-hero" className="flex flex-col items-center gap-2.5">
      <Lumi persona={STAGE_PERSONA.entry} state="idle" size="xl" />
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-stage px-2.5 py-1 text-micro font-semibold leading-none text-on-stage">{STAGE_LABEL.entry}</span>
        <span className="text-label font-medium text-muted-foreground">{t('Plan with Lumi')}</span>
      </div>
    </div>
  )
}

function ChipsBar({ draft, sent, t }: { draft: EntryDraft; sent: boolean; t: Translator }) {
  const reask = useEntryStore((s) => s.chatReask)
  return (
    // 11/5 시안 P1 · P2: 대화 위 가운데에 뜬 알약 묶음(정리 바탕 · 안쪽 6/20 · 사이 6) — 보이는 이름 "지금까지 정한 것"과 칸(정리 칸 색 · 안쪽 5/10).
    //   이름은 nav 의 aria-label 과 같아 화면 읽기에서는 한 번만 읽히게 숨긴다.
    <nav aria-label={t('What we have decided so far')} className="flex shrink-0 justify-center bg-background px-6 pt-3">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-[18px] bg-chat-summary px-5 py-1.5">
        <span className="text-meta font-medium text-subtle-foreground" aria-hidden>
          {t('What we have decided so far')}
        </span>
        {chatChips(draft, t).map((chip) => {
          // 아직 아무것도 묻지 않았으면(보내기 전) 지금 묻는 칸이 없다.
          const current = sent && chip.current
          return (
          <button
            key={chip.key}
            type="button"
            onClick={() => void reask(chip.key)}
            disabled={!chip.value}
            title={chip.value ? t('Click to choose again') : undefined}
            aria-current={current ? 'step' : undefined}
            // 지금 묻는 칸은 지금 단계 색 테두리 · 18% 바탕(v3 고른 칩과 같은 규칙), 아직 못 정한 칸은 흐린 글자.
            className={cn(
              'inline-flex min-h-6 items-center gap-[5px] rounded-full border-[1.5px] px-2.5 py-[3px] text-meta outline-none transition-colors duration-100 ease-out focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
              current ? 'border-stage bg-stage/18' : 'border-transparent bg-chat-summary-cell',
              chip.value ? 'hover:bg-card' : null,
            )}
          >
            {chip.key === 'ratio' ? <Lock className="size-3 text-subtle-foreground" aria-hidden /> : null}
            <span className="text-subtle-foreground">{chip.label}</span>
            <span className={chip.value ? 'font-semibold text-foreground' : 'text-subtle-foreground'}>{chip.value ?? t('Not yet')}</span>
          </button>
          )
        })}
      </div>
    </nav>
  )
}

function ChatRow({ item, draft, t }: { item: ChatItem; draft: EntryDraft; t: Translator }) {
  if (item.kind === 'user') return <UserBubble text={item.text} fileName={item.fileName} />
  if (item.kind === 'error') {
    return (
      <AgentBubble alert>
        <p className="text-destructive">{item.text}</p>
        {item.guide ? <p className="text-muted-foreground">{item.guide}</p> : null}
      </AgentBubble>
    )
  }
  if (item.kind === 'examples') return <ExamplesBubble page={item.page} intro={item.intro} t={t} />
  if (item.kind === 'card') return <QuestionCard question={item.question} draft={draft} t={t} />
  return (
    <AgentBubble>
      <p className="whitespace-pre-wrap">{item.text}</p>
      {item.action === 'quick_replies' ? <QuickReplies t={t} /> : null}
    </AgentBubble>
  )
}

/**
 * 첫 인사 아래 빠른 답 넷(11/5 시안 P1, 오너 2026-11-09 추천대로) — 아이디어: 입력칸에 커서 · 대본: 어디에 넣는지 알리고 커서 ·
 *   파일: 파일 고르는 창 · 예시: 지금처럼 예시 셋. 말풍선 위 알약(가운데 채팅 내 말풍선 색).
 */
function QuickReplies({ t }: { t: Translator }) {
  const quick = useEntryStore((s) => s.chatQuick)
  const showExamples = useEntryStore((s) => s.showExamples)
  const pill = 'rounded-full bg-surface-elevated hover:bg-chip'
  return (
    <div className="flex flex-wrap gap-2.5">
      <Button variant="secondary" size="sm" className={pill} onClick={() => quick('idea')}>
        {t(CHAT_QUICK.idea)}
      </Button>
      <Button variant="secondary" size="sm" className={pill} onClick={() => quick('script')}>
        {t(CHAT_QUICK.script)}
      </Button>
      <Button variant="secondary" size="sm" className={pill} onClick={() => quick('file')}>
        {t(CHAT_QUICK.file)}
      </Button>
      <Button variant="secondary" size="sm" className={pill} onClick={showExamples}>
        {t('Show me examples')}
      </Button>
    </div>
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
            className="flex flex-col items-start gap-1 rounded-[14px] bg-card px-4 py-3 text-left outline-none transition-colors duration-100 ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-label font-semibold">{t(example.title)}</span>
            <span className="text-caption text-muted-foreground">{t(example.text)}</span>
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
  sub?: ReactNode
  disabled?: boolean
  mono?: boolean
}

/**
 * 카드 안 선택지 — 누르면 바로 답이 된다(지금 고른 값은 눌린 모양). 추천에는 추천 표시.
 *   v3: 한 줄 선택지는 채팅 빠른 답 칩(tone="chat"), 설명이 붙은 선택지는 선택 카드.
 */
function CardOptions({
  options,
  current,
  recommended,
  recommendedLabel,
  onPick,
  column,
}: {
  options: CardOption[]
  current: string | null
  recommended: string | null
  /** 추천 표시의 말(기본 "추천", 시리즈 다음 화의 화면 비율은 "앞 화"). */
  recommendedLabel?: string
  onPick: (v: string) => void
  column?: boolean
}) {
  const withSub = options.some((o) => o.sub)
  return (
    <div className={cn('gap-2.5', column ? 'flex flex-col' : withSub ? 'grid grid-cols-2 sm:grid-cols-4' : 'flex flex-wrap')}>
      {options.map((o) => {
        const isRecommended = o.value === recommended
        // 추천 표시의 말을 바꾼 칸(시리즈 "앞 화")은 이름 옆에 그 배지를 직접 단다 — 칸 부품의 추천 배지는 늘 "추천"이다.
        const name = (
          <>
            <span className={cn(o.mono && 'font-num tabular-nums')}>{o.label}</span>
            {isRecommended && recommendedLabel ? <RecommendedBadge label={recommendedLabel} /> : null}
          </>
        )
        const common = {
          selected: o.value === current,
          recommended: isRecommended && !recommendedLabel,
          disabled: o.disabled,
          onClick: () => onPick(o.value),
        }
        return withSub ? (
          <OptionCard key={o.value} {...common} title={name} description={o.sub ? <span className="flex flex-col">{o.sub}</span> : undefined} />
        ) : (
          <ChoiceChip key={o.value} tone="chat" {...common}>
            {name}
          </ChoiceChip>
        )
      })}
    </div>
  )
}

function QuestionCard({ question, draft, t }: { question: ChatQuestionKey | 'confirm'; draft: EntryDraft; t: Translator }) {
  const answer = useEntryStore((s) => s.chatAnswer)
  const accept = useEntryStore((s) => s.chatAcceptRecommendation)
  const start = useEntryStore((s) => s.start)
  const revise = useEntryStore((s) => s.chatRevise)
  const writing = useEntryStore((s) => s.writing)
  const entryLocale = useEntryStore((s) => s.locale)
  const series = useEntryStore((s) => s.series)
  const rec = draft.rec
  const keepOpen = levelAvailable('keep', draft.idea, draft.file)
  const acceptButton = (
    <div>
      <Button variant="secondary" size="sm" onClick={() => void accept(question as ChatQuestionKey)}>
        {t('Go with the recommendation')}
      </Button>
    </div>
  )

  if (question === 'confirm') {
    const starting = writing.status === 'starting' || writing.status === 'writing'
    return (
      <AgentBubble roomy>
        <p>{t('I will start like this.')}</p>
        {/* 정리 표(11/5 시안 P2): 말풍선보다 어두운 정리 바탕 · 모서리 14 · 안쪽 10/20 · 줄 위아래 11 · 이름 칸 72 이상 · 이름과 값 사이 16 */}
        <dl className="grid grid-cols-[minmax(72px,auto)_1fr] gap-x-4 rounded-[14px] bg-chat-summary px-5 py-2.5">
          {summaryRows(draft, { t, locale: entryLocale, series }).map((row) => (
            <div key={row.key} className="contents">
              <dt className="flex items-center gap-1.5 py-[11px] text-subtle-foreground">
                {row.locked ? <Lock className="size-3.5" aria-hidden /> : null}
                {row.label}
              </dt>
              <dd className="break-words py-[11px]">{row.value}</dd>
            </div>
          ))}
        </dl>
        {/* 단계 확인 단추(11/5 시안 P2, 오너 2026-11-09 추천대로) — 왼쪽은 지금까지의 [Writer에게 써 달라고 하기]와 같은 일,
            오른쪽은 무엇을 바꿀지 묻고 입력칸으로 보낸다. 화면 비율이 잠긴다는 안내는 그대로 둔다. */}
        <StageConfirm stage="entry" tone="chat" disabled={starting} onConfirm={() => void start()} onRevise={revise} />
        <p className="flex items-start gap-1.5 text-caption text-muted-foreground">
          <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>{t('When you press it, the screen ratio is locked. To change something, click an item above or say it, like "make the length 1 minute".')}</span>
        </p>
      </AgentBubble>
    )
  }

  if (question === 'mood') {
    // 다음 화는 앞 화 장르에 "앞 화" 표시(2026-11-09 오너 추천대로) — 그때 AI 추천 이유 줄은 다른 장르 이야기라 두지 않는다.
    const mood = moodRecommendation(series, rec)
    return (
      <AgentBubble>
        <p>{t(CHAT_QUESTION.mood)}</p>
        <CardOptions
          options={MOODS.map((m) => ({ value: m.key, label: t(m.label) }))}
          current={draft.picks.mood}
          recommended={mood.value}
          recommendedLabel={mood.fromPreviousEpisode ? t('Previous episode') : undefined}
          onPick={(v) => void answer('mood', v)}
        />
        <WhyLine text={mood.fromPreviousEpisode ? null : rec?.moodWhy} />
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
          <span className="inline-flex items-center gap-1 font-semibold text-lock-note">
            <Lock className="size-3.5" aria-hidden />
            {t('Once chosen, it cannot be changed until the end.')}
          </span>
        </p>
        <CardOptions options={RATIOS.map((r) => ({ value: r.key, label: r.key, sub: t(r.sub), mono: true }))} current={draft.picks.ratio}
          recommended={ratioRecommendation(series)}
          recommendedLabel={series?.ratio ? t('Previous episode') : undefined}
          onPick={(v) => void answer('ratio', v)}
        />
        {acceptButton}
      </AgentBubble>
    )
  }

  // 바꿈 정도: 글만 쓴 사람(level)과 파일을 올린 사람(file, 자료 종류에 맞춘 말).
  const levelOptions = levelOptionsOf(draft).map((l, i) => ({
    value: l.key,
    label: `${i + 1} ${t(l.label)}`,
    sub: (
      <>
        <span>
          {t('Keeps')} {t(l.keeps)}
        </span>
        <span>
          {t('Changes')} {t(l.changes)}
        </span>
      </>
    ),
    disabled: l.key === 'keep' && !keepOpen,
  }))
  const ocrLine = question === 'file' && draft.file?.kind === 'image' ? (draft.file.text ?? '').split('\n').find((l) => l.trim()) : null
  return (
    <AgentBubble>
      {question === 'file' ? (
        <>
          <p>{fileReadLine(draft, t)}</p>
          {ocrLine ? (
            <blockquote className="border-l-2 border-border pl-3 text-caption text-muted-foreground">
              <span className="select-text">{ocrLine}</span> <span>{t('(the first line read from the picture)')}</span>
            </blockquote>
          ) : null}
          <p className="font-medium">{t(levelQuestion(isScriptDraft(draft)))}</p>
        </>
      ) : (
        <p>{t(CHAT_QUESTION.level)}</p>
      )}
      <CardOptions column options={levelOptions} current={draft.picks.level} recommended={rec ? (levelAvailable(rec.level, draft.idea, draft.file) ? rec.level : 'polish') : null} onPick={(v) => void answer(question, v)} />
      {!keepOpen ? <p className="text-caption text-muted-foreground">{t(keepUnavailableNote('chat'))}</p> : null}
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
  const focusAsks = useEntryStore((s) => s.chat.focus ?? 0)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const busy = !!reading || upload.status === 'uploading'
  const canSend = !!draft.file || draft.idea.trim().length > 0

  // 빠른 답(아이디어 · 대본)이 커서를 달라고 하면 입력칸이 받는다.
  useEffect(() => {
    if (focusAsks) fieldRef.current?.focus()
  }, [focusAsks])

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
      {/* v3 입력 알약(오른쪽 채팅과 같다) — 카드색 · 포커스면 지금 단계 색 테두리 · 크림 보내기 원. */}
      <div className="flex flex-col gap-2 rounded-[22px] border border-transparent bg-chat-input py-2.5 pl-4 pr-2.5 transition-colors duration-150 ease-out focus-within:border-stage">
        <Textarea
          ref={fieldRef}
          aria-label={t('Idea')}
          rows={2}
          value={draft.idea}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('E.g. A story of two people who meet on a rainy day')}
          className="min-h-12 resize-none border-0 bg-transparent p-1 text-chat shadow-none focus-visible:ring-0 dark:bg-transparent"
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
              <span className="text-caption text-subtle-foreground">{t('Upload a file if you have one')}</span>
            </>
          )}
          <span className="ml-auto font-num text-meta font-medium tabular-nums text-subtle-foreground" aria-live="polite">
            {t('{n} characters', { n: ideaLength(draft.idea) })}
          </span>
          <Button type="submit" size="icon" className="rounded-full" aria-label={t('Send')} title={t('Send')} disabled={busy || !canSend}>
            <Send aria-hidden />
          </Button>
        </div>
      </div>
      <p className="pl-4 text-caption text-subtle-foreground">{t('Enter to send · Shift+Enter for a new line')}</p>
    </form>
  )
}

/** 질문에 말로 답하는 입력칸 — "1분짜리로"처럼 말해도 된다. */
function ReplyInput() {
  const t = useT()
  const reply = useEntryStore((s) => s.chatReply)
  const writing = useEntryStore((s) => s.writing)
  const focusAsks = useEntryStore((s) => s.chat.focus ?? 0)
  const fieldRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const disabled = writing.status === 'starting' || writing.status === 'writing'

  // [아니요, 더 고칠래요]가 커서를 달라고 하면 입력칸이 받는다.
  useEffect(() => {
    if (focusAsks) fieldRef.current?.focus()
  }, [focusAsks])
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const said = text.trim()
    if (!said || disabled) return
    setText('')
    void reply(said)
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-2 rounded-[26px] border border-transparent bg-chat-input py-2 pl-4 pr-2 transition-colors duration-150 ease-out focus-within:border-stage">
      <Input
        ref={fieldRef}
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
        className="h-9 border-0 bg-transparent px-0 text-chat shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Button type="submit" size="icon" className="shrink-0 rounded-full" aria-label={t('Send')} disabled={disabled || !text.trim()}>
        <Send aria-hidden />
      </Button>
    </form>
  )
}
