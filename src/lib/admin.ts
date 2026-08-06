// 관리자 판별 (서버 전용) — 디버그 표면(#debug-prompts 2026-08-06)의 노출 게이트.
//   "관리자 계정이 만든 프로젝트"에서만 생성 풀 프롬프트 등 내부 정보를 팝업에 노출한다.
//   판정은 항상 서버(route)에서 하고 클라이언트에는 boolean 플래그만 내려보낸다.
const DEFAULT_ADMIN_EMAILS = ['auralight.gm@gmail.com']

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const fromEnv = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...DEFAULT_ADMIN_EMAILS, ...fromEnv]).has(email.trim().toLowerCase())
}
