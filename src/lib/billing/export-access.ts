// previz 데이터 내보내기 요금제 판정(2026-10-27 오너 "s2 내보내기 막으셈").
//   요금제 표의 "Previz 데이터 내보내기"(getPlanEntitlements().canExport)를 화면의 내보내기 메뉴에 그대로 건다:
//   화면 JPEG · 마스터 시트 · 이 단계 ZIP · 전체 프로젝트 ZIP. 최종 영상(Editor 의 샷 ZIP · 이어 붙인 영상)은 모든 요금제에 열려 있다.
//   할당량 면제(관리자 · 시연 계정)는 다음 화 만들기(referenceAllowed)와 같이 요금제와 상관없이 연다.
//   약속: tests/billing/previz-export-access.test.ts
import { getPlanEntitlements } from '@/lib/plan-limits'

export type PrevizExportAccess = 'open' | 'locked' | 'checking' | 'failed'

export interface PrevizExportAccessInput {
  /** 계정 요약에서 읽은 작업 공간 요금제와 할당량 면제 여부. 아직 못 읽었으면 null. */
  account: { plan: string; unlimited: boolean } | null
  loading: boolean
  error: string | null
}

export function previzExportAccess({ account, loading, error }: PrevizExportAccessInput): PrevizExportAccess {
  // 한 번 읽은 요금제가 있으면 그것으로 판정한다(다시 읽기가 실패해도).
  if (account) return account.unlimited || getPlanEntitlements(account.plan).canExport ? 'open' : 'locked'
  if (error && !loading) return 'failed'
  return 'checking'
}
