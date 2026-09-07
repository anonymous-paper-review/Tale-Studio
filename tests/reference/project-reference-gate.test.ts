// 로그인한 사람이 작업 공간 한도와 참고 작품 규칙을 지키며 새 프로젝트를 만든다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  prepareReferenceImport: vi.fn(),
  copyReferenceAssets: vi.fn(),
  workspace: {
    id: 'workspace-1',
    plan: 'free',
  } as { id: string; plan: string },
  rpcResult: null as Record<string, unknown> | null,
  rpcError: null as { message: string } | null,
  inserted: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}))
vi.mock('@/lib/reference-import', () => ({
  prepareReferenceImport: mocks.prepareReferenceImport,
  copyReferenceAssets: mocks.copyReferenceAssets,
  ReferenceImportValidationError: class ReferenceImportValidationError extends Error {},
}))

import { POST } from '@/app/api/project/new/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.workspace = { id: 'workspace-1', plan: 'free' }
  mocks.rpcResult = null
  mocks.rpcError = null
  mocks.inserted = null
  mocks.createClient.mockResolvedValue({
    auth: { getUser: mocks.getUser },
  })
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'user-1',
        user_metadata: {},
      },
    },
  })
  mocks.prepareReferenceImport.mockResolvedValue({
    id: 'source-project',
    workspaceId: 'workspace-1',
    styleAnchorKey: null,
    customStyleAnchor: null,
  })
  mocks.copyReferenceAssets.mockResolvedValue({ warnings: [] })
  mocks.from.mockImplementation((table: string) => {
    if (table === 'workspaces') return workspaceQuery()
    throw new Error(`unexpected table: ${table}`)
  })
  // #project-lifecycle-rpc: 슬롯 카운트+삽입은 create_project_slotted RPC 하나가 담당한다.
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name !== 'create_project_slotted') throw new Error(`unexpected rpc: ${name}`)
    if (mocks.rpcError) return { data: null, error: mocks.rpcError }
    if (mocks.rpcResult) return { data: mocks.rpcResult, error: null }
    mocks.inserted = {
      id: args.p_project_id,
      workspace_id: args.p_workspace_id,
      title: args.p_title,
      locale: args.p_locale,
      locale_locked: args.p_locale_locked,
      reference_project_id: args.p_reference_project_id,
    }
    return {
      data: { status: 'ok', project: mocks.inserted },
      error: null,
    }
  })
})

describe('새 프로젝트를 만들 때 작업 공간 한도와 참고 작품 규칙을 지킨다 (v4)', () => {
  it('로그인하지 않은 사용자는 작업 공간을 확인하기 전에 거절한다', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })

    const response = await POST(request({ title: 'Private project' }))

    expect(response.status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('작업 공간 한도 확인에 실패하면 프로젝트를 만들지 않는다', async () => {
    mocks.rpcError = { message: 'count unavailable' }

    const response = await POST(request({ title: 'New project' }))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'count unavailable' })
    expect(mocks.inserted).toBeNull()
  })

  it('무료 작업 공간이 한 개 한도에 도달하면 두 번째 프로젝트를 막는다', async () => {
    mocks.rpcResult = { status: 'slot_limit', count: 1 }

    const response = await POST(request({ title: 'Second project' }))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ error: 'slot_limit', limit: 1, plan: 'free' })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'create_project_slotted',
      expect.objectContaining({ p_slot_limit: 1 }),
    )
    expect(mocks.inserted).toBeNull()
  })

  it('알 수 없는 결과가 오면 프로젝트를 만들지 않고 오류를 알린다', async () => {
    mocks.rpcResult = { status: 'workspace_not_found' }

    const response = await POST(request({ title: 'Orphan project' }))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Failed to create project (workspace_not_found)' })
    expect(mocks.inserted).toBeNull()
  })

  it('참고 작품을 고를 수 있는 요금제에서는 선택한 작품을 새 프로젝트에 연결한다', async () => {
    mocks.workspace.plan = 'p10'

    const response = await POST(
      request({
        title: 'Follow-up',
        referenceProjectId: 'source-project',
        includeLastShotFrame: true,
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.inserted).toMatchObject({
      title: 'Follow-up',
      reference_project_id: 'source-project',
    })
    expect(mocks.prepareReferenceImport).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        destinationWorkspaceId: 'workspace-1',
        referenceProjectId: 'source-project',
      }),
    )
    expect(mocks.copyReferenceAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        includeLastShotFrame: true,
        source: expect.objectContaining({ id: 'source-project' }),
      }),
    )
  })

  it('내용 없이 요청해도 Untitled 프로젝트를 만든다', async () => {
    const response = await POST(request(undefined))

    expect(response.status).toBe(200)
    expect(mocks.inserted).toMatchObject({ title: 'Untitled' })
  })

  // #chat-locale-follow 2026-08-31: 계정에 언어 설정이 없는 en 은 폴백이지 선택이 아니다 —
  //   잠그면 한국어 사용자의 채팅이 영어로 고착된다(실사고). 발화 추종·스토리 감지가 후정하게 연다.
  it('계정에 언어 설정이 없으면 기본 언어를 고정하지 않는다', async () => {
    const response = await POST(request({ title: 'Defaulted' }))

    expect(response.status).toBe(200)
    expect(mocks.inserted).toMatchObject({ locale: 'en', locale_locked: false })
  })

  it('계정에 저장된 언어가 있으면 그 언어로 프로젝트를 고정한다', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', user_metadata: { locale: 'ko' } } },
    })

    const response = await POST(request({ title: 'Chosen' }))

    expect(response.status).toBe(200)
    expect(mocks.inserted).toMatchObject({ locale: 'ko', locale_locked: true })
  })
})

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/project/new', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
}

function workspaceQuery() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: mocks.workspace, error: null })),
    single: vi.fn(async () => ({ data: mocks.workspace, error: null })),
  }
  return query
}
