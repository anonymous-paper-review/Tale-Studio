// 한 Writer 실행은 한 호출만 잇는다(2026-11-11 T5) — 다시 깨우는 곳(서버 keepalive · 크론 watchdog · resume 킥)과
//   시도 소진 대기가 같은 기준을 쓴다. 한 단계 호출은 step 라우트 maxDuration(300s)까지 저장 없이 정상으로 돈다 —
//   마지막 저장(updated_at)이 이보다 최근인 running 실행에는 아직 도는 호출이 있을 수 있다. 그때 깨우면 같은 단계를
//   두 호출이 같이 돌려 같은 AI 호출을 두세 번 사고, 새 호출이 실행을 가져가 돌던 호출의 결과가 버려졌다.
//   시험: tests/writer/run-wake.test.ts
export const WRITER_RUN_ALIVE_MS = 330_000;

/** 마지막 저장 시각으로 본 "아직 도는 호출이 있을 수 있음". 시각이 없거나 읽을 수 없으면 아니다(지금처럼 깨운다). */
export function runMayBeAlive(updatedAt: string | null | undefined, now = Date.now()): boolean {
  const at = Date.parse(updatedAt ?? '');
  return Number.isFinite(at) && now - at < WRITER_RUN_ALIVE_MS;
}
