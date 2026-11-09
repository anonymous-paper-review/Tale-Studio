// 인물 모습 이름을 화면 언어로(오너 2026-11-10 "영어 언어에서 한국어 나오는거 수정해줘(Artist의 인물 버전이 "현재"로 나옴)").
//   기본 모습은 만들어질 때 서버(create_person_with_default_appearance)가 한국어 이름 "현재" 하나로 붙인다 — 작품 언어와 상관없다.
//   그 원래 이름만 화면 언어로 바꿔 보이고, 사람이 붙이거나 바꾼 이름은 작품 글이라 적은 그대로 둔다. 약속: tests/artist/look-label.test.ts
//   "현재"는 모습의 시점(과거 · 현재 · 미래)과 같은 말이라 같은 사전 키(Present)를 쓴다 — 상세 창이 이름과 시점이 같으면 한 번만 보인다.

/** 서버가 기본 모습에 붙이는 원래 이름. */
const DEFAULT_LOOK_LABEL = '현재' // i18n-ok: 서버가 저장한 원본 label 과 맞대 보는 값이다

/** 화면에 보일 모습 이름 — 기본 모습의 원래 이름 "현재"면 화면 언어("Present"), 그 밖에는 적은 그대로. */
export function appearanceLabel(
  look: { label: string; isDefault?: boolean },
  t: (text: string, params?: Record<string, string | number>) => string,
): string {
  return look.isDefault && look.label.trim() === DEFAULT_LOOK_LABEL ? t('Present') : look.label
}
