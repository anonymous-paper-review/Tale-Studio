import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
};

// Sentry 소스맵 업로드(#obs-audit 2026-09-04) — 프로덕션 클라 스택을 원본 파일·줄번호로 복원한다.
//   SENTRY_AUTH_TOKEN(조직 토큰, 빌드 전용) 없으면 업로드만 스킵되고 빌드는 그대로 진행 —
//   로컬/프리뷰 빌드가 토큰 없이도 깨지지 않는 이유. 런타임 수집 설정은 sentry.*.config.ts.
export default withSentryConfig(nextConfig, {
  org: "auteurs-media",
  project: "talestudio",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // 앱 라우터 클라 청크까지 업로드 범위를 넓힌다 — 스택 복원 커버리지.
  widenClientFileUpload: true,
  // 업로드 후 빌드 산출물에서 소스맵 제거 — 소스코드가 공개 URL로 서빙되지 않게.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
