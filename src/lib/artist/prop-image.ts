// 소품 그림(D7, 오너 2026-11-22 "소품도 한 장") — 화면과 서버가 함께 쓰는 순수 규칙: 그림 지시문 · 그림 지문 · 바뀜 판정.
//   그림 = 물건 하나만 · 정면 · 빈 배경 · 사람 · 손 · 글자 없음 · 정사각 한 장. 실사 샷 이미지가 이 그림을 소품 참고로 쓴다(2단계).
//   글씨 스위치(PROP_TEXT_RULE, 리드 2026-11-22 "(c)" — 오너 결정 대기): 기본 'none' = 글자 없음(지금).
//     'described' = 설명에 적힌 글씨(편지의 잉크 글씨 · 간판 · 책 표지)만 남기고 모델이 덧붙이는 이름 · 라벨 · 로고 · 워터마크는 계속 막는다.
//   지문 = "p1:<생김새 해시>:<그림체>" — 생김새가 바뀌면 "설명 바뀜", 그림체가 바뀌면 "그림체 바뀜"(그림체 재생성은 소품을 함께 다시 그리지 않는다, 리드 결정 3).
//   서버 전용 의존성 금지(카드가 바뀜 판정을 쓴다). 약속: tests/artist/prop-image.test.ts
import { computeWorldDescriptionHash } from '@/lib/image-provenance'

/** 소품 그림의 글씨 규칙 — 'none' 글자 없음 · 'described' 설명에 적힌 글씨만. */
export type PropTextRule = 'none' | 'described'

/** 소품 그림 글씨 스위치 — 오너가 고르기 전까지 'none'(지금 그대로). 바꾸면 tests/artist/prop-image.test.ts 의 지시문 테스트 이름도 함께 바꾼다. */
export const PROP_TEXT_RULE: PropTextRule = 'none'

const NO_TEXT_LINE = 'No people, no hands, no faces, no other objects, no text, no labels, no logo.'
const DESCRIBED_TEXT_LINE =
  'No people, no hands, no faces, no other objects. Writing that the description says is on the object stays on it, exactly as described; add no other text, no labels, no names, no logo and no watermark.'

/** 정책 거절 뒤 안전 재시도 문구 — 인물 시트(turnaround SAFE_TOKENS)와 같은 결. */
const PROP_SAFE_TOKENS = 'stylized non-graphic depiction, tasteful, safe-for-work'

export function buildPropImagePrompt(input: { name: string; appearance: string; instruction?: string | null; safeMode?: boolean; textRule?: PropTextRule }): string {
  const name = input.name.trim()
  const appearance = input.appearance.trim()
  const subject = appearance ? `${name}: ${appearance}` : name
  const instruction = input.instruction?.trim()
  return [
    `Prop reference picture of ${subject}.`,
    ...(instruction ? [`Requested change: ${instruction}.`] : []),
    'Show this one object alone, whole and centered, seen straight from the front at eye level, filling about two thirds of the frame,',
    'on a plain neutral background.',
    (input.textRule ?? PROP_TEXT_RULE) === 'described' ? DESCRIBED_TEXT_LINE : NO_TEXT_LINE,
    ...(input.safeMode ? [PROP_SAFE_TOKENS] : []),
  ].join(' ')
}

/** 이 그림을 그린 입력의 지문 — 생김새(영어 base) 해시와 그림체 id. */
export function propImageStamp(appearance: string | null | undefined, styleId: string | null | undefined): string {
  return `p1:${computeWorldDescriptionHash(appearance)}:${styleId?.trim() || '-'}`
}

/**
 * 그림이 지금 입력과 맞는가 — 'style' 그림체가 바뀜(먼저 본다), 'edited' 생김새가 바뀜, 'fresh' 맞음.
 *   지문이 없거나 모르는 꼴이면(사람이 올린 그림 · 예전 그림) 'fresh' — 바뀜을 지어내지 않는다.
 */
export function propImageStale(
  stamp: string | null | undefined,
  appearance: string | null | undefined,
  styleId: string | null | undefined,
): 'fresh' | 'edited' | 'style' {
  const match = typeof stamp === 'string' ? /^p1:([^:]+):(.+)$/.exec(stamp) : null
  if (!match) return 'fresh'
  if (match[2] !== (styleId?.trim() || '-')) return 'style'
  return match[1] === computeWorldDescriptionHash(appearance) ? 'fresh' : 'edited'
}
