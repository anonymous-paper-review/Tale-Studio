// 결제 게이트 8개가 배포된 서버에서 살아 있는지 판정한다 (#payments-phase-3 P10 공짜 검사).
//   .claude/docs/2026-09-08/remaining-three.html 2판: 돈 드는 검사(실결제+영상, 하루 1회)와 공짜 검사(API 만, 배포마다)를 나눴다.
//   이 파일이 고정하는 것은 "응답을 보고 통과/실패를 어떻게 가르나" — 실제 호출은 scripts/smoke-billing.mjs 가 브라우저 안에서 한다.
import { describe, expect, it } from 'vitest'

import { BILLING_SMOKE_CHECKS, judgeCheck, summarize, type CheckResponse } from '@/lib/billing/smoke-checks'

const res = (status: number, body: unknown = {}): CheckResponse => ({ status, body })

describe('검사 목록', () => {
  // 왜: 목록이 줄면 지키던 것이 조용히 빠진다. 8개는 remaining-three.html 2판에서 오너와 합의한 수다.
  it('공짜 검사는 8개이고 각각 무엇을 지키는지 적혀 있다', () => {
    expect(BILLING_SMOKE_CHECKS).toHaveLength(8)
    for (const check of BILLING_SMOKE_CHECKS) {
      expect(check.id).toMatch(/^[a-z-]+$/)
      expect(check.title.length).toBeGreaterThan(0)
      expect(check.guards.length).toBeGreaterThan(0)
      expect(['GET', 'POST']).toContain(check.method)
    }
  })
})

describe('판정', () => {
  // 왜: v4 충전 상한의 앞문. 이게 뚫리면 웹훅 경보만 남는다(돈은 이미 받은 뒤).
  it('무료 플랜이 팩을 두 번째 사려 하면 409 free_pack_limit 이어야 통과다', () => {
    const check = BILLING_SMOKE_CHECKS.find((c) => c.id === 'free-pack-limit')!
    expect(judgeCheck(check, res(409, { error: 'free_pack_limit' })).ok).toBe(true)
    expect(judgeCheck(check, res(200, { transactionId: 'txn_x' })).ok).toBe(false)
    expect(judgeCheck(check, res(409, { error: 'already_subscribed' })).ok).toBe(false)
    // 구독 중인 계정에서는 200 이 정상이라 판정이 성립하지 않는다 — 스크립트가 건너뛰라고 표시해 둔다.
    expect(check.onlyWhen).toBe('free-plan-with-purchase')
  })

  // 왜: 남의 워크스페이스에 적립되는 경로를 막는다.
  it('로그인 없이 결제를 시도하면 401 이어야 통과다', () => {
    const check = BILLING_SMOKE_CHECKS.find((c) => c.id === 'checkout-requires-login')!
    expect(judgeCheck(check, res(401)).ok).toBe(true)
    expect(judgeCheck(check, res(200)).ok).toBe(false)
  })

  // 왜: 위조 알림으로 공짜 Take. 서명 검증이 배포에서도 살아 있는지.
  it('서명 없는 웹훅은 401 이어야 통과다', () => {
    const check = BILLING_SMOKE_CHECKS.find((c) => c.id === 'webhook-rejects-unsigned')!
    expect(judgeCheck(check, res(401, { error: 'invalid_signature' })).ok).toBe(true)
    expect(judgeCheck(check, res(200, { ok: true })).ok).toBe(false)
    // 시크릿이 아예 없는 배포는 500 이 온다 — 그것도 실패다(웹훅이 아무것도 못 받는 상태).
    expect(judgeCheck(check, res(500, { error: 'webhook_not_configured' })).ok).toBe(false)
  })

  // 왜: Cron 경로가 열려 있으면 아무나 만료를 돌리거나 Paddle 호출을 낭비시킨다.
  it('Cron 경로는 인증 없이 부르면 401 이어야 통과다', () => {
    for (const id of ['cron-expire-guarded', 'cron-reconcile-guarded']) {
      const check = BILLING_SMOKE_CHECKS.find((c) => c.id === id)!
      expect(judgeCheck(check, res(401)).ok).toBe(true)
      expect(judgeCheck(check, res(200, { ok: true })).ok).toBe(false)
    }
  })

  // 왜: 계정 화면이 안 뜨면 유저가 잔액·플랜·영수증을 볼 길이 없다.
  it('계정 요약은 200 이고 잔액·플랜 모양이 맞아야 통과다', () => {
    const check = BILLING_SMOKE_CHECKS.find((c) => c.id === 'account-summary')!
    expect(judgeCheck(check, res(200, { subscription: { plan: 's1', status: 'active' }, balance: { total: 266 } })).ok).toBe(true)
    expect(judgeCheck(check, res(200, { subscription: { plan: 'free', status: 'none' }, balance: null })).ok).toBe(true) // admin 은 balance null
    expect(judgeCheck(check, res(200, { subscription: null })).ok).toBe(false)
    expect(judgeCheck(check, res(500)).ok).toBe(false)
  })

  // 왜: 상품 대응표가 배포 env 에 안 들어가면 결제 버튼이 전부 죽는다(라이브 전환 직후 제일 흔한 사고).
  it('가격 페이지에 살아 있는 결제 버튼이 있어야 통과다', () => {
    const check = BILLING_SMOKE_CHECKS.find((c) => c.id === 'catalog-purchasable')!
    expect(judgeCheck(check, res(200, { purchasable: 13 })).ok).toBe(true)
    expect(judgeCheck(check, res(200, { purchasable: 0 })).ok).toBe(false)
  })

  // 왜: 유저가 스스로 취소하는 유일한 길. 이게 막히면 취소 문의가 우리에게 온다.
  it('고객 포털은 주소가 오거나, 결제 이력이 없으면 409 여야 통과다', () => {
    const check = BILLING_SMOKE_CHECKS.find((c) => c.id === 'portal-opens')!
    expect(judgeCheck(check, res(200, { overviewUrl: 'https://sandbox-customer-portal.paddle.com/cpl_x' })).ok).toBe(true)
    expect(judgeCheck(check, res(409, { error: 'no_customer' })).ok).toBe(true)
    expect(judgeCheck(check, res(500, { error: 'portal_failed' })).ok).toBe(false)
    expect(judgeCheck(check, res(200, {})).ok).toBe(false)
  })
})

describe('요약', () => {
  // 왜: 새벽에 돌면 아무도 안 본다. 실패한 것만 눈에 띄어야 하고, 하나라도 실패면 종료 코드가 1이어야 CI 가 잡는다.
  it('하나라도 실패면 실패로 요약하고 실패한 검사만 나열한다', () => {
    const out = summarize([
      { id: 'a', title: 'A', ok: true, detail: '200' },
      { id: 'b', title: 'B', ok: false, detail: '200, 기대 401' },
      { id: 'c', title: 'C', ok: true, detail: '401' },
    ])
    expect(out.ok).toBe(false)
    expect(out.passed).toBe(2)
    expect(out.failed.map((f) => f.id)).toEqual(['b'])
  })

  it('전부 통과면 통과로 요약한다', () => {
    const out = summarize([{ id: 'a', title: 'A', ok: true, detail: '200' }])
    expect(out.ok).toBe(true)
    expect(out.failed).toEqual([])
  })
})
