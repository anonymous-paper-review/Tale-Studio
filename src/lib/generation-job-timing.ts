// 잡 시간 상수 — 서버·화면이 함께 쓴다.
//
//   generation-jobs.ts 에 두면 화면 코드(스토어·폴링 헬퍼)가 상수 하나 때문에 그 파일 전체를 끌어오고,
//   그 안의 supabaseAdmin(`import 'server-only'`)이 클라이언트 번들에 딸려 들어가 빌드가 깨진다
//   (2026-09-09 프로덕션 빌드 실패: director-store → generation-jobs → supabase/admin).
//   서버 전용 코드가 없는 이 파일에 두면 양쪽이 같은 값을 보면서 경계를 넘지 않는다.

/** 이보다 오래 queued 면 웹훅이 유실된 유령으로 본다. 화면 폴링 포기 시각도 같은 값이다. */
export const STALE_QUEUED_MS = 10 * 60 * 1000
