import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  getChatTrace: vi.fn(),
  patchChatTrace: vi.fn(),
  upsertChatTrace: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))
vi.mock('@/lib/chat-trace-server', () => ({
  getChatTrace: mocks.getChatTrace,
  patchChatTrace: mocks.patchChatTrace,
  upsertChatTrace: mocks.upsertChatTrace,
}))

import { GET, POST } from '@/app/api/chat/trace/route'

const TRACE_ID = '00000000-0000-4000-8000-000000000001'

function request(method: string, body?: unknown, query = '') {
  return new Request(`http://localhost/api/chat/trace${query}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.getChatTrace.mockResolvedValue(null)
  mocks.patchChatTrace.mockResolvedValue(undefined)
  mocks.upsertChatTrace.mockResolvedValue(undefined)
})

describe('chat trace API', () => {
  it('requires authentication and project ownership', async () => {
    mocks.getUser.mockResolvedValue(null)
    const unauthenticated = await GET(request('GET', undefined, '?projectId=p-1'))
    if (!unauthenticated) throw new Error('expected a response')
    expect(unauthenticated.status).toBe(401)

    mocks.getUser.mockResolvedValue({ id: 'user-1' })
    mocks.userOwnsProject.mockResolvedValue(false)
    const forbidden = await GET(request('GET', undefined, '?projectId=p-1'))
    if (!forbidden) throw new Error('expected a response')
    expect(forbidden.status).toBe(403)
  })

  it('upserts a trace while ignoring fields outside the safe receipt', async () => {
    const response = await POST(
      request('POST', {
        projectId: 'p-1',
        trace: {
          traceId: TRACE_ID,
          stage: 'artist',
          route: 'artist/chat',
          model: 'test',
          system: 'must not persist',
          prompt: 'must not persist',
        },
      }),
    )

    if (!response) throw new Error('expected a response')
    expect(response.status).toBe(200)
    expect(mocks.upsertChatTrace).toHaveBeenCalledWith('p-1', expect.objectContaining({
      traceId: TRACE_ID,
      stage: 'artist',
    }))
  })

  it('whitelists patches and returns the persisted trace', async () => {
    const trace = { traceId: TRACE_ID, stage: 'artist' }
    mocks.getChatTrace.mockResolvedValue(trace)
    const loaded = await GET(request('GET', undefined, `?projectId=p-1&traceId=${TRACE_ID}`))
    if (!loaded) throw new Error('expected a response')
    expect(loaded.status).toBe(200)
    await expect(loaded.json()).resolves.toEqual({ trace })

    const response = await POST(
      request('POST', {
        projectId: 'p-1',
        traceId: TRACE_ID,
        patch: {
          generationStatus: 'queued',
          pendingProposal: false,
          prompt: 'must be ignored',
        },
      }),
    )
    if (!response) throw new Error('expected a response')
    expect(response.status).toBe(200)
    expect(mocks.patchChatTrace).toHaveBeenCalledWith('p-1', TRACE_ID, {
      generationStatus: 'queued',
      pendingProposal: false,
    })
  })
})
