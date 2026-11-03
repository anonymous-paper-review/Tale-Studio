// Producer 설정 화면의 v3 고르기 칸: 하나만 고르는 칸은 aria-checked 로만 고름을 알리고, 꺼진 칸은 까닭을 마우스 · 화면 읽기 둘 다로 알린다 (v3 2026-11-03)
//   칩 · 선택 카드 부품 자체의 role="radio" 규칙은 tests/producer/choice-radio.test.ts 가 지킨다 — 여기는 설정 화면이 그 부품을 어떻게 쓰는지.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/start',
}))

import { EntryForm } from '@/features/entry/entry-form'
import { useEntryStore } from '@/features/entry/entry-store'
import { emptyEntryDraft, materialBasis, type EntryDraft } from '@/lib/entry/draft'
import { translate } from '@/lib/i18n/translate'
import { useLocaleStore } from '@/stores/locale-store'

const ko = (key: string) => translate('ko', key)
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다(60자가 넘어 "그대로"를 고를 수 있다).
const LONG_IDEA = '회사 복도 자판기가 고장 나서 캔이 우르르 쏟아지는 코미디. 주인공 민호는 하나도 못 먹고, 팀장은 양손 가득 캔을 안고 웃는다. 민호는 결국 동전을 하나 더 넣는다.'
const SHORT_IDEA = '회사 복도 자판기가 고장 나서 캔이 쏟아진다'

function recDraft(idea: string, level: 'keep' | 'polish' | 'grow' = 'grow'): EntryDraft {
  const base: EntryDraft = { ...emptyEntryDraft(), idea }
  const rec = { kind: '1-3' as const, mood: 'comedy' as const, moodWhy: '엉뚱한 사건이라 코미디로 읽었어요', runtime: 'r60' as const, runtimeWhy: '짧은 아이디어라 짧게 잡았어요', level, title: '자판기의 반란', source: 'llm' as const, basis: materialBasis(base) }
  return { ...base, rec, picks: { mood: rec.mood, runtime: rec.runtime, level, ratio: '9:16' } }
}

// 서버 그리기(renderToStaticMarkup)는 zustand 의 처음 상태(getInitialState)를 읽는다 — 시험은 지금 상태를 처음 상태에 덮어 그린다.
function serveCurrent(store: { getState: () => object; getInitialState: () => object }) {
  Object.assign(store.getInitialState(), store.getState())
}
function settingsHtml(draft: EntryDraft): string {
  useEntryStore.setState({ projectId: 'project-1', status: 'ready', locale: 'ko', draft, formStep: 2 })
  serveCurrent(useEntryStore)
  return renderToStaticMarkup(createElement(EntryForm)).replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
}

/** 꺼진 칸(aria-disabled) 하나하나의 aria-describedby 가 가리키는 글. */
function offReasons(out: string): string[] {
  const radios = out.match(/<button[^>]*role="radio"[^>]*aria-disabled="true"[^>]*>/g) ?? []
  return radios.map((radio) => {
    const id = radio.match(/aria-describedby="([^"]+)"/)?.[1]
    if (!id) return ''
    const target = out.match(new RegExp(`id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([^<]*)<`))
    return target?.[1] ?? ''
  })
}

beforeEach(() => {
  useEntryStore.getState().reset()
  useLocaleStore.setState({ locale: 'ko' })
  serveCurrent(useLocaleStore)
})

describe('설정 화면의 v3 고르기 칸', () => {
  it('설정 화면의 고르기 칸은 모두 aria-pressed 없이 aria-checked 로만 고른 상태를 알린다', () => {
    // 왜: 장르·분위기 · 길이 · 바꿈 정도 · 화면 비율은 저마다 하나만 고른다. v3 칩 · 선택 카드로 바꿔도 화살표로 옮겨 고르는 라디오 묶음이다.
    const out = settingsHtml(recDraft(SHORT_IDEA))
    expect(out.match(/role="radio"/g)?.length).toBe(10 + 4 + 3 + 4)
    expect(out).not.toContain('aria-pressed')
    expect(out.match(/role="radio" aria-checked="true"/g)?.length).toBe(4)
  })

  it('꺼진 길이 · 바꿈 정도 칸은 마우스를 올리면 까닭이 보이고 화면 읽기 프로그램도 그 까닭을 읽는다', () => {
    // 왜: 꺼진 버튼은 이유가 함께 있어야 한다. 원작 그대로를 고르면 길이 네 칸이, 지킬 원문이 없으면 "그대로" 칸이 꺼진다 —
    //   v3 선택 카드는 제목 칸이 버튼의 title 이 아니어서, 까닭이 마우스 말풍선 · 화면 읽기에서 빠지기 쉽다.
    const lengthReason = ko('When the original is kept as is, the length follows the original.')
    const keepLength = settingsHtml(recDraft(LONG_IDEA, 'keep'))
    expect(offReasons(keepLength)).toEqual([lengthReason, lengthReason, lengthReason, lengthReason])
    expect(keepLength.split(`title="${lengthReason}"`).length - 1).toBe(4)

    const keepReason = ko('"Keep as is" needs original text to keep. It opens when you upload a script file or write more than 60 characters of plot.')
    const noOriginal = settingsHtml(recDraft(SHORT_IDEA))
    expect(offReasons(noOriginal)).toEqual([keepReason])
    expect(noOriginal).toContain(`title="${keepReason}"`)
  })
})
