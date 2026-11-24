// 하루 한 번 유령 작업을 거둘 때 접수 번호가 없는 예약은 목록에서 뺀다
//
// 예약(request_id='reserved:<id>')은 fal 번호가 없어 reconcile 이 그대로 돌려준다. 오래된 순 10건 머리를
// 예약 좀비가 차지하면 뒤의 진짜 유령이 영영 청소되지 않는다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}))

vi.mock('@/lib/supabase/admin', () => {
  function chain(table: string) {
    const proxy: Record<string, unknown> = {}
    const target = new Proxy(proxy, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
        }
        return (...args: unknown[]) => {
          mocks.calls.push({ table, method: prop, args })
          return target
        }
      },
    })
    return target
  }
  return { supabaseAdmin: { from: (table: string) => chain(table) } }
})
vi.mock('@/lib/writer/pipeline/steps', () => ({ triggerWriterStep: vi.fn() }))
vi.mock('@/lib/fal/reconcile', () => ({ reconcileJobFromFal: vi.fn() }))

import { GET } from '@/app/api/writer/watchdog/route'

beforeEach(() => {
  mocks.calls.length = 0
  vi.stubEnv('CRON_SECRET', 'secret')
})

describe('유령 작업 일일 청소', () => {
  it('유령 목록 질문에 예약 행을 제외하는 조건이 들어간다', async () => {
    const { NextRequest } = await import('next/server')
    const response = await GET(
      new NextRequest('http://localhost/api/writer/watchdog', {
        headers: { authorization: 'Bearer secret' },
      }),
    )

    expect(response.status).toBe(200)
    const sweep = mocks.calls.filter((c) => c.table === 'generation_jobs')
    expect(sweep.length).toBeGreaterThan(0)
    expect(sweep).toContainEqual({
      table: 'generation_jobs',
      method: 'not',
      args: ['request_id', 'like', 'reserved:%'],
    })
  })
})
