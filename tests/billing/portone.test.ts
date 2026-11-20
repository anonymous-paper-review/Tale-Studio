// 국내 카드 결제(PortOne · KG이니시스)로 Take 팩을 살 때 결제창을 열지, Take 를 줄지, 결제 알림을 믿을지 정하는 규칙.
import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  decidePortOnePack,
  handlePortOneWebhook,
  newPortOnePaymentId,
  processPortOnePayment,
  type PortOneDeps,
  type PortOneOrder,
  type PortOnePayment,
} from '@/lib/billing/portone'

const PRICES = { mini: 39000, standard: null, pro: null, studio: null }
const NOW = new Date('2026-11-21T03:00:00Z')

function order(overrides: Partial<PortOneOrder> = {}): PortOneOrder {
  return { kind: 'pack', paymentId: 'tale-abc', workspaceId: 'ws-1', packId: 'mini', amountKrw: 39000, ...overrides } as PortOneOrder
}

function paid(overrides: Partial<PortOnePayment> = {}): PortOnePayment {
  return { status: 'PAID', amountTotal: 39000, amountCancelled: 0, currency: 'KRW', paidAt: '2026-11-21T02:59:00Z', ...overrides }
}

function makeDeps(input: { order?: PortOneOrder | null; payment?: PortOnePayment | null; granted?: boolean; plan?: string; balance?: number } = {}) {
  const grants: unknown[] = []
  const revokes: { amount: number; refId: string }[] = []
  const alerts: { title: string }[] = []
  const processed: string[] = []
  const seen = new Map<string, boolean>()
  const deps: PortOneDeps = {
    now: () => NOW,
    findOrder: vi.fn(async () => (input.order === undefined ? order() : input.order)),
    fetchPayment: vi.fn(async () => (input.payment === undefined ? paid() : input.payment)),
    async recordEvent({ id }) {
      if (!seen.has(id)) {
        seen.set(id, false)
        return 'new'
      }
      return seen.get(id) ? 'duplicate_processed' : 'duplicate_unprocessed'
    },
    async markProcessed(id) {
      seen.set(id, true)
      processed.push(id)
    },
    findWorkspace: vi.fn(async (id: string) => (id === 'ws-1' ? { id, plan: input.plan ?? 'free' } : null)),
    hasGrant: vi.fn(async () => input.granted ?? grants.length > 0),
    async grant(row) {
      grants.push(row)
    },
    async alert(a) {
      alerts.push(a)
    },
    setPlan: vi.fn(async () => {}),
    upsertSubscription: vi.fn(async () => {}),
    findGrantsForPayment: vi.fn(async () => (input.granted ? [{ id: 'grant-1', workspaceId: 'ws-1', delta: 50 }] : [])),
    revokedTotalForPayment: vi.fn(async () => revokes.reduce((sum, r) => sum + r.amount, 0)),
    async revoke(row) {
      revokes.push(row)
    },
    endSubscription: vi.fn(async () => {}),
    balance: vi.fn(async () => (input.balance ?? 1000) - revokes.reduce((sum, r) => sum + r.amount, 0)),
  }
  return { deps, grants, alerts, processed, revokes }
}

describe('결제창을 열기 전', () => {
  // 왜: 키가 없는 환경(로컬·아직 키를 안 넣은 배포)에서 버튼을 눌러 빈 결제창이 뜨면 안 된다. 정상 경로 고정의 짝.
  it('PortOne 키가 없으면 국내 카드 결제창을 열지 않는다', () => {
    const d = decidePortOnePack({ packId: 'mini', workspacePlan: 'free', packPurchasedBefore: false, configured: false, prices: PRICES })
    expect(d).toEqual({ ok: false, reason: 'portone_not_configured' })
  })

  // 왜: 원화 가격은 오너가 정한다. 아직 정하지 않은 팩을 임의 금액으로 청구하면 안 된다.
  it('원화 가격이 정해지지 않은 팩은 결제창을 열지 않는다', () => {
    const d = decidePortOnePack({ packId: 'standard', workspacePlan: 'p10', packPurchasedBefore: false, configured: true, prices: PRICES })
    expect(d).toEqual({ ok: false, reason: 'no_krw_price' })
  })

  // 왜: v4 충전 상한. 무료 워크스페이스는 Paddle 과 똑같이 팩을 한 번만 산다.
  it('무료 워크스페이스가 팩을 이미 샀으면 결제창을 열지 않는다', () => {
    const d = decidePortOnePack({ packId: 'mini', workspacePlan: 'free', packPurchasedBefore: true, configured: true, prices: PRICES })
    expect(d).toEqual({ ok: false, reason: 'free_pack_limit' })
  })

  // 왜: 정상 경로 고정. 결제창에 실리는 금액과 상품 이름은 서버의 가격표에서만 나온다.
  it('원화 가격이 있는 팩은 그 금액과 Take 수를 이름으로 결제창을 연다', () => {
    const d = decidePortOnePack({ packId: 'mini', workspacePlan: 'free', packPurchasedBefore: false, configured: true, prices: PRICES })
    expect(d).toEqual({ ok: true, packId: 'mini', amountKrw: 39000, orderName: 'Tale Studio Take 50' })
  })

  // 왜: 결제 번호는 서버가 만들어 기록한다. 같은 번호가 다시 나오면 두 결제가 한 주문으로 섞인다.
  it('결제 번호는 매번 새로 만든다', () => {
    const a = newPortOnePaymentId()
    const b = newPortOnePaymentId()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^tale-[0-9a-f-]{36}$/)
  })
})

describe('결제가 끝난 뒤', () => {
  // 왜: 정상 경로 고정. 팩 Take 는 Paddle 팩과 같이 12개월 동안 쓴다.
  it('PortOne 에 다시 물어 결제 완료이고 금액이 같으면 Take 를 주고 12개월 뒤 만료된다', async () => {
    const { deps, grants } = makeDeps()
    expect(await processPortOnePayment('tale-abc', deps)).toBe('pack_granted')
    expect(grants).toEqual([
      expect.objectContaining({
        workspaceId: 'ws-1',
        kind: 'grant_purchase',
        amount: 50,
        expiresAt: '2027-11-21T02:59:00.000Z',
        refKind: 'portone_payment',
        refId: 'tale-abc',
      }),
    ])
  })

  // 왜: 브라우저가 보낸 "결제 끝났다"는 믿지 않는다. 결제창을 닫거나 실패한 채 완료 주소를 직접 부르는 경우.
  it('결제가 완료 상태가 아니면 Take 를 주지 않는다', async () => {
    const { deps, grants, processed } = makeDeps({ payment: paid({ status: 'READY' }) })
    expect(await processPortOnePayment('tale-abc', deps)).toBe('not_paid')
    expect(grants).toEqual([])
    // 아직 끝난 게 아니다: 나중에 결제 완료 알림이 오면 다시 처리할 수 있어야 한다.
    expect(processed).toEqual([])
  })

  // 왜: 결제창 금액을 브라우저에서 바꿔 싸게 결제하는 경우. 돈과 Take 가 어긋나면 사람이 봐야 한다.
  it('결제 금액이 가격표와 다르면 Take 를 주지 않고 운영팀에 알린다', async () => {
    const { deps, grants, alerts } = makeDeps({ payment: paid({ amountTotal: 100 }) })
    expect(await processPortOnePayment('tale-abc', deps)).toBe('amount_mismatch')
    expect(grants).toEqual([])
    expect(alerts).toHaveLength(1)
  })

  // 왜: 원화가 아닌 통화로 같은 숫자가 결제되면 금액이 맞아 보여도 다른 돈이다.
  it('원화가 아닌 결제는 Take 를 주지 않고 운영팀에 알린다', async () => {
    const { deps, grants, alerts } = makeDeps({ payment: paid({ currency: 'USD' }) })
    expect(await processPortOnePayment('tale-abc', deps)).toBe('amount_mismatch')
    expect(grants).toEqual([])
    expect(alerts).toHaveLength(1)
  })

  // 왜: 우리가 결제창을 연 적 없는 번호(다른 서비스의 결제·지어낸 번호)로 Take 를 받으려는 경우.
  it('우리가 만든 적 없는 결제 번호는 Take 를 주지 않는다', async () => {
    const { deps, grants } = makeDeps({ order: null })
    expect(await processPortOnePayment('tale-zzz', deps)).toBe('unknown_order')
    expect(grants).toEqual([])
    expect(deps.fetchPayment).not.toHaveBeenCalled()
  })

  // 왜: 완료 화면의 확인과 결제 알림이 거의 동시에 같은 결제를 처리하는 경우.
  it('같은 결제를 두 번 확인해도 Take 는 한 번만 준다', async () => {
    const { deps, grants } = makeDeps()
    await processPortOnePayment('tale-abc', deps)
    expect(await processPortOnePayment('tale-abc', deps)).toBe('duplicate')
    expect(grants).toHaveLength(1)
  })

  // 왜: 첫 처리가 기록만 남기고 도중에 죽은 뒤 다시 들어오는 경우. 이미 준 Take 를 또 주면 안 된다.
  it('이미 Take 를 준 결제는 다시 주지 않는다', async () => {
    const { deps, grants } = makeDeps({ granted: true })
    expect(await processPortOnePayment('tale-abc', deps)).toBe('already_granted')
    expect(grants).toEqual([])
  })

  // 왜: 결제 뒤 워크스페이스가 지워진 경우. 돈은 받았으니 사람이 확인해야 한다.
  it('워크스페이스를 찾을 수 없으면 Take 를 주지 않고 운영팀에 알린다', async () => {
    const { deps, grants, alerts } = makeDeps({ order: order({ workspaceId: 'ws-gone' }) })
    expect(await processPortOnePayment('tale-abc', deps)).toBe('workspace_not_found')
    expect(grants).toEqual([])
    expect(alerts).toHaveLength(1)
  })
})

describe('결제 알림(웹훅)', () => {
  const SECRET = `whsec_${Buffer.from('portone-test-secret').toString('base64')}`

  function signed(body: string, opts: { secret?: string; timestamp?: number } = {}) {
    const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000))
    const key = Buffer.from((opts.secret ?? SECRET).replace(/^whsec_/, ''), 'base64')
    const sig = createHmac('sha256', key).update(`msg_1.${ts}.${body}`).digest('base64')
    return { 'webhook-id': 'msg_1', 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` }
  }

  const paidBody = JSON.stringify({ type: 'Transaction.Paid', timestamp: '2026-11-21T02:59:00Z', data: { paymentId: 'tale-abc', storeId: 'store-1' } })

  // 왜: 누구나 우리 알림 주소로 "결제 완료"를 보낼 수 있다. 서명이 PortOne 것이 아니면 아무것도 하지 않는다.
  it('서명이 맞지 않는 결제 알림은 거절한다', async () => {
    const { deps, grants } = makeDeps()
    const other = `whsec_${Buffer.from('someone-else').toString('base64')}`
    const out = await handlePortOneWebhook({ rawBody: paidBody, headers: signed(paidBody, { secret: other }), secret: SECRET, deps })
    expect(out.status).toBe(401)
    expect(grants).toEqual([])
  })

  // 왜: 정상 경로 고정. 사용자가 결제 뒤 창을 닫아 완료 화면이 안 불려도 알림으로 Take 가 들어온다.
  it('서명이 맞는 결제 완료 알림이 오면 PortOne 에 다시 물어 Take 를 준다', async () => {
    const { deps, grants } = makeDeps()
    const out = await handlePortOneWebhook({ rawBody: paidBody, headers: signed(paidBody), secret: SECRET, deps })
    expect(out).toEqual({ status: 200, body: { ok: true, result: 'pack_granted' } })
    expect(deps.fetchPayment).toHaveBeenCalledWith('tale-abc')
    expect(grants).toHaveLength(1)
  })

  function cancelBody(type = 'Transaction.Cancelled') {
    return JSON.stringify({ type, timestamp: '2026-11-22T00:00:00Z', data: { paymentId: 'tale-abc', cancellationId: 'c-1' } })
  }

  // 왜: 오너 11/19 "결제 취소인데 왜 회수가 안돼?". 돈을 돌려줬으면 그 돈으로 준 Take 도 돌려받는다.
  it('결제가 전액 취소되면 그 결제로 준 Take 를 모두 회수한다', async () => {
    const { deps, revokes } = makeDeps({ payment: paid({ status: 'CANCELLED', amountCancelled: 39000 }), granted: true })
    const body = cancelBody()
    const out = await handlePortOneWebhook({ rawBody: body, headers: signed(body), secret: SECRET, deps })
    expect(out).toEqual({ status: 200, body: { ok: true, result: 'revoked' } })
    expect(revokes).toEqual([expect.objectContaining({ workspaceId: 'ws-1', grantId: 'grant-1', amount: 50 })])
  })

  // 왜: 일부만 환불하면 환불한 몫만큼만 돌려받는다(Paddle 환불과 같은 규칙).
  it('결제가 일부 취소되면 취소된 금액 비율만큼 Take 를 회수한다', async () => {
    const { deps, revokes } = makeDeps({ payment: paid({ status: 'PARTIAL_CANCELLED', amountCancelled: 19500 }), granted: true })
    const body = cancelBody('Transaction.PartialCancelled')
    await handlePortOneWebhook({ rawBody: body, headers: signed(body), secret: SECRET, deps })
    expect(revokes).toEqual([expect.objectContaining({ amount: 25 })])
  })

  // 왜: PortOne 이 같은 취소 알림을 다시 보내거나, 일부 취소 뒤 나머지를 취소하는 경우. 준 것보다 많이 회수하면 안 된다.
  it('같은 취소를 두 번 받아도 준 Take 보다 많이 회수하지 않는다', async () => {
    const { deps, revokes } = makeDeps({ payment: paid({ status: 'CANCELLED', amountCancelled: 39000 }), granted: true })
    const body = cancelBody()
    await handlePortOneWebhook({ rawBody: body, headers: signed(body), secret: SECRET, deps })
    const again = await handlePortOneWebhook({ rawBody: body, headers: signed(body), secret: SECRET, deps })
    expect(again.body.result).toBe('already_revoked')
    expect(revokes).toHaveLength(1)
  })

  // 왜: 오너 11/19 — 환불 전에 Take 를 써 버린 경우(카드사 직접 취소 · 예외 환불). 잔액을 마이너스로 만들지 않는다.
  it('이미 써 버려 잔액이 모자라면 남은 만큼만 회수하고 모자란 만큼은 운영팀에 알린다', async () => {
    const { deps, revokes, alerts } = makeDeps({ payment: paid({ status: 'CANCELLED', amountCancelled: 39000 }), granted: true, balance: 20 })
    const body = cancelBody()
    await handlePortOneWebhook({ rawBody: body, headers: signed(body), secret: SECRET, deps })
    expect(revokes).toEqual([expect.objectContaining({ amount: 20 })])
    expect(alerts.some((a) => a.title.includes('모자'))).toBe(true)
  })
})
