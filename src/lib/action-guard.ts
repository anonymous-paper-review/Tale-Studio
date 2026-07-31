// 같은 동작이 짧은 시간에 두 번 발사되는 것을 막는 최종 방어선 (#double-fire 2026-07-31).
//
// 버튼의 disabled 는 첫 번째 방어일 뿐이다. 서버가 느리면 사용자는 연타하고, 그 사이 React 가
//   아직 잠금 상태를 그리기 전이면 두 번째 클릭이 이미 핸들러에 도달해 있다. 게다가 같은 대상을
//   가리키는 버튼이 여러 화면(캔버스 노드 / 그리드 카드 / 상세 패널)에 동시에 떠 있어, 버튼마다
//   따로 잠가서는 서로를 막지 못한다.
// 그래서 방어는 버튼이 아니라 **동작 키**에 건다 — 어느 버튼에서 눌렀든 같은 키면 같은 창을
//   공유한다. 창 안의 두 번째 요청은 조용히 버린다(사용자는 첫 요청의 진행 표시를 이미 보고 있다).
//
// 진행 중 잠금(수 초~수 분)은 이 창이 아니라 store 의 generating 상태가 담당한다. 여기는
//   "같은 클릭이 두 번 샌 것"만 걸러내는 짧은 창이다.

export const ACTION_GUARD_MS = 1000

/** 마지막으로 통과시킨 시각. 키는 동작+대상(예: `storyboard:shot-node-3`). */
const lastFiredAt = new Map<string, number>()

// 프로젝트를 오래 열어두면 키가 쌓이므로, 새 키를 넣을 때 만료된 것만 정리한다.
const MAX_TRACKED = 500

/**
 * 이 동작을 지금 실행해도 되는지 판정하고, 통과시키면 그 시각을 기록한다.
 * @returns 실행해도 되면 true, 창 안의 중복이라 버려야 하면 false.
 */
export function claimAction(key: string, now: number = Date.now()): boolean {
  const prev = lastFiredAt.get(key)
  if (prev !== undefined && now - prev < ACTION_GUARD_MS) return false
  if (lastFiredAt.size >= MAX_TRACKED) {
    for (const [k, at] of lastFiredAt) {
      if (now - at >= ACTION_GUARD_MS) lastFiredAt.delete(k)
    }
  }
  lastFiredAt.set(key, now)
  return true
}

/**
 * 창을 즉시 연다 — 동작이 실패해 사용자가 바로 다시 시도해야 할 때.
 * (성공 시에는 부르지 않는다: 성공 = 큐가 만들어졌다 = 추가 발사를 막아야 한다.)
 */
export function releaseAction(key: string): void {
  lastFiredAt.delete(key)
}

/** 테스트 전용 — 모듈 전역 창 초기화. */
export function resetActionGuard(): void {
  lastFiredAt.clear()
}
