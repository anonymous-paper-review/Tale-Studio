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

// 룩(전역 디자인 토큰 + 의상) 지문 구분자 — 룩 부재 시 미부착(레거시 바이트 동일 보장, F1).
const LOOK_SEP = '\u0000look:'

// computeLookFingerprint 입력 — projects.design_tokens(l1.art_style/shape_language, palette) + characters.costume.
export interface LookTokens {
  l1?: { art_style?: string | null; shape_language?: string | null } | null
  palette?: { primary?: string | null; secondary?: string | null; accent?: string | null } | null
}

/**
 * 룩(전역 그림체/형태/팔레트 + 캐릭터 의상) 지문. 룩이 전혀 없으면 null(=룩 미반영).
 *   결정적: 키 고정 + 공백 정규화 + palette 정렬(입력 순서 비의존)으로 헛-stale 방지.
 */
export function computeLookFingerprint(
  tokens: LookTokens | null | undefined,
  costume: string | string[] | null | undefined,
): string | null {
  const norm = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ')
  const art = norm(tokens?.l1?.art_style)
  const shape = norm(tokens?.l1?.shape_language)
  const palette = [tokens?.palette?.primary, tokens?.palette?.secondary, tokens?.palette?.accent]
    .map(norm)
    .filter(Boolean)
    .sort()
  // costume 은 DB characters.costume(text[]) 라 배열로 들어온다 — 합쳐서 정규화(단일 문자열도 허용).
  //   배열을 norm 에 그대로 넘기면 (배열 ?? '').trim() 이 깨짐(generate-sheet 'trim is not a function' 버그, 2026-06-28).
  const cost = norm(Array.isArray(costume) ? costume.join(', ') : costume)
  const parts: string[] = []
  if (art) parts.push(`art:${art}`)
  if (shape) parts.push(`shape:${shape}`)
  if (palette.length) parts.push(`palette:${palette.join(',')}`)
  if (cost) parts.push(`costume:${cost}`)
  return parts.length ? parts.join('|') : null
}

/**
 * 캐릭터 이미지 생성 입력 지문. submit 시점·stale 비교 시점이 같은 함수를 호출해야 한다.
 *   하위호환(F1): lookFingerprint 부재(null/undefined)면 SEP/sentinel을 부착하지 않고
 *   fnv1a(normalizeAppearance(appearance))를 그대로 반환 → 레거시 1인자 호출과 바이트 동일
 *   (룩 미반영 초안·기존 후보가 거짓 stale 안 됨). 룩 존재 시에만 appearance + LOOK_SEP + lookFingerprint.
 */
export function computeImageSourceHash(
  appearance: string | null | undefined,
  lookFingerprint?: string | null,
): string {
  const base = normalizeAppearance(appearance)
  // 룩 부재: 레거시 바이트 동일(F1). 룩 존재: appearance를 먼저 해시(고정폭 hex)해 도메인 분리 —
  //   appearance 원문이 LOOK_SEP 시퀀스를 포함해도 룩-스코프 지문과 충돌하지 않는다.
  return lookFingerprint ? fnv1a(fnv1a(base) + LOOK_SEP + lookFingerprint) : fnv1a(base)
}

/** 월드(로케이션) 이미지 생성 입력 지문 — 캐릭터와 동일 하위호환 규칙(룩 부재=visualDescription만). */
export function computeWorldImageSourceHash(
  visualDescription: string | null | undefined,
  lookFingerprint?: string | null,
): string {
  const base = normalizeAppearance(visualDescription)
  return lookFingerprint ? fnv1a(fnv1a(base) + LOOK_SEP + lookFingerprint) : fnv1a(base)
}

/**
 * stale = 현재 외모+룩으로 만든 지문이 선택 후보의 지문과 다른가.
 *   candidateSourceHash 가 null(레거시 backfill — 지문 미상)이면 stale 아님(unknown, 강제 없음).
 *   currentLookFingerprint 부재 시 appearance-only 비교(F1 하위호환). 룩 도착 후엔 룩 미반영 초안이 stale.
 *   stale 은 정보일 뿐 — 자동 무효화/재생성 금지(architecture §5).
 */
export function isImageStale(
  currentAppearance: string | null | undefined,
  currentLookFingerprint: string | null | undefined,
  candidateSourceHash: string | null | undefined,
): boolean {
  if (!candidateSourceHash) return false
  return computeImageSourceHash(currentAppearance, currentLookFingerprint) !== candidateSourceHash
}

// ── 후보 경계버퍼 evict 선정 (C4 AC16/17) ───────────────────────────────────
//
// 슬롯 키(C5 시간축 경계 결정): 현재 후보 슬롯 = (project_id, character_id|location_id, view).
//   이번 범위는 캐릭터/로케이션당 단일 canonical 이미지를 가정한다(코드에 variant_key 미사용).
//   스토리 시점별 변형은 깨지 않는 확장점으로 둔다 — 마이그레이션 023/024가 nullable variant_key를
//   예약(항상 null=canonical)하고, 도입 시 슬롯 키를 (…, view, COALESCE(variant_key,'canonical'))로 확장한다.
//   타임라인 이미지의 관리 위치/UX(artist inventory vs director i2i)는 본 범위 비목표(별도 인터뷰/플랜 보류).
/** evict 선정 입력 — 한 슬롯(project+character/location+view)의 후보들. */
export interface RetentionCandidate {
  id: string
  isSelected: boolean
  pinned: boolean
  generatedAt: string
}

/**
 * 슬롯당 최근 retention개만 보관하도록 삭제할 후보 id를 고른다(결정적).
 *   - 보호: is_selected || pinned 인 후보는 절대 evict 대상이 아니다(사람 선별 보호 — #57).
 *   - evict: 비선택·비핀 후보를 generatedAt desc(최신 우선)로 두고, (retention - 보호수)만큼만 남긴 뒤
 *     나머지(가장 오래된 비보호분)를 삭제 대상으로 반환한다.
 *   - 보호 후보만으로 retention을 넘으면 비보호분은 전부 삭제(보호는 그대로 유지 → 총량이 retention을 넘을 수 있음).
 *   캐릭터(character_image_candidates)·월드(location_image_candidates) 공통.
 */
export function selectCandidatesToEvict(
  candidates: RetentionCandidate[],
  retention: number = CANDIDATE_RETENTION,
): string[] {
  const protectedCount = candidates.filter((c) => c.isSelected || c.pinned).length
  const keep = Math.max(0, retention - protectedCount)
  return candidates
    .filter((c) => !c.isSelected && !c.pinned)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(keep)
    .map((c) => c.id)
}
