// 같은 그림을 웹훅과 폴링이 동시에 마무리해도 저장은 한 번만 한다 (2026-11-24 운영 재현: 60장 중 12장이 2번 저장됨)
//
// 같이 정한 것(오너 2026-11-24):
//   · 웹훅과 폴링이 같은 그림을 동시에 마무리하면 먼저 자리를 찍은 쪽만 저장한다.
//   · 찍은 쪽이 2분 안에 끝내지 못하면 다른 쪽이 이어받는다.
// 혼자 정한 것:
//   · 저장이 실패하면 찍은 자리를 풀어 다음 시도가 바로 가능하다(되돌리기 쌈).
//   · 자리를 못 찍은 폴링은 그림을 실패로 만들지 않고 queued 그대로 둔다 — 화면은 다음 폴링에서 완료를 본다.
//   · 자리를 못 찍은 웹훅은 실패로 만들지 않고 조용히 끝낸다.
//   · DB 는 generation_jobs 에 finalize_claimed_at(빈 값 허용) 칸 하나만 더한다. 2분 상수는 generation-job-timing.ts 에 둔다.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  calls: [] as Array<{ table: string; update?: unknown; filters: Array<[string, unknown[]]> }>,
  claimResult: { data: [{ id: 'job-1' }], error: null } as { data: unknown; error: unknown },
  failGenerationJob: vi.fn(),
  falImageFetch: vi.fn(),
  finalizeGenerationJob: vi.fn(),
  verifyFalWebhook: vi.fn(),
  getGenerationJobByRequestId: vi.fn(),
}))

/** supabaseAdmin.from 스텁 — update 체인의 표·값·필터를 기록하고 claimResult 를 돌려준다. */
function chain(table: string) {
  const call: { table: string; update?: unknown; filters: Array<[string, unknown[]]> } = { table, filters: [] }
  mocks.calls.push(call)
  const api: Record<string, unknown> = {}
  for (const name of ['eq', 'is', 'or', 'lt', 'select', 'maybeSingle', 'single']) {
    api[name] = (...args: unknown[]) => { call.filters.push([name, args]); return api }
  }
  api.update = (values: unknown) => { call.update = values; return api }
  api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(mocks.claimResult).then(resolve, reject)
  return api
}

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: vi.fn() } }))

import {
  claimGenerationJobFinalize,
  GenerationJobFinalizeInProgressError,
  releaseGenerationJobFinalizeClaim,
} from '@/lib/generation-jobs'
import { FINALIZE_CLAIM_STALE_MS } from '@/lib/generation-job-timing'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.calls = []
  mocks.claimResult = { data: [{ id: 'job-1' }], error: null }
  mocks.from.mockImplementation(chain)
})

describe('마무리 자리 찍기(DB)', () => {
  it('마이그레이션은 generation_jobs 에 finalize_claimed_at 칸(빈 값 허용) 하나만 더한다', () => {
    // 왜: 늘리기만 하는 1단계(supabase.md Expand → Contract). 옛 코드도 이 칸을 모른 채 그대로 돈다.
    const sql = readFileSync('supabase/migrations/20261124230000_generation_jobs_finalize_claim.sql', 'utf8')
    expect(sql).toMatch(/alter table public\.generation_jobs\s+add column if not exists finalize_claimed_at timestamptz/)
    expect(sql).not.toMatch(/not null/i)
    expect(readFileSync('supabase/rollbacks/20261124230000_generation_jobs_finalize_claim.rollback.sql', 'utf8'))
      .toMatch(/drop column if exists finalize_claimed_at/)
  })

  it('찍은 쪽이 2분 안에 끝내지 못하면 다른 쪽이 이어받는다', async () => {
    // 왜: 웹훅 함수는 60초 안에 끝나거나 죽는다. 죽은 뒤에도 자리가 잠겨 있으면 그림이 영영 queued 로 남는다.
    expect(FINALIZE_CLAIM_STALE_MS).toBe(2 * 60 * 1000)
    const now = Date.parse('2026-11-24T12:00:00.000Z')
    await claimGenerationJobFinalize('job-1', now)
    const call = mocks.calls[0]
    expect(call.table).toBe('generation_jobs')
    expect(call.update).toMatchObject({ finalize_claimed_at: new Date(now).toISOString() })
    expect(call.filters).toContainEqual(['eq', ['id', 'job-1']])
    expect(call.filters).toContainEqual(['eq', ['status', 'queued']])
    const cutoff = new Date(now - FINALIZE_CLAIM_STALE_MS).toISOString()
    expect(call.filters).toContainEqual(['or', [`finalize_claimed_at.is.null,finalize_claimed_at.lt.${cutoff}`]])
  })

  it('자리를 먼저 찍은 쪽만 true 를 받고 늦은 쪽은 false 를 받는다', async () => {
    await expect(claimGenerationJobFinalize('job-1')).resolves.toBe(true)
    mocks.claimResult = { data: [], error: null }
    await expect(claimGenerationJobFinalize('job-1')).resolves.toBe(false)
  })

  it('DB 오류면 자리를 찍은 것으로 꾸미지 않고 오류를 올린다', async () => {
    mocks.claimResult = { data: null, error: { message: 'db down' } }
    await expect(claimGenerationJobFinalize('job-1')).rejects.toMatchObject({ message: 'db down' })
  })

  it('자리 풀기는 아직 queued 인 잡의 finalize_claimed_at 만 비운다', async () => {
    await releaseGenerationJobFinalizeClaim('job-1')
    const call = mocks.calls[0]
    expect(call.update).toEqual({ finalize_claimed_at: null })
    expect(call.filters).toContainEqual(['eq', ['id', 'job-1']])
    expect(call.filters).toContainEqual(['eq', ['status', 'queued']])
  })

  it('자리를 못 찍었다는 오류는 종결 오류와 구별된다', () => {
    const error = new GenerationJobFinalizeInProgressError('job-1')
    expect(error.name).toBe('GenerationJobFinalizeInProgressError')
    expect(error.message).toContain('job-1')
  })
})
