// 샷 점검(C2 의미 검증) 정책 — 실행기(착수 대기)와 점검 단계(AI 부르기)가 같은 수를 읽는다.
//   오너 2026-11-11: 긴 작품은 장면별로 나눠 점검한다(따로 만든다). 그동안은 샷이 80개를 넘으면 점검을 처음부터 건너뛴다.
//   재기(5~20분 · 154샷): 점검이 270초 예산 안에 끝나지 못해 늘 생략되면서 4.5분 · Claude 약 $1을 썼다.
//   약속: tests/writer/shotcheck-timeout.test.ts · shotcheck-budget.test.ts
export const SHOTCHECK_MAX_SHOTS = 80;

/** 이 샷 수(점검이 받는 샷 설계 수, 나누기 전)면 점검 AI 를 부르지 않고 건너뛴다. */
export function skipsShotCheck(shotCount: number): boolean {
  return shotCount > SHOTCHECK_MAX_SHOTS;
}
