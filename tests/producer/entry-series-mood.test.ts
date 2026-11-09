// 시리즈 다음 화의 장르 이어받기 — 앞 화 장르를 미리 골라 두고 "앞 화" 표시, [추천대로]도 앞 화 장르, 글을 읽어도 그대로(오너 2026-11-09 추천대로)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/start',
}))

import { EntryChat } from '@/features/entry/entry-chat'
import { EntryForm } from '@/features/entry/entry-form'
import { recommendedValue } from '@/features/entry/chat-flow'
import { entrySeriesOf, moodRecommendation, parseEntrySeries, picksAfterRecommend, type EntrySeries } from '@/features/entry/series'
import { useEntryStore } from '@/features/entry/entry-store'
import { emptyEntryDraft, materialBasis, type EntryDraft } from '@/lib/entry/draft'
import { parseSeries, SERIES_VERSION } from '@/lib/series/snapshot'
import { useLocaleStore } from '@/stores/locale-store'

// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const IDEA = '자판기가 고쳐진 다음 날, 민호가 공짜 캔을 노리다 팀장에게 들키는 2화.'
const REC = { kind: '1-3' as const, mood: 'drama' as const, moodWhy: '사건보다 마음이 중심이라 드라마로 읽었어요', runtime: 'r60' as const, runtimeWhy: '짧은 아이디어라 짧게 잡았어요', level: 'grow' as const, title: '자판기의 반란 2', source: 'llm' as const }

/** 다음 화: 앞 화 장르(코미디)를 미리 골라 둔 초안에 AI 추천(드라마)이 붙은 모습. */
function nextEpisodeDraft(): EntryDraft {
  const draft: EntryDraft = { ...emptyEntryDraft(), idea: IDEA }
  return { ...draft, rec: { ...REC, basis: materialBasis(draft) }, picks: { mood: 'comedy', runtime: 'r60', level: 'grow', ratio: '9:16' } }
}
function series(over: Partial<EntrySeries> = {}): EntrySeries {
  return { ratio: '9:16', dialogueLanguage: 'ko', characters: 2, locations: 1, hasVoices: false, continuesLastScene: false, mood: 'comedy', ...over }
}
function serveCurrent(store: { getState: () => object; getInitialState: () => object }) {
  Object.assign(store.getInitialState(), store.getState())
}
function render(component: () => unknown, state: Partial<ReturnType<typeof useEntryStore.getState>>): string {
  useEntryStore.setState({ projectId: 'project-2', status: 'ready', locale: 'ko', ...state })
  serveCurrent(useEntryStore)
  return renderToStaticMarkup(createElement(component as never))
}

beforeEach(() => {
  useEntryStore.getState().reset()
  useLocaleStore.setState({ locale: 'ko' })
  serveCurrent(useLocaleStore)
})

describe('다음 화의 장르 이어받기', () => {
  // 왜: 다음 화도 대개 같은 장르다 — 앞 화 장르를 미리 골라 두고, AI 추천과 헷갈리지 않게 "앞 화" 표시를 붙인다(화면 비율과 같은 규칙).
  it('다음 화 채팅의 장르·분위기 카드는 앞 화 장르에 "앞 화" 표시를 붙인다', () => {
    const out = render(EntryChat, { draft: nextEpisodeDraft(), series: series() })
    expect(out).toContain('어떤 장르·분위기로 할까요?')
    expect(out).toContain('앞 화')
    expect(moodRecommendation(series(), REC)).toEqual({ value: 'comedy', fromPreviousEpisode: true })
    expect(moodRecommendation(null, REC)).toEqual({ value: 'drama', fromPreviousEpisode: false })
  })

  // 왜: 설정 화면도 채팅과 같은 표시여야 탭을 바꿔도 같은 값이 같은 모양으로 보인다.
  it('다음 화 설정 화면도 앞 화 장르에 "앞 화" 표시를 붙인다', () => {
    const out = render(EntryForm, { draft: nextEpisodeDraft(), series: series(), formStep: 2 })
    const moodBox = out.slice(0, out.indexOf('data-entry-lock'))
    expect(moodBox).toContain('앞 화')
    expect(readFileSync('src/features/entry/entry-form.tsx', 'utf8')).toContain('moodRecommendation(series, rec)')
  })

  // 왜: [추천대로]를 누르면 표시가 붙은 값을 고른다 — 다음 화는 앞 화 장르다.
  it('다음 화의 [추천대로]는 앞 화 장르를 고른다', () => {
    expect(recommendedValue(nextEpisodeDraft(), 'mood', series())).toBe('comedy')
    expect(recommendedValue(nextEpisodeDraft(), 'mood', null)).toBe('drama')
  })

  // 왜: 글을 읽어 추천을 새로 만들어도 이어받은(또는 사람이 바꾼) 장르를 덮지 않는다. 시리즈가 아니면 지금처럼 추천 장르다.
  it('다음 화는 글을 읽어 추천을 만들어도 앞 화에서 이어받은 장르를 그대로 둔다', () => {
    const draft = nextEpisodeDraft()
    expect(picksAfterRecommend(draft, REC, 'comedy')).toEqual({ mood: 'comedy', runtime: 'r60', level: 'grow', ratio: '9:16' })
    expect(picksAfterRecommend(draft, REC, null).mood).toBe('drama')
    expect(picksAfterRecommend({ ...draft, picks: { ...draft.picks, mood: null } }, REC, 'comedy').mood).toBe('drama')
    expect(readFileSync('src/app/api/produce/entry/recommend/route.ts', 'utf8')).toContain('picksAfterRecommend(')
  })

  // 왜: 시작 화면은 시리즈 기록(projects.series)에서 장르를 읽는다 — 기록에 없으면(이전에 만든 다음 화) 지금처럼 동작한다.
  it('시리즈 기록에 앞 화 장르가 있으면 시작 화면 정보에 싣고, 없으면 싣지 않는다', () => {
    const base = { version: SERIES_VERSION, prevProjectId: 'p1', prevTitle: '자판기의 반란', copiedAt: '', characters: [], locations: [], voices: [], styleId: null, format: null, dialogueLanguage: null, continuesLastScene: false, copyFailures: [], designTokens: null, world: null }
    expect(entrySeriesOf(parseSeries({ ...base, mood: 'comedy' }))?.mood).toBe('comedy')
    expect(entrySeriesOf(parseSeries({ ...base, mood: 'not-a-genre' }))?.mood ?? null).toBeNull()
    expect(entrySeriesOf(parseSeries(base))).not.toHaveProperty('mood')
    expect(parseEntrySeries({ characters: 1, locations: 0, hasVoices: false, continuesLastScene: false, mood: 'romance' })?.mood).toBe('romance')
  })
})
