// 시연(공유) 계정 이메일 — 서버와 화면이 함께 쓰는 한 곳(2026-10-27 오너: 홍콩 스튜디오 시연 계정).
//   할당량 무제한(quota-exempt, 서버)과 자동 로그아웃 예외(idle-logout, 화면)가 이 목록을 함께 읽는다 — 시연 계정을 더할 때 여기만 고친다.
//   화면 모듈이라 서버 전용 모듈(supabaseAdmin 등)을 들이지 않는다. 운영 설정 QUOTA_EXEMPT_EMAILS 로 더한 계정은 서버만 안다(화면 예외 아님).
export const DEMO_ACCOUNT_EMAILS: readonly string[] = ['promotion@talestudio.art']

export function isDemoAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return DEMO_ACCOUNT_EMAILS.includes(email.trim().toLowerCase())
}
