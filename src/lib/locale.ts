// 프로젝트 표시 locale 해석 (language boundary S4) — 기본 'en' → (SSO 힌트, 후속) → 콘텐츠 언어 감지로 확정.
//   감지는 rule-base(유저 입력에 한글이 있으면 'ko'). 보수적이라 LLM 불요 — 확장 시 스크립트별 매핑 추가.
//   S5(#i18n-s5 2026-08-18, 오너 지시): UI 언어는 user_metadata.locale(기본 en)이 진실이고,
//   신규 프로젝트는 생성 시점 설정을 locale 로 박아 잠근다(콘텐츠 언어 = 프로젝트 단위 고정).
//   감지는 설정 이전에 만들어진 레거시 프로젝트(unlocked)의 폴백으로만 남는다.
export const DEFAULT_LOCALE = 'en'

/** 앱이 지원하는 언어 — UI 크롬(i18n 사전)과 파이프라인 출력 강제가 공유하는 집합. */
export type AppLocale = 'en' | 'ko'

export function parseAppLocale(v: unknown): AppLocale | null {
  return v === 'en' || v === 'ko' ? v : null
}

/** 유저 입력 텍스트의 언어를 rule-base 로 감지. 한글 포함 → 'ko', 그 외 → 'en'. */
export function detectLocaleFromText(text: string | null | undefined): string {
  if (text && /[가-힣]/.test(text)) return 'ko'
  return DEFAULT_LOCALE
}
