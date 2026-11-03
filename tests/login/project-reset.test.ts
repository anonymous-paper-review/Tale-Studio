// 로그인한 사람이 바뀌면(로그아웃 · 다른 계정 로그인) 앞 계정의 프로젝트(id · 제목 · 단계)와 화면마다의 자료를 모두 비우고, 토큰 갱신 · 처음 연 페이지에서는 비우지 않는지 검사한다 (2026-11-04 리드 2차 검토)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  gate: Promise.resolve() as Promise<void>,
  projectIdNow: (() => null) as () => string | null,
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

/** 앞 계정이 프로젝트 하나를 열어 둔 탭 — 페이지를 열 때 로그인한 사람(user-a)을 한 번 알린 뒤다. */
async function openedByFirstUser() {
  const reset = await import('@/lib/signed-in-reset')
  const { useProjectStore } = await import('@/stores/project-store')
  mocks.projectIdNow = () => useProjectStore.getState().projectId
  useProjectStore.setState({ workspaceId: 'w-a', projectId: 'p-letters', projectTitle: 'Letters', currentStage: 'editor', reachedStage: 'editor', producerLocked: true })
  reset.signedInUserChanged('user-a')
  mocks.events = []
  return { store: useProjectStore, signedInUserChanged: reset.signedInUserChanged }
}
const resets = () => mocks.events.filter((e) => e.startsWith('reset:'))

beforeEach(() => {
  vi.resetModules()
  mocks.events = []
  mocks.gate = new Promise<void>((resolve) => { open = resolve })
  const gate = mocks.gate
  vi.doMock('@/stores/director-store', async () => {
    await gate
    return { useDirectorCanvasStore: childStore('director') }
  })
})
afterEach(() => open())

describe('로그인한 사람이 바뀔 때', () => {
  it('로그아웃하면 앞 계정의 프로젝트와 화면 자료가 모두 비워진다', async () => {
    // 왜: 로그아웃은 새로고침 없이 화면을 옮겨서, 앞 계정의 프로젝트 id · 제목과 화면마다 받아 둔 자료가 탭에 남아 다음 사람에게 보일 수 있었다.
    open()
    const { store, signedInUserChanged } = await openedByFirstUser()
    signedInUserChanged(null)
    await flush()
    expect(store.getState()).toMatchObject({ workspaceId: null, projectId: null, projectTitle: 'Untitled', currentStage: 'producer', reachedStage: 'producer', producerLocked: false })
    expect(resets()).toHaveLength(7)
    // 프로젝트를 먼저 비운 뒤에 화면 자료를 비운다 — 늦은 비우기 막이가 앞 계정 프로젝트를 "지금 프로젝트"로 여기지 않게.
    expect(resets().every((e) => e.endsWith(':none'))).toBe(true)
  })

  it('다른 계정으로 로그인하면 앞 계정의 프로젝트와 화면 자료가 모두 비워진다', async () => {
    // 왜: 같은 탭에서 다른 계정으로 로그인해도 앞 계정의 프로젝트가 남아 그 계정 화면이 앞 계정 자료로 열릴 수 있었다.
    open()
    const { store, signedInUserChanged } = await openedByFirstUser()
    signedInUserChanged('user-b')
    await flush()
    expect(store.getState()).toMatchObject({ projectId: null, projectTitle: 'Untitled' })
    expect(resets()).toHaveLength(7)
  })

  it('같은 사람의 로그인 정보만 새로 받으면 프로젝트와 화면 자료를 그대로 둔다', async () => {
    // 왜: 정상 경로 고정 — 토큰 갱신은 한 시간마다 저절로 온다. 그때마다 비우면 작업 중인 화면이 사라진다.
    open()
    const { store, signedInUserChanged } = await openedByFirstUser()
    signedInUserChanged('user-a')
    await flush()
    expect(store.getState()).toMatchObject({ projectId: 'p-letters', projectTitle: 'Letters' })
    expect(resets()).toHaveLength(0)
  })

  it('페이지를 처음 열 때 로그인을 알리는 것만으로는 비우지 않는다', async () => {
    // 왜: 정상 경로 고정 — 처음 연 페이지의 첫 소식은 "앞 사람"이 없다. 비우면 새로 고침할 때마다 열던 프로젝트가 사라진다.
    open()
    const reset = await import('@/lib/signed-in-reset')
    const { useProjectStore } = await import('@/stores/project-store')
    mocks.projectIdNow = () => useProjectStore.getState().projectId
    useProjectStore.setState({ projectId: 'p-letters', projectTitle: 'Letters' })
    reset.signedInUserChanged('user-a')
    await flush()
    expect(useProjectStore.getState()).toMatchObject({ projectId: 'p-letters', projectTitle: 'Letters' })
    expect(resets()).toHaveLength(0)
  })

  it('로그아웃하는 동안 끝난 앞 계정의 프로젝트 바꾸기는 프로젝트를 다시 정하지 않는다', async () => {
    // 왜: 프로젝트를 바꾸는 중에 로그아웃하면, 늦게 끝난 바꾸기가 앞 계정의 프로젝트를 다시 정해 다음 사람에게 남겼다.
    const { store, signedInUserChanged } = await openedByFirstUser()
    const switching = store.getState().switchProject('p-other', 'Other', 'writer')
    await flush()
    signedInUserChanged(null)
    open()
    await switching
    await flush()
    expect(store.getState()).toMatchObject({ projectId: null, projectTitle: 'Untitled' })
  })
})
