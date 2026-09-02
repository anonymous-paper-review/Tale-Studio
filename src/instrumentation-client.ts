// Sentry 브라우저 초기화 (#obs-audit 2026-09-02) — 관측 사각지대의 마지막 조각.
//
// 왜: hydration 불일치·undefined 접근·상태 꼬임 같은 클라 전용 사고는 서버·DB에 흔적이 0이다
//   (server_errors 테이블도 서버 예외만 담는다). window 에러·unhandledrejection·React 렌더 예외를
//   여기서 수집해야 "서버는 전부 200인데 화면이 죽는" 계열이 처음으로 부검 가능해진다.
// 범위: 에러 수집만 — 성능 추적(tracesSampleRate 0)·세션 리플레이(0) 전부 끔. DSN은 설계상
//   공개 가능 키(수집 주소일 뿐 조회 권한 없음)라 NEXT_PUBLIC_ 노출이 표준이다.
import * as Sentry from '@sentry/nextjs'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  })
}
