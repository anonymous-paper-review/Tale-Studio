// 왼쪽 레일 단계 칸의 모습(v3, 2026-11-03) — 지금 보는 단계 · 끝낸 단계(체크) · 열렸지만 아직 하는 단계 · 아직 안 연 단계.
//   끝냄 = 지금까지 연 가장 먼 단계(reachedStage)보다 앞. 앞 단계로 돌아가 봐도 체크는 남는다.
//   잠금 · AI 가 일하는 동안의 막힘은 사이드바가 따로 정한다(railNavBlocked). 약속: tests/project/rail-done-mark.test.ts
import { STAGES } from '@/lib/constants'
import type { StageId } from '@/types'

export type RailStageState = 'current' | 'done' | 'open' | 'upcoming'

const indexOf = (stage: StageId) => STAGES.findIndex((s) => s.id === stage)

export function railStageState(stage: StageId, { active, reached }: { active: StageId | null; reached: StageId }): RailStageState {
  if (stage === active) return 'current'
  const at = indexOf(stage)
  const far = indexOf(reached)
  if (at < far) return 'done'
  if (at === far) return 'open'
  return 'upcoming'
}
