// Creem 프롬프트 검사 — 이미지·영상 모델로 나가는 모든 경로의 공용 관문.
//
// 왜 한 모듈인가: 생성 진입점이 10곳이라 각자 검사하면 한 곳만 빠져도 "검사 없는 생성"이 남는다.
//   정책 약속(약관 §16 · 콘텐츠 이용정책 'How we respond' · 환불 §5 ① · 개인정보 §1·§2·§7)은
//   "모델에 보내기 전에 본다"를 요구하므로, 각 경로는 최종 프롬프트가 확정된 직후·자리 예약
//   (generation_jobs 행 · Take hold · quota) 직전에 이 함수를 부른다. 거절은 작업 행도 과금도
//   남기지 않는다.
//
// 보내는 글(2026-10-11 오너 확정): **사용자가 통제하는 텍스트만** — 사용자가 직접 쓴 칸(외형·의상·
//   나이·역할·수정 요청·배경 설명·샷 설명·대사·모션 지시)과 작가 AI 가 사용자 이야기로 만든 문장.
//   우리 고정 템플릿·스타일 앵커 절·규칙 문구는 보내지 않는다 — 'no people'·'safe-for-work' 같은
//   우리 문구가 오탐을 만들고, 전문 전송은 호출 1건당 단가(1,000자 = 1 unit)를 몇 배로 올린다.
//
// 실패는 전부 생성 금지(fail closed): 네트워크 오류 · 10초 초과 · HTTP 오류 · 모르는 판정 · 키 부재.
//   flag 는 deny 와 같이 막는다. 판단이 안 되는 상태에서 모델로 내보내지 않는다.
//
// server-only 의존성 금지 — 제출 함수(fal.ts 등)가 영수증 타입만 가져다 쓰므로 supabaseAdmin 을
//   끌어오면 그 번들 전체가 서버 전용으로 묶인다(generation-job-timing.ts 의 교훈). 관측 기록은
//   src/lib/api/moderation.ts 가 맡는다.

const ENDPOINT_PATH = '/v1/moderation/prompt'
const PRODUCTION_BASE_URL = 'https://api.creem.io'
const TEST_BASE_URL = 'https://test-api.creem.io'
/**
 * 검사에 허용하는 최대 대기 — 넘기면 생성하지 않는다(사용자에게는 "잠시 후 다시" 안내).
 * 10초 근거(2026-10-11 오너 실측): 과거 프롬프트 재생 시 p95 4.3초 · 최대 4.9초. 5초로 끊으면 평소에도
 * 멀쩡한 요청이 "검사 불가"로 막히므로 최대치의 두 배를 준다. 생성 자체가 수십 초 걸리는 작업이라
 * 10초는 체감 손해가 작고, 막히는 쪽보다 기다리는 쪽이 사용자에게 낫다.
 */
const TIMEOUT_MS = 10_000

/** 검사를 건너뛴 이유 — 건너뜀도 관측 기록·예약 스냅샷에 그대로 남는다. */
export type ModerationSkipReason = 'disabled' | 'no_user_text'

/**
 * 검사 통과 영수증.
 * 어디에 남는가(2026-10-11): ① 이미지·previz 경로는 관측 이벤트에 남긴다(작업 id · 검사 id · 판정 ·
 * 시각, 프롬프트 본문 제외). ② 나중 요청이 저장된 스냅샷으로 다시 제출하는 경로(감독 영상
 * prepare→submit, 일괄 이어가기)만 input_snapshot.moderation 에 영수증을 함께 넣는다 — 이 경로는
 * 작업 행이 영수증을 들고 있으므로 관측 이벤트를 따로 쓰지 않는다. 이미지 경로는 같은 요청 안에서
 * 제출하므로 스냅샷에 넣지 않는다 — 스냅샷은 “같은 생성 요청이면 같은 내용”이어야 하는데(채팅으로
 * 만든 스냅샷과 화면으로 만든 스냅샷이 같아야 한다고 고정한 기존 테스트가 있다), 시각이 들어가면
 * 그 성질이 깨진다.
 */
export interface ModerationReceipt {
  decision: 'allow' | 'skipped'
  /** Creem moderation_result.id — 건너뜀이면 null. */
  id: string | null
  checked_at: string
  /** 검사에 보낸 글자 수. 본문 대신 길이만 남긴다. */
  chars: number
  /**
   * 검사한 글의 SHA-256(본문은 어디에도 저장하지 않는다). “이 영수증이 어떤 글의 것이냐”를 나중에
   * 다시 대조하기 위해 필요하다 — 예약 스냅샷에 남긴 영수증으로 다시 제출할 때 지금 글의 해시와
   * 달라지면 새로 검사한다. 검사할 글이 없었으면 null.
   */
  text_sha256: string | null
  reason?: ModerationSkipReason
}

declare const MODERATION_PROOF: unique symbol

/**
 * “이 제출 입력은 검사를 통과한 글로 만들었다”는 타입 표식. 런타임 값이 아니다 — 객체에 아무것도
 * 더하지 않는다. 제출 함수(falImageSubmit · falVideoSubmit · submitFalReferenceToVideo ·
 * submitLocalVideo)의 입력 타입이 이 표식을 요구하므로, 검사를 건너뛴 제출은 타입 오류가 난다
 * (CI 의 pnpm typecheck 가 막는다).
 *
 * 왜 영수증을 제출 입력 안에 값으로 넣지 않는가: 제출 입력은 그대로 fal 요청 본문이 되는 값이라
 * 인가 정보가 섞이면 "무엇을 보냈나"를 읽기 어렵고, 저장된 예약 스냅샷의 모양까지 바뀐다. 통과
 * 기록은 관측 이벤트(recordModerationPass)와 영상 예약 스냅샷이 맡는다.
 */
export type ModerationProof = { readonly [MODERATION_PROOF]: ModerationReceipt }

/**
 * 제출 입력에 검사 표식을 붙인다 — 객체는 그대로 돌려준다(복사·필드 추가 없음).
 * 표식을 붙이는 이 자리가 마지막 런타임 검문이기도 하다: 영수증 모양이 아니면 여기서 멈춘다.
 */
export function moderatedSubmitInput<T extends object>(
  opts: T,
  moderation: ModerationReceipt,
): T & ModerationProof {
  assertModerationReceipt(moderation, 'Model submission')
  return opts as T & ModerationProof
}

/** 검사가 막은 생성 — 사용자는 설명을 고쳐 다시 시도해야 한다(콘텐츠 이용정책). */
export class ModerationBlockedError extends Error {
  constructor(
    readonly decision: 'flag' | 'deny',
    readonly moderationId: string | null,
  ) {
    super(`Prompt was blocked by content moderation (${decision})`)
    this.name = 'ModerationBlockedError'
  }
}

export type ModerationUnavailableReason =
  | 'no_key'
  | 'timeout'
  | 'http_error'
  | 'network'
  | 'invalid_response'
  | 'unknown_decision'

/** 검사를 수행하지 못했다 — 통과로 해석하지 않는다(fail closed). */
export class ModerationUnavailableError extends Error {
  constructor(
    readonly reason: ModerationUnavailableReason,
    readonly status?: number,
  ) {
    super(`Prompt moderation is unavailable (${reason}${status === undefined ? '' : ` ${status}`})`)
    this.name = 'ModerationUnavailableError'
  }
}

export interface ModerationContext {
  projectId: string
  /** generation_jobs.kind 와 같은 어휘 — 거절 관측·내부 참조에 쓴다. */
  kind: string
  userId?: string | null
}

/** 운영(Vercel production)은 끄기 설정을 무시한다 — 스위치로 심사 약속을 무력화할 수 없다. */
function moderationEnforced(): boolean {
  if (process.env.VERCEL_ENV === 'production') return true
  return process.env.CREEM_MODERATION_MODE !== 'off'
}

/** 키는 호출 시점에 읽는다(지연) — 접두사가 운영/시험 주소를 정한다(paddle-api.ts 와 같은 규약). */
function apiKey(): string {
  const key = (process.env.CREEM_API_KEY ?? '').trim()
  if (!key.startsWith('creem_')) throw new ModerationUnavailableError('no_key')
  return key
}

function baseUrl(key: string): string {
  return key.startsWith('creem_test_') ? TEST_BASE_URL : PRODUCTION_BASE_URL
}

/** 이메일 등 개인정보는 싣지 않는다 — 내부 식별자만(개인정보 처리방침 §2). */
function externalId(ctx: ModerationContext): string {
  const owner = ctx.userId?.trim() ? `user_${ctx.userId.trim()}` : 'system'
  return `${owner}:${ctx.kind}:${ctx.projectId}`
}

/** Web Crypto 만 사용한다 — node:crypto 를 올리면 이 모듈을 잡은 번들이 서버 전용이 된다. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** 검사할 글의 해시 — 영수증 재사용 전에 “같은 글이냐”를 물을 때 쓴다. 보낼 글이 없으면 null. */
export async function hashModeratedText(parts: Array<string | null | undefined>): Promise<string | null> {
  const prompt = joinUserText(parts)
  return prompt ? await sha256Hex(prompt) : null
}

/**
 * 이미 통과한 영수증을 다시 쓸 수 있는지 판단한다(2026-10-11 결정: 해시가 같을 때만).
 * 예약된 입력을 다시 제출하는 경로(일괄 이어가기·복구)가 부른다. 다르면 null — 호출부는 새로 검사한다.
 */
export async function reusableModerationReceipt(
  stored: unknown,
  parts: Array<string | null | undefined>,
): Promise<ModerationReceipt | null> {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null
  const candidate = stored as Partial<ModerationReceipt>
  if (candidate.decision !== 'allow' && candidate.decision !== 'skipped') return null
  if (typeof candidate.checked_at !== 'string') return null
  const hash = await hashModeratedText(parts)
  if (candidate.text_sha256 !== hash) return null
  return {
    decision: candidate.decision,
    id: typeof candidate.id === 'string' ? candidate.id : null,
    checked_at: candidate.checked_at,
    chars: typeof candidate.chars === 'number' ? candidate.chars : 0,
    text_sha256: hash,
    ...(candidate.reason ? { reason: candidate.reason } : {}),
  }
}

/**
 * 제출 직전 마지막 검문 — 영수증 모양이 아니면 모델로 보내지 않는다. 타입 검사가 잡지 못하는 두 경우를
 * 막는다: ① 저장된 스냅샷에서 꺼낸 값(이 배포 전에 저장된 일괄 항목은 영수증이 없다) ② 타입이 지워진
 * 자리에서 들어온 값. 사유는 메시지에 남겨 서버 로그로 추적한다.
 */
export function assertModerationReceipt(receipt: ModerationReceipt, where: string): void {
  if (!receipt || typeof receipt !== 'object') {
    throw new Error(`${where} has no content-moderation receipt`)
  }
  if (receipt.decision !== 'allow' && receipt.decision !== 'skipped') {
    throw new Error(`${where} has an invalid content-moderation receipt`)
  }
  if (typeof receipt.checked_at !== 'string' || !receipt.checked_at) {
    throw new Error(`${where} has an invalid content-moderation receipt`)
  }
}

/** 여러 조각을 한 번의 검사로 합친다 — 조각마다 부르면 호출 수와 단가가 그만큼 늘어난다. */
export function joinUserText(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)
    .join('\n')
}

function receipt(
  decision: ModerationReceipt['decision'],
  id: string | null,
  chars: number,
  textHash: string | null,
  reason?: ModerationSkipReason,
): ModerationReceipt {
  return {
    decision,
    id,
    checked_at: new Date().toISOString(),
    chars,
    text_sha256: textHash,
    ...(reason ? { reason } : {}),
  }
}

/**
 * 사용자 글을 Creem 에 보내고, 통과(allow)면 영수증을 돌려준다.
 * flag·deny → ModerationBlockedError, 그 밖의 모든 실패 → ModerationUnavailableError(생성 금지).
 */
export async function assertUserTextAllowed(
  parts: Array<string | null | undefined>,
  ctx: ModerationContext,
): Promise<ModerationReceipt> {
  const prompt = joinUserText(parts)
  // 사용자가 쓴 글이 없는 경로(고정 템플릿만 나가는 화살표 지우기 등) — 검사할 대상이 없다.
  if (!prompt) return receipt('skipped', null, 0, null, 'no_user_text')
  if (!moderationEnforced()) {
    return receipt('skipped', null, prompt.length, await sha256Hex(prompt), 'disabled')
  }
  // 해시는 호출 뒤에 계산한다 — fetch 와 제한 시간 타이머 사이에 await 가 끼면 제한 시간이 늦게 걸린다.

  const key = apiKey()
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let response: Response
  try {
    response = await Promise.race([
      fetch(`${baseUrl(key)}${ENDPOINT_PATH}`, {
        method: 'POST',
        headers: { 'x-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, external_id: externalId(ctx) }),
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new ModerationUnavailableError('timeout'))
        }, TIMEOUT_MS)
      }),
    ])
  } catch (error) {
    if (error instanceof ModerationUnavailableError) throw error
    throw new ModerationUnavailableError('network')
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }

  if (!response.ok) throw new ModerationUnavailableError('http_error', response.status)
  // 모르는 필드는 무시한다 — 응답 스키마가 늘어도 판정만 읽는다.
  const body = (await response.json().catch(() => null)) as
    | { id?: unknown; decision?: unknown }
    | null
  if (!body || typeof body !== 'object') throw new ModerationUnavailableError('invalid_response')
  const id = typeof body.id === 'string' ? body.id : null
  if (body.decision === 'allow') return receipt('allow', id, prompt.length, await sha256Hex(prompt))
  // flag 는 deny 와 같이 막는다(2026-10-11 오너 확정).
  if (body.decision === 'flag' || body.decision === 'deny') {
    throw new ModerationBlockedError(body.decision, id)
  }
  throw new ModerationUnavailableError('unknown_decision')
}
