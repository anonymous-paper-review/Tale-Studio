// AI 가 일하는 잠금 화면(AiBusyOverlay)이 무엇을 막고 무엇을 남기는지 — inert 를 거는 곳(v3 2단계, 2026-11-03).
//   단계 화면([data-stage-content])과 채팅([data-chat-panel])을 막는다. 단, 단계 화면 위 잠금은 위 막대의 프로젝트 이름 칸
//   ([data-ai-lock-keep])만 남긴다 — 예전에는 레일 홈 카드로 AI 작업 중에도 이름을 바꿀 수 있었는데, 1단계에서 이름 바꾸기가
//   위 막대 연필로 옮겨 가며 잠금 막에 덮였다. inert 는 자식에서 되돌릴 수 없으니, 남길 칸에서 단계 화면까지 올라가며 길 옆의 형제를 막는다.
//   잠금 화면이 겹쳐도 마지막 잠금 화면이 닫힐 때까지 막고, 남이 건 inert 는 건드리지 않는다. 막대를 덮지 않는 모양은 overlayClipPath.
//   약속: tests/project/ai-busy-rename.test.ts
export interface LockNode {
  readonly parentElement: LockNode | null
  readonly children: ArrayLike<LockNode>
  hasAttribute(name: string): boolean
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/** 잠금이 막은 조각에 붙는 표시 — 위 막대 오른쪽 자리가 이것으로 흐려진다(data-ai-locked:opacity-40). */
export const AI_LOCKED_ATTR = 'data-ai-locked'

export interface AiLock<T extends LockNode = LockNode> {
  /** 막은 뒤 남길 칸으로 가는 길 옆에 새로 붙은 조각도 막는다. */
  refresh: () => void
  release: () => void
  /** 새 조각이 붙는지 지켜볼 곳(남길 칸에서 단계 화면까지의 부모들). */
  watch: readonly T[]
}

// 잠금 화면마다 건 횟수 — 마지막 잠금이 풀 때만 inert 를 뗀다.
const holds = new WeakMap<LockNode, number>()

function hold(node: LockNode, mine: Set<LockNode>) {
  if (mine.has(node)) return
  const count = holds.get(node) ?? 0
  // 잠금 말고 다른 곳(화면 코드)이 건 inert — 그 주인이 풀 몫이다.
  if (count === 0 && node.hasAttribute('inert')) return
  holds.set(node, count + 1)
  mine.add(node)
  if (count === 0) {
    node.setAttribute('inert', '')
    node.setAttribute(AI_LOCKED_ATTR, '')
  }
}

function letGo(node: LockNode) {
  const count = holds.get(node) ?? 0
  if (count > 1) {
    holds.set(node, count - 1)
    return
  }
  holds.delete(node)
  node.removeAttribute('inert')
  node.removeAttribute(AI_LOCKED_ATTR)
}

function inside(node: LockNode, root: LockNode): boolean {
  for (let at = node.parentElement; at; at = at.parentElement) if (at === root) return true
  return false
}

/**
 * 잠금을 건다. keep 이 비었거나 단계 화면 밖이면 단계 화면 전체를 막는다(팝업 위 잠금 · 위 막대가 없는 화면).
 * 돌려준 release 로 푼다(effect 정리에 그대로 쓴다).
 */
export function lockForAiWork<T extends LockNode>({ stage, chats, keep }: { stage: T | null; chats: readonly T[]; keep: readonly T[] }): AiLock<T> {
  const mine = new Set<LockNode>()
  const kept = stage ? keep.filter((node) => inside(node, stage)) : []
  // 남길 칸과 그 조상(단계 화면 바로 아래까지) — 이 길 위는 막지 않고, 길 옆 형제만 막는다.
  const path = new Set<LockNode>()
  for (const node of kept) for (let at: LockNode | null = node; at && at !== stage; at = at.parentElement) path.add(at)
  const watch = [...new Set([...path].map((node) => node.parentElement).filter((node): node is LockNode => !!node))] as T[]

  const apply = () => {
    for (const chat of chats) hold(chat, mine)
    if (!stage) return
    if (kept.length === 0) {
      hold(stage, mine)
      return
    }
    for (const parent of watch) for (const child of Array.from(parent.children)) if (!path.has(child)) hold(child, mine)
  }
  apply()

  return {
    refresh: apply,
    release: () => {
      for (const node of mine) letGo(node)
      mine.clear()
    },
    watch,
  }
}

interface Box {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/** 잠금 화면에서 위 막대 자리를 오려 낸 모양(clip-path) — 막이 막대 위에 놓이지 않아 이름 칸을 누를 수 있다. 막대가 없으면 다 덮는다. */
export function overlayClipPath(overlay: Box, bar: Box | null): string | undefined {
  if (!bar) return undefined
  const left = Math.round(Math.max(0, bar.left - overlay.left))
  const right = Math.round(Math.min(overlay.width, bar.right - overlay.left))
  const bottom = Math.round(Math.min(overlay.height, bar.bottom - overlay.top))
  if (right <= left || bottom <= 0) return undefined
  return `polygon(0px 0px, ${left}px 0px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px 0px, 100% 0px, 100% 100%, 0px 100%)`
}
