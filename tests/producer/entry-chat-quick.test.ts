// 채팅으로 만들기의 빠른 답 넷과 정리 카드의 "아니요, 더 고칠래요" — 누르면 무엇을 하는지(11/5 시안 P1 · P2, 오너 2026-11-09 추천대로)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/start',
}))

import { EntryChat } from '@/features/entry/entry-chat'
import { chatTranscript } from '@/features/entry/chat-flow'
import { useEntryStore } from '@/features/entry/entry-store'
import { emptyEntryDraft, materialBasis, type EntryDraft } from '@/lib/entry/draft'
import { translate } from '@/lib/i18n/translate'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'

const ko = (key: string, params?: Record<string, string | number>) => translate('ko', key, params)
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const IDEA = '회사 복도 자판기가 고장 나서 캔이 우르르 쏟아지는 코미디. 주인공 민호는 하나도 못 먹는다.'

function confirmDraft(): EntryDraft {
  const draft = { ...emptyEntryDraft(), idea: IDEA }
  const rec = { kind: '1-3' as const, mood: 'comedy' as const, moodWhy: '엉뚱한 사건이라 코미디로 읽었어요', runtime: 'r60' as const, runtimeWhy: '짧은 아이디어라 짧게 잡았어요', level: 'grow' as const, title: '자판기의 반란', source: 'llm' as const, basis: materialBasis(draft) }
  return { ...draft, rec, picks: { mood: rec.mood, runtime: rec.runtime, level: rec.level, ratio: '9:16' }, chat: { answered: { mood: true, runtime: true, level: true, ratio: true }, pre: {} } }
}

function serveCurrent(store: { getState: () => object; getInitialState: () => object }) {
  Object.assign(store.getInitialState(), store.getState())
}
function setEntry(state: Partial<ReturnType<typeof useEntryStore.getState>>) {
  useEntryStore.setState({ projectId: 'project-1', status: 'ready', locale: 'ko', ...state })
  serveCurrent(useEntryStore)
}
const html = () => {
  serveCurrent(useEntryStore)
  return renderToStaticMarkup(createElement(EntryChat)).replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
}
const focusAsks = () => useEntryStore.getState().chat.focus ?? 0
const lines = () => chatTranscript(useEntryStore.getState().draft, useEntryStore.getState().chat, ko)

beforeEach(() => {
  useEntryStore.getState().reset()
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'project-1', reachedStage: 'entry', currentStage: 'entry', projectTitle: 'Untitled' })
  serveCurrent(useEntryStore)
  serveCurrent(useLocaleStore)
  serveCurrent(useProjectStore)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
})

afterEach(() => {
  useEntryStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('빠른 답', () => {
  // 왜: 아이디어가 있는 사람은 바로 적으면 된다 — 말풍선을 늘리지 않고 입력칸으로 보낸다.
  it('아이디어가 있어요를 누르면 말풍선 없이 입력칸에 커서를 둔다', () => {
    setEntry({ draft: emptyEntryDraft() })
    const before = lines().length
    useEntryStore.getState().chatQuick('idea')
    expect(focusAsks()).toBe(1)
    expect(lines()).toHaveLength(before)
  })

  // 왜: 대본은 길어서 어디에 넣는지(붙여 넣기 · 파일)를 먼저 알려 줘야 한다.
  it('대본이 있어요를 누르면 Lumi 가 "대본을 붙여 넣거나 파일로 올려 주세요"라고 말하고 입력칸에 커서를 둔다', () => {
    setEntry({ draft: emptyEntryDraft() })
    useEntryStore.getState().chatQuick('script')
    const out = html()
    expect(out).toContain('대본을 붙여 넣거나 파일로 올려 주세요')
    expect(lines().map((line) => line.kind)).toEqual(['agent', 'user', 'agent'])
    expect(focusAsks()).toBe(1)
  })

  // 왜: 파일로 시작하려는 사람에게 바로 파일 고르는 창을 연다(입력칸 옆 📎 와 같은 창).
  it('파일로 올릴게요를 누르면 파일 고르는 창을 연다', () => {
    setEntry({ draft: emptyEntryDraft() })
    useEntryStore.getState().chatQuick('file')
    expect(useEntryStore.getState().fileDialogOpen).toBe(true)
  })

  // 왜: 글을 보낸 뒤에는 질문 카드가 이어진다 — 처음 인사의 빠른 답은 더 보이지 않는다.
  it('글을 보낸 뒤에는 빠른 답을 보이지 않는다', () => {
    setEntry({ draft: confirmDraft() })
    expect(html()).not.toContain('대본이 있어요')
  })
})

describe('정리 카드의 단계 확인 단추', () => {
  // 왜: 정리 카드가 곧 확인이다 — 왼쪽 단추는 지금까지의 [Writer에게 써 달라고 하기]와 같은 일을 한다.
  it('"좋아요, 산문 쓰기로"를 누르면 지금처럼 Writer 에게 산문 초안을 써 달라고 한다', () => {
    const source = readFileSync('src/features/entry/entry-chat.tsx', 'utf8')
    expect(source).toContain('<StageConfirm')
    expect(source).toMatch(/stage="entry"\s+tone="chat"/)
    expect(source).toContain('onConfirm={() => void start()}')
  })

  // 왜: 바꾸고 싶은 게 있으면 말로 하면 된다 — Lumi 가 무엇을 바꿀지 묻고 입력칸으로 보낸다.
  it('"아니요, 더 고칠래요"를 누르면 Lumi 가 "무엇을 바꿀까요?"라고 묻고 입력칸에 커서를 둔다', () => {
    setEntry({ draft: confirmDraft() })
    useEntryStore.getState().chatRevise()
    const out = html()
    expect(out).toContain('무엇을 바꿀까요?')
    expect(out.indexOf('무엇을 바꿀까요?')).toBeGreaterThan(out.indexOf('좋아요, 산문 쓰기로'))
    expect(focusAsks()).toBe(1)
  })

  // 왜: 고칠 것을 말하면 물음은 끝났다 — 바꾼 값 안내만 남는다.
  it('고칠 것을 말하면 "무엇을 바꿀까요?"는 사라지고 바꾼 값을 알린다', async () => {
    setEntry({ draft: confirmDraft() })
    useEntryStore.getState().chatRevise()
    await useEntryStore.getState().chatReply('길이는 1~5분으로')
    const out = html()
    expect(out).not.toContain('무엇을 바꿀까요?')
    expect(out).toContain('"길이는 1~5분으로": 길이 1~5분(으)로 정했어요.')
  })
})
