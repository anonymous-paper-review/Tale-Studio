// 신규 계정의 작업 공간을 안전하게 준비하고 첫 프로젝트에도 무료 한도를 적용한다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  lookupWorkspace: vi.fn(),
  insertWorkspace: vi.fn(),
  workspaceOwner: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}))
vi.mock('@/lib/reference-import', () => ({
  prepareReferenceImport: vi.fn(),
  copyReferenceAssets: vi.fn(),
  ReferenceImportValidationError: class ReferenceImportValidationError extends Error {},
}))

import { POST as createProject } from '@/app/api/project/new/route'
import { POST as initializeProject } from '@/app/api/project/init/route'

const user = {
  id: 'b261d160-fd63-44ab-8f94-20e72f83b287',
  email: 'creator@example.com',
  user_metadata: { full_name: 'First Creator', locale: 'ko' },
}
const workspace = { id: 'workspace-1', plan: 'free', owner_id: user.id }

function workspaceQuery() {
  let inserted: Record<string, unknown> | undefined
  const result = () => inserted
    ? mocks.insertWorkspace(inserted)
    : mocks.lookupWorkspace()
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((field: string, value: unknown) => {
      mocks.workspaceOwner(field, value)
      return query
    }),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    insert: vi.fn((row: Record<string, unknown>) => {
      inserted = row
      return query
    }),
    single: vi.fn(result),
    maybeSingle: vi.fn(result),
  }
  return query
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user } })
  mocks.lookupWorkspace.mockReset().mockResolvedValue({ data: workspace, error: null })
  mocks.insertWorkspace.mockReset().mockResolvedValue({ data: workspace, error: null })
  mocks.rpc.mockReset().mockImplementation(async (_name: string, args: Record<string, unknown>) => ({
    data: { status: 'ok', project: { id: args.p_project_id, workspace_id: args.p_workspace_id } },
    error: null,
  }))
  mocks.from.mockImplementation((table: string) => {
    if (table === 'workspaces') return workspaceQuery()
    if (table === 'projects') {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        single: vi.fn(async () => ({ data: { id: 'existing-project' }, error: null })),
      }
      return query
    }
    throw new Error(`unexpected table: ${table}`)
  })
})

const newRequest = () => new NextRequest('http://localhost/api/project/new', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: '첫 작품' }),
})

describe('첫 프로젝트의 작업 공간 준비', () => {
  // 왜: 가입 후 바로 새 프로젝트를 만드는 사람에게 작업 공간이 아직 없을 수 있다.
  it('신규 계정이 첫 프로젝트를 만들면 작업 공간을 준비하고 무료 한 개 한도를 적용한다', async () => {
    mocks.lookupWorkspace.mockResolvedValue({ data: null, error: null })

    const response = await createProject(newRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ workspaceId: workspace.id })
    expect(mocks.insertWorkspace).toHaveBeenCalledOnce()
    expect(mocks.insertWorkspace).toHaveBeenCalledWith({
      name: user.user_metadata.full_name,
      slug: `studio-${user.id}`,
      owner_id: user.id,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('create_project_slotted', expect.objectContaining({
      p_workspace_id: workspace.id,
      p_slot_limit: 1,
      p_title: '첫 작품',
    }))
  })

  // 왜: 정상 경로 고정 — 기존 사용자에게 작업 공간을 추가하지 않는다.
  it('이미 작업 공간이 있는 계정은 기존 공간을 그대로 사용한다', async () => {
    const response = await createProject(newRequest())

    expect(response.status).toBe(200)
    expect(mocks.insertWorkspace).not.toHaveBeenCalled()
    expect(mocks.workspaceOwner).toHaveBeenCalledWith('owner_id', user.id)
  })

  // 왜: 조회 장애를 신규 가입으로 오인하면 중복 공간을 만들거나 잘못된 안내를 한다.
  it('작업 공간을 조회하지 못하면 없다고 안내하지 않고 오류를 알린다', async () => {
    mocks.lookupWorkspace.mockResolvedValue({ data: null, error: { message: 'workspace lookup unavailable' } })

    const response = await createProject(newRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'workspace lookup unavailable' })
    expect(mocks.insertWorkspace).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  // 왜: 첫 생성 버튼의 중복 요청이 같은 작업 공간을 동시에 준비할 수 있다.
  it('첫 프로젝트를 동시에 요청해도 같은 작업 공간을 사용하고 무료 한 개 한도를 유지한다', async () => {
    mocks.lookupWorkspace
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
    mocks.insertWorkspace
      .mockResolvedValueOnce({ data: workspace, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate workspace slug' } })
    mocks.rpc
      .mockResolvedValueOnce({ data: { status: 'ok', project: { id: 'first-project' } }, error: null })
      .mockResolvedValueOnce({ data: { status: 'slot_limit', count: 1 }, error: null })

    const responses = await Promise.all([createProject(newRequest()), createProject(newRequest())])

    expect(responses.map(response => response.status).sort()).toEqual([200, 403])
    expect(mocks.lookupWorkspace).toHaveBeenCalledTimes(3)
    expect(mocks.insertWorkspace.mock.calls.map(([row]) => row.slug)).toEqual([
      `studio-${user.id}`, `studio-${user.id}`,
    ])
    for (const [, args] of mocks.rpc.mock.calls) {
      expect(args).toMatchObject({ p_workspace_id: workspace.id, p_slot_limit: 1 })
    }
  })

  // 왜: 이름 충돌 뒤 다른 사람의 작업 공간으로 들어가면 안 된다.
  it('이름이 겹쳐도 본인 작업 공간을 찾지 못하면 프로젝트를 만들지 않는다', async () => {
    mocks.lookupWorkspace.mockResolvedValue({ data: null, error: null })
    mocks.insertWorkspace.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate workspace slug' } })

    const response = await createProject(newRequest())

    expect(response.status).toBe(500)
    expect(mocks.workspaceOwner.mock.calls).toEqual([
      ['owner_id', user.id], ['owner_id', user.id],
    ])
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  // 왜: 새 프로젝트와 편집 화면이 다른 방식으로 작업 공간을 만들면 중복될 수 있다.
  it('편집 화면에서 처음 시작할 때도 같은 계정의 작업 공간을 준비한다', async () => {
    mocks.lookupWorkspace.mockResolvedValue({ data: null, error: null })

    const response = await initializeProject(new Request('http://localhost/api/project/init', { method: 'POST' }))

    expect(response.status).toBe(200)
    expect(mocks.insertWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      slug: `studio-${user.id}`, owner_id: user.id,
    }))
  })

  // 왜: 편집 화면 초기 조회 장애도 새 작업 공간 생성으로 이어지면 안 된다.
  it('편집 화면에서 작업 공간 조회가 실패하면 새 공간을 만들지 않는다', async () => {
    mocks.lookupWorkspace.mockResolvedValue({ data: null, error: { message: 'workspace lookup unavailable' } })

    const response = await initializeProject(new Request('http://localhost/api/project/init', { method: 'POST' }))

    expect(response.status).toBe(500)
    expect(mocks.insertWorkspace).not.toHaveBeenCalled()
  })
})
