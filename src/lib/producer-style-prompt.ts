// 로드된 새 기획의 준비 전환만 자동 안내한다. 진입·복원은 전환이 아니다.
export interface ProducerStyleSnapshot {
  projectId: string | null
  loaded: boolean
  storyReady: boolean
  reachedStage: string
  styleAnchorKey: string | null
}

export function becameReadyForStyle(previous: ProducerStyleSnapshot | null, current: ProducerStyleSnapshot): boolean {
  return !!(current.projectId && previous?.projectId === current.projectId && previous.loaded && current.loaded
    && !previous.storyReady && current.storyReady && current.reachedStage === 'producer' && !current.styleAnchorKey)
}

export function stylePromptDecision(requestProjectId: string, state: {
  projectId: string | null; stage: string; loading: boolean; approvalBusy: boolean; hasStyle: boolean; catalogReady: boolean
}): 'open' | 'wait' | 'discard' {
  if (requestProjectId !== state.projectId || state.stage !== 'producer' || state.approvalBusy || state.hasStyle) return 'discard'
  return state.loading || !state.catalogReady ? 'wait' : 'open'
}
