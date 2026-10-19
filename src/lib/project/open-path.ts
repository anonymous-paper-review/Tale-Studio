// 목록(홈 · 프로젝트 화면)에서 프로젝트를 여는 주소와 카드의 단계 이름표(리뉴얼 1차 검토 2026-10-19).
//   단계 값(id)과 화면 주소 · 이름이 다르다(entry = /studio/start · Producer, producer = Writer, writer = Storyboard) —
//   주소와 이름은 단계 표(STAGES · STAGE_LABEL)에서만 찾는다. 약속: tests/project/open-path.test.ts
import { STAGES, STAGE_LABEL } from '@/lib/constants'
import type { StageId } from '@/types'

function knownStage(stage: string | null | undefined): StageId | null {
  return STAGES.find((s) => s.id === stage)?.id ?? null
}

/** 프로젝트를 여는 주소. 단계 값이 없거나 모르는 값이면 Producer 시작 화면 — 열린 단계는 화면이 다시 맞춘다. */
export function projectOpenPath(stage: string | null | undefined, projectId: string): string {
  const id = knownStage(stage)
  const path = id ? STAGES.find((s) => s.id === id)!.path : '/studio/start'
  return `${path}?projectId=${projectId}`
}

/** 카드의 단계 이름표 = 화면 이름. 단계 값이 없거나 모르는 값이면 Producer. */
export function projectStageLabel(stage: string | null | undefined): string {
  const id = knownStage(stage)
  return id ? STAGE_LABEL[id] : STAGE_LABEL.entry
}
