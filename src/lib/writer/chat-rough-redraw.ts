// Storyboard 채팅 고치기 뒤 — 그림(러프)이 낡은 샷 고르기(2026-10-31 QA "채팅으로 고쳐도 그림이 안 바뀐다").
//   채팅 고치기는 글만 저장한다(그림 생성 없음 — 도구 계약). 러프는 샷의 스토리 · 샷 타입 · 등장인물과 씬의 장소 · 시간대 · 분위기로 그리므로
//   (rough-storyboard 라우트), 이 칸이 이 턴에 실제로 바뀐 샷 중 러프가 다 그려진 샷만 [러프 다시 그리기] 후보다.
//   도구는 같은 값을 다시 보내도 "저장됨"으로 답한다 — 턴을 시작할 때와 끝날 때 값을 견준다(2026-11-01 리뷰 M3).
//   대사 · 길이는 그림에 보이지 않는다. 약속: tests/writer/chat-rough-redraw.test.ts
import type { ToolOutcome } from '@/lib/chat-tools/protocol'
import { toolValueKey } from '@/lib/chat-tools/executor'

export const ROUGH_VISIBLE_SHOT_FIELDS = ['actionDescription', 'shotType', 'characters'] as const
export const ROUGH_VISIBLE_SCENE_FIELDS = ['location', 'timeOfDay', 'mood'] as const

interface VisibleShot {
  sceneId: string
  drawn: boolean
  key: string
}

/** 러프 그림에 보이는 칸만 모은 그때의 모습 — 턴 시작 · 끝에 하나씩 찍어 견준다. */
export interface RoughVisibleState {
  shots: Map<string, VisibleShot>
  scenes: Map<string, string>
}

type StateShot = { shotId: string; sceneId: string; roughStoryboard?: { status?: string } | null } & Partial<Record<(typeof ROUGH_VISIBLE_SHOT_FIELDS)[number], unknown>>
type StateManifest = { scenes: ReadonlyArray<{ sceneId: string } & Partial<Record<(typeof ROUGH_VISIBLE_SCENE_FIELDS)[number], unknown>>> } | null | undefined

export function roughVisibleState(manifest: StateManifest, shots: readonly StateShot[]): RoughVisibleState {
  return {
    shots: new Map(shots.map((shot) => [shot.shotId, {
      sceneId: shot.sceneId,
      drawn: shot.roughStoryboard?.status === 'completed',
      key: toolValueKey(ROUGH_VISIBLE_SHOT_FIELDS.map((field) => shot[field] ?? null)),
    }])),
    scenes: new Map((manifest?.scenes ?? []).map((scene) => [scene.sceneId, toolValueKey(ROUGH_VISIBLE_SCENE_FIELDS.map((field) => scene[field] ?? null))])),
  }
}

type Outcomes = ReadonlyArray<Pick<ToolOutcome, 'call' | 'result'>>

/** 이 턴에 저장된 고침(edit_project · ok)의 대상 — 자원과 id. */
function savedTargets(outcomes: Outcomes): Array<{ resource: unknown; id: string }> {
  return outcomes.flatMap(({ call, result }) => {
    if (call.name !== 'edit_project' || result.status !== 'ok') return []
    const input = call.input as { resource?: unknown; id?: unknown }
    return typeof input.id === 'string' ? [{ resource: input.resource, id: input.id }] : []
  })
}

/** 이 턴에 장소 · 시간대 · 분위기가 실제로 바뀐 씬 — 저장만 된 씬(요약만 바뀐 것 포함)은 빠진다(2026-11-02 리뷰 L6). */
export function roughRedrawChangedScenes(outcomes: Outcomes, before: RoughVisibleState, after: RoughVisibleState): string[] {
  const changed: string[] = []
  for (const { resource, id } of savedTargets(outcomes)) {
    if (resource !== 'scenes' || changed.includes(id)) continue
    const was = before.scenes.get(id)
    const now = after.scenes.get(id)
    if (was !== undefined && now !== undefined && was !== now) changed.push(id)
  }
  return changed
}

/** 이 턴에 저장된 고침(edit_project · ok) 중 그림에 보이는 칸이 실제로 바뀐 샷 — 씬을 고쳤으면 그 씬의 그려진 샷 모두. 처음 나온 차례대로. */
export function roughRedrawCandidates(outcomes: Outcomes, before: RoughVisibleState, after: RoughVisibleState): string[] {
  const picked: string[] = []
  const pick = (shotId: string) => {
    if (after.shots.get(shotId)?.drawn && !picked.includes(shotId)) picked.push(shotId)
  }
  const changedScenes = roughRedrawChangedScenes(outcomes, before, after)
  for (const { resource, id } of savedTargets(outcomes)) {
    if (resource === 'shots') {
      const was = before.shots.get(id)
      const now = after.shots.get(id)
      if (was && now && was.key !== now.key) pick(id)
    } else if (resource === 'scenes' && changedScenes.includes(id)) {
      for (const [shotId, shot] of after.shots) if (shot.sceneId === id) pick(shotId)
    }
  }
  return picked
}

/** [러프 다시 그리기] 카드는 그 프로젝트의 Storyboard 보드가 열려 있을 때만 보이고 눌린다(리뷰 B1). 다른 제안은 그대로. */
export function roughRedrawOfferHere(action: { kind: string; projectId?: string } | null | undefined, boardProjectId: string | null): boolean {
  if (action?.kind !== 'roughRedraw') return true
  return !!boardProjectId && action.projectId === boardProjectId
}
