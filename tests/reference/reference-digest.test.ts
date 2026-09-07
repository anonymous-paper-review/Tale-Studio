// 참고 작품은 소유자와 이용 권한을 확인한 뒤 필요한 내용만 안전하게 보여준다
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

describe('참고 작품 정보를 안전하게 읽어온다', () => {
  it('작품 소유자와 이용 권한을 다시 확인한 뒤 참고 작품을 1500자 안에 정리한다', async () => {
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

  it('다른 사람의 작품이거나 참고 권한이 없으면 내용을 제공하지 않는다', async () => {
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

  it('참고 작품을 불러오지 못해도 대화를 이어갈 수 있게 오류를 알린다', async () => {
    mocks.responses.projects = [
      { data: null, error: { message: 'database unavailable' } },
    ]

    await expect(buildReferenceDigest('source', 'owner')).rejects.toMatchObject({
      message: 'database unavailable',
    })
  })

  it('현재 프로젝트가 가리키는 참고 작품만 읽는다', async () => {
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
