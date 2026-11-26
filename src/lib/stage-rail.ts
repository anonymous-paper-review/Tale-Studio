// 왼쪽 레일 칸 표와 칸의 모습(v3, 2026-11-03 → O1 오너 2026-11-26 "콘티를 Artist 앞에").
//   칸 표: 레일은 Producer · Writer · Artist · Storyboard · Director · Editor 여섯 칸이다(지금과 같다). Writer 칸(대표 id producer)은
//   씬 스토리(id producer)와 콘티(id conti)를 함께 맡는다 — 단계(id)는 일곱이고 단계 표(STAGES)는 열리는 순서 그대로다(dev fb1120 D1 의 칸 표를 옮겨 씀).
//   칸 모습: 지금 보는 칸 · 끝낸 칸(체크) · 열렸지만 아직 하는 칸 · 아직 안 연 칸.
//     끝냄 = 지금까지 연 가장 먼 단계(reachedStage)가 그 칸의 마지막 단계보다 뒤 — Writer 칸은 콘티까지 지나야(Artist 가 열려야) 끝낸 칸이다.
//     앞 칸으로 돌아가 봐도 체크는 남는다.
//   칸을 누르면(또는 Alt+숫자) 그 칸의 가장 먼 열린 단계로 간다 — Writer 칸은 콘티가 열렸으면 콘티, 아니면 씬 스토리.
//   잠금 · AI 가 일하는 동안의 막힘은 사이드바가 따로 정한다(railNavBlocked). 약속: tests/project/rail-done-mark.test.ts · tests/project/writer-rail.test.ts
//   Artist 칸 표시(오너 2026-11-27 N7): 그림이 실패했거나 오래 걸리면 칸 아이콘 모서리 점으로 알린다 — 칸을 누르면 Artist 화면으로 가고, 다시 시도는 그 화면에서 한다.
//     약속: tests/project/rail-artist-attention.test.ts
import { STAGES } from '@/lib/constants'
import type { StageId } from '@/types'

export type RailStageState = 'current' | 'done' | 'open' | 'upcoming'

export interface RailItem {
  /** 칸의 대표 단계 — 이름표 · 아이콘 · 색 · Alt 숫자 · 툴팁은 이 단계 것을 쓴다. */
  id: StageId
  /** 이 칸이 맡는 단계(열리는 순서). */
  stages: readonly StageId[]
}

export const RAIL_ITEMS: readonly RailItem[] = [
  { id: 'entry', stages: ['entry'] },
  { id: 'producer', stages: ['producer', 'conti'] },
  { id: 'artist', stages: ['artist'] },
  { id: 'writer', stages: ['writer'] },
  { id: 'director', stages: ['director'] },
  { id: 'editor', stages: ['editor'] },
]

const indexOf = (stage: StageId) => STAGES.findIndex((s) => s.id === stage)

/** 그 단계를 맡는 레일 칸. */
export function railItemOf(stage: StageId): RailItem | undefined {
  return RAIL_ITEMS.find((item) => item.stages.includes(stage))
}

/** 레일에서 그 단계가 있는 칸의 위치(위 → 아래). 모르는 단계면 -1. */
export function railIndexOfStage(stage: StageId): number {
  return RAIL_ITEMS.findIndex((item) => item.stages.includes(stage))
}

/** 칸의 모습. stage 는 칸의 대표 단계(또는 그 칸이 맡는 아무 단계), active 는 지금 보는 단계. */
export function railStageState(stage: StageId, { active, reached }: { active: StageId | null; reached: StageId }): RailStageState {
  const item = railItemOf(stage) ?? { id: stage, stages: [stage] }
  if (active && item.stages.includes(active)) return 'current'
  const first = indexOf(item.stages[0])
  const last = indexOf(item.stages[item.stages.length - 1])
  const far = indexOf(reached)
  if (far > last) return 'done'
  if (far >= first) return 'open'
  return 'upcoming'
}

/** 칸을 누르면 갈 단계 — 그 칸에서 열린 가장 먼 단계(Writer 칸: 콘티가 열렸으면 콘티, 아니면 씬 스토리). */
export function railTarget(stage: StageId, canNavigateTo: (stage: StageId) => boolean): StageId {
  const item = railItemOf(stage)
  if (!item) return stage
  for (let i = item.stages.length - 1; i > 0; i--) if (canNavigateTo(item.stages[i])) return item.stages[i]
  return item.stages[0]
}

/** 칸의 완료 숫자 — 그 칸이 맡는 단계들의 숫자를 합친다. */
export function railItemBadge(stage: StageId, badges: Partial<Record<StageId, number>>): number {
  const item = railItemOf(stage)
  return (item?.stages ?? [stage]).reduce((sum, id) => sum + (badges[id] ?? 0), 0)
}

export type RailArtistAttention = 'failed' | 'stalled'

/** Artist 칸에 알릴 그림 상태 — 실패가 오래 걸림보다 먼저다(실패는 실패라고, 오래 걸림은 실패가 아니라고 — #stale-gate).
 *  Artist 를 열었고(reached 가 Artist 이후) 그림이 다 있지 않을 때만. 판정 값은 그림 준비 확인(use-artist-lock-poll)이 project-store 에 둔 것. */
export function railArtistAttention(input: {
  stage: StageId
  reached: StageId
  imagesReady: boolean
  failed: boolean
  stalled: boolean
}): RailArtistAttention | null {
  if (input.stage !== 'artist' || input.imagesReady) return null
  if (indexOf(input.reached) < indexOf('artist')) return null
  if (input.failed) return 'failed'
  return input.stalled ? 'stalled' : null
}
