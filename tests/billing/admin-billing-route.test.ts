// 관리자는 무료로 처리하고, 권한에 따라 크레딧 적립과 조정 내역을 정확히 기록한다 (#payments-phase-2)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// 관리자 수동 빌링 라우트 (#payments-phase-2) — 비admin 거부, set_plan 이 plan 갱신 + grant_plan
//   적립 두 동작을 다 하는지, adjust 는 reason 필수임을 고정한다.
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import { GET, POST } from '@/app/api/admin/billing/route'

const WORKSPACE_ID = '11111111-2222-3333-4444-555555555555'

function query(result: unknown) {
  const value = {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  value.insert.mockReturnValue(value)
  value.update.mockReturnValue(value)
  value.select.mockReturnValue(value)
  value.eq.mockReturnValue(value)
  value.maybeSingle.mockResolvedValue(result)
  value.single.mockResolvedValue(result)
  return value
}

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/billing', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function getReq(qs: string) {
  return new NextRequest(`http://localhost/api/admin/billing${qs}`)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('관리자 결제 요청 — 접근 권한 확인', () => {
  it('로그인하지 않은 사용자는 접근할 수 없다', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(postReq({ workspaceId: WORKSPACE_ID, action: 'adjust', delta: 5, reason: 'x' }))
    expect(res.status).toBe(401)
  })

  it('관리자가 아닌 사용자는 접근할 수 없다', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'not-admin@x.test' } } })
    const res = await POST(postReq({ workspaceId: WORKSPACE_ID, action: 'adjust', delta: 5, reason: 'x' }))
    expect(res.status).toBe(403)
  })

  it('정보를 조회해도 관리자가 아니면 접근할 수 없다', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'not-admin@x.test' } } })
    const res = await GET(getReq(`?workspaceId=${WORKSPACE_ID}`))
    expect(res.status).toBe(403)
  })
})

describe('관리자 결제 요청 — 요금제 변경', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'admin@tale.studio' } } })
  })

  it('요금제를 바꾸면 해당 월 크레딧을 함께 적립한다', async () => {
    const updateCall = query({ error: null })
    const insertCall = query({ data: { id: 'grant-1' }, error: null })
    mocks.from.mockReturnValueOnce(updateCall).mockReturnValueOnce(insertCall)

    const res = await POST(postReq({ workspaceId: WORKSPACE_ID, action: 'set_plan', plan: 'p10' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(updateCall.update).toHaveBeenCalledWith({ plan: 'p10' })
    expect(insertCall.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WORKSPACE_ID,
        delta: 150, // p10 includedTakesPerMonth
        kind: 'grant_plan',
      }),
    )
    expect(json.grant).toEqual({ id: 'grant-1' })
  })

  it('무료 요금제로 바꾸면 추가 크레딧을 적립하지 않는다', async () => {
    const updateCall = query({ error: null })
    mocks.from.mockReturnValueOnce(updateCall)

    const res = await POST(postReq({ workspaceId: WORKSPACE_ID, action: 'set_plan', plan: 'free' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.grant).toBeNull()
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })
})

describe('관리자 결제 요청 — 크레딧 조정', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'admin@tale.studio' } } })
  })

  it('조정 사유가 없으면 처리하지 않는다', async () => {
    const res = await POST(postReq({ workspaceId: WORKSPACE_ID, action: 'adjust', delta: -5 }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/reason/i)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('조정 사유가 있으면 크레딧 변경 내역을 기록한다', async () => {
    const insertCall = query({ data: { id: 'adj-1' }, error: null })
    mocks.from.mockReturnValueOnce(insertCall)

    const res = await POST(postReq({ workspaceId: WORKSPACE_ID, action: 'adjust', delta: -5, reason: '환불' }))
    expect(res.status).toBe(200)
    expect(insertCall.insert).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: WORKSPACE_ID, delta: -5, kind: 'manual_adjust', reason: '환불' }),
    )
  })
})

describe('관리자 결제 요청 — 크레딧 적립', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'admin@tale.studio' } } })
  })

  it('지원하지 않는 적립 종류면 거부한다', async () => {
    const res = await POST(
      postReq({ workspaceId: WORKSPACE_ID, action: 'grant_takes', amount: 10, kind: 'not_a_kind' }),
    )
    expect(res.status).toBe(400)
  })

  it('유효한 크레딧 적립 요청은 변경 내역을 기록한다', async () => {
    const insertCall = query({ data: { id: 'grant-2' }, error: null })
    mocks.from.mockReturnValueOnce(insertCall)

    const res = await POST(
      postReq({ workspaceId: WORKSPACE_ID, action: 'grant_takes', amount: 50, kind: 'grant_bonus', reason: '이벤트' }),
    )
    expect(res.status).toBe(200)
    expect(insertCall.insert).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: WORKSPACE_ID, delta: 50, kind: 'grant_bonus' }),
    )
  })
})

describe('관리자 결제 요청 — 정보 조회', () => {
  it('요금제와 사용 권한, 남은 크레딧을 보여준다', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'admin@tale.studio' } } })
    const workspaceLookup = query({ data: { plan: 'p10' }, error: null })
    const balanceLookup = query({ data: [{ delta: 100 }, { delta: -20 }], error: null })
    mocks.from.mockReturnValueOnce(workspaceLookup).mockReturnValueOnce(balanceLookup)

    const res = await GET(getReq(`?workspaceId=${WORKSPACE_ID}`))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.plan).toBe('p10')
    expect(json.takeBalance).toBe(80)
    expect(json.entitlements.includedTakesPerMonth).toBe(150)
  })
})
