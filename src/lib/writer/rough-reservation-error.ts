// 러프 예약(자리 잡기) 거절 — 외부 접수 전이라 돈이 나가지 않았다. 원래 오류(message · details)를 그대로 싣는다.
//   라우트(api/writer/rough-storyboard)는 자리 축 거절(내 한도 · 모두의 자리)만 자리 없음(429)으로 바꾸고, 다른 거절은 지금처럼 500 이다
//   (2026-11-02 리뷰 R4 — 사전 검사를 함께 통과한 요청이 트리거에 막히면 날 코드 500 이 돌아와 더한 샷이 기다리지 않고 멈췄다).
export class RoughReservationError extends Error {
  readonly reason: unknown
  constructor(reason: unknown) {
    const message = (reason as { message?: unknown } | null)?.message
    super(typeof message === 'string' ? message : String(reason))
    this.name = 'RoughReservationError'
    this.reason = reason
  }
}
