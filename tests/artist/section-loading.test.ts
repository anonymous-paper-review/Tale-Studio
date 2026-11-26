// Artist 한 페이지가 프로젝트 자료를 다 읽기 전에는 숫자 0 과 "아직 ~이 없어요" 대신 불러오는 중을 보이고, 다 읽은 뒤 정말 0개일 때만 안내를 보이는지 검사한다 (실제 프로젝트 QA a, 리드 2026-11-23)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 개발 DB 대신 쓰는 메모리 표 — Artist 화면이 읽는 표만. failOn 표는 읽기가 실패한다.
const fake = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const tables: Record<string, Row[]> = {}
  const state: { failOn: string | null } = { failOn: null }
  function query(table: string) {
    if (state.failOn === table) throw new Error(`read failed: ${table}`)
    const filters: Array<(row: Row) => boolean> = []
    const run = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row))).map((row) => structuredClone(row))
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder },
      order: () => builder,
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve, reject),
    }
    return builder
  }
  return { tables, query, state }
})
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: (table: string) => fake.query(table) }),
  createCatalogClient: () => ({ from: (table: string) => fake.query(table) }),
}))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { ArtistSectionHeading } from '@/features/artist/section-heading'
import { artistDataLoading } from '@/lib/artist/card-filter'
import { useArtistStore } from '@/stores/artist-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'

const PROJECT = 'project-loading'
const setLocale = (locale: 'ko' | 'en') => {
  useLocaleStore.setState({ locale })
  Object.assign(useLocaleStore.getInitialState(), { locale })
}
const initialLocale = useLocaleStore.getInitialState().locale
beforeEach(() => {
  for (const key of Object.keys(fake.tables)) delete fake.tables[key]
  fake.state.failOn = null
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ failures: [], queuedMain: [], worldFailures: [], queuedWorld: [] })))
  useProjectStore.setState({ projectId: PROJECT })
  useArtistStore.setState({ characterAssets: [], worldAssets: [], propAssets: [], sceneManifest: null, loadedProjectId: null })
})
afterEach(() => {
  vi.unstubAllGlobals()
  setLocale(initialLocale)
  useProjectStore.setState({ projectId: null })
})

describe('Artist 한 페이지 — 다 읽기 전', () => {
  // 왜: 실제 프로젝트를 열면 1초쯤 "인물 0 · 아직 인물이 없어요"처럼 빈 프로젝트로 보였다(QA a). 다 읽기 전의 0 은 "없다"가 아니라 "아직 모른다"다.
  it('프로젝트 자료를 다 읽기 전에는 Artist 묶음 머리에 숫자와 "아직 ~이 없어요" 안내 대신 불러오는 중을 보인다', () => {
    setLocale('ko')
    const loading = renderToStaticMarkup(createElement(ArtistSectionHeading, { section: 'characters', count: 0, loading: true }))
    expect(loading).toContain('>인물<')
    expect(loading).not.toContain('인물 0')
    expect(loading).not.toContain('아직 인물이 없어요')
    expect(loading).toContain('불러오는 중…')
    const props = renderToStaticMarkup(createElement(ArtistSectionHeading, { section: 'props', count: 0, loading: true }))
    expect(props).not.toContain('소품 0')
    expect(props).not.toContain('소품이 없어요')
    setLocale('en')
    const en = renderToStaticMarkup(createElement(ArtistSectionHeading, { section: 'world', count: 0, loading: true }))
    expect(en).toContain('>Backgrounds<')
    expect(en).toContain('Loading…')
    expect(en).not.toContain('No backgrounds yet')
  })

  // 왜: 다 읽은 뒤 정말 0개면 지금 안내가 맞다. 바로가기 단추 · 머리 줄도 같은 판정을 쓴다 — 카드가 하나라도 있으면(다른 길로 먼저 실렸으면) 숫자를 그대로 보인다.
  it('자료를 다 읽은 뒤 정말 0개인 묶음만 "아직 ~이 없어요" 안내를 보이고, 다 읽기 전이라도 카드가 있으면 숫자를 보인다', () => {
    const zero = { characters: 0, world: 0, props: 0 }
    expect(artistDataLoading({ projectId: PROJECT, loadedProjectId: null, counts: zero })).toBe(true)
    expect(artistDataLoading({ projectId: PROJECT, loadedProjectId: 'other-project', counts: zero })).toBe(true)
    expect(artistDataLoading({ projectId: PROJECT, loadedProjectId: PROJECT, counts: zero })).toBe(false)
    expect(artistDataLoading({ projectId: PROJECT, loadedProjectId: null, counts: { characters: 1, world: 0, props: 0 } })).toBe(false)
    setLocale('ko')
    const loaded = renderToStaticMarkup(createElement(ArtistSectionHeading, { section: 'characters', count: 0 }))
    expect(loaded).toContain('인물 0')
    expect(loaded).toContain('아직 인물이 없어요')
  })

  // 왜: 혼자 정한 것 — 자료가 하나도 없는 프로젝트에 "불러오는 중"이 영영 남으면 안 되고, 읽기에 실패했는데 "없어요"라고 말해도 안 된다.
  it('Artist 자료 읽기가 끝나면 그 프로젝트를 다 읽은 것으로 치고(자료가 없는 프로젝트도), 읽기에 실패하면 다 읽은 것으로 치지 않는다', async () => {
    fake.tables.projects = [{ id: PROJECT, design_tokens: null, style_anchor_key: 'real' }]
    await useArtistStore.getState().loadData()
    expect(useArtistStore.getState().loadedProjectId).toBe(PROJECT)

    useArtistStore.setState({ loadedProjectId: null })
    fake.tables.characters = [{ project_id: PROJECT, character_id: 'su_a', name: '수아', role: 'protagonist', entity_type: 'person', origin: 'producer', appearance: 'yellow raincoat', appearance_native: '노란 우비' }]
    await useArtistStore.getState().loadData()
    expect(useArtistStore.getState().characterAssets.map((c) => c.characterId)).toEqual(['su_a'])
    expect(useArtistStore.getState().loadedProjectId).toBe(PROJECT)

    useArtistStore.setState({ loadedProjectId: null, characterAssets: [] })
    fake.state.failOn = 'scenes'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await useArtistStore.getState().loadData()
    expect(useArtistStore.getState().loadedProjectId).toBeNull()
  })
})
