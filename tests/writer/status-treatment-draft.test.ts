// Writer 상태 조회는 지금 실행이 아직 넘기지 않은 트리트먼트 초안인지 알려 준다 (2026-10-02 오너 · 시안 v04)
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ light: vi.fn() }))
vi.mock('@/lib/writer/run-store', () => ({ getRunStatusLight: mocks.light, estimateRunTotalMs: vi.fn(async () => null) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('@/lib/generation-jobs', () => ({ STALE_QUEUED_MS: 600_000 }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: vi.fn(async (_req: Request, projectId: string) => ({ ok: true, projectId, userId: 'u', viaShare: false })) }))

import { GET } from '@/app/api/writer/status/[projectId]/route'

const row = (patch: Record<string, unknown>) => ({
  engine: 'v1', status: 'awaiting_confirmation', current_stage: 'storyCheck', completed_units: 4, total_units: 15, error: null,
  updated_at: '2026-10-02T00:00:00.000Z', created_at: '2026-10-02T00:00:00.000Z', timings: null, shot_issues: null, ...patch,
})
const status = async () => (await GET(new NextRequest('http://localhost/api/writer/status/p1'), { params: Promise.resolve({ projectId: 'p1' }) })).json()

describe('트리트먼트 초안 상태', () => {
  it('새 프로젝트에서 만든 트리트먼트 초안은 넘기기 전 실행으로 알린다', async () => {
    mocks.light.mockResolvedValue(row({ draft: 'true' }))
    expect(await status()).toMatchObject({ started: true, draft: true, current_status: 'awaiting_confirmation' })
  })

  it('Writer로 넘긴 뒤의 실행은 초안이 아니다', async () => {
    mocks.light.mockResolvedValue(row({ draft: null, status: 'running', current_stage: 'visualFormat' }))
    expect(await status()).toMatchObject({ started: true, draft: false })
  })

  it('실행 기록이 없으면 초안도 없다', async () => {
    mocks.light.mockResolvedValue(null)
    expect(await status()).toMatchObject({ started: false, draft: false })
  })
})
