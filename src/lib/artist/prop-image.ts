// 소품 그림(D7, 오너 2026-11-22 "소품도 한 장") — 화면과 서버가 함께 쓰는 순수 규칙: 그림 지시문 · 그림 지문 · 바뀜 판정.
//   그림 = 소품 양식(m1126 A2 2026-11-26 "탬플릿에 담아서 · 인물, 배경처럼 16:9", 칸 좌표 prop-sheet-template.ts)의 칸마다 같은 물건 하나를
//   여러 방향으로 · 흰 바탕 · 사람 · 손 없음 — 16:9 한 장(인물 시트와 같은 결). 양식을 못 올리면 예전처럼 물건 하나만 정면으로 그린 한 장(16:9).
//   실사 샷 이미지가 이 그림을 소품 참고로 쓴다(2단계).
//   글씨 스위치(PROP_TEXT_RULE): 오너 P1(2026-11-22 "추천대로") = 'described' — 설명에 적힌 글씨(편지의 잉크 글씨 · 간판 · 책 표지)만 남기고
//     모델이 덧붙이는 이름 · 라벨 · 로고 · 워터마크는 막는다. 'none' 은 예전 (a) — 글자를 하나도 그리지 않는다.
//     규칙을 바꿔도 이미 그린 그림은 저절로 바뀌지 않는다(지문에 규칙이 없다 — 바뀜 표시도 없다).
//   지문 = "p1:<생김새 해시>:<그림체>" — 생김새가 바뀌면 "설명 바뀜", 그림체가 바뀌면 "그림체 바뀜"(그림체 재생성은 소품을 함께 다시 그리지 않는다, 리드 결정 3).
//   서버 전용 의존성 금지(카드가 바뀜 판정을 쓴다). 약속: tests/artist/prop-image.test.ts
import { computeWorldDescriptionHash } from '@/lib/image-provenance'
import { hasPhotoTexture, PHOTO_PROP_PICTURE_LINE, PHOTO_PROP_SHEET_LINE, PHOTO_TEXTURE_PLACE } from '@/lib/style-facets/photo-sheet-line'

/** 소품 그림의 글씨 규칙 — 'none' 글자 없음 · 'described' 설명에 적힌 글씨만. */
export type PropTextRule = 'none' | 'described'

/** 소품 그림 글씨 스위치 — 오너 P1(2026-11-22) 'described'. 바꾸면 tests/artist/prop-image.test.ts 의 지시문 테스트 이름도 함께 바꾼다. */
export const PROP_TEXT_RULE: PropTextRule = 'described'

const NO_TEXT_LINE = 'No people, no hands, no faces, no other objects, no text, no labels, no logo.'
const DESCRIBED_TEXT_LINE =
  'No people, no hands, no faces, no other objects. Writing that the description says is on the object stays on it, exactly as described; add no other text, no labels, no names, no logo and no watermark.'

/** 문장 끝 — 이미 마침표(. 。 ! ?)로 끝나면 그대로, 아니면 마침표를 붙인다(설명 · 바꿀 점이 마침표로 끝나 ".."가 되던 것, QA 2026-11-23 c). */
function sentence(text: string): string {
  return /[.。!?]$/.test(text) ? text : `${text}.`
}

/** 정책 거절 뒤 안전 재시도 문구 — 인물 시트(turnaround SAFE_TOKENS)와 같은 결. */
const PROP_SAFE_TOKENS = 'stylized non-graphic depiction, tasteful, safe-for-work'
/** 실사 그림체의 순화 문구 — "stylized … depiction"이 사진 글과 다투지 않게(인물 시트 SAFE_TOKENS_PHOTO 와 같은 결). */
const PROP_SAFE_TOKENS_PHOTO = 'tasteful non-graphic photograph, safe-for-work'

/** 소품 양식 칸 문장 — 칸 이름은 prop-sheet-template.ts 와 한 쌍이다(인물 시트의 칸 문장과 같은 결). */
const SHEET_LINES = [
  'Keep the template EXACTLY as-is — every tile border and its small label stays in place; draw only INSIDE the tiles and never add text of your own.',
  'MAIN tile: the whole object, large and centered, in a three-quarter view at eye level.',
  'FRONT, SIDE and BACK tiles: the same object seen straight from the front, the side and the back, at the same scale in all three.',
  'TOP tile: the same object seen from directly above.',
  'DETAIL tile: a close-up of its most distinctive part — its material, texture or markings.',
  'The same single object in every tile — identical shape, material, colors and markings — on a plain white background inside every tile.',
]

/** 소품 모습 그림(m1126 A3) — 마지막 참고 그림이 같은 물건의 기본 모습이다(배경 모습이 기본 배경을 참조하는 것과 같다). */
const DEFAULT_LOOK_LINE =
  'The last reference image shows the default look of this same object — keep it recognisably the same object (its shape, size, design and markings) and change only what the description above says.'

/**
 * 소품 그림 지시문. sheet(기본) = 소품 양식 칸을 채우는 시트, false = 양식 없이 물건 하나만 정면으로 그린 한 장(양식을 못 올렸을 때).
 * hasDefaultLook = 소품 모습 그림이라 마지막 참고 그림이 기본 모습 그림이다(m1126 A3).
 * photoLook = 실사 그림체(기준 그림 없는 실사)의 사진 글(리드 R2 2026-11-26, 인물 시트와 같은 결) — 물건 설명 바로 뒤에 사진 문장, 끝에 "실제 사진" 질감 문장과
 *   그 그림체의 색감 문장. 없으면(일본 멜로 · 다른 그림체 · 그림체 없음) 지금 그대로.
 */
export function buildPropImagePrompt(input: {
  name: string
  appearance: string
  instruction?: string | null
  safeMode?: boolean
  textRule?: PropTextRule
  sheet?: boolean
  photoLook?: { clause: string | null } | null
  hasDefaultLook?: boolean
}): string {
  const name = input.name.trim()
  const appearance = input.appearance.trim()
  const subject = appearance ? `${name}: ${appearance}` : name
  const instruction = input.instruction?.trim()
  const sheet = input.sheet ?? true
  const photo = input.photoLook ?? null
  const photoClause = photo?.clause?.trim() || null
  return [
    sentence(sheet ? `Fill in this prop reference-sheet template with ${subject}` : `Prop reference picture of ${subject}`),
    ...(instruction ? [sentence(`Requested change: ${instruction}`)] : []),
    ...(photo ? [sheet ? PHOTO_PROP_SHEET_LINE : PHOTO_PROP_PICTURE_LINE] : []),
    ...(sheet
      ? SHEET_LINES
      : [
          'Show this one object alone, whole and centered, seen straight from the front at eye level, filling about two thirds of the frame,',
          'on a plain neutral background.',
        ]),
    ...(input.hasDefaultLook ? [DEFAULT_LOOK_LINE] : []),
    (input.textRule ?? PROP_TEXT_RULE) === 'described' ? DESCRIBED_TEXT_LINE : NO_TEXT_LINE,
    ...(input.safeMode ? [photo ? PROP_SAFE_TOKENS_PHOTO : PROP_SAFE_TOKENS] : []),
    ...(photo && !hasPhotoTexture(photoClause) ? [sentence(PHOTO_TEXTURE_PLACE)] : []),
    ...(photoClause ? [sentence(photoClause)] : []),
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
