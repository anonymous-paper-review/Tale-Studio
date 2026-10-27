// 시연 계정은 관리자처럼 오래 쉬어도 자동으로 로그아웃되지 않는다 (2026-10-27 오너 "promotion 계정도 자동 로그아웃 안 되게")
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { idleLogoutExempt } from '@/lib/idle-logout'
import { DEMO_ACCOUNT_EMAILS } from '@/lib/demo-accounts'

describe('자동 로그아웃 예외', () => {
  it('시연 계정은 30분 넘게 쉬어도 자동으로 로그아웃되지 않는다', () => {
    // 왜: 홍콩 스튜디오에 화면을 보여 주는 동안 설명하느라 손을 놓으면 30분 뒤 로그인 화면으로 튕겼다(2026-10-27 오너).
    expect(idleLogoutExempt('promotion@talestudio.art')).toBe(true)
    expect(idleLogoutExempt('  Promotion@TaleStudio.art ')).toBe(true)
  })

  it('관리자는 지금처럼 자동 로그아웃되지 않고, 보통 계정은 지금처럼 30분 쉬면 로그아웃된다', () => {
    // 왜: 정상 경로 고정 — 예외는 관리자(2026-07-09)와 시연 계정뿐이다.
    expect(idleLogoutExempt('admin@tale.studio')).toBe(true)
    expect(idleLogoutExempt('someone@example.com')).toBe(false)
    expect(idleLogoutExempt(null)).toBe(false)
  })

  it('자동 로그아웃 예외와 할당량 무제한은 같은 시연 계정 목록을 쓴다', () => {
    // 왜: 시연 계정을 더할 때 한 곳만 고치면 두 예외가 함께 따라오게 — 목록이 갈라지면 한쪽만 풀린다.
    expect(DEMO_ACCOUNT_EMAILS).toContain('promotion@talestudio.art')
    expect(readFileSync('src/lib/quota-exempt.ts', 'utf8')).toMatch(/DEMO_ACCOUNT_EMAILS/)
    expect(readFileSync('src/hooks/use-idle-timeout.ts', 'utf8')).toMatch(/idleLogoutExempt\(/)
  })
})
