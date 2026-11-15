// Director 에 처음 들어갔을 때의 정렬(오너 2026-11-16 "director탭 처음 들어갔을 때 node 뷰의 거리가 너무 먼데 auto-arrange가 아직 안 적용된 것 같아").
//   처음 들어가면 동기화가 Writer 의 씬 · 샷 카드를 만들고, 자리는 nextScenePosition · nextShotPosition 이 정한다. 그 자리는 카드를 그리기 전에
//   정하므로 크기를 몰라 넉넉한 크기(샷 480)로 세고 씬 묶음도 1780 씩 벌려 [자동 정렬]보다 훨씬 멀다(샷 사이 249 · 묶음 1780 ↔ 56 · 776).
//   그래서 처음 들어가면 카드를 다 그린 뒤 [자동 정렬]을 한 번 한다(같은 길 relayoutCanvas → 같은 간격).
//   "처음"은 DB 로 정한다(리드 2026-11-16): Writer 씬 · 샷 카드에 DB 에 저장된 자리(canvas_position)가 하나도 없고 영상 테이크도 없고
//   Director 에서 직접 만든 카드도 없으면 사람이 자리를 놓은 적이 없다(끌면 바로 저장된다). 브라우저에 옛 간격 자리가 남아 있어도 한 번 정렬하고 저장한다 —
//   다음부터는 저장된 자리라 다시 안 놓는다. 사람이 놓은 자리(DB 에 저장된 자리 · 영상 테이크 · 직접 만든 카드)는 건드리지 않는다.
//   저장된 자리는 DB 에서 직접 읽어 가른다(projectHasSavedLayout): 진입 때 DB 읽기가 둘 겹쳐 돌아 먼저 끝난 쪽은 저장된 자리를 카드에 못 싣고 버려진다.
//   그래서 카드 자리만으로는 저장된 자리가 아직 안 들어온 것인지 없는 것인지 가를 수 없다(2026-11-16 개발 DB 에서 덮어쓴 것을 확인).
//   새로 더하는 카드의 기본 자리 함수는 그대로 둔다(이미 놓은 프로젝트에 더할 때 겹치지 않게, 2026-11-10 검토 C).
//   약속: tests/director/first-entry-layout.test.ts · first-entry-saved-layout.test.ts
import type { Viewport, XYPosition } from '@xyflow/react'
import { createClient } from '@/lib/supabase/client'
import { isAssetData, isDerivedNodeData, isSceneData, isShotData, type DirectorNode } from '@/types/director'

/** 이 화면을 닫기 전까지 "저장된 자리가 있다"고 확인한 프로젝트 — 다시 읽지 않는다. 읽기 실패로 있다고 본 것은 넣지 않는다. */
const knownSaved = new Set<string>()

/** 시험용: 기억을 비운다. */
export function resetSavedLayoutMemo(): void {
  knownSaved.clear()
}

/**
 * DB 에 이 프로젝트의 카드 자리(scenes · shots 의 canvas_position)가 하나라도 저장돼 있거나 영상 테이크가 있는가.
 * 사람이 끌었거나 [자동 정렬]을 눌렀거나 영상 작업을 시작한 프로젝트다 — 처음 정렬이 덮으면 안 된다.
 * 읽기가 실패하거나 답이 이상하면 true(= 있다고 보고 아무것도 안 한다): 모르는데 덮는 것보다 안 고치는 편이 안전하다.
 */
export async function projectHasSavedLayout(projectId: string): Promise<boolean> {
  if (knownSaved.has(projectId)) return true
  try {
    const supabase = createClient()
    const saved = (table: 'scenes' | 'shots') =>
      supabase.from(table).select('project_id').eq('project_id', projectId).not('canvas_position', 'is', null).limit(1)
    const [scenes, shots, takes] = await Promise.all([
      saved('scenes'),
      saved('shots'),
      fetch(`/api/director/video-takes?projectId=${encodeURIComponent(projectId)}`).then((response) => (response.ok ? response.json() : null)),
    ])
    if (scenes.error || shots.error || !takes || !Array.isArray(takes.takes)) return true
    const has = (scenes.data?.length ?? 0) > 0 || (shots.data?.length ?? 0) > 0 || takes.takes.length > 0
    if (has) knownSaved.add(projectId)
    return has
  } catch {
    return true
  }
}

/**
 * 사람이 놓은 카드가 없어 보이는 캔버스인가(DB 쪽은 projectHasSavedLayout 이 따로 가른다):
 * 씬 · 샷 카드가 하나 이상이고 전부 Writer 에서 왔고, 영상 테이크 · 프롬프트 노드 같은 다른 카드가 없다.
 * 에셋 카드 · 파생 카드는 매번 다시 만드는 것이라 따지지 않는다.
 */
export function isAutoPlacedCandidate(nodes: readonly DirectorNode[]): boolean {
  let cards = 0
  for (const node of nodes) {
    const data = node.data
    if (isSceneData(data) || isShotData(data)) {
      const fromWriter = isSceneData(data) ? !!data.writerSceneId : !!data.writerShotId
      if (!fromWriter) return false
      cards += 1
    } else if (!isAssetData(data) && !isDerivedNodeData(data)) {
      return false
    }
  }
  return cards > 0
}

/** 지금 씬 · 샷 카드의 자리를 찍어 둔다(id → 자리). DB 를 읽는 동안 사람이 카드를 옮겼는지 나중에 가리는 재료다. */
export function snapshotCardPositions(nodes: readonly DirectorNode[]): Map<string, XYPosition> {
  const snapshot = new Map<string, XYPosition>()
  for (const node of nodes) {
    if (isSceneData(node.data) || isShotData(node.data)) snapshot.set(node.id, { x: node.position.x, y: node.position.y })
  }
  return snapshot
}

/** 찍어 둔 뒤로 씬 · 샷 카드가 그대로인가: 새 카드도 없고 옮겨진 카드도 없다. */
export function cardsUnmovedSince(nodes: readonly DirectorNode[], snapshot: ReadonlyMap<string, XYPosition>): boolean {
  for (const node of nodes) {
    if (!isSceneData(node.data) && !isShotData(node.data)) continue
    const before = snapshot.get(node.id)
    if (!before || before.x !== node.position.x || before.y !== node.position.y) return false
  }
  return true
}

/** 첫 화면의 확대. */
export const FIRST_ENTRY_ZOOM = 0.75

/**
 * 처음 들어갔을 때 보여 주는 화면: 가장 왼쪽 샷을 가운데(가로)에 두고 위에서 3분의 1 쯤에 둔다(0.75 배).
 * 씬 카드는 캔버스에서 숨겨져 기준이 될 수 없다(2026-08-31). 샷이 없으면 null.
 */
export function firstEntryViewport(nodes: readonly DirectorNode[], pane: { width: number; height: number }): Viewport | null {
  const shots = nodes.filter((node) => node.data.kind === 'shot')
  if (shots.length === 0) return null
  const first = shots.reduce((a, b) => (a.position.x <= b.position.x ? a : b))
  return {
    x: pane.width / 2 - (first.position.x + 130) * FIRST_ENTRY_ZOOM,
    y: pane.height / 3 - (first.position.y + 60) * FIRST_ENTRY_ZOOM,
    zoom: FIRST_ENTRY_ZOOM,
  }
}
