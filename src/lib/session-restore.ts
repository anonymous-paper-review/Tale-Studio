// 세션 만료 → 재로그인/재진입 시 "보던 곳" 복원 유틸.
//
// 복원 우선순위 (studio layout):
//   ① URL ?projectId (탭별 — 각 탭의 주소가 자기 프로젝트를 들고 있음)
//   ② localStorage 마지막 본 프로젝트 (쿼리 없는 진입: 북마크/주소 직접 입력)
//   ③ 서버 fallback (최신 프로젝트 — /api/project/init)
//
// 보안 메모:
//   - projectId 는 비밀이 아니라 식별자 (URL 에 이미 노출). 진짜 경계는 서버 —
//     /api/project/init 이 본인 워크스페이스 범위로만 조회하고 미소유면 최신 fallback.
//   - next 리다이렉트 경로는 open redirect 방지를 위해 같은 오리진 상대경로만 허용.
//   - 로그아웃 시 clearLastProjectId() — 공용 브라우저에서 다음 계정에게 안 새게.

/** 로그인 복귀용 next 경로 검증 — 같은 오리진 상대경로만 통과 (open redirect 차단). */
export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (raw.length > 2000) return null
  // '/' 로 시작하되 '//'(protocol-relative)·'/\' 는 거부, 로그인 루프 방지
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null
  if (raw.startsWith('/login')) return null
  return raw
}

/** OAuth 왕복 동안 next 를 운반하는 단명 쿠키 (Supabase redirectTo 허용목록 비의존). */
export const NEXT_PATH_COOKIE = 'tale-next-path'

const LAST_PROJECT_KEY = 'tale:last-project-id'

export function readLastProjectId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(LAST_PROJECT_KEY)
  } catch {
    return null
  }
}

export function writeLastProjectId(projectId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LAST_PROJECT_KEY, projectId)
  } catch {
    /* storage 차단 환경 무시 */
  }
}

export function clearLastProjectId(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(LAST_PROJECT_KEY)
  } catch {
    /* ignore */
  }
}
