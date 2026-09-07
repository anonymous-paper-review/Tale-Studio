// Paddle 결제 알림이 Take와 플랜의 유일한 진실이다 — 웹훅 핸들러의 약속 (.claude/docs/2026-09-07/paddle-promises.md §P1 · §P11).
//   DB 는 deps 로 주입하고 여기서는 메모리 장부로 대신한다. 실제 Supabase 구현은 라우트(route.ts)가 붙인다.
import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  handlePaddleWebhook,
  verifyPaddleSignature,
  type PaddleWebhookDeps,
} from '@/lib/billing/paddle-webhook'

const SECRET = 'pdl_ntfset_test_secret'
const WS = 'ws-1'
const NOW = new Date('2026-09-15T12:00:00.000Z')

process.env.NEXT_PUBLIC_PADDLE_PRICE_PLAN_S5 = 'pri_s5'
process.env.NEXT_PUBLIC_PADDLE_PRICE_PLAN_S10 = 'pri_s10'
process.env.NEXT_PUBLIC_PADDLE_PRICE_PACK_MINI = 'pri_mini'

function sign(body: string, ts = Math.floor(NOW.getTime() / 1000)): string {
  const h1 = createHmac('sha256', SECRET).update(`${ts}:${body}`).digest('hex')
  return `ts=${ts};h1=${h1}`
}

interface LedgerRow {
  id: string
  workspaceId: string
  kind: string
  delta: number
  expiresAt: string | null
  refKind: string | null
  refId: string | null
  reason: string | null
}

function makeDeps(init?: { plan?: string; ledger?: LedgerRow[]; transactionTotals?: Record<string, number> }) {
  const state = {
    events: new Map<string, { type: string; payload: unknown; processed: boolean }>(),
    workspace: { id: WS, plan: init?.plan ?? 'free' },
    subscription: null as null | { morSubscriptionId: string; plan: string; status: string; currentPeriodEnd: string | null },
    ledger: [...(init?.ledger ?? [])],
    alerts: [] as { title: string; level: string }[],
    transactionTotals: init?.transactionTotals ?? {},
  }
  let seq = 0
  const deps: PaddleWebhookDeps = {
    now: () => NOW,
    recordEvent: async ({ id, type, payload }) => {
      const existing = state.events.get(id)
      if (existing) return existing.processed ? 'duplicate_processed' : 'duplicate_unprocessed'
      state.events.set(id, { type, payload, processed: false })
      return 'new'
    },
    markProcessed: async (id) => {
      const e = state.events.get(id)
      if (e) e.processed = true
    },
    findWorkspace: async (id) => (id === WS ? { ...state.workspace } : null),
    findWorkspaceBySubscription: async (subId) =>
      state.subscription?.morSubscriptionId === subId ? { ...state.workspace } : null,
    setPlan: async (_id, plan) => {
      state.workspace.plan = plan
    },
    upsertSubscription: async (row) => {
      state.subscription = {
        morSubscriptionId: row.morSubscriptionId,
        plan: row.plan,
        status: row.status,
        currentPeriodEnd: row.currentPeriodEnd,
      }
    },
    hasGrant: async (refKind, refId) => state.ledger.some((r) => r.delta > 0 && r.refKind === refKind && r.refId === refId),
    grant: async (input) => {
      state.ledger.push({ id: `g${++seq}`, ...input, delta: input.amount })
    },
    hasPackPurchase: async (wsId) => state.ledger.some((r) => r.workspaceId === wsId && r.kind === 'grant_purchase'),
    findGrantsForTransaction: async (txnId) =>
      state.ledger
        .filter((r) => r.refKind === 'paddle_transaction' && r.refId === txnId && r.kind.startsWith('grant_'))
        .map((r) => ({ id: r.id, workspaceId: r.workspaceId, kind: r.kind, delta: r.delta })),
    findTransactionTotal: async (txnId) => state.transactionTotals[txnId] ?? null,
    hasRevoke: async (adjId) => state.ledger.some((r) => r.kind === 'refund_revoke' && r.refId === adjId),
    revokedTotalForTransaction: async (txnId) =>
      state.ledger.filter((r) => r.kind === 'refund_revoke' && r.reason?.includes(txnId)).reduce((s, r) => s - r.delta, 0),
    revoke: async (input) => {
      state.ledger.push({
        id: `r${++seq}`,
        workspaceId: input.workspaceId,
        kind: 'refund_revoke',
        delta: -input.amount,
        expiresAt: null,
        refKind: 'paddle_adjustment',
        refId: input.refId,
        reason: input.reason,
      })
    },
    alert: async (msg) => {
      state.alerts.push({ title: msg.title, level: msg.level })
    },
  }
  return { deps, state, balance: () => state.ledger.reduce((s, r) => s + r.delta, 0) }
}

const txnCompleted = (over: Record<string, unknown> = {}, custom: Record<string, unknown> | null = { workspace_id: WS }) => ({
  event_id: 'evt_txn_1',
  event_type: 'transaction.completed',
  occurred_at: NOW.toISOString(),
  data: {
    id: 'txn_1',
    status: 'completed',
    origin: 'web',
    subscription_id: null,
    custom_data: custom,
    items: [{ price: { id: 'pri_mini' }, quantity: 1 }],
    details: { totals: { total: '2900', currency_code: 'USD' } },
    billing_period: null,
    billed_at: NOW.toISOString(),
    ...over,
  },
})

const subscriptionTxn = (eventId: string, txnId: string, origin: string, priceId = 'pri_s5') => ({
  event_id: eventId,
  event_type: 'transaction.completed',
  occurred_at: NOW.toISOString(),
  data: {
    id: txnId,
    status: 'completed',
    origin,
    subscription_id: 'sub_1',
    custom_data: { workspace_id: WS },
    items: [{ price: { id: priceId }, quantity: 1 }],
    details: { totals: { total: '6000', currency_code: 'USD' } },
    billing_period: { starts_at: '2026-09-15T12:00:00.000Z', ends_at: '2026-10-15T12:00:00.000Z' },
    billed_at: NOW.toISOString(),
  },
})

const subscriptionEvent = (eventId: string, type: string, over: Record<string, unknown> = {}) => ({
  event_id: eventId,
  event_type: type,
  occurred_at: NOW.toISOString(),
  data: {
    id: 'sub_1',
    status: 'active',
    custom_data: { workspace_id: WS },
    items: [{ price: { id: 'pri_s5' } }],
    current_billing_period: { starts_at: '2026-09-15T12:00:00.000Z', ends_at: '2026-10-15T12:00:00.000Z' },
    scheduled_change: null,
    ...over,
  },
})

const adjustmentEvent = (eventId: string, over: Record<string, unknown> = {}) => ({
  event_id: eventId,
  event_type: 'adjustment.updated',
  occurred_at: NOW.toISOString(),
  data: {
    id: 'adj_1',
    action: 'refund',
    status: 'approved',
    transaction_id: 'txn_1',
    totals: { total: '2900', currency_code: 'USD' },
    ...over,
  },
})

async function send(deps: PaddleWebhookDeps, event: unknown, header?: string) {
  const body = JSON.stringify(event)
  return handlePaddleWebhook({ rawBody: body, signatureHeader: header ?? sign(body), secret: SECRET, deps })
}

describe('받기', () => {
  it('Paddle이 보낸 것이 아니면(서명이 틀리면) 받지 않고 장부에 아무것도 넣지 않는다', async () => {
    const { deps, state, balance } = makeDeps()
    const body = JSON.stringify(txnCompleted())
    const forged = `ts=${Math.floor(NOW.getTime() / 1000)};h1=${'0'.repeat(64)}`
    const res = await handlePaddleWebhook({ rawBody: body, signatureHeader: forged, secret: SECRET, deps })
    expect(res.status).toBe(401)
    expect(balance()).toBe(0)
    expect(state.events.size).toBe(0)
  })

  it('서명이 맞아도 5분 넘게 지난 알림은 받지 않는다(재전송 공격 방어)', () => {
    const body = '{"a":1}'
    const oldTs = Math.floor(NOW.getTime() / 1000) - 6 * 60
    expect(verifyPaddleSignature({ rawBody: body, header: sign(body, oldTs), secret: SECRET, nowMs: NOW.getTime() })).toBe(false)
    expect(verifyPaddleSignature({ rawBody: body, header: sign(body), secret: SECRET, nowMs: NOW.getTime() })).toBe(true)
  })

  it('같은 알림이 몇 번 와도 Take는 한 번만 들어가고 플랜도 한 번만 바뀐다', async () => {
    const { deps, balance } = makeDeps()
    await send(deps, txnCompleted())
    await send(deps, txnCompleted())
    await send(deps, txnCompleted())
    expect(balance()).toBe(50)
  })

  it('받은 알림 원문은 처리 성공·실패와 무관하게 전부 남는다', async () => {
    const { deps, state } = makeDeps()
    deps.grant = async () => {
      throw new Error('db down')
    }
    const res = await send(deps, txnCompleted())
    expect(res.status).toBe(500)
    expect(state.events.get('evt_txn_1')?.payload).toBeTruthy()
    expect(state.events.get('evt_txn_1')?.processed).toBe(false)
  })

  it('알림 처리 중 오류가 나면 Paddle에 "실패"로 답해 다시 보내게 하고, 재전송에서 처리되면 "성공"이다', async () => {
    const { deps, balance } = makeDeps()
    const original = deps.grant
    let failOnce = true
    deps.grant = async (input) => {
      if (failOnce) {
        failOnce = false
        throw new Error('transient')
      }
      return original(input)
    }
    expect((await send(deps, txnCompleted())).status).toBe(500)
    expect((await send(deps, txnCompleted())).status).toBe(200)
    expect(balance()).toBe(50)
  })

  it('알림에 어느 워크스페이스 결제인지 표시가 없으면 넣지 않고 원문만 남긴다', async () => {
    const { deps, state, balance } = makeDeps()
    const res = await send(deps, txnCompleted({}, null))
    expect(res.status).toBe(200)
    expect(balance()).toBe(0)
    expect(state.events.get('evt_txn_1')?.processed).toBe(true)
    expect(state.alerts.some((a) => a.level === 'error')).toBe(true)
  })

  it('알림에 적힌 상품이 우리 상품 목록에 없으면 넣지 않고 원문만 남긴다', async () => {
    const { deps, state, balance } = makeDeps()
    const res = await send(deps, txnCompleted({ items: [{ price: { id: 'pri_unknown' }, quantity: 1 }] }))
    expect(res.status).toBe(200)
    expect(balance()).toBe(0)
    expect(state.events.get('evt_txn_1')?.processed).toBe(true)
    expect(state.alerts.some((a) => a.level === 'error')).toBe(true)
  })
})

describe('팩(충전)', () => {
  it('팩 결제 알림이 오면 그 팩의 Take가 결제일부터 12개월 유효로 들어간다', async () => {
    const { deps, state } = makeDeps()
    await send(deps, txnCompleted())
    const row = state.ledger[0]
    expect(row.kind).toBe('grant_purchase')
    expect(row.delta).toBe(50)
    expect(row.expiresAt).toBe('2027-09-15T12:00:00.000Z')
    expect(row.refId).toBe('txn_1')
  })

  it('무료 워크스페이스에 이미 충전 기록이 있는데 팩 결제 알림이 또 오면 Take는 들어가되 경보가 울린다', async () => {
    const { deps, state, balance } = makeDeps({
      plan: 'free',
      ledger: [{ id: 'old', workspaceId: WS, kind: 'grant_purchase', delta: 50, expiresAt: null, refKind: 'paddle_transaction', refId: 'txn_0', reason: null }],
    })
    await send(deps, txnCompleted())
    expect(balance()).toBe(100)
    expect(state.alerts.some((a) => a.level === 'warn')).toBe(true)
  })
})

describe('구독', () => {
  it('구독 첫 결제 알림이 오면 플랜이 그 플랜으로 바뀌고 포함 Take가 결제 주기 끝까지 유효로 들어간다', async () => {
    const { deps, state } = makeDeps()
    await send(deps, subscriptionTxn('evt_s1', 'txn_s1', 'web'))
    expect(state.workspace.plan).toBe('s5')
    expect(state.subscription).toMatchObject({ morSubscriptionId: 'sub_1', plan: 's5', status: 'active', currentPeriodEnd: '2026-10-15T12:00:00.000Z' })
    const row = state.ledger[0]
    expect(row).toMatchObject({ kind: 'grant_plan', delta: 60, expiresAt: '2026-10-15T12:00:00.000Z', refId: 'txn_s1' })
  })

  it('갱신 결제 알림이 오면 그 주기 포함 Take가 다시 들어간다', async () => {
    const { deps, balance } = makeDeps()
    await send(deps, subscriptionTxn('evt_s1', 'txn_s1', 'web'))
    await send(deps, subscriptionTxn('evt_s2', 'txn_s2', 'subscription_recurring'))
    expect(balance()).toBe(120)
  })

  it('구독을 취소해도 낸 기간이 끝날 때까지는 플랜과 Take가 유지되고, 끝나면 무료로 돌아간다', async () => {
    const { deps, state, balance } = makeDeps()
    await send(deps, subscriptionTxn('evt_s1', 'txn_s1', 'web'))
    await send(deps, subscriptionEvent('evt_u1', 'subscription.updated', { scheduled_change: { action: 'cancel', effective_at: '2026-10-15T12:00:00.000Z' } }))
    expect(state.workspace.plan).toBe('s5')
    expect(state.subscription?.status).toBe('cancel_scheduled')
    expect(balance()).toBe(60)
    await send(deps, subscriptionEvent('evt_c1', 'subscription.canceled', { status: 'canceled', scheduled_change: null }))
    expect(state.workspace.plan).toBe('free')
    expect(state.subscription?.status).toBe('canceled')
  })

  it('갱신 결제가 실패하면 그 즉시 무료 플랜으로 돌아가고 그 주기 Take는 들어가지 않으며, 재시도가 성공하면 다시 그 플랜으로 돌아가고 Take가 들어간다', async () => {
    const { deps, state, balance } = makeDeps()
    await send(deps, subscriptionTxn('evt_s1', 'txn_s1', 'web'))
    await send(deps, {
      event_id: 'evt_pf',
      event_type: 'transaction.payment_failed',
      occurred_at: NOW.toISOString(),
      data: { id: 'txn_s2', subscription_id: 'sub_1', custom_data: { workspace_id: WS }, origin: 'subscription_recurring' },
    })
    await send(deps, subscriptionEvent('evt_pd', 'subscription.past_due', { status: 'past_due' }))
    expect(state.workspace.plan).toBe('free')
    expect(state.subscription?.status).toBe('past_due')
    expect(balance()).toBe(60)
    expect(state.alerts.some((a) => a.title.includes('갱신 결제 실패'))).toBe(true)
    await send(deps, subscriptionTxn('evt_s2', 'txn_s2', 'subscription_recurring'))
    expect(state.workspace.plan).toBe('s5')
    expect(state.subscription?.status).toBe('active')
    expect(balance()).toBe(120)
  })

  it('플랜이 바뀌었다는 알림이 오면 플랜 표시를 바꾼다. 이미 들어간 Take와 충전 Take는 건드리지 않는다', async () => {
    const { deps, state, balance } = makeDeps({
      ledger: [{ id: 'p', workspaceId: WS, kind: 'grant_purchase', delta: 50, expiresAt: null, refKind: 'paddle_transaction', refId: 'txn_0', reason: null }],
    })
    await send(deps, subscriptionTxn('evt_s1', 'txn_s1', 'web'))
    await send(deps, subscriptionEvent('evt_u2', 'subscription.updated', { items: [{ price: { id: 'pri_s10' } }] }))
    expect(state.workspace.plan).toBe('s10')
    expect(balance()).toBe(110)
  })
})

describe('환불', () => {
  it('환불 알림이 오면 그 결제로 들어간 Take를 회수한다. 이미 써서 모자라면 잔액이 음수가 된다', async () => {
    const { deps, state, balance } = makeDeps({ transactionTotals: { txn_1: 2900 } })
    await send(deps, txnCompleted())
    state.ledger.push({ id: 'h', workspaceId: WS, kind: 'hold', delta: -12, expiresAt: null, refKind: 'generation_job', refId: 'job', reason: null })
    await send(deps, adjustmentEvent('evt_adj_1'))
    expect(balance()).toBe(-12)
    expect(state.ledger.at(-1)).toMatchObject({ kind: 'refund_revoke', delta: -50, refId: 'adj_1' })
  })

  it('부분 환불이면 환불 금액 비율만큼 회수한다', async () => {
    const { deps, balance } = makeDeps({ transactionTotals: { txn_1: 2900 } })
    await send(deps, txnCompleted())
    await send(deps, adjustmentEvent('evt_adj_half', { id: 'adj_half', totals: { total: '1450', currency_code: 'USD' } }))
    expect(balance()).toBe(25)
  })

  it('같은 환불 알림이 두 번 와도 회수는 한 번이다', async () => {
    const { deps, balance } = makeDeps({ transactionTotals: { txn_1: 2900 } })
    await send(deps, txnCompleted())
    await send(deps, adjustmentEvent('evt_adj_c', { event_id: 'evt_adj_c' }))
    await send(deps, { ...adjustmentEvent('evt_adj_u'), event_type: 'adjustment.updated' })
    expect(balance()).toBe(0)
  })

  it('아직 승인되지 않은 환불 요청은 회수하지 않는다', async () => {
    const { deps, balance } = makeDeps({ transactionTotals: { txn_1: 2900 } })
    await send(deps, txnCompleted())
    await send(deps, adjustmentEvent('evt_adj_p', { status: 'pending_approval' }))
    expect(balance()).toBe(50)
  })

  it('부분 환불이 여러 번 와도 회수 합은 그 결제로 들어간 양을 넘지 않는다', async () => {
    const { deps, balance } = makeDeps({ transactionTotals: { txn_1: 2900 } })
    await send(deps, txnCompleted())
    await send(deps, adjustmentEvent('evt_a1', { id: 'adj_a1', totals: { total: '1450', currency_code: 'USD' } }))
    await send(deps, adjustmentEvent('evt_a2', { id: 'adj_a2', totals: { total: '1450', currency_code: 'USD' } }))
    await send(deps, adjustmentEvent('evt_a3', { id: 'adj_a3', totals: { total: '1450', currency_code: 'USD' } }))
    expect(balance()).toBe(0)
  })

  it('카드사 분쟁(차지백) 알림도 환불과 똑같이 처리한다', async () => {
    const { deps, balance } = makeDeps({ transactionTotals: { txn_1: 2900 } })
    await send(deps, txnCompleted())
    await send(deps, adjustmentEvent('evt_cb', { id: 'adj_cb', action: 'chargeback' }))
    expect(balance()).toBe(0)
  })
})

describe('경보 (P11)', () => {
  it('처리 실패·워크스페이스 없음·상품 매핑 없음·갱신 결제 실패는 경보로 간다', async () => {
    const { deps, state } = makeDeps()
    await send(deps, txnCompleted({}, null))
    await send(deps, { ...txnCompleted({ id: 'txn_2', items: [{ price: { id: 'pri_nope' }, quantity: 1 }] }), event_id: 'evt_txn_2' })
    await send(deps, { event_id: 'evt_pf2', event_type: 'transaction.payment_failed', occurred_at: NOW.toISOString(), data: { id: 'txn_3', subscription_id: 'sub_1', custom_data: { workspace_id: WS } } })
    deps.grant = async () => {
      throw new Error('boom')
    }
    await send(deps, { ...txnCompleted({ id: 'txn_4' }), event_id: 'evt_txn_4' })
    expect(state.alerts.map((a) => a.level)).toEqual(['error', 'error', 'warn', 'error'])
  })

  it('알 수 없는 종류의 알림은 원문만 남기고 성공으로 답한다', async () => {
    const { deps, state } = makeDeps()
    const res = await send(deps, { event_id: 'evt_x', event_type: 'product.updated', occurred_at: NOW.toISOString(), data: { id: 'pro_1' } })
    expect(res.status).toBe(200)
    expect(state.events.get('evt_x')?.processed).toBe(true)
    expect(state.alerts).toEqual([])
  })
})

describe('디스코드 전송', () => {
  it('경보 주소가 없으면 보내지 않고, 있으면 그 주소로 한 번 보낸다', async () => {
    const { sendOpsAlert } = await import('@/lib/ops-alert')
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DISCORD_ALERT_WEBHOOK_URL', '')
    await sendOpsAlert({ title: 't', body: 'b', level: 'error' })
    expect(fetchMock).not.toHaveBeenCalled()
    vi.stubEnv('DISCORD_ALERT_WEBHOOK_URL', 'https://discord.com/api/webhooks/x/y')
    await sendOpsAlert({ title: 't', body: 'b', level: 'error' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://discord.com/api/webhooks/x/y')
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
})
