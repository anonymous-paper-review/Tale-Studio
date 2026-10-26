// AI 가 일하는 잠금 화면(AiBusyOverlay)이 지금 떠 있는지 — 왼쪽 단계 레일이 읽는다(디자이너 QA 1차 #07, 2026-10-27).
//   잠금 화면마다 일하는 동안 자기 표를 올리고, 일이 끝나거나(닫힘) 실패 안내로 바뀌거나 화면이 사라지면 내린다.
//   표가 하나라도 있으면 단계 단추 · Alt 단축키로 다른 단계로 옮겨 가지 않는다 — 산문 초안을 쓰는 중에 Writer 로 넘어가
//   잠금 없는 [산문 쓰기]로 같은 산문을 두 번 쓰게 할 수 있었다. 홈(프로젝트 목록)으로 나가는 길은 막지 않는다.
//   저장할 값은 없다(화면에 떠 있는 잠금 화면이 진실).
import { create } from 'zustand'

interface AiBusyState {
  /** 지금 일하는 잠금 화면들의 표(화면마다 하나). */
  tokens: string[]
  hold: (token: string) => void
  release: (token: string) => void
}

export const useAiBusyStore = create<AiBusyState>((set) => ({
  tokens: [],
  hold: (token) => set((s) => (s.tokens.includes(token) ? s : { tokens: [...s.tokens, token] })),
  release: (token) => set((s) => (s.tokens.includes(token) ? { tokens: s.tokens.filter((t) => t !== token) } : s)),
}))

/** 잠금 화면이 표를 올려 둘지 — 떠 있고(open) 실패 안내가 아닐 때(busy 기본 true)만. */
export function aiBusyHolds(input: { open: boolean; busy?: boolean }): boolean {
  return input.open && input.busy !== false
}

/** 잠금 화면 하나가 일하는 동안 표를 올린다. 돌려준 함수로 내린다(effect 정리에 그대로 쓴다). */
export function holdAiBusy(token: string): () => void {
  useAiBusyStore.getState().hold(token)
  return () => useAiBusyStore.getState().release(token)
}

/** 지금 일하는 잠금 화면이 하나라도 있나 — 오래 사는 리스너(단축키)도 낡지 않게 지금 값을 읽는다. */
export function aiBusyNow(): boolean {
  return useAiBusyStore.getState().tokens.length > 0
}

/** 왼쪽 레일에서 그곳으로 옮겨 갈 수 없는가. 단계는 아직 안 열렸거나(locked) AI 가 일하는 동안 막는다.
 *  프로젝트 목록(홈)은 늘 갈 수 있다 — 오래 걸리는 작업 중에도 빠져나갈 길은 남긴다(생성은 서버에서 이어진다). */
export function railNavBlocked(input: { to: 'stage' | 'projects'; locked?: boolean; aiBusy: boolean }): boolean {
  if (input.to === 'projects') return false
  return input.locked === true || input.aiBusy
}
