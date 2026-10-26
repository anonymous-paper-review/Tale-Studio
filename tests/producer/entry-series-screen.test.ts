// 시리즈 다음 화의 시작 화면: 설정의 화면 비율 · 언어 묶음, 시작 확인 창의 이어받는 것 줄, 채팅 [추천대로] 비율 (2026-10-26 · 프로토타입 E3s · E4s)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/start',
}))

import { EntryForm } from '@/features/entry/entry-form'
import { summaryRows } from '@/features/entry/summary'
import { recommendedValue } from '@/features/entry/chat-flow'
import { entrySeriesOf, parseEntrySeries, type EntrySeries } from '@/features/entry/series'
import { useEntryStore } from '@/features/entry/entry-store'
import { emptyEntryDraft, materialBasis, type EntryDraft } from '@/lib/entry/draft'
import { translate } from '@/lib/i18n/translate'
import { SERIES_VERSION, type SeriesSnapshot } from '@/lib/series/snapshot'
import { useLocaleStore } from '@/stores/locale-store'

const ko = (key: string, params?: Record<string, string | number>) => translate('ko', key, params)
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const IDEA = '자판기가 고쳐진 다음 날, 민호가 공짜 캔을 노리다 팀장에게 들키는 2화.'

function recDraft(ratio: EntryDraft['picks']['ratio']): EntryDraft {
  const draft: EntryDraft = { ...emptyEntryDraft(), idea: IDEA }
  const rec = { kind: '1-3' as const, mood: 'comedy' as const, moodWhy: '엉뚱한 사건이라 코미디로 읽었어요', runtime: 'r60' as const, runtimeWhy: '짧은 아이디어라 짧게 잡았어요', level: 'grow' as const, title: '자판기의 반란 2', source: 'llm' as const, basis: materialBasis(draft) }
  return { ...draft, rec, picks: { mood: rec.mood, runtime: rec.runtime, level: rec.level, ratio } }
}

function series(over: Partial<EntrySeries> = {}): EntrySeries {
  return { ratio: '16:9', dialogueLanguage: 'ko', characters: 2, locations: 1, hasVoices: true, continuesLastScene: false, ...over }
}

function snapshot(over: Partial<SeriesSnapshot> = {}): SeriesSnapshot {
  return {
    version: SERIES_VERSION,
    prevProjectId: 'project-1',
    prevTitle: '자판기의 반란',
    copiedAt: '2026-10-26T00:00:00.000Z',
    characters: [
      { characterId: 'char_minho', name: '민호', role: 'protagonist', appearance: '구겨진 셔츠를 입은 신입', personality: [], sheetUrl: 'https://media.test/minho.png', portraitUrl: null, styleId: 'anime' },
      { characterId: 'char_lead', name: '팀장', role: 'supporting', appearance: '늘 웃는 중년', personality: [], sheetUrl: null, portraitUrl: null, styleId: 'anime' },
    ],
    locations: [{ locationId: 'loc_hall', name: '회사 복도', description: '긴 복도', wideShotUrl: null, styleId: 'anime' }],
    voices: [],
    styleId: 'anime',
    format: 'horizontal_16:9',
    dialogueLanguage: 'ja',
    continuesLastScene: true,
    copyFailures: [],
    ...over,
  }
}

// 서버 그리기(renderToStaticMarkup)는 zustand 의 처음 상태(getInitialState)를 읽는다 — 시험은 지금 상태를 처음 상태에 덮어 그린다.
function serveCurrent(store: { getState: () => object; getInitialState: () => object }) {
  Object.assign(store.getInitialState(), store.getState())
}

function settingsHtml(state: Partial<ReturnType<typeof useEntryStore.getState>>): string {
  useEntryStore.setState({ projectId: 'project-2', status: 'ready', locale: 'ko', formStep: 2, ...state })
  serveCurrent(useEntryStore)
  return renderToStaticMarkup(createElement(EntryForm))
}

/** 잠금 묶음(화면 비율 · 언어)만 잘라 본다 — 위쪽 장르 · 길이 · 바꿈 정도에도 추천 표시가 있다. */
function lockBox(out: string): string {
  return out.slice(out.indexOf('data-entry-lock'), out.indexOf('<footer'))
}

beforeEach(() => {
  useEntryStore.getState().reset()
  useLocaleStore.setState({ locale: 'ko' })
  serveCurrent(useLocaleStore)
})

describe('시리즈 다음 화의 설정 화면', () => {
  it('시리즈 다음 화면 화면 비율은 앞 화 값으로 골라져 있고 그 칸에 "앞 화" 표시가 붙는다', () => {
    // 왜: 앞 화와 같은 비율이 기본이다. 늘 붙던 9:16 추천 표시가 남으면 앞 화 값을 두고 다른 비율을 권하는 셈이 된다(프로토타입 E3s).
    const box = lockBox(settingsHtml({ draft: recDraft('16:9'), series: series() }))
    expect(box).toContain('앞 화 값으로 골라 뒀어요. 시작하면 끝까지 바꿀 수 없어요')
    const ratio16 = box.slice(box.indexOf('>16:9<'), box.indexOf('>9:16<'))
    expect(ratio16).toContain('>앞 화<')
    expect(box).not.toContain('>추천<')
    // 바꿀 수는 있다 — 다른 비율 칸도 그대로 고를 수 있다.
    expect(box).toContain('role="radio" aria-checked="true"')
    expect(box.match(/role="radio"/g)?.length).toBe(4)
  })

  it('시리즈 다음 화면 언어 묶음이 잠금으로 보이고 앞 화 언어 하나만 보인다', () => {
    // 왜: 대사 언어가 바뀌면 이어받은 말투를 쓸 수 없어 언어는 앞 화로 잠근다. 잠근 값을 화면에서 볼 수 있어야 한다(프로토타입 E3s).
    const box = lockBox(settingsHtml({ draft: recDraft('16:9'), series: series({ dialogueLanguage: 'ja' }) }))
    expect(box).toContain('언어')
    expect(box).toContain('앞 화와 같아요. 대사 말투를 이으려고 바꿀 수 없어요')
    expect(box).toContain('日本語')
  })

  it('시리즈가 아니면 화면 비율 칸에는 지금처럼 9:16 추천 표시가 붙고 언어 묶음은 없다', () => {
    // 왜: 시리즈 배선이 새 프로젝트의 설정 화면을 바꾸면 안 된다.
    const box = lockBox(settingsHtml({ draft: recDraft('9:16'), series: null }))
    const ratio916 = box.slice(box.indexOf('>9:16<'), box.indexOf('>1:1<'))
    expect(ratio916).toContain('>추천<')
    expect(box).not.toContain('>앞 화<')
    expect(box).not.toContain('대사 말투를 이으려고')
  })
})

describe('시리즈 다음 화의 시작 확인 창', () => {
  it('시리즈 다음 화면 확인 창에 언어 · 이어받는 것 줄이 더해진다', () => {
    // 왜: [예, 시작]을 누르기 전에 무엇을 이어받아 시작하는지 한 번 더 본다(프로토타입 E4s).
    const rows = summaryRows(recDraft('16:9'), { t: ko, locale: 'ko', series: series() })
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['화면 비율', '16:9 · 시작하면 끝까지 바꿀 수 없어요'],
      ['장르·분위기', '코미디'],
      ['길이', '15~60초'],
      ['바꿈 정도', '3 새롭게 키우기 · 재료에서 출발해 아이디어를 더해요'],
      ['자료', '아이디어 글만'],
      ['언어', '한국어 · 앞 화와 같아요'],
      ['이어받는 것', '인물 2 · 배경 1 · 그림체 · 말투 · 앞 화 줄거리'],
    ])
    expect(rows.find((r) => r.key === 'language')?.locked).toBe(true)
  })

  it('앞 화가 대사 전이면 이어받는 것 줄에 말투가 빠진다', () => {
    // 왜: 말투는 앞 화가 대사까지 끝났을 때만 넘어온다. 넘어오지 않은 것을 넘어온다고 적으면 안 된다.
    const rows = summaryRows(recDraft('16:9'), { t: ko, locale: 'ko', series: series({ hasVoices: false }) })
    expect(rows.find((r) => r.key === 'carried')?.value).toBe('인물 2 · 배경 1 · 그림체 · 앞 화 줄거리')
  })

  it('마지막 장면에서 이어 시작하기를 골랐으면 확인 창에 첫 샷 줄이 더해진다', () => {
    // 왜: 만들 때 고른 것이 시작 직전에도 보여야 한다(프로토타입 E4s).
    const rows = summaryRows(recDraft('16:9'), { t: ko, locale: 'ko', series: series({ continuesLastScene: true }) })
    expect(rows.at(-1)).toMatchObject({ key: 'firstShot', label: '첫 샷', value: '앞 화 마지막 장면에서 이어 시작해요.' })
  })

  it('시작한 뒤 완료 화면의 언어 줄에는 언어 이름만 적는다', () => {
    // 왜: 완료 화면은 잠김 표시를 화면이 따로 붙인다. 비율 줄과 같은 방식이다.
    const rows = summaryRows(recDraft('16:9'), { t: ko, locale: 'ko', mode: 'done', series: series() })
    expect(rows.find((r) => r.key === 'language')).toMatchObject({ value: '한국어', locked: true })
  })
})

describe('채팅으로 만들기', () => {
  it('시리즈 다음 화면 [추천대로] 화면 비율은 앞 화 값이다', () => {
    // 왜: 두 탭(화면에서 고르기 · 채팅)은 같은 기본값을 쓴다. 채팅만 9:16을 권하면 앞 화와 다른 비율로 시작하기 쉽다.
    expect(recommendedValue(recDraft(null), 'ratio', series({ ratio: '2.39:1' }))).toBe('2.39:1')
    // 시리즈가 아니거나 앞 화 비율을 읽지 못했으면 지금처럼 9:16이다.
    expect(recommendedValue(recDraft(null), 'ratio', null)).toBe('9:16')
    expect(recommendedValue(recDraft(null), 'ratio', series({ ratio: null }))).toBe('9:16')
  })
})

describe('시작 화면에 넘기는 앞 화 정보', () => {
  it('앞 화 정보는 비율 · 언어 · 이어받은 개수 · 말투 · 마지막 장면만 남겨 시작 화면에 넘긴다', () => {
    // 왜: 시작 화면은 개수와 잠근 값만 쓴다. 그림 주소 · 성격 같은 큰 값은 다른 화면이 시리즈 정보에서 따로 읽는다.
    const info = entrySeriesOf(snapshot())
    expect(info).toEqual({ ratio: '16:9', dialogueLanguage: 'ja', characters: 2, locations: 1, hasVoices: false, continuesLastScene: true })
    expect(parseEntrySeries(JSON.parse(JSON.stringify(info)))).toEqual(info)
    expect(entrySeriesOf(null)).toBeNull()
    // 모양이 틀린 값은 시리즈가 아닌 것으로 본다.
    expect(parseEntrySeries({ ratio: '16:9' })).toBeNull()
    expect(parseEntrySeries('series')).toBeNull()
    expect(parseEntrySeries({ ...info, ratio: '4:3', dialogueLanguage: 'fr' })).toMatchObject({ ratio: null, dialogueLanguage: null })
  })
})
