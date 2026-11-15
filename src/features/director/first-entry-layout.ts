// Director 에 처음 들어갔을 때의 정렬(오너 2026-11-16 "director탭 처음 들어갔을 때 node 뷰의 거리가 너무 먼데 auto-arrange가 아직 안 적용된 것 같아").
//   처음 들어가면 동기화가 Writer 의 씬 · 샷 카드를 만들고, 자리는 nextScenePosition · nextShotPosition 이 정한다. 그 자리는 카드를 그리기 전에
//   정하므로 크기를 몰라 넉넉한 크기(샷 480)로 세고 씬 묶음도 1780 씩 벌려 [자동 정렬]보다 훨씬 멀다(샷 사이 249 · 묶음 1780 ↔ 56 · 776).
//   그래서 처음 들어가면 카드를 다 그린 뒤 [자동 정렬]을 한 번 한다(같은 길 relayoutCanvas → 같은 간격).
//   단, 사람이 놓은 자리는 건드리지 않는다. "처음"은 이번 진입이 Writer 카드를 전부 새로 만들었고 아무도 옮기지 않았고,
//   DB 에 저장된 자리(canvas_position)도 영상 테이크도 하나도 없을 때뿐이다. 영상 테이크 · Director 에서 만든 카드가 있으면 작업이 진행된 캔버스다.
//   저장된 자리는 DB 에서 직접 읽어 가른다(projectHasSavedLayout): 진입 때 DB 읽기가 둘 겹쳐 돌아 먼저 끝난 쪽은 저장된 자리를 카드에 못 싣고 버려진다.
//   그래서 "카드가 처음 자리에서 안 옮겨졌다"만으로는 저장된 자리가 아직 안 들어온 것인지 없는 것인지 가를 수 없다(2026-11-16 개발 DB 에서 덮어쓴 것을 확인).
//   새로 더하는 카드의 기본 자리 함수는 그대로 둔다(이미 놓은 프로젝트에 더할 때 겹치지 않게, 2026-11-10 검토 C).
//   약속: tests/director/first-entry-layout.test.ts
import type { Viewport, XYPosition } from '@xyflow/react'
import { createClient } from '@/lib/supabase/client'
import { isAssetData, isDerivedNodeData, isSceneData, isShotData, type DirectorNode } from '@/types/director'

/**
 * DB 에 이 프로젝트의 카드 자리(scenes · shots 의 canvas_position)가 하나라도 저장돼 있거나 영상 테이크가 있는가.
 * 사람이 끌었거나 [자동 정렬]을 눌렀거나 영상 작업을 시작한 프로젝트다 — 처음 정렬이 덮으면 안 된다.
 * 읽기가 실패하거나 답이 이상하면 true(= 있다고 보고 아무것도 안 한다): 모르는데 덮는 것보다 안 고치는 편이 안전하다.
 */
export async function projectHasSavedLayout(projectId: string): Promise<boolean> {
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
    return (scenes.data?.length ?? 0) > 0 || (shots.data?.length ?? 0) > 0 || takes.takes.length > 0
  } catch {
    return true
  }
}

/**
 * 이 캔버스가 "처음 놓인 그대로"인가. placedAt = 이번 진입에서 동기화가 새로 만든 씬 · 샷 카드의 처음 자리(id → 자리).
 * 모든 씬 · 샷 카드가 Writer 에서 왔고, placedAt 에 있고(이번 진입에서 만들었다), 아직 그 자리에 있어야 한다.
 * 에셋 카드 · 파생 카드는 매번 다시 만드는 것이라 따지지 않는다. 그 밖의 카드(영상 테이크 · 프롬프트 노드 …)가 있으면 아니다.
 */
export function isUntouchedFirstLayout(nodes: readonly DirectorNode[], placedAt: ReadonlyMap<string, XYPosition>): boolean {
  let cards = 0
  for (const node of nodes) {
    const data = node.data
    if (isSceneData(data) || isShotData(data)) {
      const fromWriter = isSceneData(data) ? !!data.writerSceneId : !!data.writerShotId
      if (!fromWriter) return false
      const first = placedAt.get(node.id)
      if (!first || first.x !== node.position.x || first.y !== node.position.y) return false
      cards += 1
    } else if (!isAssetData(data) && !isDerivedNodeData(data)) {
      return false
    }
  }
  return cards > 0
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
