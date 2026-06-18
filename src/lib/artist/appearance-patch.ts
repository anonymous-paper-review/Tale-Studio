// 캐릭터 canonical 외형(원천) 변경 검증 (순수 함수) — C3 F6 승인 경로.
//
// cc 가 "기존 캐릭터 외형 변경"을 감지하면 자동경로(applyUpdates)로 절대 커밋되지 않고
//   pending-proposal('artistSourceAppearancePatch')로만 표면화된다. 사용자 승인 후 /api/artist/appearance
//   라우트가 이 검증을 통과한 값만 characters.appearance 에 커밋한다(모델은 제안만 — architecture §3).
//   검증을 라우트와 분리해 순수 단위 테스트가 가능하게 한다.

export const APPEARANCE_MAX_LENGTH = 2000

export type AppearancePatchResult =
  | { ok: true; appearance: string }
  | { ok: false; error: string }

/**
 * 외형 패치 입력 검증·정규화. 통과 시 trim 된 appearance 반환.
 *   - 문자열 아님/누락 → 거부
 *   - trim 후 빈 문자열 → 거부(외형 비우기는 이 경로로 허용 안 함)
 *   - APPEARANCE_MAX_LENGTH 초과 → 거부(과도 입력 방지)
 *   (소유권 검증은 라우트에서 userOwnsProject 로 별도 수행 — 여기선 필드 화이트리스트+길이만.)
 */
export function validateAppearancePatch(input: unknown): AppearancePatchResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'body required' }
  }
  const { appearance } = input as { appearance?: unknown }
  if (typeof appearance !== 'string') {
    return { ok: false, error: 'appearance must be a string' }
  }
  const trimmed = appearance.trim()
  if (!trimmed) {
    return { ok: false, error: 'appearance must not be empty' }
  }
  if (trimmed.length > APPEARANCE_MAX_LENGTH) {
    return { ok: false, error: `appearance exceeds ${APPEARANCE_MAX_LENGTH} chars` }
  }
  return { ok: true, appearance: trimmed }
}
