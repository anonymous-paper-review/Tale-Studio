// 원작을 그대로 쓰면 시작 화면 채팅도 길이를 묻지 않고, 위쪽 칩 · 말로 한 길이 · 정리 카드 · 확인 창이 모두 원작 길이를 따른다고 보인다 (D15 오너 2026-11-22)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/start',
}))

import { EntryChat } from '@/features/entry/entry-chat'
import { useEntryStore } from '@/features/entry/entry-store'
import { chatChips, chatTranscript, currentChatQuestion, hintText, EMPTY_CHAT_UI } from '@/features/entry/chat-flow'
import { chatQuestionOrder } from '@/features/entry/options'
import { chatConfirmNote, startConfirmNote, summaryRows } from '@/features/entry/summary'
import { emptyEntryDraft, materialBasis, type EntryDraft, type EntryFileMeta } from '@/lib/entry/draft'
import { translate } from '@/lib/i18n/translate'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'

const ko = (key: string, params?: Record<string, string | number>) => translate('ko', key, params)
const KEEP_LENGTH = 'When the original is kept as is, the length follows the original.'
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다(60자가 넘어 글만 써도 "그대로"를 고를 수 있다).
const LONG_IDEA = '회사 복도 자판기가 고장 나서 캔이 우르르 쏟아지는 코미디. 주인공 민호는 하나도 못 먹고, 팀장은 양손 가득 캔을 안고 웃는다. 민호는 결국 자판기에 동전을 하나 더 넣는다.'
const SCRIPT = '민호: 또 안 나와?\n팀장: 고마워.'
const scriptFile: EntryFileMeta = { name: '자판기_촬영대본.docx', ext: 'docx', kind: 'text', size: 2048, chars: 20, text: SCRIPT, uploadedAt: '2026-11-22T00:00:00.000Z' }

function withRec(draft: EntryDraft, picks: EntryDraft['picks'], kind: '1-1' | '1-3' = '1-3'): EntryDraft {
  const rec = { kind, mood: 'comedy' as const, moodWhy: '', runtime: 'r60' as const, runtimeWhy: '', level: picks.level ?? 'grow', title: '자판기의 반란', source: 'llm' as const, basis: materialBasis(draft) }
  return { ...draft, rec, picks }
}
/** 대본 파일을 올리고 "바로 영상화"(그대로)를 고른 초안. answered = 이미 답한 질문. */
function keepFileDraft(answered: Record<string, boolean>, picks: Partial<EntryDraft['picks']> = {}): EntryDraft {
  const draft = withRec({ ...emptyEntryDraft(), file: scriptFile }, { mood: null, runtime: null, level: 'keep', ratio: null, ...picks }, '1-1')
  return { ...draft, chat: { answered, pre: {} } }
}
/** 글만 쓰고 길이를 먼저 답한 뒤 그대로를 고른 초안(모두 답함). */
function keepIdeaDraft(): EntryDraft {
  const draft = withRec({ ...emptyEntryDraft(), idea: LONG_IDEA }, { mood: 'comedy', runtime: 'r60', level: 'keep', ratio: '9:16' })
  return { ...draft, chat: { answered: { mood: true, runtime: true, level: true, ratio: true }, pre: {} } }
}

function serveCurrent(store: { getState: () => object; getInitialState: () => object }) {
  Object.assign(store.getInitialState(), store.getState())
}
function setEntry(draft: EntryDraft) {
  useEntryStore.setState({ projectId: 'project-1', status: 'ready', locale: 'ko', draft })
  serveCurrent(useEntryStore)
}
const html = () => renderToStaticMarkup(createElement(EntryChat as never)).replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')

let patches: unknown[] = []

beforeEach(() => {
  patches = []
  useEntryStore.getState().reset()
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'project-1', reachedStage: 'entry', currentStage: 'entry', projectTitle: 'Untitled' })
  serveCurrent(useEntryStore)
  serveCurrent(useLocaleStore)
  serveCurrent(useProjectStore)
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PATCH') patches.push(JSON.parse(String(init.body)))
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})

afterEach(() => {
  useEntryStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('원작 그대로와 시작 화면 채팅의 길이', () => {
  it('시작 채팅에서 그대로를 고르면 길이를 묻지 않고 장르·분위기 다음에 화면 비율을 묻는다', () => {
    // 왜: 그대로 쓰면 길이는 원작이 정한다 — 채팅만 길이를 물어 놓고 답을 버렸다(D15). 대본 파일을 올리고 "바로 영상화"를 고른 사람이 겪는다.
    expect(chatQuestionOrder(true, 'keep')).toEqual(['file', 'mood', 'ratio'])
    expect(chatQuestionOrder(false, 'keep')).toEqual(['mood', 'level', 'ratio'])
    const afterMood = keepFileDraft({ file: true, level: true, mood: true }, { mood: 'comedy' })
    expect(currentChatQuestion(afterMood)).toBe('ratio')
    setEntry(afterMood)
    const out = html()
    expect(out).toContain(ko('Choose the screen ratio.'))
    expect(out).not.toContain(ko('About how long shall it be?'))
  })

  it('글만 쓴 사람이 길이를 답한 뒤 그대로를 고르면 길이 문답은 대화에서 빠지고 정리 카드의 길이는 원작 길이대로다', () => {
    // 왜: 글만 쓴 사람은 바꿈 정도보다 길이를 먼저 답한다(11/5 시안 순서) — 그 뒤 그대로를 고르면 앞서 답한 길이는 쓰이지 않는다. 대화에 남으면 그 길이로 만드는 줄 안다.
    const draft = keepIdeaDraft()
    const ids = chatTranscript(draft, EMPTY_CHAT_UI, ko).map((item) => item.id)
    expect(ids).not.toContain('q-runtime')
    expect(ids).not.toContain('a-runtime')
    expect(ids).toContain('card-confirm')
    expect(summaryRows(draft, { t: ko, locale: 'ko' }).find((row) => row.key === 'runtime')?.value).toBe(ko('As long as the original'))
  })

  it('그대로면 위쪽 칩의 길이는 "원작 길이대로"이고 눌러 다시 고를 수 없다', () => {
    // 왜: 칩은 "15~60초", 정리표는 "원작 길이대로"로 서로 달랐다(D15 틈 ①). 칩을 눌러 길이를 다시 고를 수 있어 보이면 안 된다.
    const draft = keepIdeaDraft()
    expect(chatChips(draft, ko).find((chip) => chip.key === 'runtime')).toMatchObject({ value: ko('As long as the original'), locked: true })
    setEntry(draft)
    const button = html().match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*원작 길이대로(?:(?!<\/button>)[\s\S])*<\/button>/)?.[0] ?? ''
    expect(button).toContain('disabled')
    expect(button).toContain(`title="${ko(KEEP_LENGTH)}"`)
  })

  it('그대로면 시작 채팅에서 길이를 말해도 길이를 바꾸지 않고 원작 길이를 따른다고 답한다', async () => {
    // 왜: "길이는 1분으로"라고 하면 칩만 1분으로 바뀌고 실제로는 원작 길이로 만들었다. 정리 카드 아래에서 말로 고치는 사람이 겪는다.
    const draft = { ...keepIdeaDraft(), picks: { mood: 'comedy' as const, runtime: 'r15' as const, level: 'keep' as const, ratio: '9:16' as const } }
    useEntryStore.setState({ projectId: 'project-1', status: 'ready', draft })
    await useEntryStore.getState().chatReply('길이는 1분으로')
    const state = useEntryStore.getState()
    expect(state.draft.picks.runtime).toBe('r15')
    expect(patches.some((patch) => JSON.stringify(patch).includes('"runtime"'))).toBe(false)
    expect(state.chat.hint).not.toBeNull()
    expect(hintText(state.draft, state.chat.hint!, ko)).toBe(ko(KEEP_LENGTH))
  })

  it('그대로가 아니면 시작 채팅에서 말한 길이는 지금처럼 정한다', async () => {
    // 왜: 정상 경로 고정 — 다듬기 · 새롭게 키우기는 길이를 사용자가 정한다.
    const draft = { ...keepIdeaDraft(), picks: { mood: 'comedy' as const, runtime: 'r15' as const, level: 'polish' as const, ratio: '9:16' as const } }
    useEntryStore.setState({ projectId: 'project-1', status: 'ready', draft })
    await useEntryStore.getState().chatReply('길이는 1분으로')
    expect(useEntryStore.getState().draft.picks.runtime).toBe('r60')
    expect(patches.some((patch) => JSON.stringify(patch).includes('"runtime":"r60"'))).toBe(true)
  })

  it('그대로면 정리 카드 안내는 길이를 바꾸는 예시 대신 장르를 바꾸는 예시를 든다', () => {
    // 왜: 그대로에 "길이는 1분으로처럼 말해 주세요"는 따를 수 없는 안내다. 정리 카드는 확인 창 없이 바로 시작하는 마지막 자리다.
    setEntry(keepIdeaDraft())
    const out = html()
    expect(out).toContain(ko(chatConfirmNote('keep')))
    expect(out).not.toContain('"길이는 1분으로"')
    expect(ko(chatConfirmNote('keep'))).toContain('"장르는 코미디로"')
    // 그대로가 아니면 지금 안내 그대로다.
    expect(chatConfirmNote('grow')).toBe('When you press it, the screen ratio is locked. To change something, click an item above or say it, like "make the length 1 minute".')
  })

  it('그대로면 확인 창은 길이를 Writer에서 다시 바꿀 수 있다고 하지 않고 원작 길이를 따른다고 보인다', () => {
    // 왜: 확인 창이 "길이는 Writer에서 다시 바꿀 수 있어요"라고 했지만 그대로 쓰는 작품은 Writer에서 산문도 길이도 바꿀 수 없다(D15 틈 ②).
    expect(startConfirmNote('keep')).toBe(KEEP_LENGTH)
    expect(startConfirmNote('polish')).toBe('You can change the genre and mood and the length again in Writer.')
    const form = readFileSync(path.join(process.cwd(), 'src/features/entry/entry-form.tsx'), 'utf8')
    expect(form).toContain('t(startConfirmNote(')
    expect(form).not.toContain("t('You can change the genre and mood and the length again in Writer.')")
  })
})
