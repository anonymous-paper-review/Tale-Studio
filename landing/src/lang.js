// 첫 화면 언어 정하기 (오너 2026-11-24 ③A) — 주소 ?lang= → 첫 화면에서 고른 언어(tale-lang) → 앱에서 고른 언어(tale-locale) → 브라우저 언어.
//   고른 언어는 앱의 언어 저장소(tale-locale, zustand persist 모양)에도 적어 요금 화면이 같은 언어로 열리게 한다.
//   약속: tests/ui-text/landing.test.ts
const ok = (v) => (v === 'ko' || v === 'en' ? v : null)

export function pickLandingLang({ query, saved, app, languages }) {
  const first = String((languages && languages[0]) || '').toLowerCase()
  return ok(query) || ok(saved) || ok(app) || (first === 'ko' || first.startsWith('ko-') ? 'ko' : 'en')
}

/** 앱(locale-store persist)이 읽는 저장 모양. */
export function appLocaleRecord(lang) {
  return JSON.stringify({ state: { locale: lang }, version: 0 })
}

export function readAppLocale(raw) {
  try { return ok(JSON.parse(raw || 'null')?.state?.locale) } catch { return null }
}
