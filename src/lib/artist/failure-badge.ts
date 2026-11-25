// Artist 카드·상세가 보여 줄 실패 표시를 고르는 규칙 — 내용 검사에 걸린 칸과 그 밖의 실패를 가른다 (2026-11-25 오너).
//
// 왜 한 파일인가: 같은 판단을 인물 카드 · 배경 카드 · 인물 상세 · 배경 상세가 쓴다. 네 곳에 조건문을
//   흩으면 "내용 검사가 일반 실패를 이긴다"는 순서가 조용히 갈라진다 — 학생이 고칠 것이 있는 쪽(설명)을
//   먼저 보여야 하는데 한 화면에서는 "이미지 실패"만 보이는 일이 생긴다.
//
// 두 검사가 있고 할 수 있는 일이 다르다:
//   · 제출 전(Creem) 거절 — 작업 기록이 생기기 전에 끝난다. 서버가 순화 재시도 자격을 주지 않으므로
//     할 수 있는 일은 "설명을 고쳐 다시 그리기" 하나다.
//   · 제출 뒤(fal) 거절 — 작업이 실패로 닫힌다. 순화 재시도 단추가 있다(SAFE_RETRY_CAP 까지).
//   자동 재시도·문구 다시 쓰기는 하지 않는다(2026-11-25 오너) — 빨리 실패로 끝내고 어느 칸인지 알린다.
//
// 화면용 파일이다 — 서버 전용 모듈을 들이지 않는다.
import type { CharacterViewKey } from '@/types/asset'

/** 인물 칸 키의 구분자 — 인물 id · 모습 키 · 뷰 이름에 섞일 수 없는 글자라야 키가 겹치지 않는다. */
const SLOT_SEPARATOR = '\u0000'

/** artist-store 의 contentRefusals 인물 칸 키 — 인물 × 모습 × 뷰. 배경은 worldFailureKey 를 그대로 쓴다. */
export function characterRefusalKey(characterId: string, appearanceKey: string, view: CharacterViewKey): string {
  return [characterId, appearanceKey, view].join(SLOT_SEPARATOR)
}

/** 그 인물의 어느 칸이라도 제출 전 내용 검사에 걸렸나 — 카드 배지는 인물 단위라 모습·뷰를 묶어 본다. */
export function hasCharacterContentRefusal(
  refusals: Readonly<Record<string, unknown>>,
  characterId: string,
): boolean {
  const prefix = `${characterId}${SLOT_SEPARATOR}`
  return Object.keys(refusals).some((key) => key.startsWith(prefix))
}

/** 카드에 붙는 실패 배지의 종류. null = 배지 없음. */
export type FailureBadge = 'content-check' | 'image-failed' | null

/** 내용 검사에 걸린 칸이 있으면 그것이 이긴다 — 학생이 고칠 것이 있는 쪽을 보인다. */
export function failureBadge(input: { contentRefused?: boolean; failed?: boolean }): FailureBadge {
  if (input.contentRefused) return 'content-check'
  if (input.failed) return 'image-failed'
  return null
}

/** 상세 창의 실패 안내 종류. null = 안내 없음. */
export type FailureNotice = 'content-check-softer' | 'content-check-edit' | 'failed' | null

/**
 * 제출 뒤 거절(failure.moderation)이면 순화 재시도를 권하고, 제출 전 거절이면 설명 고치기만 말한다.
 * 두 거절이 겹치면 순화 단추가 있는 쪽을 보인다 — 할 수 있는 일이 하나 더 많다.
 */
export function failureNotice(input: {
  failure?: { moderation?: boolean } | null
  contentRefused?: boolean
}): FailureNotice {
  if (input.failure?.moderation) return 'content-check-softer'
  if (input.contentRefused) return 'content-check-edit'
  if (input.failure) return 'failed'
  return null
}
