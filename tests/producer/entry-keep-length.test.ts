// 원작을 그대로 쓰면 길이 단추가 꺼지고 길이는 원작을 따라간다고 보인다 (2026-10-27 오너)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/start',
}))

import { EntryForm } from '@/features/entry/entry-form'
import { useEntryStore } from '@/features/entry/entry-store'
import { summaryRows } from '@/features/entry/summary'
import { translate } from '@/lib/i18n/translate'
import { emptyEntryDraft, materialBasis, picksComplete, type EntryDraft } from '@/lib/entry/draft'
import { planEntryStart } from '@/lib/entry/start-plan'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'

const ko = (key: string, params?: Record<string, string | number>) => translate('ko', key, params)
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다(60자가 넘어 "그대로"를 고를 수 있다).
const IDEA = '회사 복도 자판기가 고장 나서 캔이 우르르 쏟아지는 코미디. 주인공 민호는 하나도 못 먹고, 팀장은 양손 가득 캔을 안고 웃는다. 민호는 결국 자판기에 동전을 하나 더 넣는다.'

function draftOf(level: 'keep' | 'polish' | 'grow', runtime: EntryDraft['picks']['runtime'] = 'r60'): EntryDraft {
  const base = { ...emptyEntryDraft(), idea: IDEA }
  const rec = { kind: '1-3' as const, mood: 'comedy' as const, moodWhy: '', runtime: 'r60' as const, runtimeWhy: '', level, title: '자판기의 반란', source: 'llm' as const, basis: materialBasis(base) }
  return { ...base, rec, picks: { mood: 'comedy', runtime, level, ratio: '9:16' } }
}

function serveCurrent(store: { getState: () => object; getInitialState: () => object }) {
  Object.assign(store.getInitialState(), store.getState())
}
const html = () => renderToStaticMarkup(createElement(EntryForm as never)).replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')

/** 길이 묶음만 잘라 낸다 — "길이" 제목부터 바꿈 정도 묶음 제목(id=entry-level-title) 앞까지. */
function lengthGroup(out: string): string {
  const start = out.indexOf('>길이<')
  const end = out.indexOf('id="entry-level-title"', start)
  expect(start).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(start)
  return out.slice(start, end)
}

beforeEach(() => {
  useEntryStore.getState().reset()
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'project-1', reachedStage: 'entry', currentStage: 'entry', projectTitle: 'Untitled' })
  serveCurrent(useLocaleStore)
  serveCurrent(useProjectStore)
})

function show(draft: EntryDraft) {
  useEntryStore.setState({ projectId: 'project-1', status: 'ready', locale: 'ko', draft, formStep: 2 })
  serveCurrent(useEntryStore)
  return html()
}

describe('원작 그대로와 길이', () => {
  it('원작 그대로를 고르면 길이 단추가 모두 꺼지고 길이는 원작을 따라간다고 보여준다', () => {
    // 왜: 그대로 쓰면 길이는 원작이 정한다 — 고를 수 있어 보이는 길이 단추는 실제로는 아무 일도 하지 않았다(2026-10-27 오너).
    const group = lengthGroup(show(draftOf('keep')))
    const radios = group.match(/role="radio"[^>]*/g) ?? []
    expect(radios).toHaveLength(4)
    for (const radio of radios) {
      expect(radio).toContain('aria-disabled="true"')
      expect(radio).toContain('aria-checked="false"')
    }
    expect(group).toContain('원문을 그대로 쓰면 길이는 원작 길이를 따라요.')
    expect(group).not.toContain('추천')
  })

  it('원작 그대로면 길이를 고르지 않아도 시작할 수 있다', () => {
    // 왜: 길이 단추가 꺼져 있는데 "설정을 모두 고르세요"로 막히면 시작할 길이 없다.
    const draft = draftOf('keep', null)
    expect(picksComplete(draft.picks)).toBe(true)
    expect(planEntryStart({ projectId: 'project-1', draft, locale: 'ko', currentTitle: 'Untitled' })).toMatchObject({ ok: true })
    expect(show(draft)).not.toContain('설정을 모두 골라 주세요.')
    // 확인 창 · 정리 카드의 길이 줄은 "원작 길이"로 남는다.
    expect(summaryRows(draft, { t: ko, locale: 'ko' }).find((row) => row.key === 'runtime')?.value).toBe(ko('As long as the original'))
  })

  it('다듬기나 새롭게 키우기면 길이 단추는 지금처럼 켜져 있고 고른 길이가 보인다', () => {
    // 왜: 정상 경로 고정 — 원작을 고쳐 쓰는 두 단계에서는 길이를 사용자가 정한다.
    for (const level of ['polish', 'grow'] as const) {
      const group = lengthGroup(show(draftOf(level)))
      expect(group, level).not.toContain('aria-disabled="true"')
      expect(group, level).toContain('aria-checked="true"')
      expect(group, level).not.toContain('원문을 그대로 쓰면 길이는 원작 길이를 따라요.')
    }
    expect(picksComplete(draftOf('polish', null).picks)).toBe(false)
  })
})
