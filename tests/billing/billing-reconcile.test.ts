// 놓친 결제는 유저가 보고 있으면 90초 안에, 아니면 다음 날 아침에 잡힌다 (#payments-phase-3 P12).
//   .claude/docs/2026-09-08/remaining-three.html 2판: Paddle 재시도(1차)·결제 직후 폴링(2차)이 둘 다 실패한 결제를
//   ① 즉시 재조회(그 유저 것만, 유저가 보고 있을 때) ② 일일 대사(전부, 유저가 안 보고 있을 때)로 잡는다.
import { describe, expect, it, vi } from 'vitest'

import { diffLedgerAgainstPaddle, type PaddleTxnSummary } from '@/lib/billing/reconcile'

const txn = (id: string, over: Partial<PaddleTxnSummary> = {}): PaddleTxnSummary => ({
  id,
  customerId: 'ctm_1',
  billedAt: '2026-09-07T10:00:00.000Z',
  total: '2900',
  ...over,
})

describe('대조 계산', () => {
  // 왜: 알림 유실. 이 잡의 존재 이유다.
  it('Paddle 에 완료된 결제가 있는데 우리 장부에 없으면 빠진 것으로 잡는다', () => {
    const out = diffLedgerAgainstPaddle({
      paddleTransactions: [txn('txn_a'), txn('txn_b')],
      grantedTransactionIds: ['txn_a'],
    })
    expect(out.missing.map((t) => t.id)).toEqual(['txn_b'])
    expect(out.extra).toEqual([])
    expect(out.matched).toBe(1)
  })

  // 왜: 있을 수 없는 일이라 있으면 위조·버그 신호다.
  it('우리 장부에 적립이 있는데 Paddle 에 그 결제가 없으면 남는 것으로 잡는다', () => {
    const out = diffLedgerAgainstPaddle({
      paddleTransactions: [txn('txn_a')],
      grantedTransactionIds: ['txn_a', 'txn_ghost'],
    })
    expect(out.missing).toEqual([])
    expect(out.extra).toEqual(['txn_ghost'])
  })

  // 왜: 매일 "OK" 가 오면 진짜 경보를 안 읽게 된다. 조용함이 곧 정상.
  it('전부 맞으면 빠진 것도 남는 것도 없다', () => {
    const out = diffLedgerAgainstPaddle({
      paddleTransactions: [txn('txn_a'), txn('txn_b')],
      grantedTransactionIds: ['txn_b', 'txn_a'],
    })
    expect(out.missing).toEqual([])
    expect(out.extra).toEqual([])
    expect(out.matched).toBe(2)
  })

  // 왜: 즉시 재조회가 처리한 결제(recon_ 이벤트)도 적립은 같은 참조 번호로 남는다. 그걸 매일 다시 경보하면 안 된다.
  it('즉시 재조회로 이미 처리된 결제는 빠진 것으로 세지 않는다', () => {
    const out = diffLedgerAgainstPaddle({
      paddleTransactions: [txn('txn_recon')],
      grantedTransactionIds: ['txn_recon'],
    })
    expect(out.missing).toEqual([])
  })
})

describe('즉시 재조회 라우트', () => {
  function mockDeps(opts: {
    user?: { id: string; email: string } | null | undefined
    customerId?: string | null
    paddleTxns?: unknown[]
    grantedIds?: string[]
  }) {
    const handled: string[] = []
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: 'user' in opts ? opts.user : { id: 'u1', email: 'a@b.c' } } }) } }),
    }))
    const ledgerRows = (opts.grantedIds ?? []).map((id) => ({ ref_id: id }))
    vi.doMock('@/lib/supabase/admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          const chain: Record<string, unknown> = {}
          const self = new Proxy(chain, {
            get: (_t, prop) => {
              if (prop === 'maybeSingle') {
                return async () =>
                  table === 'workspaces'
                    ? { data: { id: 'ws-1', plan: 'free' }, error: null }
                    : { data: opts.customerId === undefined ? { mor_customer_id: 'ctm_1' } : opts.customerId ? { mor_customer_id: opts.customerId } : null, error: null }
              }
              if (prop === 'then') return undefined
              if (prop === 'select' && table === 'take_ledger') {
                return () => ({
                  eq: () => ({ in: () => ({ data: ledgerRows, error: null }) }),
                  in: () => ({ data: ledgerRows, error: null }),
                })
              }
              return () => self
            },
          })
          return self
        },
      },
    }))
    vi.doMock('@/lib/billing/paddle-api', () => ({
      paddleRequest: async () => opts.paddleTxns ?? [],
    }))
    vi.doMock('@/lib/billing/paddle-webhook', async (orig) => ({
      ...(await orig<Record<string, unknown>>()),
      processPaddleTransaction: async (t: { id: string }) => {
        handled.push(t.id)
        return 'pack_granted'
      },
    }))
    return { handled }
  }

  // 왜: 남의 결제를 적립하면 그게 더 큰 사고다.
  it('그 유저의 결제만 본다 — 다른 워크스페이스 결제는 건드리지 않는다', async () => {
    vi.resetModules()
    const { handled } = mockDeps({
      paddleTxns: [
        { id: 'txn_mine', customer_id: 'ctm_1', billed_at: '2026-09-08T00:00:00Z', details: { totals: { total: '2900' } } },
      ],
      grantedIds: [],
    })
    const { POST } = await import('@/app/api/billing/reconcile-me/route')
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, recovered: 1 })
    expect(handled).toEqual(['txn_mine'])
    vi.resetModules()
  })

  // 왜: 이미 적립된 결제를 다시 처리하면 이중 적립이다(DB 제약이 막지만 여기서 먼저 거른다).
  it('이미 적립된 결제는 다시 처리하지 않는다', async () => {
    vi.resetModules()
    const { handled } = mockDeps({
      paddleTxns: [
        { id: 'txn_done', customer_id: 'ctm_1', billed_at: '2026-09-08T00:00:00Z', details: { totals: { total: '2900' } } },
      ],
      grantedIds: ['txn_done'],
    })
    const { POST } = await import('@/app/api/billing/reconcile-me/route')
    const res = await POST()
    expect(await res.json()).toMatchObject({ ok: true, recovered: 0 })
    expect(handled).toEqual([])
    vi.resetModules()
  })

  // 왜: Paddle 에 고객이 없으면(결제한 적 없음) 조회할 것이 없다. 빈손으로 끝내야 한다.
  it('Paddle 고객이 없는 워크스페이스는 조용히 0으로 끝난다', async () => {
    vi.resetModules()
    mockDeps({ customerId: null })
    const { POST } = await import('@/app/api/billing/reconcile-me/route')
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, recovered: 0 })
    vi.resetModules()
  })

  // 왜: 로그인 안 한 요청이 남의 결제를 뒤지면 안 된다.
  it('로그인하지 않으면 거부한다', async () => {
    vi.resetModules()
    mockDeps({ user: null })
    const { POST } = await import('@/app/api/billing/reconcile-me/route')
    const res = await POST()
    expect(res.status).toBe(401)
    vi.resetModules()
  })
})

describe('일일 대사 라우트', () => {
  // 왜: Cron 전용 경로다. 아무나 부르면 Paddle 호출이 낭비되고 남의 장부를 훑는다.
  it('CRON_SECRET 이 설정돼 있는데 헤더가 다르면 거부한다', async () => {
    vi.resetModules()
    vi.stubEnv('CRON_SECRET', 'secret-token')
    vi.doMock('@/lib/billing/paddle-api', () => ({ paddleRequest: async () => [] }))
    const { GET } = await import('@/app/api/cron/billing-reconcile/route')
    const res = await GET(new Request('https://x/api/cron/billing-reconcile') as never)
    expect(res.status).toBe(401)
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  // 왜: 조용함이 곧 정상. 전부 맞으면 디스코드에 아무것도 안 간다(주 1회 요약도 안 보낸다 — 오너 09-08).
  it('전부 맞으면 경보를 보내지 않는다', async () => {
    vi.resetModules()
    vi.stubEnv('CRON_SECRET', 'secret-token')
    const alert = vi.fn(async (_m: { level: string; title: string; body?: string }) => {})
    vi.doMock('@/lib/ops-alert', () => ({ sendOpsAlert: alert }))
    vi.doMock('@/lib/billing/paddle-api', () => ({
      paddleRequest: async () => [{ id: 'txn_a', customer_id: 'ctm_1', billed_at: '2026-09-07T10:00:00Z', details: { totals: { total: '2900' } } }],
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ in: () => ({ data: [{ ref_id: 'txn_a' }], error: null }) }) }) }) },
    }))
    const { GET } = await import('@/app/api/cron/billing-reconcile/route')
    const res = await GET(new Request('https://x/api/cron/billing-reconcile', { headers: { authorization: 'Bearer secret-token' } }) as never)
    expect(await res.json()).toMatchObject({ ok: true, missing: 0, extra: 0, matched: 1 })
    expect(alert).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  // 왜: 유저가 창을 닫았거나 구독 갱신처럼 아무도 안 보는 결제. 즉시 재조회가 못 잡는다.
  it('빠진 결제가 있으면 결제 번호와 함께 경보를 보내되 자동 적립은 하지 않는다', async () => {
    vi.resetModules()
    vi.stubEnv('CRON_SECRET', 'secret-token')
    const alert = vi.fn(async (_m: { level: string; title: string; body?: string }) => {})
    const processed: string[] = []
    vi.doMock('@/lib/ops-alert', () => ({ sendOpsAlert: alert }))
    vi.doMock('@/lib/billing/paddle-api', () => ({
      paddleRequest: async () => [
        { id: 'txn_a', customer_id: 'ctm_1', billed_at: '2026-09-07T10:00:00Z', details: { totals: { total: '2900' } } },
        { id: 'txn_lost', customer_id: 'ctm_2', billed_at: '2026-09-07T11:00:00Z', details: { totals: { total: '10900' } } },
      ],
    }))
    vi.doMock('@/lib/supabase/admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ in: () => ({ data: [{ ref_id: 'txn_a' }], error: null }) }) }) }) },
    }))
    vi.doMock('@/lib/billing/paddle-webhook', async (orig) => ({
      ...(await orig<Record<string, unknown>>()),
      processPaddleTransaction: async (t: { id: string }) => {
        processed.push(t.id)
        return 'pack_granted'
      },
    }))
    const { GET } = await import('@/app/api/cron/billing-reconcile/route')
    const res = await GET(new Request('https://x/api/cron/billing-reconcile', { headers: { authorization: 'Bearer secret-token' } }) as never)
    expect(await res.json()).toMatchObject({ ok: true, missing: 1 })
    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert.mock.calls[0][0].body).toContain('txn_lost')
    expect(processed).toEqual([])
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  // 왜: 잡이 조용히 죽으면 유실을 못 잡는 상태로 돌아간다.
  it('Paddle 이 응답하지 않으면 경보를 보내고 실패로 답한다', async () => {
    vi.resetModules()
    vi.stubEnv('CRON_SECRET', 'secret-token')
    const alert = vi.fn(async (_m: { level: string; title: string; body?: string }) => {})
    vi.doMock('@/lib/ops-alert', () => ({ sendOpsAlert: alert }))
    vi.doMock('@/lib/billing/paddle-api', () => ({
      paddleRequest: async () => {
        throw new Error('paddle down')
      },
    }))
    const { GET } = await import('@/app/api/cron/billing-reconcile/route')
    const res = await GET(new Request('https://x/api/cron/billing-reconcile', { headers: { authorization: 'Bearer secret-token' } }) as never)
    expect(res.status).toBe(500)
    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert.mock.calls[0][0]).toMatchObject({ level: 'error' })
    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
