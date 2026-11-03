// 지금 프로젝트를 지운 뒤 열 곳(유저 메뉴) — 남은 프로젝트가 있으면 그 프로젝트의 단계로, 없으면 새로 만든 프로젝트의 Producer 시작 화면으로.
//   바꾸기(switchProject)는 화면마다의 store 를 다 비운 뒤에야 프로젝트를 정한다 — 끝나기를 기다린 뒤에 갈 곳을 읽는다(2026-11-04 리드 2차 검토).
//   기다리지 않고 읽으면 프로젝트가 비어 ?projectId 없는 주소로 튀고, 지운 프로젝트의 단계(예: 시작 화면)로 남은 프로젝트를 열었다.
//   약속: tests/project/delete-current.test.ts
import { STAGES } from '@/lib/constants'
import { useProjectStore } from '@/stores/project-store'
import type { StageId } from '@/types'

export interface RemainingProject {
  id: string
  title: string
  current_stage?: string | null
}

export type OpenAfterDelete = { ok: true; path: string } | { ok: false; error?: string }

/** 남은 프로젝트(목록 순서)로 바꾸거나 새로 만든 뒤, 갈 주소를 돌려준다. 새로 만들지 못하면 실패를 돌려준다. */
export async function openAfterDeletingCurrent(remaining: RemainingProject[]): Promise<OpenAfterDelete> {
  const store = useProjectStore.getState()
  const next = remaining[0]
  if (next) {
    // 남은 프로젝트의 단계를 넘긴다 — 목록 화면에서 카드를 열 때와 같다(열린 단계는 화면이 다시 맞춘다).
    await store.switchProject(next.id, next.title, (next.current_stage ?? 'producer') as StageId)
  } else {
    const result = await store.createNewProject(undefined, { entry: true })
    if (!result.ok) return { ok: false, error: result.error }
  }
  const nextId = useProjectStore.getState().projectId
  // 남은 프로젝트로 옮기면 그 단계로, 새로 만들었으면 Producer 시작 화면으로(리뉴얼 1차).
  const nextStage = useProjectStore.getState().currentStage
  const nextPath = STAGES.find((s) => s.id === nextStage)?.path ?? '/studio/start'
  return { ok: true, path: nextId ? `${nextPath}?projectId=${nextId}` : nextPath }
}
