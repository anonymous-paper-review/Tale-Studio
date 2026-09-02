'use client'

// 429(동시 생성 한도) 공용 안내 — 생성 진입점이 7곳이라 각자 처리하면 파편화된다(#quota-toast 2026-08-25).
//
// 파편화의 실제 모습(이 파일 도입 전): director-store 는 429 를 **무음으로 삼켜** 버튼을 눌러도 아무
//   일도 안 일어난 것처럼 보였고, real-batch-client 는 한국어 하드코딩 toast 라 영어 UI 에서 한글이
//   튀었다. 서버 게이트는 하나(checkGenerationCapacity)인데 안내가 7가지면 같은 상태가 7가지로 보인다.
//
// 여기 없는 예외 하나: rough-storyboard-view 의 자동 펌프. 거기서 429 는 "실패"가 아니라 "큐가 빌
//   때까지 대기" 신호이고 라운드마다 재시도하므로, 매 라운드 toast 를 띄우면 소음이 된다. 그쪽은
//   자체 억제 로직(3라운드째 1회)을 유지한다 — 의도된 분기이니 여기로 합치지 말 것.

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
          'All generation slots are busy right now. It will start automatically in a moment — please try again shortly.',
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

export function notifyInsufficientTakes(body: InsufficientTakesBody | null | undefined): void {
  const locale = useLocaleStore.getState().locale
  toast.error(
    translate(locale, 'Not enough Takes for this generation — you need {required}, you have {balance}.', {
      required: body?.required ?? 0,
      balance: body?.balance ?? 0,
    }),
    { id: 'generation-quota-exceeded' },
  )
}

/**
 * 429/402 면 안내하고 true. 호출부 관용구: `if (await notifyIfQuotaExceeded(res, body)) return`.
 * 안내 대상이 아니면 아무 것도 하지 않고 false — 나머지 오류 처리는 호출부 몷이다.
 * 동시성 한도와 프로젝트 영상 예산(#f4)에 이어 Take 부족(#payments-phase-2)도 여기서 갈라 안내한다 —
 * 진입점들은 이 함수 하나만 안다.
 */
export function notifyIfQuotaExceeded(status: number, body: unknown): boolean {
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
