// 관리자 디버그 게이트(#debug-prompts) 회귀 — 2026-08-07 실측 버그 방어.
//   버그: 관리자 목록에 개인 계정만 있고 실제 작업 워크스페이스는 admin@tale.studio 소유라
//   "관리자 이메일 && 워크스페이스 소유자" AND 조건이 배타가 돼 디버그가 영영 안 켜졌다.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { isAdminEmail, isAdminWorkspaceOwner } from '@/lib/admin'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isAdminEmail', () => {
  it('작업 워크스페이스 소유 계정(admin@tale.studio)을 관리자로 인정한다', () => {
    // 이 계정이 빠지면 프로젝트 25개에서 디버그가 켜지지 않는다(실측 버그 재발 방지).
    expect(isAdminEmail('admin@tale.studio')).toBe(true)
  })

  it('개인 관리자 계정도 인정한다', () => {
    expect(isAdminEmail('auralight.gm@gmail.com')).toBe(true)
  })

  it('대소문자·공백을 정규화한다', () => {
    expect(isAdminEmail('  Admin@Tale.Studio ')).toBe(true)
  })

  it('일반 계정·빈 값은 거부한다', () => {
    expect(isAdminEmail('test-eb2da004@tale.studio')).toBe(false)
    expect(isAdminEmail('')).toBe(false)
    expect(isAdminEmail(null)).toBe(false)
    expect(isAdminEmail(undefined)).toBe(false)
  })

  it('ADMIN_EMAILS 환경변수로 확장할 수 있다', () => {
    vi.stubEnv('ADMIN_EMAILS', 'extra@tale.studio, other@x.com')
    expect(isAdminEmail('extra@tale.studio')).toBe(true)
    expect(isAdminEmail('other@x.com')).toBe(true)
    expect(isAdminEmail('nope@x.com')).toBe(false)
  })
})

describe('isAdminWorkspaceOwner', () => {
  it('관리자 이메일과 워크스페이스 소유자가 모두 일치할 때만 통과한다', () => {
    const user = { id: 'admin-id', email: 'admin@tale.studio' }
    expect(isAdminWorkspaceOwner(user, 'admin-id')).toBe(true)
    expect(isAdminWorkspaceOwner(user, 'other-id')).toBe(false)
    expect(isAdminWorkspaceOwner({ id: 'admin-id', email: 'user@example.com' }, 'admin-id')).toBe(
      false,
    )
  })
})
