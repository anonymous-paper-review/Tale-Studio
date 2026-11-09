// 채팅으로 만들기 첫 화면 — 첫 인사 위 큰 Lumi 머리와 보내기 전에도 보이는 "지금까지 정한 것" 막대(11/5 시안 P1, 리드 2026-11-09)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/start',
}))

import { EntryChat } from '@/features/entry/entry-chat'
import { useEntryStore } from '@/features/entry/entry-store'
import { emptyEntryDraft, materialBasis, type EntryDraft } from '@/lib/entry/draft'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'

// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const IDEA = '회사 복도 자판기가 고장 나서 캔이 우르르 쏟아지는 코미디. 주인공 민호는 하나도 못 먹는다.'

function sentDraft(): EntryDraft {
  const draft = { ...emptyEntryDraft(), idea: IDEA }
  const rec = { kind: '1-3' as const, mood: 'comedy' as const, moodWhy: '엉뚱한 사건이라 코미디로 읽었어요', runtime: 'r60' as const, runtimeWhy: '짧은 아이디어라 짧게 잡았어요', level: 'grow' as const, title: '자판기의 반란', source: 'llm' as const, basis: materialBasis(draft) }
  return { ...draft, rec, picks: { mood: rec.mood, runtime: rec.runtime, level: rec.level, ratio: '9:16' } }
}

// 서버 그리기(renderToStaticMarkup)는 zustand 의 처음 상태(getInitialState)를 읽는다 — 시험은 지금 상태를 처음 상태에 덮어 그린다.
function serveCurrent(store: { getState: () => object; getInitialState: () => object }) {
  Object.assign(store.getInitialState(), store.getState())
}
function setEntry(state: Partial<ReturnType<typeof useEntryStore.getState>>) {
  useEntryStore.setState({ projectId: 'project-1', status: 'ready', locale: 'ko', ...state })
  serveCurrent(useEntryStore)
}
const html = () => renderToStaticMarkup(createElement(EntryChat)).replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
/** 막대(nav) 한 덩어리만 — 말풍선 글과 섞이지 않게. 막대가 없으면 빈 글. */
function bar(out: string): string {
  const label = out.indexOf('aria-label="지금까지 정한 것"')
  if (label < 0) return ''
  const start = out.lastIndexOf('<nav', label)
  return out.slice(start, out.indexOf('</nav>', start) + 6)
}

beforeEach(() => {
  useEntryStore.getState().reset()
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'project-1', reachedStage: 'entry', currentStage: 'entry', projectTitle: 'Untitled' })
  serveCurrent(useEntryStore)
  serveCurrent(useLocaleStore)
  serveCurrent(useProjectStore)
})

describe('채팅으로 만들기 첫 화면', () => {
  // 왜: 무엇을 같이 정하게 되는지 첫 글을 보내기 전에 보여 준다(리드 결정 — 칸 이름 · "아직"은 그대로).
  it('보내기 전에도 "지금까지 정한 것" 막대를 보이고 네 칸은 모두 "아직"이다', () => {
    setEntry({ draft: emptyEntryDraft() })
    const out = bar(html())
    expect(out).toContain('지금까지 정한 것')
    for (const label of ['장르·분위기', '길이', '바꿈 정도', '화면 비율']) expect(out, label).toContain(label)
    expect(out.match(/아직/g)).toHaveLength(4)
  })

  // 왜: 아직 아무것도 묻지 않았다 — 지금 묻는 칸처럼 단계 색으로 칠하면 무엇을 고르라는지 헷갈린다.
  it('보내기 전 막대에는 지금 묻는 칸 표시가 없고, 보낸 뒤에는 지금 묻는 칸을 표시한다', () => {
    setEntry({ draft: emptyEntryDraft() })
    const before = bar(html())
    expect(before).toContain('지금까지 정한 것')
    expect(before).not.toContain('aria-current="step"')
    setEntry({ draft: sentDraft() })
    expect(bar(html())).toContain('aria-current="step"')
  })

  // 왜: 첫 화면에서 누구와 무엇을 하는지 알린다(시안 P1 — 큰 Lumi · Producer 칩 · "Lumi와 기획해요").
  it('채팅 첫 화면은 첫 인사 위에 큰 Lumi 와 Producer 단계 칩, "Lumi와 기획해요"를 보인다', () => {
    setEntry({ draft: emptyEntryDraft() })
    const out = html()
    const hero = out.indexOf('data-testid="entry-chat-hero"')
    expect(hero).toBeGreaterThan(-1)
    const head = out.slice(hero, out.indexOf('무엇을 만들까요?'))
    expect(head).toContain('Producer')
    expect(head).toContain('Lumi와 기획해요')
  })
})
