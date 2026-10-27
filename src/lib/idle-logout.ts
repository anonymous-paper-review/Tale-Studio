// 유휴 자동 로그아웃(30분) 예외 계정 — 화면 모듈(use-idle-timeout 이 읽는다).
//   관리자 편의(2026-07-09, 사용자 요청) + 시연 계정(2026-10-27 오너 "promotion 계정도 자동 로그아웃 안 되게" — 화면을 보여 주는 동안
//   설명하느라 손을 놓으면 로그인 화면으로 튕겼다). 클라 UX 예외일 뿐 — 세션 자체는 Supabase JWT 만료/갱신이 관장한다.
//   트레이드오프: 예외 계정은 자리 비운 세션이 유휴로 끊기지 않는다(시연 계정은 외부와 비밀번호를 나눈다 — 시연 뒤 비밀번호 교체 권장).
import { isDemoAccountEmail } from '@/lib/demo-accounts'

const ADMIN_IDLE_EXEMPT_EMAILS = new Set(['admin@tale.studio'])

export function idleLogoutExempt(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase() ?? ''
  if (!normalized) return false
  return ADMIN_IDLE_EXEMPT_EMAILS.has(normalized) || isDemoAccountEmail(normalized)
}
