// 시연(공유) 계정 이메일 — 서버와 화면이 함께 쓰는 한 곳(2026-10-27 오너: 홍콩 스튜디오 시연 계정).
//   할당량 무제한(quota-exempt, 서버)과 자동 로그아웃 예외(idle-logout, 화면)가 이 목록을 함께 읽는다 — 시연 계정을 더할 때 여기만 고친다.
//   화면 모듈이라 서버 전용 모듈(supabaseAdmin 등)을 들이지 않는다. 운영 설정 QUOTA_EXEMPT_EMAILS 로 더한 계정은 서버만 안다(화면 예외 아님).
//   devtest@ — 운영 시험 계정(2026-11-12 오너 "devtest도 admin과 같은 설정해놔줘(테이크 무한, 자동 로그아웃 끄기)"). 동시 생성 무제한은
//   quota-exempt 의 UNLIMITED_CAPACITY_EMAILS 가 따로 준다. 관리자 권한은 없다.
export const DEMO_ACCOUNT_EMAILS: readonly string[] = ['promotion@talestudio.art', 'devtest@talestudio.art']

export function isDemoAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return DEMO_ACCOUNT_EMAILS.includes(email.trim().toLowerCase())
}
