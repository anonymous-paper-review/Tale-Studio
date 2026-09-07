import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  mediaCopy: vi.fn(),
  mediaPublicUrl: vi.fn((path: string) => `https://media.test/${path}`),
  isOwnMediaUrl: vi.fn((url: unknown) =>
    typeof url === 'string' && url.startsWith('https://media.test/'),
  ),
  mediaPathFromUrl: vi.fn((url: string) =>
    url.startsWith('https://media.test/') ? url.slice('https://media.test/'.length) : null,
  ),
  parseCustomStyleAnchor: vi.fn((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return null
    const value = raw as { url?: unknown; label?: unknown; medium?: unknown }
    return typeof value.url === 'string'
      ? {
          url: value.url,
          label: typeof value.label === 'string' ? value.label : null,
          medium: typeof value.medium === 'string' ? value.medium : null,
        }
      : null
  }),
  responses: {} as Record<string, unknown[]>,
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/storage/media', () => ({
  mediaCopy: mocks.mediaCopy,
  mediaPublicUrl: mocks.mediaPublicUrl,
}))
vi.mock('@/lib/storage/media-url', () => ({
  isOwnMediaUrl: mocks.isOwnMediaUrl,
  mediaPathFromUrl: mocks.mediaPathFromUrl,
}))
vi.mock('@/lib/style-anchor', () => ({
  parseCustomStyleAnchor: mocks.parseCustomStyleAnchor,
}))

import {
  copyReferenceAssets,
  prepareReferenceImport,
  ReferenceImportValidationError,
} from '@/lib/reference-import'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.responses = {}
  mocks.mediaCopy.mockResolvedValue({ data: {}, error: null })
  mocks.mediaPublicUrl.mockImplementation((path: string) => `https://media.test/${path}`)
  mocks.isOwnMediaUrl.mockImplementation(
    (url: unknown) =>
      typeof url === 'string' && url.startsWith('https://media.test/'),
  )
  mocks.mediaPathFromUrl.mockImplementation((url: string) =>
    url.startsWith('https://media.test/') ? url.slice('https://media.test/'.length) : null,
  )
  mocks.from.mockImplementation((table: string) => {
    const result = mocks.responses[table]?.shift() ?? { data: null, error: null }
    return query(result)
  })
})

describe('reference-import server boundary', () => {
  it('rejects a source project outside the requester workspace without revealing it', async () => {
    mocks.responses.projects = [
      { data: { id: 'source', workspace_id: 'other-workspace' }, error: null },
    ]

    await expect(
      prepareReferenceImport({
        userId: 'owner',
        destinationWorkspaceId: 'workspace-1',
        referenceProjectId: 'source',
      }),
    ).rejects.toMatchObject({ code: 'reference_not_found', status: 404 })
  })

  it('rejects a closed plan after rechecking the source workspace owner', async () => {
    mocks.responses.projects = [
      {
        data: {
          id: 'source',
          workspace_id: 'workspace-1',
          style_anchor_key: null,
          custom_style_anchor: null,
        },
        error: null,
      },
    ]
    mocks.responses.workspaces = [
      { data: { id: 'workspace-1', owner_id: 'owner', plan: 's10' }, error: null },
    ]

    const error = await captureError(() =>
      prepareReferenceImport({
        userId: 'owner',
        destinationWorkspaceId: 'workspace-1',
        referenceProjectId: 'source',
      }),
    )

    expect(error).toBeInstanceOf(ReferenceImportValidationError)
    expect(error).toMatchObject({ code: 'reference_unavailable', status: 403 })
  })

  it('copies a custom anchor and the selected last-shot storyboard start frame internally', async () => {
    const source = {
      id: 'source',
      workspaceId: 'workspace-1',
      styleAnchorKey: 'custom-source',
      customStyleAnchor: {
        url: 'https://media.test/workspace-1/source/anchors/style.png',
        label: 'Watercolor',
        medium: 'watercolor',
      },
    }
    mocks.responses.scenes = [
      {
        data: [
          { id: 'scene-1', sort_order: 1 },
          { id: 'scene-2', sort_order: 2 },
        ],
        error: null,
      },
    ]
    mocks.responses.shots = [
      {
        data: [
          {
            scene_id: 'scene-1',
            sort_order: 9,
            storyboard_image: {
              status: 'completed',
              frames: { start: 'https://media.test/source/old.png' },
            },
            rough_storyboard: null,
          },
          {
            scene_id: 'scene-2',
            sort_order: 1,
            storyboard_image: {
              status: 'completed',
              frames: { start: 'https://media.test/workspace-1/source/last.png' },
            },
            rough_storyboard: null,
          },
        ],
        error: null,
      },
    ]
    mocks.responses.projects = [{ data: null, error: null }]

    const result = await copyReferenceAssets({
      source,
      destinationProjectId: 'destination',
      destinationWorkspaceId: 'workspace-1',
      includeLastShotFrame: true,
    })

    expect(result.warnings).toEqual([])
    expect(mocks.mediaCopy).toHaveBeenCalledTimes(2)
    expect(mocks.mediaCopy.mock.calls[0][0]).toBe(
      'workspace-1/source/anchors/style.png',
    )
    expect(mocks.mediaCopy.mock.calls[1][0]).toBe(
      'workspace-1/source/last.png',
    )
    expect(mocks.from).toHaveBeenLastCalledWith('projects')
  })

  it('uses rough storyboard frames when the final storyboard has no start frame', async () => {
    mocks.responses.scenes = [
      { data: [{ id: 'scene-1', sort_order: 1 }], error: null },
    ]
    mocks.responses.shots = [
      {
        data: [
          {
            scene_id: 'scene-1',
            sort_order: 1,
            storyboard_image: { status: 'completed', url: 'https://media.test/stale.png' },
            rough_storyboard: {
              status: 'completed',
              frames: { start: 'https://media.test/workspace-1/source/rough.png' },
            },
          },
        ],
        error: null,
      },
    ]
    mocks.responses.projects = [{ data: null, error: null }]

    const result = await copyReferenceAssets({
      source: {
        id: 'source',
        workspaceId: 'workspace-1',
        styleAnchorKey: null,
        customStyleAnchor: null,
      },
      destinationProjectId: 'destination',
      destinationWorkspaceId: 'workspace-1',
      includeLastShotFrame: true,
    })

    expect(result.warnings).toEqual([])
    expect(mocks.mediaCopy).toHaveBeenCalledWith(
      'workspace-1/source/rough.png',
      expect.stringContaining('last-shot-start'),
    )
  })

  it('warns and never copies an external custom-anchor URL', async () => {
    const result = await copyReferenceAssets({
      source: {
        id: 'source',
        workspaceId: 'workspace-1',
        styleAnchorKey: 'custom-source',
        customStyleAnchor: {
          url: 'http://169.254.169.254/latest/meta-data',
          label: null,
          medium: null,
        },
      },
      destinationProjectId: 'destination',
      destinationWorkspaceId: 'workspace-1',
    })

    expect(result.warnings).toEqual([
      {
        code: 'style_anchor_copy_failed',
        detail: 'source URL is outside the media bucket',
      },
    ])
    expect(mocks.mediaCopy).not.toHaveBeenCalled()
    // The preset/custom key is still copied as metadata; only the untrusted image
    // itself is skipped.
    expect(mocks.from).toHaveBeenCalledWith('projects')
  })

  it('turns storage copy failures into warnings instead of throwing after insert', async () => {
    mocks.mediaCopy.mockRejectedValueOnce(new Error('storage unavailable'))
    mocks.responses.projects = [{ data: null, error: null }]

    const result = await copyReferenceAssets({
      source: {
        id: 'source',
        workspaceId: 'workspace-1',
        styleAnchorKey: 'custom-source',
        customStyleAnchor: {
          url: 'https://media.test/workspace-1/source/anchor.png',
          label: null,
          medium: null,
        },
      },
      destinationProjectId: 'destination',
      destinationWorkspaceId: 'workspace-1',
    })

    expect(result.warnings).toEqual([
      { code: 'style_anchor_copy_failed', detail: 'storage unavailable' },
    ])
  })

  it('turns source scene lookup failures into frame warnings', async () => {
    mocks.responses.scenes = [
      { data: null, error: { message: 'scene lookup unavailable' } },
    ]

    const result = await copyReferenceAssets({
      source: {
        id: 'source',
        workspaceId: 'workspace-1',
        styleAnchorKey: null,
        customStyleAnchor: null,
      },
      destinationProjectId: 'destination',
      destinationWorkspaceId: 'workspace-1',
      includeLastShotFrame: true,
    })

    expect(result.warnings).toEqual([
      { code: 'reference_frame_copy_failed', detail: 'scene lookup unavailable' },
    ])
  })
})

async function captureError(run: () => Promise<unknown>) {
  try {
    await run()
    throw new Error('expected the operation to reject')
  } catch (error) {
    return error
  }
}

function query(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    update: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  }
  return builder
}
