'use client'

// 429(동시 생성 한도) 공용 안내 — 생성 진입점이 7곳이라 각자 처리하면 파편화된다(#quota-toast 2026-08-25).
//
// 파편화의 실제 모습(이 파일 도입 전): director-store 는 429 를 **무음으로 삼켜** 버튼을 눌러도 아무
//   일도 안 일어난 것처럼 보였고, real-batch-client 는 한국어 하드코딩 toast 라 영어 UI 에서 한글이
//   튀었다. 서버 게이트는 하나(checkGenerationCapacity)인데 안내가 7가지면 같은 상태가 7가지로 보인다.
//
// 자리 부족은 어느 경로든 안내만 하고 자동 재시도하지 않는다(2026-09-11 오너 결정). 그래서 여기 문구는
//   "잠시 뒤 다시 시도"만 말하고 "자동으로 시작된다"는 약속을 하지 않는다 — 예전 영어 문구가 그 약속을 했고
//   실제로는 Artist·개별 영상 경로에 자동 재개가 없었다(2026-09-11 동시성 감사). 러프 전체 생성 펌프도
//   이제 재시도 없이 멈추므로 같은 토스트를 쓴다(예전 자체 억제 로직은 사라졌다).

import { toast } from 'sonner'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'

/** 서버 quotaExceededBody() 의 클라 측 계약. 필드가 없어도(파싱 실패 등) 안전하게 동작한다. */
export interface QuotaExceededBody {
  code?: string
  scope?: 'user' | 'global'
  category?: 'video' | 'image'
  queued?: number
  limit?: number
}

/**
 * 이 응답이 동시 생성 한도 429 인가. 429 라도 provider rate-limit 등 다른 원인이 있어
 * code 까지 확인한다(서버가 code:'quota_exceeded' 를 붙이는 경로만 해당).
 */
export function isQuotaExceeded(status: number, body: unknown): body is QuotaExceededBody {
  return (
    status === 429 &&
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === 'quota_exceeded'
  )
}

/**
 * 한도 안내 toast. 같은 id 를 재사용해 여러 요청이 동시에 429 를 받아도 토스트가 쌓이지 않는다
 * (패널 여러 장을 한꺼번에 제출하면 429 가 동시에 여러 번 온다 — 그때 화면이 토스트로 덮이면 안 된다).
 *
 * scope 로 문구가 갈린다: 'user' 는 내 작업이 끝나길 기다리는 것, 'global' 은 서버가 붐비는 것 —
 *   사용자가 취할 행동이 다르므로 같은 말로 뭉개지 않는다.
 */
export function notifyQuotaExceeded(body: QuotaExceededBody | null | undefined): void {
  const locale = useLocaleStore.getState().locale
  const scope = body?.scope === 'global' ? 'global' : 'user'
  // 영상/이미지 분리 풀(2026-08-26 오너 결정) — 어느 풀에 걸렸는지 문구로 구분해야
  //   "이미지는 6개라며 왜 3개에서 막히지" 류의 혼란이 없다.
  const message =
    scope === 'global'
      ? translate(
          locale,
          'All generation slots are busy right now. Please try again in a moment.',
        )
      : body?.category === 'video'
        ? translate(
            locale,
            'You can run up to {limit} video generations at once. Please retry after the current ones finish.',
            { limit: body?.limit ?? 0 },
          )
        : translate(
            locale,
            'You can run up to {limit} image generations at once. Please retry after the current ones finish.',
            { limit: body?.limit ?? 0 },
          )
  toast.info(message, { id: 'generation-quota-exceeded' })
}

/**
 * 429 를 거절의 축과 함께 안내한다 — 돌려주는 값: 'user'(내 한도) · 'global'(모두의 자리. 까닭을 모르는 429 도 모두의 자리로 본다 —
 * 기다려도 내 것이 끝나 풀리지 않는다). quietUserLimit 이면 내 한도 안내만 띄우지 않는다: 화면이 기다림을 따로 알리는 곳
 * (Storyboard 더한 샷 카드 "자리가 나면 바로 그려요", 2026-11-02 리드)만 쓴다. 모두의 자리 · 예산 안내는 언제나 띄운다.
 */
export function notifyQuotaRefusal(status: number, body: unknown, options: { quietUserLimit?: boolean } = {}): 'user' | 'global' {
  const scope = isQuotaExceeded(status, body) && body.scope !== 'global' ? 'user' : 'global'
  if (!(options.quietUserLimit && scope === 'user')) notifyIfQuotaExceeded(status, body)
  return scope
}

/** #f4(2026-08-27): 프로젝트 영상 예산 소진 429 — code 'video_budget_exceeded'. */
export interface VideoBudgetExceededBody {
  code?: string
  used?: number
  limit?: number
}

export function isVideoBudgetExceeded(
  status: number,
  body: unknown,
): body is VideoBudgetExceededBody {
  return (
    status === 429 &&
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === 'video_budget_exceeded'
  )
}

export function notifyVideoBudgetExceeded(body: VideoBudgetExceededBody | null | undefined): void {
  const locale = useLocaleStore.getState().locale
  toast.error(
    translate(locale, 'This project has reached its video generation limit ({limit}). New video generations are blocked.', {
      limit: body?.limit ?? 100,
    }),
    { id: 'generation-quota-exceeded' },
  )
}

/** #payments-phase-2 슬라이스 2: Take hold 부족 402 — error==='insufficient_takes'인 응답의 계약. */
export interface InsufficientTakesBody {
  error?: string
  required?: number
  balance?: number
}

export function isInsufficientTakes(
  status: number,
  body: unknown,
): body is InsufficientTakesBody {
  return (
    status === 402 &&
    typeof body === 'object' &&
    body !== null &&
    (body as { error?: unknown }).error === 'insufficient_takes'
  )
}

// 베타 약속 2(2026-09-04 오너, phase-3 3-10): "부족 안내에는 크레딧을 채우러 가는 버튼이 있다" — 목적지는 계정·결제 페이지(P9a).
export function notifyInsufficientTakes(body: InsufficientTakesBody | null | undefined): void {
  const locale = useLocaleStore.getState().locale
  toast.error(
    translate(locale, 'Not enough Takes for this generation: you need {required}, you have {balance}.', {
      required: body?.required ?? 0,
      balance: body?.balance ?? 0,
    }),
    {
      id: 'generation-quota-exceeded',
      action: {
        label: translate(locale, 'Add Takes'),
        onClick: () => {
          if (typeof window !== 'undefined') window.location.assign('/account')
        },
      },
    },
  )
}

/** #creem-moderation(2026-10-11): 내용 규칙 막힘(400) — 서버 src/lib/api/moderation.ts 의 code 와 짝이다. */
export interface ContentPolicyBlockedBody {
  code?: string
  policyUrl?: string
  /** 걸린 그림의 대상(2026-11-25 오너) — 서버가 이름을 알 때만 오고, 있으면 안내가 그 이름을 말한다. */
  target?: { kind: 'character' | 'world' | 'prop'; name: string }
}

export function isContentPolicyBlocked(status: number, body: unknown): body is ContentPolicyBlockedBody {
  return (
    status === 400 &&
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === 'content_policy_blocked'
  )
}

/**
 * 막힘 안내 — 사용자가 할 수 있는 일은 "설명을 고쳐 다시"다. 다시 눌러도 같은 결과라 재시도를 권하지 않는다.
 * 어떤 내용이 안 되는지는 콘텐츠 이용정책에 적혀 있다 — 토스트에 다 옮기는 대신 그 페이지로 보낸다.
 */
export function notifyContentPolicyBlocked(body: ContentPolicyBlockedBody | null | undefined): void {
  const locale = useLocaleStore.getState().locale
  // 서버가 이름을 알 때는 그 이름을 말한다 — 거절은 작업 행이 없어 카드에 배지가 남지 않으니,
  //   하나만 걸려도 어느 그림의 설정을 고쳐야 하는지는 이 안내만 알려 준다.
  const name = typeof body?.target?.name === 'string' ? body.target.name.trim() : ''
  toast.error(
    name
      ? translate(
          locale,
          'The description for "{name}" did not pass the content check, so it was not drawn. Edit the description and try again.',
          { name },
        )
      : translate(
          locale,
          'This request breaks the content rules, so nothing was generated. Edit the description and try again.',
        ),
    {
      // 이름을 id 에 붙여 걸린 그림마다 안내가 따로 보이게 한다 — 이어 그리기처럼 여러 장을 한번에 그릴 때
      //   id 가 같으면 나중 안내가 앞 안내를 덮어 둘이 걸렸는데 하나만 보였다.
      id: name ? `generation-content-policy:${name}` : 'generation-content-policy',
      action: {
        label: translate(locale, 'Content rules'),
        onClick: () => {
          if (typeof window !== 'undefined') window.open(body?.policyUrl ?? '/acceptable-use', '_blank')
        },
      },
    },
  )
}

/** #creem-moderation: 검사 장애(503) — 통과로 해석하지 않았기 때문에 아무것도 생성되지 않았다. */
export interface ModerationUnavailableBody {
  code?: string
}

export function isModerationUnavailable(status: number, body: unknown): body is ModerationUnavailableBody {
  return (
    status === 503 &&
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === 'moderation_unavailable'
  )
}

export function notifyModerationUnavailable(): void {
  const locale = useLocaleStore.getState().locale
  toast.error(
    translate(
      locale,
      'The content check is unavailable right now, so nothing was generated. Please try again in a moment.',
    ),
    { id: 'generation-content-policy' },
  )
}

/**
 * H3 Max · Turbo 로 보낼 작은 그림(한 변 256 미만)을 서버가 키우지 못해 Take 전에 막았다(422 — m-qa 2026-11-27).
 *   서버 문구는 영어라(사용자 언어를 모른다) code 를 보고 여기서 사용자 언어로 띄운다. 샷 여러 개를 한꺼번에 내도 안내는 하나.
 */
export function isReferenceImageTooSmall(status: number, body: unknown): boolean {
  return (
    status === 422 &&
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === 'reference_image_too_small'
  )
}

export function notifyReferenceImageTooSmall(): void {
  const locale = useLocaleStore.getState().locale
  toast.error(
    translate(
      locale,
      'The start or end image is too small for this video model and could not be enlarged, so nothing was generated. Choose another video model or remake the images.',
    ),
    { id: 'video-reference-too-small' },
  )
}

/**
 * 고른 영상 방식(오너 2026-11-27 N4a) 때문에 서버가 Take 전에 막은 code → 사용자 언어 안내(영어 원문 = i18n 키).
 *   화면이 대부분 미리 끄지만, 누른 사이 앞 샷을 다시 만들었거나 노드 · Lumi 가 옛 이어서 출처로 다시 만들 때 서버가 막는다.
 *   서버 문구는 영어라(사용자 언어를 모른다) code 를 보고 여기서 띄운다 — 새 Take 줄은 남기지 않는다(작은 그림 막힘과 같은 길).
 */
const VIDEO_MODE_REFUSALS: Readonly<Record<string, string>> = {
  continue_first_shot: 'This is the first shot of its scene, so there is no video to continue from.',
  continue_previous_not_ready: 'The previous shot has no finished video yet.',
  continue_source_changed: "The previous shot's video has changed. Choose Continuation again to use its new last frame.",
  invalid_continue_frame: "The last frame of the previous shot's video can't be used. Choose Continuation again.",
  missing_middle_frame: "This shot's images have no middle frame yet. Remake images first.",
  middle_outdated: 'Remake the images after editing the rough to use Start + middle.',
  rough_image_not_allowed: "Rough (mannequin) images can't be used to make a video. Use the live-action images.",
}

export function isVideoModeRefused(status: number, body: unknown): boolean {
  if ((status !== 400 && status !== 409) || typeof body !== 'object' || body === null) return false
  const code = (body as { code?: unknown }).code
  return typeof code === 'string' && Object.hasOwn(VIDEO_MODE_REFUSALS, code)
}

export function notifyVideoModeRefused(body: unknown): void {
  const code = (body as { code?: unknown }).code as string
  toast.error(translate(useLocaleStore.getState().locale, VIDEO_MODE_REFUSALS[code]!), { id: 'video-mode-refused' })
}

/**
 * 429/402/내용 규칙 거절이면 안내하고 true. 호출부 관용구: `if (await notifyIfQuotaExceeded(res, body)) return`.
 * 안내 대상이 아니면 아무 것도 하지 않고 false — 나머지 오류 처리는 호출부 몫이다.
 * 동시성 한도와 프로젝트 영상 예산(#f4)에 이어 Take 부족(#payments-phase-2)도 여기서 갈라 안내한다 —
 * 진입점들은 이 함수 하나만 안다.
 */
export function notifyIfQuotaExceeded(status: number, body: unknown): boolean {
  // #creem-moderation(2026-10-11): 생성 진입점은 이 함수 하나만 알고 있다 — 내용 규칙 막힘·검사 장애도
  //   여기서 갈라 안내해야 7개 입구가 같은 문구를 보여 준다(한도 안내와 같은 이유).
  if (isContentPolicyBlocked(status, body)) {
    notifyContentPolicyBlocked(body)
    return true
  }
  if (isModerationUnavailable(status, body)) {
    notifyModerationUnavailable()
    return true
  }
  if (isReferenceImageTooSmall(status, body)) {
    notifyReferenceImageTooSmall()
    return true
  }
  if (isVideoModeRefused(status, body)) {
    notifyVideoModeRefused(body)
    return true
  }
  if (isVideoBudgetExceeded(status, body)) {
    notifyVideoBudgetExceeded(body)
    return true
  }
  if (isInsufficientTakes(status, body)) {
    notifyInsufficientTakes(body)
    return true
  }
  if (!isQuotaExceeded(status, body)) return false
  notifyQuotaExceeded(body)
  return true
}
