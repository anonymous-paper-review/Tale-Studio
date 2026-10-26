// 시연 계정(promotion@talestudio.art)은 할당량만 무제한이고 관리자 권한은 없다 (2026-10-27 오너: 홍콩 스튜디오 시연용)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUserById: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from, auth: { admin: { getUserById: mocks.getUserById } } },
}))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: vi.fn() }))

import { isAdminEmail } from '@/lib/admin'
import { isQuotaExemptEmail, isQuotaExemptWorkspaceOwner, referenceAllowed } from '@/lib/quota-exempt'
import { holdTakesForVideoJob } from '@/lib/billing/take-hold'

const PROMO = 'promotion@talestudio.art'
const read = (file: string) => readFileSync(file, 'utf8')

beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => vi.unstubAllEnvs())

describe('시연 계정(promotion@talestudio.art)', () => {
  it('시연 계정은 할당량이 무제한이지만 관리자는 아니다', () => {
    // 왜: 외부 스튜디오와 비밀번호를 나눌 계정이라 관리자 결제 창구(모든 계정의 요금제 · Take 조정) · 디버그 프롬프트가 열리면 안 된다.
    expect(isQuotaExemptEmail(PROMO)).toBe(true)
    expect(isQuotaExemptEmail('  Promotion@TaleStudio.art ')).toBe(true)
    expect(isAdminEmail(PROMO)).toBe(false)
  })

  it('관리자 계정은 지금처럼 할당량도 무제한이고, 보통 계정은 아니다', () => {
    // 왜: 정상 경로 고정 — 할당량 면제를 관리자에서 떼어 내도 관리자 동작은 그대로다.
    expect(isQuotaExemptEmail('admin@tale.studio')).toBe(true)
    expect(isQuotaExemptEmail('someone@example.com')).toBe(false)
    expect(isQuotaExemptEmail(null)).toBe(false)
  })

  it('할당량 면제는 자기 작업 공간에서만 통한다', () => {
    // 왜: 남의 작업 공간을 열어도 그 공간의 한도가 풀리면 안 된다(관리자 판정과 같은 소유자 조건).
    expect(isQuotaExemptWorkspaceOwner({ id: 'u-promo', email: PROMO }, 'u-promo')).toBe(true)
    expect(isQuotaExemptWorkspaceOwner({ id: 'u-promo', email: PROMO }, 'someone-else')).toBe(false)
  })

  it('설정값으로 시연 계정을 더할 수 있다', () => {
    // 왜: 다음 시연 계정은 배포 없이 운영 설정으로 더한다.
    vi.stubEnv('QUOTA_EXEMPT_EMAILS', 'demo-hk@talestudio.art, other@x.com')
    expect(isQuotaExemptEmail('demo-hk@talestudio.art')).toBe(true)
    expect(isQuotaExemptEmail('nope@x.com')).toBe(false)
  })

  it('시연 계정은 영상을 만들 때 Take 를 묶지 않는다', async () => {
    // 왜: Take 를 실제로 받는 설정(enforce)으로 바뀌어도 시연 중에 잔액 부족으로 막히지 않게.
    vi.stubEnv('TAKE_BILLING_MODE', 'enforce')
    mocks.getUserById.mockResolvedValue({ data: { user: { email: PROMO } }, error: null })

    const result = await holdTakesForVideoJob({ workspaceId: 'ws-promo', userId: 'u-promo-hold', jobId: 'job-1', amount: 5, projectId: 'p-1' })

    expect(result.ok).toBe(true)
    expect(result.insufficient).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('시연 계정은 프로젝트 칸 제한 없이 만들고, 목록과 계정 화면에 무제한으로 보인다', () => {
    // 왜: 무료 요금제는 프로젝트 1개뿐이라 시연에서 두 번째 이야기를 만들 수 없었다.
    for (const file of ['src/app/api/project/new/route.ts', 'src/app/api/project/next-episode/route.ts', 'src/app/api/project/list/route.ts', 'src/app/api/billing/take-balance/route.ts', 'src/app/api/billing/account/route.ts']) {
      expect(read(file), file).toMatch(/isQuotaExemptWorkspaceOwner\(/)
    }
    expect(read('src/app/api/billing/account/route.ts')).toMatch(/unlimited[:,]/)
    expect(read('src/app/account/page.tsx')).toMatch(/data\?\.unlimited \? t\('Unlimited'\)/)
  })

  it('시연 계정은 요금제와 상관없이 앞 화에서 이어 만들 수 있다', () => {
    // 왜: 무료 요금제라 [다음 화 만들기]가 요금제 안내 창으로 막혔다 — 칸이 무제한이면 막을 까닭이 없다(검토 지적).
    expect(referenceAllowed('free', true)).toBe(true)
    expect(referenceAllowed('free', false)).toBe(false)
    expect(referenceAllowed('p10', false)).toBe(true)
    for (const file of ['src/app/api/project/next-episode/route.ts', 'src/app/api/project/list/route.ts', 'src/lib/reference-import.ts']) {
      expect(read(file), file).toMatch(/referenceAllowed\(/)
    }
  })

  it('시연 계정은 프로젝트당 영상 100회 한도를 받지 않는다', async () => {
    // 왜: 관리자와 같은 할당량 면제 — 시연 중 영상 100회 한도로 멈추지 않게.
    mocks.getUserById.mockResolvedValue({ data: { user: { email: PROMO } }, error: null })
    const { checkProjectVideoBudget } = await import('@/lib/generation-quota')

    await expect(checkProjectVideoBudget('p-1', 'u-promo-video')).resolves.toMatchObject({ ok: true, used: 0 })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('관리자 결제 창구 · 디버그 · 내부 엔진 · 정합 검사는 지금처럼 관리자만 연다', () => {
    // 왜: 할당량 면제를 넓히면서 관리자 기능까지 함께 열리지 않게 고정한다.
    expect(read('src/app/api/admin/billing/route.ts')).toMatch(/isAdminEmail\(user\.email\)/)
    for (const file of ['src/app/api/debug-flags/route.ts', 'src/app/api/debug-prompt-trace/route.ts', 'src/app/api/writer/engine/route.ts', 'src/app/api/writer/v2/apply/route.ts', 'src/app/api/writer/v2/review/route.ts', 'src/app/api/writer/rough-adherence/route.ts', 'src/app/api/director/video-adherence/route.ts']) {
      expect(read(file), file).toMatch(/isAdminOwnedProject\(/)
      expect(read(file), file).not.toMatch(/QuotaExempt/)
    }
  })
})
