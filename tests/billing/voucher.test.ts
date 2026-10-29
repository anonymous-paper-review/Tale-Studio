// 구글로 로그인한 사용자가 받은 코드를 넣으면 그 요금제와 한 달 Take 가 들어오고, 코드마다 정한 계정 수까지만 쓰며 한 계정은 같은 코드를 한 번만 쓴다 (2026-10-27 · 10-29 오너 바우처)
//   오너 결정(10-27): 아이디 · 비밀번호를 나눠 주던 테스트 계정을 코드로 바꾼다. s2 · p10 코드를 45개씩 만들고, 코드 하나는 한 명만 쓴다.
//   오너 결정(10-29): s2 · p10 코드를 하나씩 만들어 여러 구글 계정이 같은 코드를 쓴다. 이미 만든 한 명용 코드는 그대로 한 명만 쓴다.
import { existsSync, readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  ensureWorkspace: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/supabase/workspace', () => ({ ensureWorkspace: mocks.ensureWorkspace }))

import { POST } from '@/app/api/billing/voucher/route'
import {
  normalizeVoucherCode,
  showVoucherCard,
  voucherFailureMessage,
  voucherTakeGrant,
  VOUCHER_TAKES_VALID_DAYS,
} from '@/lib/billing/voucher'
import { formatVoucherCode, generateVoucherCode, parseVoucherArgs } from '../../scripts/create-vouchers.mjs'

const USER = { id: 'user-1', email: 'tester@gmail.com', user_metadata: {} }
const WORKSPACE = { id: 'ws-1', plan: 'free', owner_id: 'user-1' }

function voucherRow(row: { plan: string } | null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  mocks.from.mockReturnValue(query)
  return query
}

function redeem(code: unknown, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost/api/billing/voucher', {
      method: 'POST',
      body: JSON.stringify({ code }),
      headers: { 'content-type': 'application/json', ...headers },
    }),
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: USER } })
  mocks.ensureWorkspace.mockResolvedValue(WORKSPACE)
})

describe('코드 모양', () => {
  it('코드는 대문자 · 소문자 · 띄어쓰기 · 하이픈이 달라도 같은 코드로 읽는다', () => {
    // 왜: 받은 사람이 메신저에서 코드를 옮겨 적다 보면 소문자로 치거나 하이픈을 빼먹는다.
    expect(normalizeVoucherCode(' tale-7k3p 9qxm ')).toBe('TALE7K3P9QXM')
    expect(normalizeVoucherCode('TALE-7K3P-9QXM')).toBe('TALE7K3P9QXM')
    expect(normalizeVoucherCode(null)).toBe('')
  })

  it('새로 만든 코드는 헷갈리는 글자(0 · O · 1 · I · L)를 쓰지 않고 TALE-XXXX-XXXX 모양으로 보인다', () => {
    // 왜: 코드를 눈으로 읽어 옮길 때 0과 O, 1과 I · L 을 헷갈리면 맞는 코드가 "코드가 맞지 않아요"로 거절된다.
    const codes = Array.from({ length: 300 }, () => generateVoucherCode())
    for (const code of codes) {
      expect(code).toMatch(/^TALE[2-9A-HJKMNP-Z]{8}$/)
      expect(formatVoucherCode(code)).toMatch(/^TALE-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/)
      expect(normalizeVoucherCode(formatVoucherCode(code))).toBe(code)
    }
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('코드로 받는 것', () => {
  it('코드를 쓰면 그 요금제의 한 달 Take 를 한 번 넣고 30일 뒤 만료된다', () => {
    // 왜: 코드 요금제는 결제가 없어 매달 다시 채워지지 않는다. 쓴 날이 월말이어도 테스트할 시간이 남게 30일을 준다.
    const now = new Date('2026-10-27T12:00:00.000Z')
    expect(VOUCHER_TAKES_VALID_DAYS).toBe(30)
    expect(voucherTakeGrant('p10', now)).toEqual({ takes: 150, expiresAt: '2026-11-26T12:00:00.000Z' })
    expect(voucherTakeGrant('s2', now)).toEqual({ takes: 30, expiresAt: '2026-11-26T12:00:00.000Z' })
  })

  it('코드 입력 칸은 무료 요금제 계정에만 보인다', () => {
    // 왜: 결제 중이거나 이미 코드를 쓴 계정은 코드를 쓸 수 없으니 칸을 보여 주면 헛걸음이다.
    expect(showVoucherCard({ plan: 'free', unlimited: false })).toBe(true)
    expect(showVoucherCard({ plan: 'p10', unlimited: false })).toBe(false)
    expect(showVoucherCard({ plan: 's2', unlimited: false })).toBe(false)
    expect(showVoucherCard({ plan: 'free', unlimited: true })).toBe(false)
  })

  it('코드를 못 쓴 까닭마다 사용자에게 보일 문장이 다르다', () => {
    // 왜: "다시 시도"만 보이면 이미 쓴 코드를 계속 넣거나, 오타인지 몰라 운영자에게 묻게 된다.
    expect(voucherFailureMessage('invalid')).toBe('This code is not valid. Check it and try again.')
    expect(voucherFailureMessage('used')).toBe('This code has already been used.')
    expect(voucherFailureMessage('not_free')).toBe('Codes can only be used on the Free plan.')
    expect(voucherFailureMessage('voucher_failed')).toBe('Could not apply the code. Please try again.')
  })
})

describe('코드 넣기 (POST /api/billing/voucher)', () => {
  it('로그인하지 않았으면 코드를 받지 않는다', async () => {
    // 왜: 정상 경로 고정. 누구의 요금제를 올릴지 모른다.
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const res = await redeem('TALE-7K3P-9QXM')
    expect(res.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('공유 보기 화면에서는 코드를 받지 않는다', async () => {
    // 왜: 공유 링크로 들어온 사람이 링크 주인의 요금제를 바꾸면 안 된다.
    const res = await redeem('TALE-7K3P-9QXM', { cookie: 'demo_share=abc' })
    expect(res.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('없는 코드를 넣으면 "코드가 맞지 않아요"로 거절하고 아무것도 바꾸지 않는다', async () => {
    // 왜: 오타 난 코드로 요금제가 바뀌거나 빈 작업 공간이 생기면 안 된다.
    voucherRow(null)
    const res = await redeem('tale-zzzz-zzzz')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'invalid' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled()
  })

  it('코드 모양이 아니면 코드 표를 찾아보지도 않고 거절한다', async () => {
    // 왜: 빈칸이나 엉뚱한 글을 넣고 눌렀을 때 서버가 쓸데없이 코드 표를 뒤지지 않게 한다.
    const res = await redeem('   ')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'invalid' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('쓸 수 있는 계정 수를 다 채운 코드를 넣으면 "이미 사용된 코드예요"로 거절한다', async () => {
    // 왜: 한 명용 코드를 받은 사람이 다른 사람에게 넘기거나, 공용 코드가 정한 수보다 많이 퍼졌을 때다. 남은 자리는 DB 함수가 잠금을 걸고 센다.
    voucherRow({ plan: 'p10' })
    mocks.rpc.mockResolvedValue({ data: { status: 'used' }, error: null })
    const res = await redeem('TALE-7K3P-9QXM')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'used' })
  })

  it('같은 공용 코드를 다른 구글 계정이 넣어도 그 계정의 요금제가 바뀌고 한 달 Take 가 들어온다', async () => {
    // 왜: 정상 경로 고정(오너 2026-10-29). 공용 코드 하나를 여러 사람에게 나눠 주므로, 앞사람이 썼다고 다음 사람이 거절되면 안 된다.
    voucherRow({ plan: 's2' })
    mocks.rpc.mockResolvedValue({ data: { status: 'ok', plan: 's2', takes: 30 }, error: null })
    mocks.getUser.mockResolvedValue({ data: { user: { ...USER, id: 'user-2', email: 'second@gmail.com' } } })
    mocks.ensureWorkspace.mockResolvedValue({ id: 'ws-2', plan: 'free', owner_id: 'user-2' })
    const res = await redeem('TALE-7K3P-9QXM')

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, plan: 's2', takes: 30 })
    expect(mocks.rpc).toHaveBeenCalledWith('redeem_voucher', expect.objectContaining({ p_workspace: 'ws-2', p_user: 'user-2', p_plan: 's2' }))
  })

  it('맞는 코드를 넣으면 그 요금제로 바꾸고 한 달 Take 를 넣는다', async () => {
    // 왜: 정상 경로 고정. 코드를 쓰자마자 다음 화 만들기 · 내보내기(p10)나 영상 만들기(s2)를 시험할 수 있어야 한다.
    const lookup = voucherRow({ plan: 'p10' })
    mocks.rpc.mockResolvedValue({ data: { status: 'ok', plan: 'p10', takes: 150 }, error: null })
    const res = await redeem(' tale-7k3p-9qxm ')

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, plan: 'p10', takes: 150 })
    expect(lookup.eq).toHaveBeenCalledWith('code', 'TALE7K3P9QXM')
    // 쓴 기록은 voucher_redemptions 로 옮겼다(10-29). 코드 표에서는 요금제만 읽는다.
    expect(lookup.select).toHaveBeenCalledWith('plan')
    expect(mocks.rpc).toHaveBeenCalledWith('redeem_voucher', {
      p_code: 'TALE7K3P9QXM',
      p_workspace: 'ws-1',
      p_user: 'user-1',
      p_plan: 'p10',
      p_takes: 150,
      p_expires_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })
  })

  it('작업 공간이 아직 없는 새 구글 사용자도 코드를 쓸 수 있다', async () => {
    // 왜: 구글로 처음 로그인한 사람은 프로젝트를 만들기 전까지 작업 공간이 없다. 코드부터 넣는 것이 보통 순서다.
    voucherRow({ plan: 's2' })
    mocks.rpc.mockResolvedValue({ data: { status: 'ok', plan: 's2', takes: 30 }, error: null })
    const res = await redeem('TALE-7K3P-9QXM')

    expect(res.status).toBe(200)
    expect(mocks.ensureWorkspace).toHaveBeenCalledWith(USER)
  })

  it('무료 요금제가 아닌 계정은 코드를 쓸 수 없다', async () => {
    // 왜: 결제 중인 계정의 요금제를 코드가 덮으면 결제와 요금제가 어긋나고, 코드를 이미 쓴 계정이 두 번째 코드로 Take 를 또 받는다.
    voucherRow({ plan: 's2' })
    mocks.rpc.mockResolvedValue({ data: { status: 'not_free', plan: 'p10' }, error: null })
    const res = await redeem('TALE-7K3P-9QXM')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'not_free' })
  })

  it('남은 자리가 하나인 코드를 두 사람이 거의 동시에 넣으면 먼저 넣은 한 명만 쓰고 다른 한 명은 "이미 사용된 코드예요"를 받는다', async () => {
    // 왜: 코드 표를 읽은 뒤 쓰기 전 사이에 다른 사람이 마지막 자리를 먼저 썼을 때다. 판정은 DB 함수 한 곳(redeem_voucher)이 잠금을 걸고 한다.
    voucherRow({ plan: 'p10' })
    mocks.rpc.mockResolvedValue({ data: { status: 'used' }, error: null })
    const res = await redeem('TALE-7K3P-9QXM')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'used' })
  })

  it('DB 처리가 실패하면 실패로 알리고 성공처럼 보이지 않는다', async () => {
    // 왜: 서버 오류인데 화면이 "적용됐어요"를 보이면 사용자는 요금제가 바뀐 줄 안다.
    voucherRow({ plan: 'p10' })
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await redeem('TALE-7K3P-9QXM')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'voucher_failed' })
  })
})

describe('코드 표와 코드 쓰기 함수 (마이그레이션)', () => {
  const sql = readFileSync('supabase/migrations/20261027220000_add_vouchers.sql', 'utf8')

  it('코드 목록은 서버만 읽고 쓴다', () => {
    // 왜: 브라우저에서 코드 표를 읽을 수 있으면 아직 안 쓴 코드를 아무나 가져다 쓴다.
    expect(sql).toMatch(/alter table public\.vouchers enable row level security/)
    expect(sql).not.toMatch(/create policy/i)
    expect(sql).toMatch(/revoke all on function public\.redeem_voucher\([^)]*\) from public, anon, authenticated/)
  })

})

describe('여러 계정이 함께 쓰는 코드 (마이그레이션)', () => {
  const file = 'supabase/migrations/20261029160000_share_vouchers.sql'
  const sql = existsSync(file) ? readFileSync(file, 'utf8') : ''

  it('코드를 쓴 기록도 서버만 읽고 쓴다', () => {
    // 왜: 브라우저에서 기록을 읽을 수 있으면 누가 어떤 코드를 썼는지 다른 사람이 본다.
    expect(sql).toMatch(/create table public\.voucher_redemptions/)
    expect(sql).toMatch(/alter table public\.voucher_redemptions enable row level security/)
    expect(sql).not.toMatch(/create policy/i)
    expect(sql).toMatch(/revoke all on function public\.redeem_voucher\([^)]*\) from public, anon, authenticated/)
  })

  it('코드마다 쓸 수 있는 계정 수가 있고, 그 수를 다 채우면 더 받지 않는다', () => {
    // 왜: 공용 코드가 나눠 준 사람 밖으로 퍼져도 유료 요금제가 끝없이 풀리지 않는다. 자리 세기와 쓰기 사이에 다른 사람이 끼지 않게 코드를 잠근다.
    expect(sql).toMatch(/add column max_uses integer not null default 1 check \(max_uses >= 1\)/)
    expect(sql).toMatch(/from public\.vouchers where code = p_code for update/)
    expect(sql).toMatch(/v_uses >= v_voucher\.max_uses/)
  })

  it('코드 쓰기 · 요금제 바꾸기 · Take 넣기는 한 번에 일어나고, 한 계정이 같은 코드로 Take 를 두 번 받지 않는다', () => {
    // 왜: 중간에 끊기면 코드만 쓰이고 요금제가 안 바뀌거나, 요금제만 바뀌고 Take 가 빠진다. 무료로 돌아간 계정이 같은 코드를 다시 넣어 Take 를 또 받으면 안 된다.
    expect(sql).toMatch(/unique \(code, redeemed_workspace_id\)/)
    expect(sql).toMatch(/insert into public\.voucher_redemptions/)
    expect(sql).toMatch(/update public\.workspaces/)
    expect(sql).toMatch(/insert into public\.take_ledger/)
    expect(sql).toMatch(/'voucher_redemption', v_redemption::text/)
  })

  it('이미 만든 한 명용 코드는 계속 한 명만 쓰고, 이미 쓴 기록은 그대로 남는다', () => {
    // 왜: 10-27 에 만든 s2 · p10 코드 90개는 한 명씩 나눠 주려고 만든 것이다. 구조를 바꾸면서 쓴 기록이 사라지면 쓴 코드가 다시 살아난다.
    expect(sql).toMatch(/max_uses integer not null default 1/)
    expect(sql).toMatch(/insert into public\.voucher_redemptions \(code, redeemed_at, redeemed_by, redeemed_workspace_id\)\s+select code, redeemed_at, redeemed_by, redeemed_workspace_id\s+from public\.vouchers\s+where redeemed_at is not null/)
  })
})

describe('코드 만들기 (scripts/create-vouchers.mjs)', () => {
  it('코드 만들기는 요금제와 개수를 꼭 받고, 개수는 1~100개로 제한한다', () => {
    // 왜: 오타로 무료 요금제 코드나 수천 개의 코드가 운영 DB 에 들어가면 지우기 번거롭다.
    expect(parseVoucherArgs(['--plan', 's2', '--count', '45', '--out', 'a.csv'])).toMatchObject({ plan: 's2', count: 45, live: false, out: 'a.csv' })
    expect(parseVoucherArgs(['--plan', 'p10', '--count', '45', '--out', 'b.csv', '--live'])).toMatchObject({ plan: 'p10', live: true })
    expect(() => parseVoucherArgs(['--count', '45', '--out', 'a.csv'])).toThrow()
    expect(() => parseVoucherArgs(['--plan', 'free', '--count', '45', '--out', 'a.csv'])).toThrow()
    expect(() => parseVoucherArgs(['--plan', 's2', '--count', '101', '--out', 'a.csv'])).toThrow()
    expect(() => parseVoucherArgs(['--plan', 's2', '--count', '0', '--out', 'a.csv'])).toThrow()
    expect(() => parseVoucherArgs(['--plan', 's2', '--count', '45'])).toThrow()
  })

  it('코드 만들기에서 코드 하나를 쓸 수 있는 계정 수를 1~1000 사이로 정할 수 있고, 안 정하면 한 명만 쓴다', () => {
    // 왜: 공용 코드는 여러 명이 쓰고 이전 코드는 한 명씩 쓴다. 0명이나 끝없는 수가 들어가면 코드가 아예 안 되거나 무한히 풀린다.
    expect(parseVoucherArgs(['--plan', 's2', '--count', '1', '--out', 'a.csv', '--uses', '100'])).toMatchObject({ plan: 's2', count: 1, uses: 100 })
    expect(parseVoucherArgs(['--plan', 'p10', '--count', '45', '--out', 'b.csv'])).toMatchObject({ uses: 1 })
    expect(() => parseVoucherArgs(['--plan', 's2', '--count', '1', '--out', 'a.csv', '--uses', '0'])).toThrow()
    expect(() => parseVoucherArgs(['--plan', 's2', '--count', '1', '--out', 'a.csv', '--uses', '1001'])).toThrow()
    expect(() => parseVoucherArgs(['--plan', 's2', '--count', '1', '--out', 'a.csv', '--uses', 'many'])).toThrow()
  })
})
