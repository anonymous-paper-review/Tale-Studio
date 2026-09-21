// 외부 접수(fal) 오류를 "확정 거절"과 "접수 여부 불명"으로 가른다 — 예약 선행 경로 공통.
//
// 예약(reserved:)을 먼저 넣고 제출하는 경로는 응답을 잃었을 때 같은 자리를 새 번호로 다시 내면 안 된다
//   (이중 발주·이중 과금). 그래서 예약을 실패로 닫는 것은 명시적인 4xx 거절일 때뿐이고, 통신 오류·5xx·
//   408/425/429 는 "이미 접수됐을 수 있음"으로 남긴다. 러프(rough-submit.ts, 2026-09-10)가 먼저 이 기준을
//   썼고, 이미지 5경로가 예약 선행으로 바뀌며(2026-09-14) 여기로 뽑았다.

export function isDefiniteSubmitRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const failure = error as { status?: unknown; cause?: unknown }
  if (typeof failure.status === 'number') {
    return failure.status >= 400 && failure.status < 500 && ![408, 425, 429].includes(failure.status)
  }
  return failure.cause ? isDefiniteSubmitRejection(failure.cause) : false
}
