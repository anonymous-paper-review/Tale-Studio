// 사용자 id 로 보는 관리자 · 할당량 면제 판정(서버 전용) — 생성 검사 · Take 묶기 · 앞 화 가져오기처럼 이메일이 손에 없는 곳이 쓴다.
//   생성마다 도는 핫패스라 계정 이메일을 사용자당 한 번만 읽어 둔다(명단 변경은 배포 · 운영 설정 수준의 사건이라 프로세스 수명 캐시로 충분).
//   읽기에 실패하면 면제가 아닌 것으로 본다 — 한도가 잘못 걸리는 쪽이 뚫리는 쪽보다 안전하다(다음에 다시 읽는다).
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/admin'
import { isQuotaExemptEmail } from '@/lib/quota-exempt'

const accountEmails = new Map<string, string | null>()

async function accountEmailOf(userId: string): Promise<string | null> {
  if (accountEmails.has(userId)) return accountEmails.get(userId) ?? null
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (error) throw error
    const email = data?.user?.email ?? null
    accountEmails.set(userId, email)
    return email
  } catch {
    return null
  }
}

/** 관리자 — 동시 생성 자리(개인 상한) 면제는 관리자만 받는다(시연 계정은 상한 10 — generation-quota). */
export async function isAdminUserId(userId: string): Promise<boolean> {
  return isAdminEmail(await accountEmailOf(userId))
}

/** 할당량 면제(관리자 · 시연 계정) — 프로젝트 칸 · Take · 프로젝트당 영상 한도 · 앞 화 가져오기. */
export async function isQuotaExemptUserId(userId: string): Promise<boolean> {
  return isQuotaExemptEmail(await accountEmailOf(userId))
}
