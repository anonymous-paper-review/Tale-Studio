// 계정을 지우면 자동갱신 구독을 먼저 끊고 프로젝트와 로그인 계정을 지우되 법정 보존 대상인 결제 기록은 남긴다
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 약관 §9: "Deleting your account cancels any auto-renewing subscription, ends your access to
//   projects and generated output, and starts the deletion timelines set out in the Privacy Policy."
// 개인정보 처리방침 §1 법정 보존표: 계약·결제·서비스 공급 기록 5년, 분쟁 기록 3년.
//   그래서 "지운다"의 범위는 프로젝트와 로그인 계정까지이고, 결제 장부는 그 범위 밖이다.

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  deleteUser: vi.fn(),
  deleteProject: vi.fn(),
  cancelSubscription: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from, auth: { admin: { deleteUser: mocks.deleteUser } } },
}))
vi.mock('@/lib/project/delete-project', () => ({ deleteProjectDeep: mocks.deleteProject }))
vi.mock('@/lib/billing/cancel-subscription', () => ({ cancelSubscriptionNow: mocks.cancelSubscription }))

import { POST } from '@/app/api/account/delete/route'

const USER = 'user-1'
const WORKSPACE = 'ws-1'

/** 라우트가 어느 표에 무엇을 했는지 — 결제 장부가 삭제 대상에 들어갔는지 보려고 전부 적는다. */
let touched: { table: string; op: string }[]
let subscriptions: unknown[]
let projects: { id: string }[]

function table(name: string, data: unknown) {
  const result = { data, error: null }
  const chain = {
    select: () => {
      touched.push({ table: name, op: 'select' })
      return chain
    },
    update: (values: Record<string, unknown>) => {
      touched.push({ table: name, op: `update:${Object.keys(values).join(',')}` })
      return chain
    },
    delete: () => {
      touched.push({ table: name, op: 'delete' })
      return chain
    },
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  return chain
}

function call(headers: Record<string, string> = {}) {
  return POST(new Request('http://localhost/api/account/delete', { method: 'POST', headers }))
}

beforeEach(() => {
  vi.clearAllMocks()
  touched = []
  subscriptions = []
  projects = [{ id: 'project-1' }, { id: 'project-2' }]
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER, email: 'owner@example.test' } } })
  mocks.from.mockImplementation((name: string) => {
    if (name === 'workspaces') return table(name, [{ id: WORKSPACE }])
    if (name === 'subscriptions') return table(name, subscriptions)
    if (name === 'projects') return table(name, projects)
    throw new Error(`Unexpected table: ${name}`)
  })
  mocks.deleteProject.mockResolvedValue({ status: 'ok', removedPaths: [], leftoverPaths: [] })
  mocks.deleteUser.mockResolvedValue({ data: { user: null }, error: null })
  mocks.cancelSubscription.mockResolvedValue(undefined)
})

describe('계정 삭제 요청', () => {
  // 왜: 로그인 없이 도달하는 요청 하나로 남의 계정이 사라지면 안 된다.
  it('로그인하지 않고 계정 삭제를 요청하면 아무것도 지우지 않고 거절한다', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })

    const response = await call()

    expect(response.status).toBe(401)
    expect(mocks.deleteProject).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  // 왜: 공유 링크로 들어온 읽기 전용 열람자가 주인의 계정을 지울 수 있으면 안 된다.
  it('공유 보기 세션이 계정 삭제를 요청하면 거절한다', async () => {
    const response = await call({ cookie: 'demo_share=' + 'a'.repeat(64) })

    expect(response.status).toBe(403)
    expect(mocks.deleteProject).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  // 왜: 해지가 안 된 채 계정이 사라지면 쓸 수 없는 서비스에 계속 돈이 빠져나간다.
  it('자동갱신 구독 해지가 실패하면 계정과 프로젝트를 지우지 않는다', async () => {
    subscriptions = [{ workspace_id: WORKSPACE, mor_subscription_id: 'sub_1', plan: 's2', status: 'active', current_period_end: null, updated_at: '2026-10-01' }]
    mocks.cancelSubscription.mockRejectedValue(new Error('Paddle 502'))

    const response = await call()

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: 'subscription_cancel_failed' })
    expect(mocks.deleteProject).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  // 왜: 순서가 뒤집히면 지울 권한이 사라진 뒤에 프로젝트가 남거나 결제가 계속된다. 정상 경로 고정.
  it('계정을 지우면 구독을 해지하고 프로젝트를 지운 뒤 로그인 계정을 지운다', async () => {
    subscriptions = [{ workspace_id: WORKSPACE, mor_subscription_id: 'sub_1', plan: 's2', status: 'active', current_period_end: null, updated_at: '2026-10-01' }]
    const order: string[] = []
    mocks.cancelSubscription.mockImplementation(async () => void order.push('cancel'))
    mocks.deleteProject.mockImplementation(async ({ projectId }: { projectId: string }) => {
      order.push(`project:${projectId}`)
      return { status: 'ok', removedPaths: [], leftoverPaths: [] }
    })
    mocks.deleteUser.mockImplementation(async () => {
      order.push('user')
      return { data: { user: null }, error: null }
    })

    const response = await call()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(order).toEqual(['cancel', 'project:project-1', 'project:project-2', 'user'])
    expect(mocks.cancelSubscription).toHaveBeenCalledWith('sub_1')
    expect(mocks.deleteUser).toHaveBeenCalledWith(USER)
  })

  // 왜: 해지할 구독이 없는데 결제사를 부르면 결제가 열리지 않은 지금은 요청 자체가 실패한다.
  it('자동갱신 구독이 없으면 결제사를 부르지 않고 지운다', async () => {
    const response = await call()

    expect(response.status).toBe(200)
    expect(mocks.cancelSubscription).not.toHaveBeenCalled()
    expect(mocks.deleteUser).toHaveBeenCalledWith(USER)
  })

  // 왜: 프로젝트가 남은 채 로그인 계정이 사라지면 주인 없는 자료를 아무도 지울 수 없다.
  it('프로젝트 삭제가 실패하면 로그인 계정을 지우지 않는다', async () => {
    mocks.deleteProject.mockResolvedValue({ status: 'forbidden' })

    const response = await call()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'project_delete_failed' })
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  // 왜: 전자상거래법이 계약·결제 기록을 5년간 요구한다. 계정 삭제가 그 장부를 지우면 법을 어긴다.
  it('계정을 지워도 결제·구독·Take 장부 기록은 지우지 않는다', async () => {
    subscriptions = [{ workspace_id: WORKSPACE, mor_subscription_id: 'sub_1', plan: 's2', status: 'active', current_period_end: null, updated_at: '2026-10-01' }]

    const response = await call()

    expect(response.status).toBe(200)
    expect(touched.filter((row) => row.op === 'delete')).toEqual([])
    for (const ledger of ['take_ledger', 'billing_customers', 'billing_events', 'subscriptions']) {
      expect(touched.some((row) => row.table === ledger && row.op !== 'select')).toBe(false)
    }
  })

  // 왜: 작업공간이 로그인 계정에 매달린 채 삭제되면 그 아래 결제 장부가 함께 쓸려간다.
  it('계정을 지우기 전에 작업공간을 그 계정에서 떼어 놓는다', async () => {
    const response = await call()

    expect(response.status).toBe(200)
    expect(touched).toContainEqual({ table: 'workspaces', op: 'update:owner_id' })
  })

  // 왜: 로그인 계정이 남으면 다시 들어와 빈 계정을 쓰게 되고 삭제 약속이 깨진다.
  it('로그인 계정을 지우지 못하면 성공으로 알리지 않는다', async () => {
    mocks.deleteUser.mockResolvedValue({ data: { user: null }, error: { message: 'service unavailable' } })

    const response = await call()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'account_delete_failed' })
  })
})
