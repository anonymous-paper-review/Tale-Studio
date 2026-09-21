// #script-preserve 2026-09-17: 시작 요청의 대본 보존 표시 읽기 — 명시적 true 만 인정한다(문자열·누락은 종전 경로).
//   라우트 본문에서 떼어 둔 순수 함수(tests/producer/preserve-script-gate.test.ts).
export function readPreserveScript(body: unknown): boolean {
  return !!body && typeof body === 'object' && (body as { preserveScript?: unknown }).preserveScript === true;
}
