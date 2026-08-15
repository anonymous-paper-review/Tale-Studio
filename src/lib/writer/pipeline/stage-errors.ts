// #stage-retry (2026-08-13, 오너 정책) — 스테이지 예외 분류와 자동 재시도 판정.
//
// 정책: **일시(transient) 오류는 자동 1회 재시도, 그 후는 사람 방아쇠('이어서 재시도')**.
// 결정(permanent) 오류는 같은 입력이 같은 실패를 낳으므로 재시도 예산을 태우지 않고
// 즉시 표면화한다 — F5-R2 제약 위반(데이터 결함 신호)을 재시도로 문지르면 F-005 재연.
//
// 분류는 **permanent 패턴만 명시**하고 나머지는 transient 로 둔다(기본 = 재시도 1회 후 표면화,
// 비용 상한이 있으므로 오분류의 대가가 작은 쪽으로 기운다). 429 계열 문구에 "quota" 가
// 끼는 프로바이더(rate limit 의미)가 있어 quota 단어 자체는 permanent 로 취급하지 않는다 —
// 결제/크레딧 소진만 명시적으로 잡는다.

export type StageErrorClass = 'network' | 'transient' | 'permanent'

/** 오너 정책(2026-08-13): 스테이지당 자동 재시도 횟수. 이 예산이 소진되면 markFailed → resume 버튼. */
export const AUTO_RETRY_PER_STAGE = 1

/** 오너 정책(2026-08-13 확장): network(프로바이더/우리 서버 일시 장애)는 **예산 차감 없이**
 *  백그라운드 재시도. 이 캡은 정책이 아니라 무한 루프 안전핀 — 실제 장애는 그 전에 풀리거나
 *  캡 소진 후 resume 버튼으로 표면화된다. */
export const NET_RETRY_CAP = 8

/** network 재시도 n회차(1부터) 전 대기 — 429 폭주 완화. 지수 백오프, 15s 상한. */
export function netBackoffMs(count: number): number {
  return Math.min(2_000 * 2 ** Math.max(0, count - 1), 15_000)
}

// 프로바이더/네트워크/우리 서버의 일시 장애 — 같은 입력 그대로 다시 보내면 되는 부류.
const NETWORK_PATTERNS =
  /\b(429|500|502|503|504|529)\b|rate.?limit|resource has been exhausted|timeout|timed out|overloaded|unavailable|ECONN|EAI_AGAIN|socket hang up|fetch failed|network error|aborted/i

const PERMANENT_PATTERNS: RegExp[] = [
  // DB 결정 실패 — 제약/중복/스키마. F5-R2(shots_prompt_not_blanked) 위반이 여기로 온다.
  /violates|constraint|duplicate key|23514|23505|42703|42P01/i,
  // 권한/인증 — 재시도해도 같은 답.
  /permission denied|row-level security|unauthorized|forbidden/i,
  // 프로바이더 설정/키/결제 — 사람이 고쳐야 한다.
  /invalid api key|api key not|misconfigured|insufficient.{0,12}(credit|fund)|billing/i,
  // 콘텐츠 정책 — 입력을 바꿔야 한다.
  /moderation|content.?policy|safety (system|setting)/i,
]

/** 스테이지 예외 분류. permanent > network > transient 순으로 판정 — 모르는 오류는
 *  transient(1회 재시도 후 표면화). network 는 예산 무차감 재시도(NET_RETRY_CAP 안전핀). */
export function classifyStageError(e: unknown): StageErrorClass {
  const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
  if (PERMANENT_PATTERNS.some((re) => re.test(message))) return 'permanent'
  if (NETWORK_PATTERNS.test(message)) return 'network'
  return 'transient'
}

/**
 * 자동 재시도 판정 — attemptCount 는 방금 실패한 진입의 카운트(첫 시도 = 1).
 * transient 이고 소진 전(attemptCount ≤ 예산)일 때만 true. permanent 는 항상 false.
 */
export function shouldAutoRetry(e: unknown, attemptCount: number): boolean {
  return classifyStageError(e) === 'transient' && attemptCount <= AUTO_RETRY_PER_STAGE
}
