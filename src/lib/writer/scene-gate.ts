// 씬 스토리 확정 단계(#s3-gate)의 자리를 Producer 메인으로 옮긴다(2026-10-01 오너 "full run 전 scene 스토리 수정 과정을
//   producer 메인에 넣는다", "writer 생성 중 페이지에서는 상호 작용 없이 진행"). 여기는 그 단계를 읽는 순수 함수와
//   확정 안내(채팅 제안)를 만드는 함수만 둔다 — 확정 호출은 global-chat-store.confirmSceneGate.
import type { ChatSuggestion } from '@/stores/global-chat-store'

export type SceneGatePhase = 'before' | 'writing' | 'gate' | 'continuing' | 'done' | 'failed'

/** 확정 게이트 앞의 Writer 단계(steps.ts 순서). 씬 스토리를 쓰고 점검하는 동안이다. */
const PRE_GATE_STEPS = new Set(['dramaturgy', 'narrativeStructure', 'scenes', 'storyCheck'])

export function sceneGatePhase(
  status: {
    started?: boolean
    pipeline_completed?: boolean
    pipeline_failed?: boolean
    current_status?: string | null
    current_stage?: string | null
    engine?: 'v1' | 'v2'
  } | null | undefined,
): SceneGatePhase {
  if (!status?.started) return 'before'
  if (status.pipeline_failed) return 'failed'
  if (status.pipeline_completed) return 'done'
  if (status.current_status === 'awaiting_confirmation') return 'gate'
  // V2 는 확정 게이트가 없다 — 씬을 쓰는 중이어도 Producer 에서 기다릴 일이 없다.
  if (status.engine === 'v2') return 'continuing'
  if (!status.current_stage || PRE_GATE_STEPS.has(status.current_stage)) return 'writing'
  return 'continuing'
}

/** 확정 대기 동안 채팅에 띄우는 blocking 제안 — Producer 단계에 띄워 수정 요청이 Producer 채팅 입력창으로 들어오게 한다. */
export function sceneGateSuggestion(projectId: string, content: string, label: string): ChatSuggestion {
  return {
    id: `scene-gate:${projectId}`,
    stage: 'producer',
    dismissible: false,
    content,
    action: { kind: 'confirmScenes', label },
  }
}
