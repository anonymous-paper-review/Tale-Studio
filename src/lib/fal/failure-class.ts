// 생성 실패 글 분류 — 화면 코드도 가져다 쓸 수 있게 서버 전용 파일(generation-jobs.ts · 서비스 키 클라이언트)에서 뽑았다.
//   규칙 본문은 옮기기 전 그대로다(동작 불변). generation-jobs.ts 가 이름 그대로 다시 내보내 기존 호출부는 바뀌지 않는다.
//   화면이 이 규칙으로 내용 검사 실패를 가려야 서버의 안전 모드 재시도 판단과 안내가 어긋나지 않는다(러프 내용 검사 알림).
//   약속: tests/job/classify-fal-failure.test.ts · tests/job/failure-class-shared.test.ts

// fal 실패 메시지 분류(best-effort) — 모더레이션/콘텐츠정책류 vs 일반. safe-mode 재시도 자격 판정에 쓴다.
//   오분류 시 generic 으로 떨어져 원본 프롬프트 재시도(안전 측). 키워드는 fal/openai 모더레이션 문구 기준.
const MODERATION_KEYWORDS =
  /moderation|safety|content[ _-]?policy|content_policy|\bblocked\b|nsfw|prohibited|flagged|violat|disallow/i

// #error-class(2026-08-13): 실패 원인 분류 — 클래스별 재시도 정책(P2/P3)의 측정 기반.
//   프로덕션 실패 51건 전수 집계에서 도출한 분류이고, 규칙의 예문은 전부 실측 메시지다.
//   순서가 곧 우선순위 — 구체 클래스가 먼저 먹는다(soft 가 moderation 키워드보다 앞 등).
//   'unknown' 은 분류 실패가 아니라 "아직 패턴을 모르는 실패"라는 축적 대상 데이터다.
export type JobErrorClass =
  | 'billing' // 잔액/결제 — 재시도 무의미, 오너 행동 필요 ("fal 잔액 소진")
  | 'data_ref' // 참조 이미지 접근 불가 — 우리 데이터 결함 ("image URL is not accessible")
  | 'moderation_soft' // 빈/검은 산출 — 비결정적, 재시도 가치 ("image too small — blank/moderated")
  | 'moderation' // 명시 콘텐츠 정책 — 프롬프트 수정 필요 (fal content_policy_violation)
  | 'infra' // 우리 인프라 정리 — webhook 유실 좀비, superseded ("stale queued reaped")
  | 'provider' // 프로바이더 일시 장애 — 재시도 가치 (5xx/429/타임아웃/결과 결함)
  | 'bad_request' // 불투명 400 + 422 스키마 거부 — 요청 자체가 틀림, 재시도 무가치 (#fal-canvas 실측 40건: image_size 'WxH' 문자열 거부가 unknown 으로 새던 구멍)
  | 'unknown'

const JOB_ERROR_CLASS_RULES: Array<[JobErrorClass, RegExp]> = [
  ['billing', /잔액|balance|billing|insufficient.{0,12}(credit|fund)/i], // i18n-ok: 서버가 받는 실패 글의 낱말을 가르는 규칙 — 화면 문구가 아니다
  ['data_ref', /image url is not accessible|failed to load the image|input\.image_urls/i],
  ['moderation_soft', /image too small|blank\/moderated/i],
  ['moderation', MODERATION_KEYWORDS],
  ['infra', /stale queued reaped|superseded|좀비/i], // i18n-ok: 서버가 받는 실패 글의 낱말을 가르는 규칙 — 화면 문구가 아니다
  [
    'provider',
    /\b(429|500|502|503|504|529)\b|rate.?limit|timeout|timed out|overloaded|ECONN|no (image|video) url in webhook payload|invalid video url|unavailable/i,
  ],
  // 422 는 data_ref(참조 이미지 접근 불가도 422로 옴)가 먼저 매칭된 뒤의 잔여 = 스키마 거부.
  ['bad_request', /^bad request$|status=4(00|22)\b|unprocessable entity/i],
]

export function classifyJobError(message: string | null | undefined): JobErrorClass {
  const m = (message ?? '').trim()
  if (!m) return 'unknown'
  for (const [cls, re] of JOB_ERROR_CLASS_RULES) if (re.test(m)) return cls
  return 'unknown'
}

export function classifyFalFailure(message: string | null | undefined): 'moderation' | 'generic' {
  return classifyJobError(message) === 'moderation' ? 'moderation' : 'generic'
}

/** 이 실패 글이 내용 검사(moderation)로 실패했다는 뜻인가 — 빈 그림(soft) · 시간 초과 · 일반 실패는 아니다. 글이 아니면(없음 · 오류 객체) false. */
export function isModerationFailureText(message: unknown): boolean {
  return typeof message === 'string' && classifyFalFailure(message) === 'moderation'
}
