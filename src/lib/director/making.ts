// Director 에서 지금 그림 · 영상을 만드는 중인가 — 접힌 Lumi 아이콘이 살짝 움직이는 때(11/13 시안 R "만드는 중이면 아이콘이 살짝 움직여요").
//   이 프로젝트의 일괄(실사 이미지 · 영상)이 돌거나, 샷 하나라도 실사 이미지 · 영상이 만들어지는 중이면 그렇다. 다른 프로젝트의 것은 세지 않는다.
//   순수 함수 — 약속: tests/director/chat-closed.test.ts
import { isShotData, isVideoData, type DirectorNode } from '@/types/director'

export interface DirectorMakingState {
  projectId: string | null
  realBatchBusy: boolean
  videoBatchBusy: boolean
  nodes: readonly DirectorNode[]
}

export function directorMaking(state: DirectorMakingState, projectId: string | null): boolean {
  if (!projectId || state.projectId !== projectId) return false
  if (state.realBatchBusy || state.videoBatchBusy) return true
  return state.nodes.some((node) => {
    if (isVideoData(node.data)) return node.data.status === 'generating'
    if (isShotData(node.data)) return node.data.storyboardImage?.status === 'generating'
    return false
  })
}
