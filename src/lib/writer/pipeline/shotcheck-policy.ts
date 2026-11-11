// 샷 점검(C2 의미 검증) 정책 — 실행기(착수 대기)와 점검 단계(AI 부르기)가 같은 수를 읽는다.
//   오너 2026-11-11: 긴 작품은 장면별로 나눠 점검한다. 샷이 80개를 넘으면 장면을 이어 붙인 묶음(40샷 안팎)마다 점검하고,
//   앞 묶음 끝 2샷을 읽기만 하는 맥락으로 붙인다. 80샷 이하는 한 번에 점검한다.
//   재기(5~20분 · 154샷): 한 번에는 270초 예산 안에 끝나지 못해 늘 생략됐다. 견주기(40샷대 2작품, 한 번에 vs 묶음):
//   이어짐 지시 +0~12% · 관리자 띠 +3~6%, 나눈 샷은 한 작품만 2 → 8. 같은 설계로 한 번에 3번 · 묶음 1번(잡음):
//   나눈 샷 7 · 7 · 7 vs 7(하나 다름), 관리자 띠 55 · 64 · 59 vs 73, 묶음 출력 토큰 약 3배.
//   알고 켠 빠짐: 앞 묶음의 먼 장면을 가리키는 지시(앞 장면에서 정한 조명 등)는 묶음에서 빠질 수 있다 — 앞 맥락은 끝 2샷뿐
//   (오너 2026-11-11 "켠다", 앞 장면 요약 붙이기는 버린 안).
//   약속: tests/writer/shotcheck-timeout.test.ts · shotcheck-chunks.test.ts · shotcheck-budget.test.ts
export const SHOTCHECK_MAX_SHOTS = 80;
/** 묶음 하나의 샷 수 기준 — 장면을 이어 붙이다 이 수를 넘기 전에 끊는다(한 장면이 더 크면 그 장면 하나가 한 묶음). */
export const SHOTCHECK_CHUNK_SHOTS = 40;
/** 묶음마다 붙이는 앞 묶음의 끝 샷 수(읽기만 — 나누거나 지적하지 않는다). */
export const SHOTCHECK_CONTEXT_SHOTS = 2;
/** 한 호출 안에서 동시에 점검하는 묶음 수 — 154샷(4묶음)이 차례로면 7~8분, 2개씩이면 3~4분. */
export const SHOTCHECK_CHUNK_CONCURRENCY = 2;

/** 이 샷 수(점검이 받는 샷 설계 수, 나누기 전)면 묶음으로 나눠 점검한다. */
export function chunksShotCheck(shotCount: number): boolean {
  return shotCount > SHOTCHECK_MAX_SHOTS;
}

/** 점검(또는 묶음 하나) 착수 대기 기준 — 샷당 6초, 바닥 160초 · 상한 200초(실측 87~154초, 관측 최대 278초).
 *  상한이 step 예산(240초)보다 작아야 새 호출은 언제나 착수한다(좀비 run 방지). */
export function shotCheckEstMs(shotCount: number): number {
  return Math.min(200_000, Math.max(160_000, shotCount * 6_000));
}

/** 장면을 쪼개지 않고 이어 붙여 묶음을 만든다 — 다음 장면을 더하면 target 을 넘을 때 끊는다. */
export function planShotCheckChunks<T>(shots: readonly T[], sceneOf: (shot: T) => string, target = SHOTCHECK_CHUNK_SHOTS): T[][] {
  const groups: Array<{ scene: string; shots: T[] }> = [];
  for (const shot of shots) {
    const scene = sceneOf(shot);
    const last = groups.at(-1);
    if (last && last.scene === scene) last.shots.push(shot);
    else groups.push({ scene, shots: [shot] });
  }
  const chunks: T[][] = [];
  let current: T[] = [];
  for (const group of groups) {
    if (current.length && current.length + group.shots.length > target) {
      chunks.push(current);
      current = [];
    }
    current.push(...group.shots);
  }
  if (current.length) chunks.push(current);
  return chunks;
}
