// 장면 목록을 못 불러왔을 때는 장면이 없다고 단정하지 않는다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  scenesResult: { data: null as unknown, error: null as unknown },
  fetch: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      for (const name of ['select', 'eq', 'limit']) q[name] = vi.fn(() => q)
      ;(q as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(mocks.scenesResult)
      return q
    },
  }),
}))
vi.mock('@/stores/producer-store', () => ({ useProducerStore: { getState: () => ({ reset: vi.fn() }) } }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: { getState: () => ({ reset: vi.fn() }) } }))
vi.mock('@/stores/artist-store', () => ({ useArtistStore: { getState: () => ({ reset: vi.fn() }) } }))
vi.mock('@/stores/editor-store', () => ({ useEditorStore: { getState: () => ({ reset: vi.fn() }) } }))
vi.mock('@/stores/global-chat-store', () => ({ useGlobalChatStore: { getState: () => ({ reset: vi.fn() }) } }))
vi.mock('@/stores/asset-storage-store', () => ({ useAssetStorageStore: { getState: () => ({ reset: vi.fn() }) } }))
vi.mock('@/stores/director-store', () => ({
  useDirectorCanvasStore: { getState: () => ({ reset: vi.fn(), setProjectId: vi.fn() }) },
}))

import { useProjectStore } from '@/stores/project-store'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.fetch.mockResolvedValue(new Response('{}', { status: 200 }))
  useProjectStore.getState().resetProject()
  // Director 까지 진행한 프로젝트를 보고 있는 상태.
  useProjectStore.setState({ currentStage: 'director', reachedStage: 'director' })
})

describe('작업 단계 잠금 판정', () => {
  it('장면이 정말 없으면 앞 단계로 되돌린다', async () => {
    mocks.scenesResult = { data: [], error: null }

    await useProjectStore.getState().verifyWriterGate('project-1')

    expect(useProjectStore.getState().currentStage).toBe('producer')
    expect(useProjectStore.getState().writerNeedsRerun).toBe(true)
  })

  it('장면이 있으면 보던 단계에 그대로 둔다', async () => {
    mocks.scenesResult = { data: [{ scene_id: 'sc_1' }], error: null }

    await useProjectStore.getState().verifyWriterGate('project-1')

    expect(useProjectStore.getState().currentStage).toBe('director')
  })

  it('장면 목록을 못 불러오면 앞 단계로 되돌리지 않는다', async () => {
    // 조회 실패는 "장면이 없다" 가 아니라 "모른다" 다.
    // 없는 것으로 단정하면 장면이 멀쩡한 프로젝트도 Director 에서 튕겨난다.
    mocks.scenesResult = { data: null, error: { message: 'network error' } }

    await useProjectStore.getState().verifyWriterGate('project-1')

    expect(useProjectStore.getState().currentStage).toBe('director')
    expect(useProjectStore.getState().writerNeedsRerun).toBe(false)
  })

  it('장면 목록을 못 불러오면 완료 표시도 건드리지 않는다', async () => {
    useProjectStore.setState({ writerComplete: true })
    mocks.scenesResult = { data: null, error: { message: 'network error' } }

    await useProjectStore.getState().verifyWriterGate('project-1')

    expect(useProjectStore.getState().writerComplete).toBe(true)
  })
})
