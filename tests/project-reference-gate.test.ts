import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  prepareReferenceImport: vi.fn(),
  copyReferenceAssets: vi.fn(),
  workspace: {
    id: 'workspace-1',
    plan: 'free',
  } as { id: string; plan: string },
  projectCount: 0 as number | null,
  countError: null as { message: string } | null,
  inserted: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/reference-import', () => ({
  prepareReferenceImport: mocks.prepareReferenceImport,
  copyReferenceAssets: mocks.copyReferenceAssets,
  ReferenceImportValidationError: class ReferenceImportValidationError extends Error {},
}))

import { POST } from '@/app/api/project/new/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.workspace = { id: 'workspace-1', plan: 'free' }
  mocks.projectCount = 0
  mocks.countError = null
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
    if (table === 'projects') return projectQuery()
    throw new Error(`unexpected table: ${table}`)
  })
})

describe('POST /api/project/new — v4 slot and reference contract', () => {
  it('rejects unauthenticated callers before reading workspace state', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })

    const response = await POST(request({ title: 'Private project' }))

    expect(response.status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('fails closed when the project count query fails', async () => {
    mocks.countError = { message: 'count unavailable' }

    const response = await POST(request({ title: 'New project' }))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'count unavailable' })
    expect(mocks.inserted).toBeNull()
  })

  it('blocks a free workspace at its one-project limit', async () => {
    mocks.projectCount = 1

    const response = await POST(request({ title: 'Second project' }))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ error: 'slot_limit', limit: 1, plan: 'free' })
    expect(mocks.inserted).toBeNull()
  })

  it('routes reference selection through the server helper for an open plan', async () => {
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

  it('keeps the old body-less call working with the Untitled title', async () => {
    const response = await POST(request(undefined))

    expect(response.status).toBe(200)
    expect(mocks.inserted).toMatchObject({ title: 'Untitled' })
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

function projectQuery() {
  const insertQuery = {
    select: vi.fn(() => insertQuery),
    single: vi.fn(async () => ({
      data: {
        id: 'created-project',
        ...mocks.inserted,
      },
      error: null,
    })),
  }
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    then: (
      resolve: (value: { count: number | null; error: { message: string } | null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        count: mocks.projectCount,
        error: mocks.countError,
      }).then(resolve, reject),
    insert: vi.fn((payload: Record<string, unknown>) => {
      mocks.inserted = payload
      return insertQuery
    }),
  }
  return query
}
