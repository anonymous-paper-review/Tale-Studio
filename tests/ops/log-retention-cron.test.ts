// 90일이 지난 접근·오류 로그만 매일 지우고, Take 장부·생성 작업·피드백 본문은 남긴다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const NOW = new Date('2026-10-11T05:00:00.000Z')

type DeleteCall = { table: string; column: string; value: string }

interface Harness {
  deletes: DeleteCall[]
  /** 표별 '기간이 지난 행 수' — 라우트가 표마다 제 숫자를 돌려주는지 보려면 값이 달라야 한다. */
  expired: Map<string, number>
  failures: Map<string, string>
}

function stubSupabase(harness: Harness) {
  return {
    supabaseAdmin: {
      from(table: string) {
        return {
          delete(options?: { count?: string }) {
            return {
              lt(column: string, value: string) {
                harness.deletes.push({ table, column, value })
                const failure = harness.failures.get(table)
                if (failure) return Promise.resolve({ count: null, error: { message: failure } })
                return Promise.resolve({
                  count: options?.count === 'exact' ? (harness.expired.get(table) ?? 0) : null,
                  error: null,
                })
              },
            }
          },
        }
      },
    },
  }
}

type AlertFn = (payload: { level: string }) => Promise<void>

async function loadRoute(harness: Harness, alert = vi.fn<AlertFn>(async () => {})) {
  vi.resetModules()
  vi.doMock('@/lib/supabase/admin', () => stubSupabase(harness))
  vi.doMock('@/lib/ops-alert', () => ({ sendOpsAlert: alert }))
  const route = await import('@/app/api/cron/log-retention/route')
  return { route, alert }
}

function request(secret?: string): Request {
  return new Request('https://x/api/cron/log-retention', {
    headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
  })
}

let harness: Harness

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  harness = {
    deletes: [],
    expired: new Map([
      ['server_errors', 12],
      ['writer_observability_events', 340],
      ['chat_traces', 57],
    ]),
    failures: new Map(),
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.doUnmock('@/lib/supabase/admin')
  vi.doUnmock('@/lib/ops-alert')
})

describe('로그 보관 기간 정리 잡', () => {
  // 왜: Cron 전용 경로다. 아무나 부르면 남의 진단 기록을 지울 수 있다.
  it('CRON_SECRET 이 설정돼 있는데 요청 헤더가 다르면 로그를 지우지 않는다', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-token')
    const { route } = await loadRoute(harness)

    const res = await route.GET(request('wrong-token'))

    expect(res.status).toBe(401)
    expect(harness.deletes).toEqual([])
  })

  // 왜: 개인정보 처리방침 §1 "접근·오류 로그 약 3개월" — 기간이 지난 행이 남아 있으면 그 문장이 거짓이 된다.
  it('헤더가 맞으면 90일이 지난 로그 행만 지우고 표별로 지운 수를 돌려준다', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-token')
    const { route } = await loadRoute(harness)

    const res = await route.GET(request('secret-token'))
    const body = (await res.json()) as {
      ok: boolean
      cutoff: string
      deleted: Record<string, number>
    }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.cutoff).toBe('2026-07-13T05:00:00.000Z')
    expect(harness.deletes.map((call) => call.table)).toEqual([...route.LOG_RETENTION_TABLES])
    for (const call of harness.deletes) {
      expect(call.column).toBe('created_at')
      expect(call.value).toBe('2026-07-13T05:00:00.000Z')
    }
    expect(body.deleted).toEqual({
      server_errors: 12,
      writer_observability_events: 340,
      chat_traces: 57,
    })
  })

  // 왜: 보관 기간이 90일이 아닌 값으로 흘러가면 문서와 코드가 조용히 어긋난다.
  it('정리 기준은 90일이다', async () => {
    const { route } = await loadRoute(harness)

    expect(route.LOG_RETENTION_DAYS).toBe(90)
  })

  // 왜: 장부·생성 작업·피드백 본문은 로그가 아니다. 목록에 섞이면 결제 증빙과 결과물 연결이 사라진다.
  it('Take 장부·생성 작업·사용자 피드백 표는 로그 정리 대상에 없다', async () => {
    const { route } = await loadRoute(harness)

    const protectedTables = [
      'take_ledger',
      'billing_events',
      'billing_customers',
      'subscriptions',
      'generation_jobs',
      'feedback',
      'llm_calls',
      'messages',
      'projects',
      'video_clips',
    ]
    for (const table of protectedTables) {
      expect(route.LOG_RETENTION_TABLES as readonly string[]).not.toContain(table)
    }
  })

  // 왜: 한 표가 막혀도 나머지는 지워야 한다. 전부 멈추면 보관 기간이 조용히 무한이 된다.
  it('로그 한 표를 지우다 실패하면 나머지 표는 그대로 지우고 경보를 보낸 뒤 실패로 답한다', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-token')
    const alert = vi.fn<AlertFn>(async () => {})
    const { route } = await loadRoute(harness, alert)
    harness.failures.set(route.LOG_RETENTION_TABLES[0], 'boom')

    const res = await route.GET(request('secret-token'))

    expect(res.status).toBe(500)
    expect(harness.deletes.map((call) => call.table)).toEqual([...route.LOG_RETENTION_TABLES])
    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert.mock.calls[0][0]).toMatchObject({ level: 'error' })
  })

  // 왜: 예약 등록이 빠지면 라우트만 있고 아무도 부르지 않는다(지금까지 삭제 루틴이 없던 상태와 같다).
  it('예약 작업 목록에 로그 정리 잡이 다른 잡과 겹치지 않는 시각으로 등록돼 있다', async () => {
    const vercel = (await import('../../vercel.json')).default as {
      crons: { path: string; schedule: string }[]
    }

    const entry = vercel.crons.find((cron) => cron.path === '/api/cron/log-retention')
    expect(entry).toBeDefined()
    const others = vercel.crons.filter((cron) => cron.path !== '/api/cron/log-retention')
    expect(others.map((cron) => cron.schedule)).not.toContain(entry!.schedule)
  })
})
