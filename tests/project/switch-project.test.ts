// 프로젝트를 바꾸면 화면마다의 자료를 다 비운 뒤에 새 프로젝트로 바뀌어, 늦게 끝나는 비우기가 새 프로젝트 자료를 지우지 않는지 검사한다 (QA 2026-11-03 밤 Editor 무한 로딩의 뿌리)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  gate: Promise.resolve() as Promise<void>,
  projectIdNow: (() => null) as () => string | null,
  fetch: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
}))

// 화면마다의 store — 비울 때 그 순간의 프로젝트를 적는다. Director store 는 늦게 불러와지는 것을 흉내 낸다(beforeEach 의 gate).
function childStore(name: string) {
  return {
    getState: () => ({
      reset: () => mocks.events.push(`reset:${name}:${mocks.projectIdNow() ?? 'none'}`),
      setProjectId: () => {},
    }),
  }
}
vi.mock('@/stores/producer-store', () => ({ useProducerStore: childStore('producer') }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: childStore('writer') }))
vi.mock('@/stores/artist-store', () => ({ useArtistStore: childStore('artist') }))
vi.mock('@/stores/editor-store', () => ({ useEditorStore: childStore('editor') }))
vi.mock('@/stores/global-chat-store', () => ({ useGlobalChatStore: childStore('chat') }))
vi.mock('@/stores/asset-storage-store', () => ({ useAssetStorageStore: childStore('assets') }))
vi.mock('@/lib/supabase/client', () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null, error: null }) }
  return { createClient: () => ({ from: () => chain }) }
})

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
let open: () => void = () => {}

async function load() {
  const mod = await import('@/stores/project-store')
  mocks.projectIdNow = () => mod.useProjectStore.getState().projectId
  mod.useProjectStore.subscribe((state, prev) => {
    if (state.projectId !== prev.projectId) mocks.events.push(`project:${state.projectId ?? 'none'}`)
  })
  return mod.useProjectStore
}
const resets = () => mocks.events.filter((e) => e.startsWith('reset:'))

beforeEach(() => {
  vi.resetModules()
  mocks.events = []
  mocks.gate = new Promise<void>((resolve) => { open = resolve })
  // 테스트마다 새로 늦게 불러와지게 — 한 번 불러온 가짜 모듈은 남아 있어서 여기서 다시 단다.
  const gate = mocks.gate
  vi.doMock('@/stores/director-store', async () => {
    await gate
    return { useDirectorCanvasStore: childStore('director') }
  })
  mocks.fetch = vi.fn(async () => new Response(JSON.stringify({ workspaceId: 'w', projectId: 'from-init', project: { title: 'init' } }), { status: 200 }))
  vi.stubGlobal('fetch', mocks.fetch)
})
afterEach(() => {
  open()
  vi.unstubAllGlobals()
})

describe('프로젝트 바꾸기', () => {
  it('프로젝트를 바꾸면 화면마다의 자료를 다 비운 뒤에 새 프로젝트로 바뀐다', async () => {
    // 왜: 예전에는 새 프로젝트로 먼저 바꾸고 비우기를 나중에(늦게) 끝냈다 — 그 사이 화면이 새 프로젝트를 읽기 시작하면 비우기가 그 자료를 지웠다.
    open()
    const store = await load()
    store.setState({ projectId: 'project-a' })
    mocks.events = []
    await store.getState().switchProject('project-b', 'B', 'editor')
    expect(mocks.events[0]).toBe('project:none')
    expect(resets()).toHaveLength(7)
    expect(resets().every((e) => e.endsWith(':none'))).toBe(true)
    expect(mocks.events.at(-1)).toBe('project:project-b')
    expect(store.getState()).toMatchObject({ projectId: 'project-b', projectTitle: 'B', currentStage: 'editor', initLoading: false })
  })

  it('비우기가 늦게 끝나도 새 프로젝트에서 읽은 자료를 지우지 않는다', async () => {
    // 왜: 프로젝트 목록에서 처음 열 때 화면 store 들을 늦게 불러와 비우기가 늦게 끝났다 — 그사이 Editor 가 읽은 자료를 비우기가 지워 기다림이 끝나지 않았다(11/3 밤 오너 제보).
    const store = await load()
    const switching = store.getState().switchProject('project-b', 'B', 'editor')
    await flush()
    // 비우기가 끝나기 전에는 프로젝트가 정해지지 않아 어느 화면도 새 프로젝트를 읽기 시작하지 않는다.
    expect(store.getState().projectId).toBeNull()
    store.subscribe((state) => {
      if (state.projectId === 'project-b') mocks.events.push('screen-reads:project-b')
    })
    open()
    await switching
    expect(resets()).toHaveLength(7)
    expect(mocks.events.at(-1)).toBe('screen-reads:project-b')
  })

  it('프로젝트를 바꾸는 중에 스튜디오가 열려도 바꾸기가 끝날 때까지 기다렸다가 고른 프로젝트로 연다', async () => {
    // 왜: 스튜디오는 열릴 때 주소의 프로젝트로 시작 준비(init)를 한다 — 바꾸기보다 먼저 프로젝트를 정하면 같은 고장(늦은 비우기)이 다시 난다.
    const store = await load()
    const switching = store.getState().switchProject('project-b', 'B', 'editor')
    const init = store.getState().initProject('project-b')
    await flush()
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(store.getState().projectId).toBeNull()
    open()
    await switching
    await init
    expect(store.getState().projectId).toBe('project-b')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('같은 프로젝트를 다시 열어도 프로젝트가 잠깐 비었다가 다시 정해진다', async () => {
    // 왜: 프로젝트가 그대로면 화면은 다시 읽지 않는다 — 비우기만 하고 다시 읽지 않으면 빈 화면으로 남는다.
    open()
    const store = await load()
    store.setState({ projectId: 'project-a' })
    mocks.events = []
    await store.getState().switchProject('project-a', 'A', 'editor')
    expect(mocks.events.filter((e) => e.startsWith('project:'))).toEqual(['project:none', 'project:project-a'])
  })

  it('프로젝트를 연달아 바꾸면 마지막으로 고른 프로젝트로만 바뀐다', async () => {
    // 왜: 앞서 고른 프로젝트의 늦은 바꾸기가 나중에 고른 프로젝트를 덮으면 엉뚱한 프로젝트가 열린다.
    const store = await load()
    const first = store.getState().switchProject('project-b', 'B', 'editor')
    const second = store.getState().switchProject('project-c', 'C', 'writer')
    open()
    await Promise.all([first, second])
    expect(store.getState()).toMatchObject({ projectId: 'project-c', projectTitle: 'C' })
    expect(mocks.events.filter((e) => e.startsWith('project:') && e !== 'project:none')).toEqual(['project:project-c'])
  })
})
