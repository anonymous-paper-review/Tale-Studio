'use client'

// 러프 누락 패널 전체 생성 펌프(#c1·#c2·#c3 2026-07-15) — 서버가 호출당 6샷으로 캡하므로(504·쿼터
//   독점 방지) remaining 이 0이 될 때까지 라운드를 이어간다. 라운드 배리어(이전 잡 완료 대기)로
//   내 이미지 상한을 넘지 않는다.
//
// 자리 부족(429)은 멈춤이다 — 자동 재시도 없음(2026-09-11 오너 결정). 예전에는 8초 대기 후
//   최대 40라운드까지 다시 두드렸다(다른 사용자의 생성이 자리를 채운 상황을 브라우저가 기다렸다).
//   지금은 첫 429 에서 펌프를 끝내고, 안내는 generate 쪽 공용 토스트(notifyIfQuotaExceeded)가 한다.
//   사용자가 다시 누르면 누락분부터 새 펌프가 돈다.

export interface RoughPumpRound {
  submitted: number
  remaining: number
  /** 서버가 429(동시 생성 한도)로 거절했다. */
  quota: boolean
  /** 접수 여부가 불확실한 라운드 — 새 요청으로 복구하지 않는다. */
  confirmationPending?: boolean
  /** 이 라운드 잡들의 완료(라운드 배리어). */
  done: Promise<unknown>
}

export interface RoughPumpDeps {
  /** 한 라운드 제출. round 는 0부터 — give-up 안내 토스트는 수동 1라운드에서만 띄우도록 호출부가 쓴다. */
  generate: (round: number) => Promise<RoughPumpRound | null>
  /** 화면 이탈 등으로 펌프를 멈춰야 하면 true. */
  isAborted: () => boolean
}

export type RoughPumpOutcome =
  | 'quota' // 자리 부족 — 다시 시도하지 않고 멈춤
  | 'done' // 남은 샷 없음
  | 'unconfirmed' // 접수 여부 불확실 — 새 요청 없이 멈춤
  | 'aborted' // 화면 이탈
  | 'request_failed' // generate 가 null(요청 실패, 토스트는 generate 가 이미 띄움)
  | 'exhausted' // 폭주 방지 상한

/** 76샷=13라운드 + 여유. 폭주 방지 상한 — 429 대기 여유는 더 이상 필요 없다. */
export const ROUGH_PUMP_MAX_ROUNDS = 20

/** 자동 진입이든 버튼이든 같은 규칙으로 돈다 — 자동/수동 구분은 호출부의 generate 안에서만 쓴다. */
export async function runRoughPump(deps: RoughPumpDeps): Promise<RoughPumpOutcome> {
  for (let round = 0; round < ROUGH_PUMP_MAX_ROUNDS; round++) {
    if (deps.isAborted()) return 'aborted'
    const r = await deps.generate(round)
    if (!r) return 'request_failed'
    if (r.quota) return 'quota'
    if (r.submitted === 0 && r.remaining <= 0) return 'done' // 전부 완료/제외 — 수렴
    await r.done
    if (r.confirmationPending) return 'unconfirmed'
    // remaining<=0 이어도 바로 끝내지 않는다 — 다음 라운드가 이번 라운드 실패분을
    //   재제출할 기회(그 라운드 submitted 0 이면 그때 종료). give-up 게이트가 무한 재시도를 막는다.
  }
  return 'exhausted'
}
