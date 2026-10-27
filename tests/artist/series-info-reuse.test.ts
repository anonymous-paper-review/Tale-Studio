// 한 번 읽은 시리즈 정보(이어받음 · 보관)를 탭이나 화면이 다시 열릴 때 기다리지 않고 바로 쓰는지 검사한다.
//   2026-10-27 오너 "고치셈": 운영 Artist 에서 배경 탭을 누르면 약 3초(3,048ms · 3,037ms) 동안 이어받음 표시가 없고
//   보관한 마을 광장 · 우물가가 이번 화 배경 사이에 섞여 보였다. 탭 카드가 열릴 때마다 시리즈 정보를 서버에서 처음부터
//   다시 읽었고, 그 한 번이 운영에서 약 3초 걸렸다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SeriesView } from '@/lib/series/view'

type Store = typeof import('@/features/series/use-series-info')

const view = (prevTitle: string): SeriesView => ({
  prevTitle,
  prevProjectId: 'ep1',
  prevDeleted: false,
  characters: [],
  locations: [{ id: 'location', name: '마을 광장', imageUrl: 'https://img/plaza.png', styleId: 'jp_anime', appearing: false, use: 'reuse' }],
  styleId: 'jp_anime',
  currentStyleId: 'jp_anime',
  hasVoices: true,
  continuesLastScene: false,
  copyFailures: [],
})

const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

let fetchMock: ReturnType<typeof vi.fn>
let store: Store

beforeEach(async () => {
  vi.resetModules()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  store = await import('@/features/series/use-series-info')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('한 번 읽은 시리즈 정보 다시 쓰기', () => {
  it('한 번 읽은 프로젝트의 시리즈 정보는 탭이나 화면이 다시 열려도 기다리지 않고 바로 보인다', async () => {
    // 왜: 배경 탭을 누를 때마다 3초 동안 이어받음 표시가 사라지고 보관한 배경이 이번 화 배경 사이에 섞여 보였다.
    fetchMock.mockResolvedValueOnce(answer({ view: view('1화') }))
    await store.loadSeriesInfo('ep2', false)

    expect(store.readSeriesInfo('ep2', false)).toEqual({ view: view('1화'), loading: false, error: false })
  })

  it('처음 읽는 프로젝트는 답이 올 때까지 읽는 중으로 둔다', () => {
    // 왜: 정상 경로 고정. 아직 모르는 것을 "시리즈 아님"으로 그리지 않는다.
    expect(store.readSeriesInfo('ep2', false)).toEqual({ view: null, loading: true, error: false })
  })

  it('프로젝트를 아직 모르면 서버에 묻지 않고 아무 표시도 하지 않는다', async () => {
    // 왜: 정상 경로 고정. 프로젝트를 불러오기 전에 화면이 먼저 그려진다.
    expect(store.readSeriesInfo(null, false)).toEqual({ view: null, loading: false, error: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('바로 보여 준 뒤에도 서버에서 다시 읽어 바뀐 것이 있으면 그것으로 바꾼다', async () => {
    // 왜: 그림체를 바꾸거나 산문을 다시 쓰면 어떤 그림을 그대로 쓰고 무엇이 보관인지가 달라진다.
    fetchMock.mockResolvedValueOnce(answer({ view: view('1화') }))
    await store.loadSeriesInfo('ep2', false)
    fetchMock.mockResolvedValueOnce(answer({ view: view('1화 (고침)') }))
    await store.loadSeriesInfo('ep2', false)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(store.readSeriesInfo('ep2', false).view?.prevTitle).toBe('1화 (고침)')
  })

  it('같은 프로젝트를 여러 곳이 동시에 읽으면 서버에 한 번만 묻는다', async () => {
    // 왜: Artist 화면은 머리 줄과 인물 탭이 같이 열리며 같은 3초짜리 요청을 두 번 보냈다.
    fetchMock.mockResolvedValueOnce(answer({ view: view('1화') }))
    await Promise.all([store.loadSeriesInfo('ep2', false), store.loadSeriesInfo('ep2', false)])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('한 곳이 새로 읽으면 같은 프로젝트를 보고 있는 다른 곳에 알린다', async () => {
    // 왜: 머리 줄의 보관 수와 탭의 보관 묶음이 서로 다른 때의 정보를 보이지 않게 한다.
    const header = vi.fn()
    const tab = vi.fn()
    const other = vi.fn()
    store.subscribeSeriesInfo('ep2', false, header)
    const stopTab = store.subscribeSeriesInfo('ep2', false, tab)
    store.subscribeSeriesInfo('ep9', false, other)
    stopTab()
    fetchMock.mockResolvedValueOnce(answer({ view: view('1화') }))
    await store.loadSeriesInfo('ep2', false)

    expect(header).toHaveBeenCalledTimes(1)
    expect(tab).not.toHaveBeenCalled()
    expect(other).not.toHaveBeenCalled()
  })

  it('다시 읽다 실패하면 이미 보이던 시리즈 정보를 그대로 둔다', async () => {
    // 왜: 서버가 잠깐 실패할 때(운영 503) 이어받음 표시와 보관 묶음이 사라지면 같은 흔들림이 다시 생긴다.
    fetchMock.mockResolvedValueOnce(answer({ view: view('1화') }))
    await store.loadSeriesInfo('ep2', false)
    fetchMock.mockResolvedValueOnce(answer({ error: 'down' }, 503))
    await store.loadSeriesInfo('ep2', false)

    expect(store.readSeriesInfo('ep2', false)).toEqual({ view: view('1화'), loading: false, error: false })
  })

  it('처음 읽기부터 실패하면 시리즈 표시를 하지 않고 실패로 알린다', async () => {
    // 왜: 정상 경로 고정. 조회 실패가 산문 · 그림 작업 자체를 막지 않는다. 앞 화 산문 창은 "불러오지 못했다"를 보인다.
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await store.loadSeriesInfo('ep2', false)

    expect(store.readSeriesInfo('ep2', false)).toEqual({ view: null, loading: false, error: true })
  })

  it('앞 화 산문을 싣는 읽기와 싣지 않는 읽기는 따로 둔다', async () => {
    // 왜: 산문 없이 읽은 정보로 [앞 화 산문 보기] 창을 채우면 앞 화 산문이 비어 보인다.
    fetchMock.mockResolvedValueOnce(answer({ view: view('1화') }))
    await store.loadSeriesInfo('ep2', false)

    expect(store.readSeriesInfo('ep2', true)).toEqual({ view: null, loading: true, error: false })
    fetchMock.mockResolvedValueOnce(answer({ view: { ...view('1화'), prose: '앞 화 산문' } }))
    await store.loadSeriesInfo('ep2', true)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/project/ep2/series?prose=1')
    expect(store.readSeriesInfo('ep2', true).view?.prose).toBe('앞 화 산문')
  })
})
