// 잡 시간 상수 — 서버·화면이 함께 쓴다.
//
//   generation-jobs.ts 에 두면 화면 코드(스토어·폴링 헬퍼)가 상수 하나 때문에 그 파일 전체를 끌어오고,
//   그 안의 supabaseAdmin(`import 'server-only'`)이 클라이언트 번들에 딸려 들어가 빌드가 깨진다
//   (2026-09-09 프로덕션 빌드 실패: director-store → generation-jobs → supabase/admin).
//   서버 전용 코드가 없는 이 파일에 두면 양쪽이 같은 값을 보면서 경계를 넘지 않는다.
//
//   시계는 둘뿐이다(2026-11-24 C12): 그림 10분 · 영상 30분. 영상 30분은 DB 자리 집계 창(트리거
//   v_cutoff 30분)과 같은 값이라 "화면에는 없는데 자리는 먹는" 20분 구간이 영상에는 없다.
//   generation-batches 가 따로 적던 BATCH_STALE_QUEUED_MS 도 여기서 가져간다.

/** 그림 잡이 이보다 오래 queued 면 웹훅이 유실된 유령으로 본다. 화면 폴링 포기 시각도 같은 값이다. */
export const STALE_QUEUED_MS = 10 * 60 * 1000

/** 영상 잡의 같은 기준. 영상은 큐 대기까지 10분을 넘기는 일이 있어 DB 자리 집계 창(30분)과 맞춘다. */
export const STALE_QUEUED_VIDEO_MS = 30 * 60 * 1000

/** 영상 잡 종류 — 유령 기준이 30분인 쪽. */
export const VIDEO_JOB_KINDS = ['shot_video', 'shot_previz_video'] as const

/** 잡 종류별 유령 기준. kind 를 모르면 그림 기준(짧은 쪽)을 쓴다. */
export function staleQueuedMsFor(kind: string | null | undefined): number {
  return (VIDEO_JOB_KINDS as readonly string[]).includes(kind ?? '') ? STALE_QUEUED_VIDEO_MS : STALE_QUEUED_MS
}

/**
 * PostgREST `.or()` 에 넣는 종류별 시간 필터 — 영상은 30분, 그림은 10분 기준을 DB 에서 한 번에 거른다.
 *   'fresh' = 기준 안(진행 중으로 세는 것) · 'stale' = 기준 밖(유령 후보).
 */
export function staleQueuedOrFilter(side: 'fresh' | 'stale', now = Date.now()): string {
  const op = side === 'fresh' ? 'gte' : 'lt'
  const kinds = `(${VIDEO_JOB_KINDS.join(',')})`
  const videoCut = new Date(now - STALE_QUEUED_VIDEO_MS).toISOString()
  const imageCut = new Date(now - STALE_QUEUED_MS).toISOString()
  return `and(kind.in.${kinds},created_at.${op}.${videoCut}),and(kind.not.in.${kinds},created_at.${op}.${imageCut})`
}

/** 화면 폴링: 질문 한 번을 이보다 오래 기다리지 않는다. 넘기면 이번 시도만 접고 다음 틱에 다시 묻는다. */
export const POLL_REQUEST_TIMEOUT_MS = 10_000

/** 화면 폴링: 평소 간격. */
export const POLL_INTERVAL_MS = 3_000

/** 화면 폴링: 일시 오류가 이어질 때 간격 상한(3→6→12→24→30초). */
export const POLL_BACKOFF_MAX_MS = 30_000

/** 서버 폴링 라우트: 제출 뒤 이 시간 안에는 웹훅을 믿고 fal 에 직접 묻지 않는다. 웹훅 주소가 없으면(로컬) 0. */
export const WEBHOOK_GRACE_MS = 45_000

/** 서버 폴링 라우트: 웹훅 유예가 지난 잡도 인스턴스당 이 간격으로만 fal 에 묻는다. */
export const POLL_RECONCILE_THROTTLE_MS = 30_000

/**
 * 마무리(저장) 자리: 웹훅과 폴링이 같은 그림을 동시에 마무리하면 먼저 자리를 찍은 쪽만 저장한다(2026-11-24).
 *   찍은 쪽이 이 시간 안에 끝내지 못하면(함수가 죽음) 다른 쪽이 이어받는다. 웹훅 함수는 60초(maxDuration) 안에 끝나거나 죽으므로 2분이면 넘넉하다.
 */
export const FINALIZE_CLAIM_STALE_MS = 2 * 60 * 1000
