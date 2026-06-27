// 프로젝트 표시 locale 해석 (language boundary S4) — 기본 'en' → (SSO 힌트, 후속) → 콘텐츠 언어 감지로 확정.
//   감지는 rule-base(유저 입력에 한글이 있으면 'ko'). 보수적이라 LLM 불요 — 확장 시 스크립트별 매핑 추가.
//   소비자(표시 언어 전환·UI 크롬 i18n)는 S5. 생성은 locale 무관 항상 영어 base.
export const DEFAULT_LOCALE = 'en'

/** 유저 입력 텍스트의 언어를 rule-base 로 감지. 한글 포함 → 'ko', 그 외 → 'en'. */
export function detectLocaleFromText(text: string | null | undefined): string {
  if (text && /[가-힣]/.test(text)) return 'ko'
  return DEFAULT_LOCALE
}
