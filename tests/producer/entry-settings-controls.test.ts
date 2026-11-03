// 하나만 고르는 v3 고르기 칸(칩 · 선택 카드)은 고른 상태를 aria-checked 로만 알린다 · 여러 번 누르는 칩은 지금처럼 aria-pressed (v3 2026-11-03)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/start',
}))

import { ChoiceChip, OptionCard } from '@/components/controls/choice-chip'
import { EntryForm } from '@/features/entry/entry-form'
import { useEntryStore } from '@/features/entry/entry-store'
import { emptyEntryDraft, materialBasis, type EntryDraft } from '@/lib/entry/draft'
import { useLocaleStore } from '@/stores/locale-store'

// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const IDEA = '회사 복도 자판기가 고장 나서 캔이 우르르 쏟아지는 코미디. 주인공 민호는 하나도 못 먹는다.'

function recDraft(): EntryDraft {
  const base: EntryDraft = { ...emptyEntryDraft(), idea: IDEA }
  const rec = { kind: '1-3' as const, mood: 'comedy' as const, moodWhy: '엉뚱한 사건이라 코미디로 읽었어요', runtime: 'r60' as const, runtimeWhy: '짧은 아이디어라 짧게 잡았어요', level: 'grow' as const, title: '자판기의 반란', source: 'llm' as const, basis: materialBasis(base) }
  return { ...base, rec, picks: { mood: rec.mood, runtime: rec.runtime, level: rec.level, ratio: '9:16' } }
}

// 서버 그리기(renderToStaticMarkup)는 zustand 의 처음 상태(getInitialState)를 읽는다 — 시험은 지금 상태를 처음 상태에 덮어 그린다.
function serveCurrent(store: { getState: () => object; getInitialState: () => object }) {
  Object.assign(store.getInitialState(), store.getState())
}

beforeEach(() => {
  useEntryStore.getState().reset()
  useLocaleStore.setState({ locale: 'ko' })
  serveCurrent(useLocaleStore)
})

describe('v3 고르기 칸의 고른 상태 알리기', () => {
  it('하나만 고르는 칩과 선택 카드는 고른 상태를 aria-checked 로 알리고 aria-pressed 는 달지 않는다', () => {
    // 왜: 화면 읽기 프로그램은 radio 에 붙은 aria-pressed 를 읽지 못하거나 엉뚱하게 읽는다 — 하나만 고르는 묶음은 "선택됨"으로 들려야 한다.
    const chip = renderToStaticMarkup(createElement(ChoiceChip, { role: 'radio', selected: true }, '코미디'))
    expect(chip).toContain('role="radio" aria-checked="true"')
    expect(chip).not.toContain('aria-pressed')
    const card = renderToStaticMarkup(createElement(OptionCard, { role: 'radio', selected: false, title: '15초 이하' }))
    expect(card).toContain('role="radio" aria-checked="false"')
    expect(card).not.toContain('aria-pressed')
  })

  it('여러 번 누르는 칩은 지금처럼 aria-pressed 로 고른 상태를 알린다', () => {
    // 왜: 정상 경로 고정 — 채팅 빠른 답 · 필터처럼 누를 때마다 켜고 끄는 칩은 눌림 단추다.
    const chip = renderToStaticMarkup(createElement(ChoiceChip, { selected: true }, '코미디'))
    expect(chip).toContain('aria-pressed="true"')
    expect(chip).not.toContain('aria-checked')
  })

  it('설정 화면의 고르기 칸은 모두 aria-pressed 없이 aria-checked 로만 고른 상태를 알린다', () => {
    // 왜: 장르·분위기 · 길이 · 바꿈 정도 · 화면 비율은 저마다 하나만 고른다. v3 칩으로 바꿔도 화살표로 옮겨 고르는 라디오 묶음이다.
    useEntryStore.setState({ projectId: 'project-1', status: 'ready', locale: 'ko', draft: recDraft(), formStep: 2 })
    serveCurrent(useEntryStore)
    const out = renderToStaticMarkup(createElement(EntryForm))
    expect(out.match(/role="radio"/g)?.length).toBe(10 + 4 + 3 + 4)
    expect(out).not.toContain('aria-pressed')
    expect(out.match(/role="radio" aria-checked="true"/g)?.length).toBe(4)
  })
})
