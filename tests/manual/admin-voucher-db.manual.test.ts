// 관리자가 등록 고객 줄에서 [저장]·[해지]를 누르면 바우처 Take와 계정 요금제가 정해진 규칙대로 바뀐다. 개발 DB에서 돌리고 전부 되돌린다.
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { takeBreakdown, type LedgerRow } from '@/lib/billing/account-summary'

const connectionString = process.env.ADMIN_VOUCHER_TEST_DATABASE_URL
if (!connectionString || !process.env.ADMIN_VOUCHER_TEST_CA) throw new Error('Run node scripts/test-admin-voucher-dev-db.mjs')
const client = new Client({ connectionString, ssl: { ca: process.env.ADMIN_VOUCHER_TEST_CA, rejectUnauthorized: true }, connectionTimeoutMillis: 20000 })
const MIGRATION = 'supabase/migrations/20261122041500_admin_voucher_save_moves_takes.sql'
const CODE = 'ADMINTEST0001'
const DAY = 86_400_000
const query = (sql: string, values: unknown[] = []) => client.query(sql, values)
const future = (days: number) => new Date(Date.now() + days * DAY).toISOString()
let a: { id: string; owner_id: string }
let b: { id: string; owner_id: string }
let start: number

beforeAll(async () => {
  await client.connect()
  await query('begin')
  await query("set local statement_timeout = '20s'")
  // 이번 변경 전 함수로 돌려 보려면 --baseline. 파일의 바깥 begin/commit 은 검사 트랜잭션을 끝내면 안 된다.
  if (process.env.ADMIN_VOUCHER_TEST_BASELINE !== 'true') {
    await query(readFileSync(MIGRATION, 'utf8').replace(/^(?:begin|commit);\s*$/gim, ''))
  }
  const pair = (await query(`
    select w.id, w.owner_id from public.workspaces w
     where w.owner_id is not null
       and not exists (select 1 from public.subscriptions s where s.workspace_id = w.id)
       and not exists (select 1 from public.voucher_redemptions r where r.redeemed_workspace_id = w.id)
     order by w.created_at limit 2`)).rows
  if (pair.length < 2) throw new Error('need two workspaces without subscriptions or vouchers on development DB')
  ;[a, b] = pair
  await query("update public.workspaces set plan = 'free' where id = any($1::uuid[])", [[a.id, b.id]])
  await query(`insert into public.vouchers (code, plan, note, max_uses, duration_days, active)
    values ($1, 's2', 'rollback test', 2, 30, true)`, [CODE])
  start = await balance(a.id)
  await query('savepoint fixture_start')
}, 60000)
beforeEach(async () => { await query('rollback to savepoint fixture_start') })
afterAll(async () => {
  await query('rollback').finally(() => client.end())
})

async function balance(workspace: string) {
  const rows = (await query('select * from public.take_ledger where workspace_id = $1', [workspace])).rows.map((r) => ({
    ...r, expires_at: r.expires_at?.toISOString() ?? null, created_at: r.created_at.toISOString(),
  })) as LedgerRow[]
  return takeBreakdown(rows).total
}
async function plan(workspace: string) {
  return (await query('select plan from public.workspaces where id = $1', [workspace])).rows[0].plan as string
}
async function ledgerCount(workspace: string) {
  return (await query('select count(*)::int as n from public.take_ledger where workspace_id = $1', [workspace])).rows[0].n as number
}
/** 아직 만료되지 않고 남은 게 있는 이 등록의 바우처 적립 — 남은 수와 기한. */
async function voucherLots(redemption: string) {
  const rows = (await query(`
    select g.delta + coalesce(sum(c.delta), 0) as remaining, g.expires_at
      from public.take_ledger g left join public.take_ledger c on c.grant_id = g.id
     where g.kind = 'grant_plan' and g.expires_at > now()
       and ((g.ref_kind = 'voucher_redemption' and g.ref_id = $1)
         or (g.ref_kind = 'voucher_admin_plan' and g.ref_id like $1 || ':%'))
     group by g.id, g.delta, g.expires_at
    having g.delta + coalesce(sum(c.delta), 0) > 0
     order by g.expires_at`, [redemption])).rows
  return rows.map((r) => ({ remaining: Number(r.remaining), expiresAt: r.expires_at.toISOString() }))
}
async function redeem(ws: { id: string; owner_id: string }, expiresAt = "now() + interval '30 days'") {
  const result = (await query(`select public.redeem_voucher($1, $2, $3, 's2', 30, ${expiresAt}) as r`, [CODE, ws.id, ws.owner_id])).rows[0].r
  const row = (await query('select id from public.voucher_redemptions where code = $1 and redeemed_workspace_id = $2', [CODE, ws.id])).rows[0]
  return { result, redemption: row?.id as string }
}
async function firstGrant(redemption: string) {
  return (await query("select id from public.take_ledger where ref_kind = 'voucher_redemption' and ref_id = $1", [redemption])).rows[0].id as string
}
/** 이 등록의 첫 적립에서 n개를 영상 생성에 쓴다. */
async function spend(redemption: string, n: number) {
  await query(`insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason)
    values ($1, $2, 'consume', $3, 'admin_voucher_test', gen_random_uuid()::text, 'rollback test')`, [a.id, -n, await firstGrant(redemption)])
}
async function save(redemption: string, tier: string, endsAt: string) {
  return (await query('select public.admin_update_voucher_redemption($1, $2, $3::timestamptz, false) as r', [redemption, tier, endsAt])).rows[0].r
}
async function subscribe(workspace: string) {
  await query(`insert into public.subscriptions (workspace_id, mor_subscription_id, plan, status)
    values ($1, 'sub_admin_voucher_test', 'p10', 'active')`, [workspace])
  await query("update public.workspaces set plan = 'p10' where id = $1", [workspace])
}

describe('바우처 등록 (정상 경로 고정)', () => {
  // 왜: 관리자 화면의 모든 조정은 이 등록 결과에서 시작한다.
  it('코드를 등록하면 요금제가 바우처 티어가 되고 그 티어 한 달 치 Take가 들어온다', async () => {
    const { result, redemption } = await redeem(a)
    expect(result).toEqual({ plan: 's2', takes: 30, status: 'ok' })
    expect(await plan(a.id)).toBe('s2')
    expect((await query('select plan from public.voucher_redemptions where id = $1', [redemption])).rows[0].plan).toBe('s2')
    expect(await balance(a.id) - start).toBe(30)
  })
  // 왜: 관리자가 [중지]한 코드를 퍼진 링크로 계속 등록하면 중지가 의미 없다.
  it('관리자가 중지한 코드는 등록 자리가 남아도 새 등록을 거절한다', async () => {
    await redeem(a)
    await query('update public.vouchers set active = false where code = $1', [CODE])
    expect((await redeem(b)).result).toEqual({ status: 'invalid' })
  })
})

describe('관리자 [저장] — 종료일만 바꿀 때', () => {
  // 왜: 체험 기간을 늘려 줄 때 Take까지 다시 채우면 기간 연장이 충전이 된다(오너 2026-11-22 B안).
  it('같은 티어로 종료일만 늘려 저장하면 남은 바우처 Take 수는 그대로 두고 쓸 수 있는 기한만 새 종료일로 옮긴다', async () => {
    const { redemption } = await redeem(a)
    await spend(redemption, 10)
    const endsAt = future(45)
    expect(await save(redemption, 's2', endsAt)).toEqual({ status: 'updated', moved_takes: 20, revoked_takes: 0, granted_takes: 0 })
    expect(await balance(a.id) - start).toBe(20)
    expect(await voucherLots(redemption)).toEqual([{ remaining: 20, expiresAt: endsAt }])
    expect(await plan(a.id)).toBe('s2')
  })
  // 왜: 기간을 줄이는 저장이 오히려 Take를 채워 주면 안 된다.
  it('종료일을 앞당겨 저장해도 Take를 다시 채우지 않고 기한만 당긴다', async () => {
    const { redemption } = await redeem(a)
    await spend(redemption, 10)
    const endsAt = future(10)
    await save(redemption, 's2', endsAt)
    expect(await balance(a.id) - start).toBe(20)
    expect(await voucherLots(redemption)).toEqual([{ remaining: 20, expiresAt: endsAt }])
  })
  // 왜: 관리자가 바꾼 것 없이 [저장]을 또 눌러도 고객 내역에 회수·적립 줄이 쌓이면 안 된다.
  it('티어와 종료일을 그대로 두고 다시 저장하면 Take 기록이 늘지 않는다', async () => {
    const { redemption } = await redeem(a)
    await spend(redemption, 10)
    const endsAt = future(45)
    await save(redemption, 's2', endsAt)
    const rows = await ledgerCount(a.id)
    expect(await save(redemption, 's2', endsAt)).toEqual({ status: 'updated', moved_takes: 0, revoked_takes: 0, granted_takes: 0 })
    expect(await ledgerCount(a.id)).toBe(rows)
    expect(await balance(a.id) - start).toBe(20)
  })
  // 왜: 기한이 지나 없어진 Take를 기간 연장이 되살리면 안 된다. 만료 정리는 take_expire_due 몫이다.
  it('이미 만료된 바우처 Take는 종료일을 옮겨도 되살아나지 않는다', async () => {
    const { redemption } = await redeem(a)
    await spend(redemption, 10)
    await query(`insert into public.take_ledger (workspace_id, delta, kind, expires_at, ref_kind, ref_id, reason)
      values ($1, 5, 'grant_plan', now() - interval '1 day', 'voucher_admin_plan', $2 || ':' || gen_random_uuid()::text, 'rollback test')`, [a.id, redemption])
    expect(await balance(a.id) - start).toBe(20)
    const endsAt = future(45)
    expect(await save(redemption, 's2', endsAt)).toEqual({ status: 'updated', moved_takes: 20, revoked_takes: 0, granted_takes: 0 })
    expect(await balance(a.id) - start).toBe(20)
  })
})

describe('관리자 [저장] — 티어를 바꾸거나 끝난 고객을 다시 열 때', () => {
  // 왜: 다른 티어로 옮겨 줄 때는 그 티어의 한 달 치를 새로 쓰게 해야 한다(오너 2026-11-22 B안).
  it('티어를 바꿔 저장하면 남은 바우처 Take를 회수하고 새 티어 한 달 치를 새 종료일까지 준다', async () => {
    const { redemption } = await redeem(a)
    await spend(redemption, 10)
    const endsAt = future(45)
    expect(await save(redemption, 'p10', endsAt)).toEqual({ status: 'updated', moved_takes: 0, revoked_takes: 20, granted_takes: 150 })
    expect(await plan(a.id)).toBe('p10')
    expect(await balance(a.id) - start).toBe(150)
    expect(await voucherLots(redemption)).toEqual([{ remaining: 150, expiresAt: endsAt }])
    const row = (await query('select plan, plan_ended_at is null as open, plan_ends_at from public.voucher_redemptions where id = $1', [redemption])).rows[0]
    expect({ plan: row.plan, open: row.open, endsAt: row.plan_ends_at.toISOString() }).toEqual({ plan: 'p10', open: true, endsAt })
  })
  // 왜: 해지한 고객을 다시 살려 줄 때 Take가 0이면 다시 연 의미가 없다(오너 2026-11-22 B안).
  it('해지한 고객을 미래 종료일로 다시 열면 고른 티어 한 달 치를 새로 주고 요금제도 그 티어로 되돌린다', async () => {
    const { redemption } = await redeem(a)
    await spend(redemption, 10)
    await query('select public.admin_end_voucher_redemption($1)', [redemption])
    expect(await plan(a.id)).toBe('free')
    expect(await save(redemption, 's2', future(30))).toEqual({ status: 'updated', moved_takes: 0, revoked_takes: 0, granted_takes: 30 })
    expect(await plan(a.id)).toBe('s2')
    expect(await balance(a.id) - start).toBe(30)
  })
  // 왜: 기간이 지나 무료로 돌아간 체험 고객을 다시 열어 줄 때도 해지와 같은 규칙이어야 한다.
  it('기간이 지나 끝난 고객을 다시 열어도 고른 티어 한 달 치를 새로 준다', async () => {
    const { redemption } = await redeem(a, "now() - interval '1 day'")
    await query('select public.voucher_plan_expire_due()')
    expect(await plan(a.id)).toBe('free')
    expect(await balance(a.id) - start).toBe(0)
    expect(await save(redemption, 's2', future(30))).toEqual({ status: 'updated', moved_takes: 0, revoked_takes: 0, granted_takes: 30 })
    expect(await plan(a.id)).toBe('s2')
    expect(await balance(a.id) - start).toBe(30)
  })
  // 왜: 생성 중이던 영상이 실패해 Take가 회수 뒤에 돌아오면, 같은 적립을 두 번째로 회수하는 저장이 오류로 막혔다.
  it('생성 중이라 잡아둔 Take가 저장 뒤에 돌아와도 다음 저장이 실패하지 않는다', async () => {
    const { redemption } = await redeem(a)
    const grant = await firstGrant(redemption)
    await query(`insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason)
      values ($1, -5, 'hold', $2, 'admin_voucher_test', 'job-1', 'rollback test')`, [a.id, grant])
    await save(redemption, 'p10', future(45))
    await query(`insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason)
      values ($1, 5, 'hold_release', $2, 'admin_voucher_test', 'job-1', 'rollback test')`, [a.id, grant])
    expect(await save(redemption, 'p15', future(45))).toEqual({ status: 'updated', moved_takes: 0, revoked_takes: 155, granted_takes: 200 })
    expect(await balance(a.id) - start).toBe(200)
  })
})

describe('관리자 [저장] — 구독 중인 고객', () => {
  // 왜: 바우처를 쓰다 유료 구독을 시작한 고객은 [저장]을 누르면 남은 바우처 Take를 회수만 당하고 새로 받지 못했다.
  it('구독 중인 고객도 종료일만 바꾸면 남은 바우처 Take를 그대로 새 종료일로 옮긴다', async () => {
    const { redemption } = await redeem(a)
    await spend(redemption, 10)
    await subscribe(a.id)
    const endsAt = future(45)
    expect(await save(redemption, 's2', endsAt)).toEqual({ status: 'updated', moved_takes: 20, revoked_takes: 0, granted_takes: 0 })
    expect(await balance(a.id) - start).toBe(20)
    expect(await voucherLots(redemption)).toEqual([{ remaining: 20, expiresAt: endsAt }])
  })
  // 왜: 요금제는 결제가 정한다. 바우처 티어를 바꿔도 구독 요금제를 덮어쓰면 결제와 화면이 어긋난다.
  it('구독 중인 고객의 티어를 바꾸면 새 티어 한 달 치를 바우처 Take로 주고 계정 요금제는 구독 그대로 둔다', async () => {
    const { redemption } = await redeem(a)
    await spend(redemption, 10)
    await subscribe(a.id)
    expect(await save(redemption, 'p15', future(45))).toEqual({ status: 'updated', moved_takes: 0, revoked_takes: 20, granted_takes: 200 })
    expect(await plan(a.id)).toBe('p10')
    expect(await balance(a.id) - start).toBe(200)
  })
})

describe('관리자 [해지] (정상 경로 고정)', () => {
  // 왜: 해지는 바로 무료로 돌려야 한다. 이미 쓴 Take 기록은 남긴다.
  it('[해지]를 누르면 남은 바우처 Take를 회수하고 계정을 무료로 돌린다', async () => {
    const { redemption } = await redeem(a)
    await spend(redemption, 10)
    expect((await query('select public.admin_end_voucher_redemption($1) as r', [redemption])).rows[0].r).toEqual({ status: 'ended', revoked_takes: 20 })
    expect(await plan(a.id)).toBe('free')
    expect(await balance(a.id) - start).toBe(0)
  })
  // 왜: 종료일 칸에 지난 날짜를 넣고 [저장]하는 것도 해지와 같은 뜻이다.
  it('종료일을 지난 날짜로 저장하면 [해지]와 같이 남은 바우처 Take를 회수하고 계정을 무료로 돌린다', async () => {
    const { redemption } = await redeem(a)
    await spend(redemption, 10)
    expect(await save(redemption, 's2', future(-1))).toEqual({ status: 'ended', revoked_takes: 20 })
    expect(await plan(a.id)).toBe('free')
  })
})
