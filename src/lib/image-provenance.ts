// 파생 이미지 provenance(입력 지문) + stale 판정 — producer-story-gate #57 / 결정 8.
//
// 원칙(architecture §5): 지문은 "생성 입력을 조립하는 그 함수"가 함께 계산한다. 캐릭터 이미지의
//   생성 입력 경계 = appearance(외모 텍스트)만 (결정: costume/채팅 스타일 지시는 stale 무관 — 권고안).
//   여기 순수 함수를 generate-sheet(submit 시 지문 계산)와 클라(현재 외모로 stale 비교)가 공유한다 →
//   분리하면 지문과 실제 입력이 어긋나 판정이 거짓말을 한다.
//
// isomorphic(서버/클라 공용) — node crypto/SubtleCrypto 차이를 피하려 비암호화 FNV-1a 지문을 쓴다.
//   지문은 정합성 신호일 뿐 보안 용도가 아니다.
import type { CharacterViewKey } from '@/types/asset'

/** character_image_candidates 행 하나 (클라 표현). */
export interface CandidateImage {
  id: string
  url: string
  sourceHash: string | null
  isSelected: boolean
  generatedAt: string
}

// 후보 보관 정책: 선택본은 항상 보존 + 미선택 후보는 슬롯당 최근 N장 (기간 기준 금지 — 결정 6).
export const CANDIDATE_RETENTION = 5

// character_image_candidates.view 값 (019 백필과 동일한 snake_case). object 단일 이미지도 'main' 사용.
export type CandidateView = 'main' | 'back' | 'side_left' | 'side_right'

export function viewKeyToCandidateView(view: CharacterViewKey): CandidateView {
  switch (view) {
    case 'main':
      return 'main'
    case 'back':
      return 'back'
    case 'sideLeft':
      return 'side_left'
    case 'sideRight':
      return 'side_right'
  }
}

/** CandidateView(snake_case DB 값) → CharacterViewKey(camelCase 클라/store 값) 역방향 매핑 */
export function candidateViewToViewKey(v: CandidateView): CharacterViewKey {
  switch (v) {
    case 'main':
      return 'main'
    case 'back':
      return 'back'
    case 'side_left':
      return 'sideLeft'
    case 'side_right':
      return 'sideRight'
  }
}

// 외모 텍스트 정규화: trim + 연속 공백 1칸 (사소한 공백 편집으로 헛-stale 방지). 대소문자/내용은 보존.
function normalizeAppearance(appearance: string | null | undefined): string {
  return (appearance ?? '').trim().replace(/\s+/g, ' ')
}

// FNV-1a 32bit → 8자리 hex. 결정적·동기·isomorphic.
function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** 캐릭터 이미지 생성 입력(외모)의 지문. submit 시점·stale 비교 시점이 같은 함수를 호출해야 한다. */
export function computeImageSourceHash(appearance: string | null | undefined): string {
  return fnv1a(normalizeAppearance(appearance))
}

/**
 * stale = 현재 외모로 만든 지문이 선택 후보의 지문과 다른가.
 *   candidateSourceHash 가 null(레거시 backfill — 지문 미상)이면 stale 아님(unknown, 강제 없음).
 *   stale 은 정보일 뿐 — 자동 무효화/재생성 금지(architecture §5).
 */
export function isImageStale(
  currentAppearance: string | null | undefined,
  candidateSourceHash: string | null | undefined,
): boolean {
  if (!candidateSourceHash) return false
  return computeImageSourceHash(currentAppearance) !== candidateSourceHash
}
