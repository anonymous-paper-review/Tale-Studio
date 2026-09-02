import { beforeEach, describe, expect, it, vi } from 'vitest'

// 러프 previz 429 관문 복원(#A, 2026-09-02 오너 결정 — #initial-rough-unblocked 번복,
//   티켓 rough-storyboard-429-unreachable-2026-08-30). 이 파일은 진입 관문 자체만 검증한다 —
//   나머지 무거운 제출 로직은 rough-regenerate-inflight-block.test.ts / sheet-formats-e2e 가 커버.
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  requireProjectAccess: vi.fn(),
  checkGenerationCapacity: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/generation-quota', () => ({
  checkGenerationCapacity: mocks.checkGenerationCapacity,
  quotaExceededBody: (check: { queued: number; limit: number; scope: string; category: string }) => ({
    error: 'quota exceeded',
    code: 'quota_exceeded' as const,
    scope: check.scope,
    category: check.category,
    queued: check.queued,
    limit: check.limit,
  }),
}))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))

import { POST } from '@/app/api/writer/rough-storyboard/route'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

function request(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/writer/rough-storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT_ID, ...body }),
  })
}

function insertStub() {
  return { insert: vi.fn().mockResolvedValue({ error: null }) }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.from.mockImplementation(() => insertStub())
  mocks.requireProjectAccess.mockResolvedValue({
    ok: true,
    projectId: PROJECT_ID,
    userId: 'user-1',
    viaShare: false,
  })
})

describe('rough-storyboard 진입 관문 — 429 복원', () => {
  it('quota 거절이면 프로젝트/DB 조회 전에 429 를 반환한다', async () => {
    mocks.checkGenerationCapacity.mockResolvedValue({
      ok: false,
      queued: 6,
      limit: 6,
      scope: 'user',
      category: 'image',
    })

    const res = await POST(request())

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body).toMatchObject({ code: 'quota_exceeded', scope: 'user', category: 'image', queued: 6, limit: 6 })
    expect(mocks.checkGenerationCapacity).toHaveBeenCalledWith('user-1', 'image')
    // projects 테이블 조회(관문 뒤 로직)까지 못 갔다 — writer_observability_events insert 만 있었다.
    expect(mocks.from).not.toHaveBeenCalledWith('projects')
  })

  it('전역 슬롯(scope=global) 거절도 429 로 표면화한다', async () => {
    mocks.checkGenerationCapacity.mockResolvedValue({
      ok: false,
      queued: 40,
      limit: 40,
      scope: 'global',
      category: 'image',
    })

    const res = await POST(request())

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.scope).toBe('global')
  })

  it('quota 통과면 429 를 내지 않는다(이후 project not found 로 404)', async () => {
    mocks.checkGenerationCapacity.mockResolvedValue({
      ok: true,
      queued: 0,
      limit: 6,
      scope: 'user',
      category: 'image',
    })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'projects') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
      }
      return insertStub()
    })

    const res = await POST(request())

    expect(res.status).toBe(404)
  })
})
