// 소품 모습 — 소품 카드에 [+ 모습 추가]가 있고, 이름 · 이야기 속 때 · 설명을 적어 저장하면 그 모습 칸이 생겨 기본 그림을 참고해 바로 그리며, 새로고침해도 남는다 (m1126 A3, 오너 2026-11-26 · 리드 R3)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  demo: false,
  poll: vi.fn(),
  tables: {} as Record<string, { data: unknown[] | null; error: { message: string } | null }>,
}))
vi.mock('@/lib/demo/context', () => ({ isDemoSession: () => mocks.demo }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), message: vi.fn() } }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const name of ['select', 'eq', 'in', 'order', 'limit', 'update', 'is']) q[name] = () => q
      q.then = (resolve: (v: unknown) => unknown) => resolve(mocks.tables[table] ?? { data: [], error: null })
      q.maybeSingle = async () => ({ data: null, error: null })
      return q
    },
  }),
}))
vi.mock('@/lib/generation-notify', () => ({
  notifyGenerationComplete: vi.fn(),
  notifyGenerationFailed: vi.fn(),
  notifyGenerationFailure: vi.fn(),
  notifyBatchSummary: vi.fn(),
  notifyGenerationGaveUp: vi.fn(),
}))
vi.mock('@/lib/generation-jobs-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs-client')>()),
  pollGenerationJob: mocks.poll,
}))

import { PropPanel } from '@/features/artist/prop-panel'
import { PropDetailPanels } from '@/features/artist/prop-view-dialog'
import { KO } from '@/lib/i18n/messages-ko'
import { useArtistStore } from '@/stores/artist-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import type { PropAsset } from '@/types'

const BROKEN = { appearanceKey: 'broken', label: '부러진 칼', narrativeTime: 'future' as const, appearance: 'the same sword snapped in half', appearanceNative: '두 동강 난 같은 칼', imageUrl: 'https://media.test/props/sword-broken.png', sourceHash: null }
const sword = (over: Partial<PropAsset> = {}): PropAsset => ({
  propId: 'sword', name: '칼', appearance: 'a straight steel sword', appearanceNative: '곧은 강철 칼', imageUrl: 'https://media.test/props/sword.png', sourceHash: null, origin: 'writer', appearances: [], ...over,
})
const artistInitial = { ...useArtistStore.getInitialState() }
const localeInitial = useLocaleStore.getInitialState().locale
/** 정적 그리기는 store 의 처음 상태를 읽는다 — 지금 상태와 처음 상태를 함께 넣는다. */
function seed(state: Partial<ReturnType<typeof useArtistStore.getState>>) {
  useArtistStore.setState(state)
  Object.assign(useArtistStore.getInitialState(), state)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.demo = false
  mocks.tables = {}
  mocks.poll.mockResolvedValue('https://media.test/props/sword-rusty.png')
  useProjectStore.setState({ projectId: 'project-1' })
  useLocaleStore.setState({ locale: 'ko' })
  Object.assign(useLocaleStore.getInitialState(), { locale: 'ko' })
  seed({ propAssets: [sword()], propUsage: {}, generatingProps: [], propFailures: {}, propContentRefusals: {}, selectedPropAppearances: {} })
})
afterEach(() => {
  seed({ propAssets: artistInitial.propAssets, propUsage: artistInitial.propUsage, generatingProps: [], propFailures: {}, propContentRefusals: {}, selectedPropAppearances: {} })
  useProjectStore.setState({ projectId: null })
  useLocaleStore.setState({ locale: localeInitial })
  Object.assign(useLocaleStore.getInitialState(), { locale: localeInitial })
  vi.unstubAllGlobals()
})

describe('소품 카드의 모습 칸', () => {
  // 왜: 오너 A3 "소품 모습 추가 버튼 만들기" — 인물 · 배경 카드의 모습 줄(기본 · 모습들 · [+ 모습 추가])과 같은 자리에 같은 단추.
  it('소품 카드에 [+ 모습 추가]가 있고, 기본 칸 옆에 저장한 모습 칸이 보인다', () => {
    seed({ propAssets: [sword({ appearances: [BROKEN] })] })
    const html = renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))
    expect(html).toContain('data-testid="artist-prop-add-appearance"')
    expect(html).toContain(KO['+ Add appearance'])
    expect(html).toContain('부러진 칼')
    expect(html).toContain(KO['Default'])
  })

  // 왜: 칸을 고르면 그 모습의 그림 · 설명을 봐야 다시 그릴지 정할 수 있다(배경 카드와 같다).
  it('모습 칸을 고르면 카드와 창이 그 모습의 그림과 설명을 보인다', () => {
    seed({ propAssets: [sword({ appearances: [BROKEN] })], selectedPropAppearances: { sword: 'broken' } })
    const card = renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))
    expect(card).toContain('https://media.test/props/sword-broken.png')
    expect(card).toContain('두 동강 난 같은 칼')
    expect(card).not.toContain('https://media.test/props/sword.png')
    const dialog = renderToStaticMarkup(createElement(PropDetailPanels, { propId: 'sword' }))
    expect(dialog).toContain('https://media.test/props/sword-broken.png')
    expect(dialog).toContain('두 동강 난 같은 칼')
  })

  // 왜: 올린 그림은 소품의 기본 그림 자리(props 행)에만 들어간다 — 모습 칸을 보면서 올리면 기본 그림이 바뀌어 사람이 헷갈린다.
  it('소품 모습 칸을 보는 동안은 창에 [레퍼런스 이미지 올리기]가 보이지 않는다', () => {
    seed({ propAssets: [sword({ appearances: [BROKEN] })], selectedPropAppearances: { sword: 'broken' } })
    expect(renderToStaticMarkup(createElement(PropDetailPanels, { propId: 'sword' }))).not.toContain('data-testid="prop-detail-upload"')
    seed({ selectedPropAppearances: {} })
    expect(renderToStaticMarkup(createElement(PropDetailPanels, { propId: 'sword' }))).toContain('data-testid="prop-detail-upload"')
  })

  // 왜: 데모(보기 전용 공유)는 만들기 · 그리기가 막혀 눌러도 아무 일이 없다(소품 [그리기]와 같은 규칙).
  it('데모(보기 전용 공유) 화면에서는 소품 [+ 모습 추가]가 보이지 않는다', () => {
    mocks.demo = true
    expect(renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))).not.toContain('data-testid="artist-prop-add-appearance"')
  })
})

describe('소품 모습 만들기', () => {
  // 왜: 배경 [모습 추가]와 같다(약속 C10 · 오너 C4) — 저장하면 칸이 생기고, 기본 그림을 같은 물건의 참고로 삼아 그 모습을 바로 그린다. 그림은 무료(Take 없음).
  it('소품 모습 이름 · 이야기 속 때 · 설명을 적어 저장하면 그 모습 칸이 생기고 기본 그림을 참고해 바로 그린다', async () => {
    const posted: Array<{ url: string; body: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      posted.push({ url, body })
      if (url === '/api/artist/prop-appearance') {
        return new Response(JSON.stringify({ ok: true, propId: 'sword', appearanceKey: 'rusty', label: '녹슨 칼', narrativeTime: 'past', appearance: 'the same sword covered in rust', appearanceNative: '녹이 슨 같은 칼' }), { status: 200 })
      }
      if (url === '/api/artist/generate-prop') return new Response(JSON.stringify({ ok: true, jobId: 'job-7', status: 'queued' }), { status: 200 })
      return new Response('{}', { status: 200 })
    }))
    const key = await useArtistStore.getState().createPropAppearance('sword', '녹슨 칼', '녹이 슨 같은 칼', 'past', { generate: true, actor: 'ui' })
    expect(key).toBe('rusty')
    expect(posted[0]).toEqual({ url: '/api/artist/prop-appearance', body: { projectId: 'project-1', propId: 'sword', label: '녹슨 칼', appearance: '녹이 슨 같은 칼', narrativeTime: 'past' } })
    expect(posted.find((p) => p.url === '/api/artist/generate-prop')?.body).toEqual({ projectId: 'project-1', propId: 'sword', appearanceKey: 'rusty', actor: 'ui' })
    const state = useArtistStore.getState()
    expect(state.propAssets[0].appearances?.map((a) => a.appearanceKey)).toEqual(['rusty'])
    expect(state.selectedPropAppearances.sword).toBe('rusty')
  })

  // 왜: 저장한 모습이 새로고침 뒤에도 카드에 남아야 한다 — 소품 모습 표를 읽어 소품마다 붙인다(만든 순서).
  it('새로고침해도 저장한 소품 모습이 카드에 칸으로 남는다', async () => {
    mocks.tables = {
      // 소품 카드는 인물 · 배경 자료가 있을 때 함께 읽힌다 — 배경 하나를 둔다.
      locations: { data: [{ location_id: 'forest', name: '숲', visual_description: 'a pine forest' }], error: null },
      props: { data: [{ prop_id: 'sword', name: '칼', appearance: 'a straight steel sword', appearance_native: '곧은 강철 칼', image_url: null, source_hash: null, origin: 'writer' }], error: null },
      prop_appearances: { data: [{ prop_id: 'sword', appearance_key: 'broken', label: '부러진 칼', narrative_time: 'future', appearance: 'the same sword snapped in half', appearance_native: '두 동강 난 같은 칼', image_url: BROKEN.imageUrl, source_hash: null }], error: null },
    }
    await useArtistStore.getState().loadData()
    expect(useArtistStore.getState().propAssets[0].appearances).toEqual([BROKEN])
  })

  // 왜: 코드가 먼저 나가고 표는 그 뒤에 만들어진다(.claude/rules/supabase.md Expand → Contract) — 소품 모습 표를 못 읽어도 소품 카드 · 기본 그림은 그대로 보여야 한다.
  it('소품 모습 표를 못 읽어도 소품 카드는 그대로 보인다', async () => {
    mocks.tables = {
      locations: { data: [{ location_id: 'forest', name: '숲', visual_description: 'a pine forest' }], error: null },
      props: { data: [{ prop_id: 'sword', name: '칼', appearance: 'a straight steel sword', appearance_native: '곧은 강철 칼', image_url: 'https://media.test/props/sword.png', source_hash: null, origin: 'writer' }], error: null },
      prop_appearances: { data: null, error: { message: 'relation "public.prop_appearances" does not exist' } },
    }
    await useArtistStore.getState().loadData()
    const [prop] = useArtistStore.getState().propAssets
    expect(prop).toMatchObject({ propId: 'sword', imageUrl: 'https://media.test/props/sword.png', appearances: [] })
  })

  // 왜: 모습 칸마다 그리는 중 · 실패가 따로다 — 기본 그림을 다시 그리는 동안에도 다른 모습 칸은 그리기 단추가 남는다(배경 모습과 같다).
  it('소품 모습 그리기는 그 모습 칸만 그리는 중으로 센다', async () => {
    seed({ propAssets: [sword({ appearances: [{ ...BROKEN, imageUrl: null }] })] })
    let release: () => void = () => {}
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/artist/generate-prop') {
        await new Promise<void>((resolve) => { release = resolve })
        return new Response(JSON.stringify({ ok: true, jobId: 'job-8', status: 'queued' }), { status: 200 })
      }
      return new Response('{}', { status: 200 })
    }))
    const run = useArtistStore.getState().generateProp('sword', 'ui', { appearanceKey: 'broken' })
    await Promise.resolve()
    const { generatingProps } = useArtistStore.getState()
    expect(generatingProps).toHaveLength(1)
    expect(generatingProps).not.toContain('sword')
    release()
    await run
    expect(useArtistStore.getState().generatingProps).toEqual([])
  })
})
