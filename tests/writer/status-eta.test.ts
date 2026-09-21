// 믿을 수 없는 과거 실행 시간으로 남은 시간을 표시하지 않는다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  current: {} as Record<string, unknown>,
  history: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/lib/generation-jobs', () => ({ STALE_QUEUED_MS: 600_000 }))

import { GET } from '@/app/api/writer/status/[projectId]/route'

function query(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    in: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: mocks.current, error: null })),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
      data: table === 'writer_runs'
        ? mocks.history
        : [{ id: 'old-project', settings: { playtime: 60 } }],
      error: null,
    })),
  }
  return builder
}

async function status(id: string) {
  const response = await GET(new Request(`http://localhost/api/writer/status/${id}`) as NextRequest, {
    params: Promise.resolve({ projectId: id }),
  })
  expect(response.status).toBe(200)
  return response.json()
}

describe('근거 없는 예상 시간 제거', () => {
  beforeEach(() => {
    mocks.from.mockReset().mockImplementation(query)
    mocks.current = {
      engine: 'v1', status: 'running', current_stage: 'scenes', completed_units: 2, total_units: 15,
      error: null, created_at: '2026-09-10T00:00:00Z', updated_at: '2026-09-10T00:00:10Z',
      timings: {}, shot_issues: null,
    }
    mocks.history = [{
      id: 'old-run', project_id: 'old-project', engine: 'v1',
      created_at: '2026-09-09T00:00:00Z', updated_at: '2026-09-09T00:18:00Z',
    }]
  })

  // 왜: 초안 확인을 기다린 18분이 실제 생성 시간으로 환산되던 경로를 막는다.
  it('검토 대기가 섞인 과거 기록으로 남은 시간을 표시하지 않는다', async () => {
    expect(await status('approval-wait')).toMatchObject({ eta_total_ms: null, eta_based_on_runs: 0 })
  })

  // 왜: 다른 제작 방식과 다른 프로젝트의 실행 시간을 현재 작업에 대입하지 않는다.
  it('다른 제작 방식의 기록으로 남은 시간을 표시하지 않는다', async () => {
    mocks.history[0].engine = 'v2'
    expect(await status('other-engine')).toMatchObject({ eta_total_ms: null, eta_based_on_runs: 0 })
  })

  // 왜: 중간 저장과 재시도 시간이 빠진 마지막 실행 조각은 전체 작업 시간의 근거가 아니다.
  it('마지막 실행 조각만 측정된 기록으로 남은 시간을 표시하지 않는다', async () => {
    mocks.current.current_stage = 'shotsAndDialogue'
    mocks.history[0].timings = { shotsAndDialogue: { ms: 1_000, attempts: 1, endedAt: '2026-09-09T00:18:00Z' } }
    expect(await status('partial-timing')).toMatchObject({ eta_total_ms: null, eta_based_on_runs: 0 })
  })

  // 왜: 사용자의 초안 확인을 기다리는 동안 작업 완료까지의 숫자가 계속 보이면 안 된다.
  it('초안 확인을 기다릴 때 예상 남은 시간을 표시하지 않는다', async () => {
    mocks.current.status = 'awaiting_confirmation'
    expect(await status('review')).toMatchObject({ eta_total_ms: null, eta_based_on_runs: 0 })
  })

  // 왜: 표시하지 않는 숫자를 만들려고 다른 프로젝트의 실행 기록을 계속 조회할 필요가 없다.
  it('예상 시간을 숨긴 상태에서는 다른 프로젝트의 실행 기록을 읽지 않는다', async () => {
    await status('no-unrelated-reads')
    expect(mocks.from.mock.calls).toEqual([['writer_runs']])
  })
})
