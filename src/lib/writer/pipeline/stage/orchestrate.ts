// 무대 적용 순서(2026-09-05, 전이 소유권): 1차 적용으로 배치를 구한 뒤 전이마다 소유 샷을 정하고, 핀을 걸어 2차 적용,
//   그 위에 장부(소유 샷에만 동작 보충). 파이프라인(v4_shots)과 재적용 하네스가 같은 순서를 쓴다.
import type { DecoupageShot, SceneStage, ShotDesign, ValidationIssue, SceneLedger } from '@/lib/writer/types/pipeline'
import { applyStageToShots } from './apply'
import { applyLedgerToShots, decideTransitionOwners, transitionPins, type TransitionOwners } from './ledger'

export interface StagePipelineResult {
  shots: ShotDesign[]
  ledger: SceneLedger
  issues: ValidationIssue[]
  owners: TransitionOwners
}

export function runStageForScene(
  shots: ShotDesign[],
  stage: SceneStage,
  sceneDec: DecoupageShot[] | null,
  opts: { format?: string | null; aspect?: number; names?: ReadonlyMap<string, string> },
): StagePipelineResult {
  const first = applyStageToShots(shots, stage, sceneDec, { format: opts.format, aspect: opts.aspect, names: opts.names })
  const owners = decideTransitionOwners(first.shots, stage)
  const pins = transitionPins(first.shots, stage, owners)
  const second = pins.size ? applyStageToShots(shots, stage, sceneDec, { format: opts.format, aspect: opts.aspect, names: opts.names, pins }) : first
  const ledgered = applyLedgerToShots(second.shots, stage, opts.names, { owners })
  return { shots: ledgered.shots, ledger: ledgered.ledger, issues: [...second.issues, ...ledgered.issues], owners }
}
