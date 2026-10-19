// 채팅으로 만들기(2안, 리뉴얼 1차 2026-10-19 · 프로토타입 EB1~EB7)의 흐름 — 초안에서 대화 줄을 만들고, 답 · 다시 묻기를 초안 고침으로 바꾼다.
//   순수 함수만: 화면(entry-chat.tsx)과 저장소(entry-store.ts)가 같이 쓴다. 화면에서 고르기 탭과 같은 초안을 읽으므로
//   한쪽에서 쓴 글 · 올린 파일 · 고른 값이 다른 쪽에 그대로 보인다.
//   약속: tests/producer/entry-store.test.ts · tests/producer/entry-screens.test.ts
import { fileHasText, recIsCurrent, type EntryChatProgress, type EntryDraft, type EntryPicks } from '@/lib/entry/draft'
import {
  CHAT_QUESTION,
  MATERIAL_KINDS,
  MIN_IDEA_CHARS,
  PICK_KEYS,
  QUESTION_NAME,
  RECOMMENDED_RATIO,
  TOO_SHORT_KEY,
  chatQuestionOrder,
  levelAvailable,
  levelOptionsFor,
  levelQuestion,
  isScriptMaterial,
  materialProblem,
  moodOf,
  nextChatQuestion,
  runtimeOf,
  type ChatQuestionKey,
  type LevelKey,
  type ParsedAnswer,
  type PickKey,
} from './options'

export type Translator = (key: string, params?: Record<string, string | number>) => string

/** 사용자가 말로 답한 뒤의 한 줄 — 읽은 질문들(빈 배열이면 못 알아들었다). 화면에서 번역한다. */
export interface ChatHint {
  said: string
  keys: PickKey[]
}

/** 채팅 화면만의 상태(초안에 저장하지 않는다). */
export interface ChatUi {
  showExamples: boolean
  examplePage: number
  /** 20자 규칙을 어기고 보냈다 — 에이전트가 더 적어 달라고 말한다. */
  lengthError: boolean
  hint: ChatHint | null
}

export const EMPTY_CHAT_UI: ChatUi = { showExamples: false, examplePage: 0, lengthError: false, hint: null }

export type ChatItem =
  | { kind: 'agent'; id: string; text: string; action?: 'show_examples' }
  | { kind: 'user'; id: string; text: string; fileName?: string }
  | { kind: 'examples'; id: string; page: number; intro: string }
  | { kind: 'error'; id: string; text: string }
  | { kind: 'card'; id: string; question: ChatQuestionKey | 'confirm' }

export const CHAT_GREETING = 'What shall we make? Upload material if you have it, or write it yourself. If you have no idea yet, I can show you examples.'
export const CHAT_EXAMPLES_INTRO = 'How about these? Click one you like and I will put it in the input. You can edit it before sending.'
export const CHAT_SHOW_EXAMPLES = 'Show me examples'
const CHAT_GUIDE = 'Who, where, what happens and how it ends: one or two lines are enough.'
const CHAT_PRE = 'From your message I read {items}. I will only ask the rest.'
const CHAT_READ_AS = 'I read {name} as {kind}.'
const CHAT_HINT_SET = '"{text}": set {items}.'
const CHAT_HINT_UNKNOWN = '"{text}": I did not quite get that. Please choose with the buttons.'
const CHAT_READ_KIND = 'Read it as {kind}.'

/** 처음 글을 보냈고 그 재료로 추천이 나왔다 — 이때부터 질문 카드를 묻는다. */
export function chatSent(draft: EntryDraft): boolean {
  return recIsCurrent(draft)
}

export function chatOrderOf(draft: EntryDraft): ChatQuestionKey[] {
  return chatQuestionOrder(!!draft.file)
}

/** 정했나: 정한 표시가 있고 그 값도 있다(파일 질문의 값은 바꿈 정도). */
function isAnswered(draft: EntryDraft, key: ChatQuestionKey): boolean {
  const value = key === 'file' ? draft.picks.level : draft.picks[key]
  return draft.chat.answered[key] === true && value !== null
}

export function currentChatQuestion(draft: EntryDraft): ChatQuestionKey | 'confirm' {
  const order = chatOrderOf(draft)
  const answered: Partial<Record<ChatQuestionKey, boolean>> = {}
  for (const key of order) if (isAnswered(draft, key)) answered[key] = true
  return nextChatQuestion(order, answered)
}

function fileWithText(draft: EntryDraft): boolean {
  return fileHasText(draft.file)
}

export function levelOptionsOf(draft: EntryDraft) {
  return levelOptionsFor(draft.rec?.kind ?? null, fileWithText(draft))
}

export function isScriptDraft(draft: EntryDraft): boolean {
  return isScriptMaterial(draft.rec?.kind ?? null, fileWithText(draft))
}

/** 정한 값을 보이는 말로(사용자 말풍선 · 요약 칩 · 읽었어요 안내). */
export function answerText(draft: EntryDraft, key: ChatQuestionKey, t: Translator): string {
  const { mood, runtime, level, ratio } = draft.picks
  if (key === 'mood') return mood ? t(moodOf(mood).label) : ''
  if (key === 'runtime') return runtime ? t(runtimeOf(runtime).label) : ''
  if (key === 'ratio') return ratio ?? ''
  if (!level) return ''
  const options = levelOptionsOf(draft)
  const index = options.findIndex((o) => o.key === level)
  const option = options[index] ?? options[0]
  return key === 'file' ? t(option.label) : `${index + 1} ${t(option.label)}`
}

export function questionText(draft: EntryDraft, key: ChatQuestionKey, t: Translator): string {
  if (key === 'file') {
    const kind = draft.rec?.kind ?? '1-3'
    return `${t(CHAT_READ_KIND, { kind: t(MATERIAL_KINDS[kind].label) })} ${t(levelQuestion(isScriptDraft(draft)))}`
  }
  return t(CHAT_QUESTION[key])
}

/** 파일 카드 첫 줄 — "자판기_촬영대본.docx을(를) 영상까지 고려된 대본(으)로 읽었어요." */
export function fileReadLine(draft: EntryDraft, t: Translator): string {
  const kind = draft.rec?.kind ?? '1-3'
  return t(CHAT_READ_AS, { name: draft.file?.name ?? '', kind: t(MATERIAL_KINDS[kind].label) })
}

export function hintText(draft: EntryDraft, hint: ChatHint, t: Translator): string {
  if (!hint.keys.length) return t(CHAT_HINT_UNKNOWN, { text: hint.said })
  const items = hint.keys.map((k) => `${t(QUESTION_NAME[k])} ${answerText(draft, k, t)}`).join(', ')
  return t(CHAT_HINT_SET, { text: hint.said, items })
}

/** 대화 줄 — 프로토타입 chatStage 와 같은 순서: 인사 · (예시) · (더 적어 달라는 말) / 보낸 글 · 읽었어요 · 지난 문답 · 지금 카드. */
export function chatTranscript(draft: EntryDraft, ui: ChatUi, t: Translator): ChatItem[] {
  const sent = chatSent(draft)
  const items: ChatItem[] = [{ kind: 'agent', id: 'greeting', text: t(CHAT_GREETING), ...(!sent && !ui.showExamples ? { action: 'show_examples' as const } : {}) }]
  if (!sent) {
    if (ui.showExamples) {
      items.push({ kind: 'user', id: 'ask-examples', text: t(CHAT_SHOW_EXAMPLES) })
      items.push({ kind: 'examples', id: 'examples', page: ui.examplePage, intro: t(CHAT_EXAMPLES_INTRO) })
    }
    const problem = materialProblem(draft.idea, draft.file)
    if (ui.lengthError && problem) {
      items.push({ kind: 'error', id: 'too-short', text: `${t(TOO_SHORT_KEY, { min: MIN_IDEA_CHARS, n: problem.length })} ${t(CHAT_GUIDE)}` })
    }
    return items
  }
  items.push({ kind: 'user', id: 'idea', text: draft.idea.trim(), ...(draft.file ? { fileName: draft.file.name } : {}) })
  const order = chatOrderOf(draft)
  const current = currentChatQuestion(draft)
  const pre = order.filter((k): k is PickKey => k !== 'file' && draft.chat.pre[k] === true && isAnswered(draft, k))
  if (pre.length) {
    items.push({ kind: 'agent', id: 'pre', text: t(CHAT_PRE, { items: pre.map((k) => `${t(QUESTION_NAME[k])} ${answerText(draft, k, t)}`).join(', ') }) })
  }
  for (const key of order) {
    if (key === current) {
      if (ui.hint) items.push({ kind: 'agent', id: 'hint', text: hintText(draft, ui.hint, t) })
      items.push({ kind: 'card', id: `card-${key}`, question: key })
      return items
    }
    if (draft.chat.pre[key]) continue
    items.push({ kind: 'agent', id: `q-${key}`, text: questionText(draft, key, t) })
    items.push({ kind: 'user', id: `a-${key}`, text: answerText(draft, key, t) })
  }
  if (ui.hint) items.push({ kind: 'agent', id: 'hint', text: hintText(draft, ui.hint, t) })
  items.push({ kind: 'card', id: 'card-confirm', question: 'confirm' })
  return items
}

export interface ChatChip {
  key: PickKey
  label: string
  value: string | null
  current: boolean
}

/** 위쪽 요약 칩 — 정한 값만 보이고, 누르면 그 질문으로 돌아간다. 파일이 있으면 바꿈 정도는 파일 질문이다. */
export function chatChips(draft: EntryDraft, t: Translator): ChatChip[] {
  const current = currentChatQuestion(draft)
  return PICK_KEYS.map((key) => {
    const question: ChatQuestionKey = key === 'level' && draft.file ? 'file' : key
    return {
      key,
      label: t(QUESTION_NAME[key]),
      value: isAnswered(draft, question) ? answerText(draft, key, t) : null,
      current: current === question,
    }
  })
}

// ── 초안 고침(서버 PATCH 와 같은 모양) ─────────────────────────────────────────

export interface ChatPatch {
  picks: Partial<EntryPicks>
  chat: EntryChatProgress
}

function flags(draft: EntryDraft): EntryChatProgress {
  return { answered: { ...draft.chat.answered }, pre: { ...draft.chat.pre } }
}

function markAnswered(draft: EntryDraft, chat: EntryChatProgress, key: ChatQuestionKey, pre: boolean) {
  const keys: ChatQuestionKey[] = key === 'file' || (key === 'level' && draft.file) ? ['file', 'level'] : [key]
  for (const k of keys) {
    chat.answered[k] = true
    if (pre) chat.pre[k] = true
    else delete chat.pre[k]
  }
}

/** 카드 버튼으로 답했다(1안에서 직접 고른 값도 같다). 파일 질문의 값은 바꿈 정도다. */
export function answerPatch(draft: EntryDraft, key: ChatQuestionKey, value: string): ChatPatch {
  const chat = flags(draft)
  markAnswered(draft, chat, key, false)
  const pickKey: PickKey = key === 'file' ? 'level' : key
  return { picks: { [pickKey]: value } as Partial<EntryPicks>, chat }
}

/** 말에서 읽은 값(asPre = 처음 보낸 글에서 읽었다). */
export function parsedPatch(draft: EntryDraft, parsed: ParsedAnswer, opts: { asPre: boolean }): ChatPatch {
  const chat = flags(draft)
  const picks: Partial<EntryPicks> = {}
  for (const key of PICK_KEYS) {
    const value = parsed[key]
    if (!value) continue
    ;(picks as Record<PickKey, unknown>)[key] = value
    markAnswered(draft, chat, key, opts.asPre)
  }
  return { picks, chat }
}

/** 요약 칩을 눌렀다 — 그 질문만 다시 묻는다. */
export function reaskPatch(draft: EntryDraft, key: PickKey): ChatPatch {
  const chat = flags(draft)
  const keys: ChatQuestionKey[] = key === 'level' && draft.file ? ['file', 'level'] : [key]
  for (const k of keys) {
    delete chat.answered[k]
    delete chat.pre[k]
  }
  return { picks: {}, chat }
}

/** [추천대로]의 값 — 화면 비율은 언제나 9:16 추천, "그대로"를 고를 수 없으면 다듬기. */
export function recommendedValue(draft: EntryDraft, key: ChatQuestionKey): string | null {
  const rec = draft.rec
  if (key === 'ratio') return RECOMMENDED_RATIO
  if (!rec) return null
  if (key === 'mood') return rec.mood
  if (key === 'runtime') return rec.runtime
  const level: LevelKey = levelAvailable(rec.level, draft.idea, draft.file) ? rec.level : 'polish'
  return level
}

export function applyChatPatch(draft: EntryDraft, patch: ChatPatch): EntryDraft {
  return { ...draft, picks: { ...draft.picks, ...patch.picks }, chat: patch.chat }
}
