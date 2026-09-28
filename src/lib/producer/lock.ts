// 넘긴 뒤 Producer 잠금(그룹1 P1·P7·P9) — Writer 로 넘긴 순간부터 포맷과 산문은 Writer·Artist 가
//   기준으로 삼는 값이 된다. 뒤늦게 고치면 이미 만든 결과와 조용히 어긋나므로 보기·복사만 남긴다.
//   여기는 "무엇이 아직 열려 있나"만 판정하는 순수 함수다 — 화면·스토어는 이 결과만 믿는다.

import type { ProjectSettings, StageId } from '@/types'

/** 잠금 판정 대상 — 프로젝트 설정 필드 + 보드 밖에 사는 채팅 언어(projects.locale). */
export type ProducerEditableField = keyof ProjectSettings | 'chatLanguage'

const ALL_FIELDS: readonly ProducerEditableField[] = [
  'playtime',
  'genre',
  'subGenre',
  'format',
  'tone',
  'targetEmotion',
  'dialogueLanguage',
  'chatLanguage',
]

// P7: 러닝타임은 목표값이라 Writer 에서 샷이 늘면 합계가 느는 게 정상이고, 채팅 언어는
//   만들어진 결과에 영향이 없다. 이 둘만 넘긴 뒤에도 열어 둔다.
const EDITABLE_AFTER_HANDOFF: readonly ProducerEditableField[] = ['playtime', 'chatLanguage']

export interface ProducerLock {
  /** Writer 로 한 번이라도 넘겼나 — 참이면 보드의 직접 편집 경로가 잠긴다. */
  locked: boolean
  /** 지금 고칠 수 있는 항목. */
  editable: Set<ProducerEditableField>
}

/** 넘긴 뒤 = reachedStage 가 producer 가 아님(프로젝트 스토어의 단조 증가 값). */
export function producerLock(reachedStage: StageId | null | undefined): ProducerLock {
  const locked = !!reachedStage && reachedStage !== 'producer'
  return {
    locked,
    editable: new Set(locked ? EDITABLE_AFTER_HANDOFF : ALL_FIELDS),
  }
}

/** 설정 패치에서 잠긴 필드 이름만 골라낸다 — 호출부는 나머지만 반영한다. */
export function lockedSettingKeys(
  lock: ProducerLock,
  patch: Partial<ProjectSettings>,
): (keyof ProjectSettings)[] {
  return (Object.keys(patch) as (keyof ProjectSettings)[]).filter(
    (key) => !lock.editable.has(key),
  )
}

/** 설정 패치에서 지금 고칠 수 있는 필드만 남긴다. */
export function editableSettingPatch(
  lock: ProducerLock,
  patch: Partial<ProjectSettings>,
): Partial<ProjectSettings> {
  const next: Partial<ProjectSettings> = {}
  for (const key of Object.keys(patch) as (keyof ProjectSettings)[]) {
    if (lock.editable.has(key)) Object.assign(next, { [key]: patch[key] })
  }
  return next
}
