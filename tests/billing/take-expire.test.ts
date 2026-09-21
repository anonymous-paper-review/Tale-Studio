// 만료일이 지난 Take는 잔액에 없고, 장부에도 만료로 남는다 (#payments-phase-3 P13).
//   .claude/docs/2026-09-08/ledger-two-holes.html 3판 설계: ① 읽을 때 만료 lot 을 빼서 새는 창을 0 으로
//   ② 잡은 만료 행을 넣어 내역에 남기고 죽은 lot 을 정리(하루 1회). 여기는 ①의 순수 계산과 잡 라우트 계약.
import { describe, expect, it, vi } from 'vitest'

import { takeBreakdown, type LedgerRow } from '@/lib/billing/account-summary'

const NOW = new Date('2026-10-08T00:00:00.000Z')
const row = (partial: Partial<LedgerRow> & Pick<LedgerRow, 'id' | 'kind' | 'delta'>): LedgerRow => ({
  grant_id: null,
  expires_at: null,
  ref_kind: null,
  ref_id: null,
  reason: null,
  created_at: '2026-09-07T00:00:00.000Z',
  ...partial,
})

describe('읽을 때 — 만료된 Take는 안 세어진다', () => {
  // 왜: 오너 09-08 "1시간 주기도 새는 창이 59분까지 되는 거 아님?" — 맞다. 잡을 기다리면 최악 59분(1시간 주기)·23시간(하루 1회)이 샌다.
  it('만료일이 지난 Take는 잡이 돌기 전이라도 잔액에 안 잡힌다', () => {
    const rows: LedgerRow[] = [
      row({ id: 'g-plan', kind: 'grant_plan', delta: 16, expires_at: '2026-10-07T00:00:00.000Z' }),
      row({ id: 'g-pack', kind: 'grant_purchase', delta: 50, expires_at: '2027-09-07T00:00:00.000Z' }),
    ]
    const b = takeBreakdown(rows, NOW)
    expect(b.plan).toBe(0)
    expect(b.purchase).toBe(50)
    expect(b.total).toBe(50)
  })

  // 왜: 시간대 실수(UTC/KST)로 하루 일찍 빼는 사고.
  it('만료일이 안 지난 Take는 그대로 세어진다', () => {
    const rows: LedgerRow[] = [
      row({ id: 'g1', kind: 'grant_plan', delta: 16, expires_at: '2026-10-08T00:00:01.000Z' }),
      row({ id: 'g2', kind: 'grant_plan', delta: 10, expires_at: null }),
    ]
    const b = takeBreakdown(rows, NOW)
    expect(b.plan).toBe(26)
    expect(b.total).toBe(26)
  })

  // 왜: 만료된 lot 에서 이미 나간 hold·consume 까지 되살아나면 잔액이 늘어난다. 만료는 "남은 양만" 지운다.
  it('만료된 lot 에서 이미 쓴 만큼은 되살아나지 않는다', () => {
    const rows: LedgerRow[] = [
      row({ id: 'g', kind: 'grant_plan', delta: 16, expires_at: '2026-10-07T00:00:00.000Z' }),
      row({ id: 'h', kind: 'hold', delta: -6, grant_id: 'g', ref_kind: 'generation_job', ref_id: 'job-1' }),
      row({ id: 'p', kind: 'grant_purchase', delta: 50, expires_at: '2027-09-07T00:00:00.000Z' }),
    ]
    const b = takeBreakdown(rows, NOW)
    expect(b.plan).toBe(0)
    expect(b.total).toBe(50)
  })

  // 왜: 만료 행이 이미 들어간 뒤(잡이 돈 뒤)에도 같은 숫자가 나와야 한다. 읽을 때 빼기와 잡이 겹쳐 두 번 빠지면 안 된다.
  it('잡이 만료 행을 넣은 뒤에도 잔액은 같다', () => {
    const before: LedgerRow[] = [
      row({ id: 'g', kind: 'grant_plan', delta: 16, expires_at: '2026-10-07T00:00:00.000Z' }),
      row({ id: 'p', kind: 'grant_purchase', delta: 50, expires_at: '2027-09-07T00:00:00.000Z' }),
    ]
    const after: LedgerRow[] = [
      ...before,
      row({ id: 'e', kind: 'expire', delta: -16, grant_id: 'g', reason: 'take_expire_due' }),
    ]
    expect(takeBreakdown(before, NOW).total).toBe(takeBreakdown(after, NOW).total)
    expect(takeBreakdown(after, NOW).total).toBe(50)
  })

  // 왜: 만료 행은 내역에 "만료 −16" 으로 보여야 한다("왜 줄었냐" 문의를 화면이 먼저 답한다).
  it('만료 행은 기타가 아니라 만료로 잡히고 잔액을 두 번 깎지 않는다', () => {
    const rows: LedgerRow[] = [
      row({ id: 'g', kind: 'grant_plan', delta: 16, expires_at: '2026-10-07T00:00:00.000Z' }),
      row({ id: 'e', kind: 'expire', delta: -16, grant_id: 'g' }),
    ]
    const b = takeBreakdown(rows, NOW)
    expect(b.plan).toBe(0)
    expect(b.other).toBe(0)
    expect(b.total).toBe(0)
  })
})

describe('만료 잡 라우트', () => {
  // 왜: Cron 전용 경로다. 아무나 부르면 남의 장부를 만료시킬 수 있다.
  it('CRON_SECRET 이 설정돼 있는데 헤더가 다르면 거부한다', async () => {
    vi.resetModules()
    vi.stubEnv('CRON_SECRET', 'secret-token')
    const rpc = vi.fn()
    vi.doMock('@/lib/supabase/admin', () => ({ supabaseAdmin: { rpc } }))
    const { GET } = await import('@/app/api/cron/take-expire/route')
    const res = await GET(new Request('https://x/api/cron/take-expire') as never)
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
    vi.doUnmock('@/lib/supabase/admin')
  })

  // 왜: 정상 경로 고정. 만료된 lot 수와 Take 수를 돌려줘야 대사·경보가 그 숫자를 쓴다.
  it('헤더가 맞으면 만료 RPC 를 부르고 결과를 돌려준다', async () => {
    vi.resetModules()
    vi.stubEnv('CRON_SECRET', 'secret-token')
    const rpc = vi.fn(async () => ({ data: { lots: 3, takes: 42 }, error: null }))
    vi.doMock('@/lib/supabase/admin', () => ({ supabaseAdmin: { rpc } }))
    const { GET } = await import('@/app/api/cron/take-expire/route')
    const res = await GET(
      new Request('https://x/api/cron/take-expire', { headers: { authorization: 'Bearer secret-token' } }) as never,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, lots: 3, takes: 42 })
    expect(rpc).toHaveBeenCalledWith('take_expire_due')
    vi.unstubAllEnvs()
    vi.doUnmock('@/lib/supabase/admin')
  })

  // 왜: 조용히 안 돌면 장부에 죽은 lot 이 쌓이고 내역이 비어 보인다.
  it('만료 RPC 가 실패하면 경보를 보내고 실패로 답한다', async () => {
    vi.resetModules()
    vi.stubEnv('CRON_SECRET', 'secret-token')
    const alert = vi.fn(async (_msg: { level: string; title: string; body?: string }) => {})
    vi.doMock('@/lib/supabase/admin', () => ({
      supabaseAdmin: { rpc: vi.fn(async () => ({ data: null, error: { message: 'boom' } })) },
    }))
    vi.doMock('@/lib/ops-alert', () => ({ sendOpsAlert: alert }))
    const { GET } = await import('@/app/api/cron/take-expire/route')
    const res = await GET(
      new Request('https://x/api/cron/take-expire', { headers: { authorization: 'Bearer secret-token' } }) as never,
    )
    expect(res.status).toBe(500)
    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert.mock.calls[0][0]).toMatchObject({ level: 'error' })
    vi.unstubAllEnvs()
    vi.doUnmock('@/lib/supabase/admin')
    vi.doUnmock('@/lib/ops-alert')
  })
})
