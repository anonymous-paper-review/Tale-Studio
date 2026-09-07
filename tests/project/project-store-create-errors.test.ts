// 새 프로젝트를 만들 수 있는지 먼저 알리고 성공하면 결과와 주의사항을 전한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}))

vi.mock('@/stores/producer-store', () => ({
  useProducerStore: { getState: () => ({ reset: vi.fn() }) },
}))
vi.mock('@/stores/writer-store', () => ({
  useWriterStore: { getState: () => ({ reset: vi.fn() }) },
}))
vi.mock('@/stores/artist-store', () => ({
  useArtistStore: { getState: () => ({ reset: vi.fn() }) },
}))
vi.mock('@/stores/editor-store', () => ({
  useEditorStore: { getState: () => ({ reset: vi.fn() }) },
}))
vi.mock('@/stores/global-chat-store', () => ({
  useGlobalChatStore: { getState: () => ({ reset: vi.fn() }) },
}))
vi.mock('@/stores/asset-storage-store', () => ({
  useAssetStorageStore: { getState: () => ({ reset: vi.fn() }) },
}))
vi.mock('@/stores/director-store', () => ({
  useDirectorCanvasStore: { getState: () => ({ reset: vi.fn(), setProjectId: vi.fn() }) },
}))

import { useProjectStore } from '@/stores/project-store'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mocks.fetch)
  useProjectStore.getState().resetProject()
})

describe('새 프로젝트를 만들 때 결과와 기존 작업을 안전하게 알린다', () => {
  it('만들 수 있는 프로젝트 수를 넘으면 실패를 알리고 기존 프로젝트는 유지한다', async () => {
    useProjectStore.setState({ projectId: 'previous-project' })
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'slot_limit' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await useProjectStore.getState().createNewProject('Second project')

    expect(result).toEqual({
      ok: false,
      projectId: null,
      warnings: [],
      error: 'slot_limit',
    })
    expect(useProjectStore.getState().projectId).toBe('previous-project')
  })

  it('새 프로젝트를 만들면 생성 결과와 주의사항을 알려준다', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          workspaceId: 'workspace-1',
          projectId: 'created-project',
          project: { title: 'Follow-up', locale: 'en' },
          warnings: [
            { code: 'style_anchor_copy_failed', detail: 'copy skipped' },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const result = await useProjectStore.getState().createNewProject('Follow-up', {
      referenceProjectId: 'source-project',
      includeLastShotFrame: true,
    })

    expect(result).toEqual({
      ok: true,
      projectId: 'created-project',
      warnings: [
        { code: 'style_anchor_copy_failed', detail: 'copy skipped' },
      ],
    })
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/project/new',
      expect.objectContaining({
        body: JSON.stringify({
          title: 'Follow-up',
          referenceProjectId: 'source-project',
          includeLastShotFrame: true,
        }),
      }),
    )
  })
})
