// writer 파이프라인 진행 화면용 자연어 단계 문구(#c3 2026-07-14).
//   내부 stage key(steps.ts 등록 키)를 영상 업계 사람이 읽기 자연스러운
//   "주체 + 행동" 문장으로 바꾼다. 표시 전용 — 로그/DB/status API 는 key 그대로.
//   key 목록은 src/lib/writer/pipeline/steps.ts 의 등록이 진실 (여기 없는 키는 fallback).

const STAGE_LABELS: Record<string, string> = {
  narrativeStructure: 'Writer가 이야기 구조를 짜고 있습니다',
  scenes: 'Writer가 씬과 배경, 인물을 만들고 있습니다',
  storyCheck: 'Writer가 스토리를 검토하고 있습니다',
  visualFormat: 'Artist가 화면 포맷과 룩을 정하고 있습니다',
  actVisualArc: 'Artist가 막(Act)별 비주얼 흐름을 잡고 있습니다',
  v2Design: 'Artist가 배경과 인물을 디자인하고 있습니다',
  sceneCinematography: 'Director가 씬 촬영 방향을 잡고 있습니다',
  decoupage: 'Director가 씬을 샷으로 나누고 있습니다',
  shotDesign: 'Director가 샷들에 연출을 손보고 있습니다',
  shotCheck: 'Director가 샷 연출을 검증하고 있습니다',
  renderPrompts: 'Director가 촬영 지시서를 쓰고 있습니다',
  dialogue: 'Writer가 인물 대사를 쓰고 있습니다',
  persistShots: 'Director가 샷 목록을 정리해 저장하고 있습니다',
}

const FALLBACK_LABEL = 'Writer 팀이 작업하고 있습니다'

export function friendlyStageLabel(stageKey: string | null | undefined): string {
  if (!stageKey) return FALLBACK_LABEL
  return STAGE_LABELS[stageKey] ?? FALLBACK_LABEL
}

/** 남은 예상 시간 표시 문자열 — 분 단위 올림, 지나면 "곧 마무리돼요". */
export function formatRemaining(remainMs: number): string {
  if (remainMs <= 0) return '곧 마무리돼요'
  const min = Math.ceil(remainMs / 60_000)
  if (min <= 1) return '남은 예상 시간 1분 미만'
  return `남은 예상 시간 약 ${min}분`
}
