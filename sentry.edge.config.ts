// Sentry edge(미들웨어) 초기화 — instrumentation.register()가 런타임에 맞춰 로드한다.
// server_errors DB 기록은 nodejs 전용(관리자 클라이언트가 Node 의존)이라, edge 예외는 Sentry가 유일한 흔적이다.
import * as Sentry from '@sentry/nextjs'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? 'development',
    tracesSampleRate: 0,
    sendDefaultPii: false,
  })
}
