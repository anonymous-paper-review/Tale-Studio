// 프로젝트 표시 locale 해석 (language boundary S4) — 기본 'en' → (SSO 힌트, 후속) → 콘텐츠 언어 감지로 확정.
//   감지는 rule-base(유저 입력에 한글이 있으면 'ko'). 보수적이라 LLM 불요 — 확장 시 스크립트별 매핑 추가.
//   S5(#i18n-s5 2026-08-18, 오너 지시): UI 언어는 user_metadata.locale(기본 en)이 진실이고,
//   신규 프로젝트는 생성 시점 설정을 locale 로 박는다(콘텐츠 언어 = 프로젝트 단위).
//   잠금(#chat-locale-follow 2026-08-31): 계정에 실제 설정이 있을 때만 생성 시 잠깍니다 —
//   미설정 계정의 en 폴백을 잠그면 한국어 사용자의 채팅이 영어로 고착된다(실사고).
//   unlocked 프로젝트는 ① producer 채팅의 발화 언어 추종(한글 발화 → ko 채택·잠금,
//   chat-format.ts) ② writer/start 스토리 감지(아래 resolveOutputLocale) ③ 보드의 채팅 언어
//   배지(명시 전환, PATCH /api/project/[id]) 중 먼저 오는 신호로 확정된다.
export const DEFAULT_LOCALE = 'en'

/** 앱이 지원하는 언어 — UI 크롬(i18n 사전)과 파이프라인 출력 강제가 공유하는 집합. */
export type AppLocale = 'en' | 'ko'

/**
 * 처음 온 방문자(저장된 언어 없음)의 화면 언어 (오너 2026-11-24 ③A).
 * 브라우저가 고른 첫 언어가 한국어면 ko, 아니면 en. 한 번 고른 언어(저장값)가 있으면 그쪽이 이긴다.
 */
export function initialLocaleFor(languages: readonly string[] | undefined): AppLocale {
  const first = languages?.[0]?.toLowerCase() ?? ''
  return first === 'ko' || first.startsWith('ko-') ? 'ko' : 'en'
}

export function parseAppLocale(v: unknown): AppLocale | null {
  return v === 'en' || v === 'ko' ? v : null
}

/** 화면 말을 실어 보내는 요청 머리 — 화살표 편집 길(콘티 · 실사)이 쓴다. 요청 몸 모양은 출시 시험이 못 박아 머리로 보낸다(검토 rev-realarrow 2차). */
export const UI_LOCALE_HEADER = 'x-ui-locale'

/** 서버가 쓸 사용자 말 — 화면이 보낸 말 → 계정에 저장된 말(user_metadata.locale, 언어 메뉴를 눌렀을 때만 저장) → en. 채팅 라우트와 같은 차례. */
export function requestUiLocale(sent: unknown, saved: unknown): AppLocale {
  return parseAppLocale(sent) ?? parseAppLocale(saved) ?? 'en'
}

/** 잠긴 프로젝트는 콘텐츠 언어, 아직 잠기지 않았으면 현재 화면 언어를 따른다. */
export function pickContentLocale(input: { projectLocale: AppLocale | null; locked: boolean | null; uiLocale: AppLocale }): AppLocale {
  if (input.projectLocale && input.locked !== false) return input.projectLocale
  return input.uiLocale
}

/**
 * writer/start 1.6 의 출력 언어 결정 (#i18n-s5) — 순수 로직 분리(유닛 검증 대상).
 * 잠긴 프로젝트는 잠긴 값이 곧 출력 언어. 레거시(unlocked)는 스토리 감지값을 쓰고 잠근다 —
 * 종전 "스토리 언어 추종" 산출과 동일해 행동이 보존된다.
 */
export function resolveOutputLocale(
  row: { locale?: unknown; locale_locked?: boolean | null } | null | undefined,
  story: string,
): { outputLocale: AppLocale | undefined; lockTo: string | null } {
  if (row?.locale_locked) return { outputLocale: parseAppLocale(row.locale) ?? undefined, lockTo: null }
  const detected = detectLocaleFromText(story)
  return { outputLocale: parseAppLocale(detected) ?? undefined, lockTo: detected }
}

/** 유저 입력 텍스트의 언어를 rule-base 로 감지. 한글 포함 → 'ko', 그 외 → 'en'. */
export function detectLocaleFromText(text: string | null | undefined): string {
  if (text && /[가-힣]/.test(text)) return 'ko'
  return DEFAULT_LOCALE
}
