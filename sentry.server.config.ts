// Sentry 서버(nodejs) 초기화 — instrumentation.register()가 런타임에 맞춰 로드한다.
// DSN 없으면 no-op: 로컬/프리뷰에서 env 미설정이어도 제품 동작 불변.
// tracesSampleRate 0 = 에러 수집만(성능 추적·리플레이 없음 — 과하지 않게, #obs-audit 2026-09-02).
import * as Sentry from '@sentry/nextjs'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? 'development',
    tracesSampleRate: 0,
    sendDefaultPii: false,
  })
}
