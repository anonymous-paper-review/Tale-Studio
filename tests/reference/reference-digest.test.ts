import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  responses: {} as Record<string, unknown[]>,
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import {
  buildReferenceDigest,
  getProjectReferenceId,
} from '@/lib/reference-import'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.responses = {}
  mocks.from.mockImplementation((table: string) => {
    const result = mocks.responses[table]?.shift() ?? { data: null, error: null }
    return query(result)
  })
})

describe('reference digest', () => {
  it('rechecks owner and plan, then serializes the source project within 1500 characters', async () => {
    mocks.responses.projects = [
      {
        data: {
          id: 'source',
          workspace_id: 'workspace-1',
          title: 'Episode One',
          settings: { genre: 'mystery', tone: 'quiet' },
          story_text: 'The first episode opens at dawn.',
          expanded_story: 'A longer explanation that remains behind the canonical story text.',
        },
        error: null,
      },
    ]
    mocks.responses.workspaces = [
      { data: { id: 'workspace-1', owner_id: 'owner', plan: 'p10' }, error: null },
    ]
    mocks.responses.characters = [
      {
        data: [{ name: 'Mina', role: 'detective', appearance: 'red coat' }],
        error: null,
      },
    ]
    mocks.responses.locations = [
      {
        data: [{ name: 'Old station', visual_description: 'empty platform' }],
        error: null,
      },
    ]

    const digest = await buildReferenceDigest('source', 'owner')

    expect(digest).toContain('[Referenced Project: Episode One]')
    expect(digest).toContain('"name":"Mina"')
    expect(digest).toContain('"name":"Old station"')
    expect(digest).toContain('The first episode opens at dawn.')
    expect(digest).toContain('[Referenced Project:')
    expect(digest!.length).toBeLessThanOrEqual(1500)
  })

  it('returns null for another owner or a plan without reference access', async () => {
    mocks.responses.projects = [
      {
        data: { id: 'source', workspace_id: 'workspace-1', title: 'Private' },
        error: null,
      },
    ]
    mocks.responses.workspaces = [
      { data: { id: 'workspace-1', owner_id: 'someone-else', plan: 'p10' }, error: null },
    ]

    await expect(buildReferenceDigest('source', 'owner')).resolves.toBeNull()
    expect(mocks.from).toHaveBeenCalledTimes(2)

    mocks.responses.projects = [
      {
        data: { id: 'source', workspace_id: 'workspace-1', title: 'Locked' },
        error: null,
      },
    ]
    mocks.responses.workspaces = [
      { data: { id: 'workspace-1', owner_id: 'owner', plan: 'free' }, error: null },
    ]

    await expect(buildReferenceDigest('source', 'owner')).resolves.toBeNull()
    expect(mocks.from).toHaveBeenCalledTimes(4)
  })

  it('throws system query failures so the chat route can warn and continue', async () => {
    mocks.responses.projects = [
      { data: null, error: { message: 'database unavailable' } },
    ]

    await expect(buildReferenceDigest('source', 'owner')).rejects.toMatchObject({
      message: 'database unavailable',
    })
  })

  it('reads only the current project reference pointer', async () => {
    mocks.responses.projects = [
      { data: { reference_project_id: 'source' }, error: null },
    ]

    await expect(getProjectReferenceId('current')).resolves.toBe('source')
    expect(mocks.from).toHaveBeenCalledWith('projects')
  })
})

function query(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  }
  return builder
}
