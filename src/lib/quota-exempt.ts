// 할당량 면제 계정(서버 전용 판정) — 프로젝트 칸 · Take · 프로젝트당 영상 한도 · 앞 화 가져오기의 요금제 제한을 받지 않는다.
//   동시 생성 자리(개인 상한)는 관리자만 면제고, 시연 계정은 영상 · 그림 각각 10개다(generation-quota, 2026-10-27 오너).
//   관리자(src/lib/admin.ts)는 늘 면제다. 그 밖에 관리자 권한 없이 할당량만 푼 계정이 있다 —
//   2026-10-27 오너: 홍콩 스튜디오 시연용 promotion@talestudio.art(외부와 비밀번호를 나누므로 관리자 결제 창구 ·
//   디버그 프롬프트 · 내부 엔진은 열리지 않는다). 더할 계정은 운영 설정 QUOTA_EXEMPT_EMAILS(쉼표 구분)로.
//   ⚠ 공유 시연 계정 전용이다 — 이 목록의 관리자 아닌 계정은 계정 지우기도 잠긴다(api/account/delete). 실제 고객을 넣지 않는다.
//   코드 기본값을 끄려면 배포가 필요하다 — 급하면 Supabase 에서 비밀번호를 바꾸거나 계정을 정지한다.
//   관리자 판정처럼 소유자 검사와 AND 로 쓴다 — 남의 작업 공간을 열어도 그 공간의 한도는 풀리지 않는다.
import { isAdminEmail } from '@/lib/admin'
import { canUseReference } from '@/lib/plan-limits'
import { DEMO_ACCOUNT_EMAILS } from '@/lib/demo-accounts'

// 코드 기본 시연 계정 — 화면의 자동 로그아웃 예외와 같은 목록(src/lib/demo-accounts.ts).
const DEFAULT_QUOTA_EXEMPT_EMAILS = DEMO_ACCOUNT_EMAILS

export function isQuotaExemptEmail(email: string | null | undefined): boolean {
  if (!email) return false
  if (isAdminEmail(email)) return true
  const fromEnv = (process.env.QUOTA_EXEMPT_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...DEFAULT_QUOTA_EXEMPT_EMAILS, ...fromEnv]).has(email.trim().toLowerCase())
}

export function isQuotaExemptWorkspaceOwner(
  user: { id: string; email?: string | null },
  ownerId: string | null | undefined,
): boolean {
  return isQuotaExemptEmail(user.email) && ownerId === user.id
}

/** 앞 화에서 이어 만들기(다음 화 · 참고 프로젝트)를 쓸 수 있나 — 칸이 2개 이상인 요금제이거나 할당량 면제 계정.
 *  요금제 검사의 까닭은 "칸이 하나면 다음 화를 만들 자리가 없다"인데, 면제 계정은 칸이 무제한이다(2026-10-27 검토). */
export function referenceAllowed(plan: unknown, quotaExempt: boolean): boolean {
  return quotaExempt || canUseReference(plan)
}
