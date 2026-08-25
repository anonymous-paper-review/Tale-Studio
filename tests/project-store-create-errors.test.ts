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

describe('project store createNewProject result contract', () => {
  it('returns a failure and does not expose the previous project id after a slot-limit response', async () => {
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

  it('returns the created id and warnings without changing the request contract', async () => {
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
