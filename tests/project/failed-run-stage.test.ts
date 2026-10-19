// 산문을 넘긴 뒤 실행이 멈춘 프로젝트를 열면 Writer 로 되돌려 가두지 않고 보던 단계에 둔다 (리뉴얼 1차 검토 2026-10-19)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  scenesResult: { data: [] as unknown, error: null as unknown },
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

const status = (body: Record<string, unknown>) => new Response(JSON.stringify(body), { status: 200 })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.scenesResult = { data: [], error: null }
  useProjectStore.getState().resetProject()
})

describe('실행이 멈춘 프로젝트 열기', () => {
  it('산문을 넘긴 뒤 실행이 실패했으면 Writer 로 되돌리지 않고 보던 단계에 둔다', async () => {
    // 왜: [만들기] 뒤 인물 · 배경 디자인에서 실패하면 장면이 아직 없다. 그때 잠긴 Writer 화면으로 보내면 거기엔 다시 시도가 없고,
    //   Artist 로 가기를 눌러도 되돌아와 갇힌다(운영에 이런 프로젝트가 있다). Artist 화면은 멈춘 이유와 [이어서 다시 시도]를 보인다.
    useProjectStore.setState({ currentStage: 'artist', reachedStage: 'artist' })
    mocks.fetch.mockResolvedValue(status({ started: true, pipeline_failed: true, draft: false, current_status: 'failed', current_stage: 'v2Design' }))

    await useProjectStore.getState().verifyWriterGate('project-1')

    expect(useProjectStore.getState()).toMatchObject({ currentStage: 'artist', reachedStage: 'artist' })
  })

  it('예전 흐름으로 끝까지 가다 실패한 프로젝트도 Writer 로 되돌리지 않는다', async () => {
    // 왜: 리뉴얼 전에 넘긴 프로젝트가 샷 단계에서 실패해 장면이 없으면, 예전에는 Producer(지금은 잠긴 Writer)로 되돌려 갇혔다.
    useProjectStore.setState({ currentStage: 'director', reachedStage: 'director' })
    mocks.fetch.mockResolvedValue(status({ started: true, pipeline_failed: true, current_status: 'failed', current_stage: 'shotsAndDialogue' }))

    await useProjectStore.getState().verifyWriterGate('project-1')

    expect(useProjectStore.getState().currentStage).toBe('director')
  })
})
