// Camera 한 씬 보기(오너 2026-11-22 D2~D5 "위에 씬별 버튼, 아래에 그 씬의 샷이 세로로") — 고른 씬의 씬 노드 · 이름 · 샷(보드 차례).
//   씬 열쇠 · 차례 · 이름은 Director 노드 보기와 같은 규칙(features/director/scene-view · node-label)을 쓴다. 약속: tests/camera/scene.test.ts
import { orderedScenes } from '@/features/director/scene-view'
import { directorNodeLabel, sortByBoard, type BoardNodeNames } from '@/features/director/node-label'
import { isSceneData, isShotData, type DirectorNode } from '@/types/director'

export interface CameraSceneView {
  /** 씬 열쇠(Writer 씬 id, Director 에서 만든 씬은 노드 id) — 지금 보는 씬 기억과 같은 값. */
  key: string
  nodeId: string
  /** 보드 이름("씬 2" · "Scene 2", 화면 언어). */
  label: string
  /** 장소 슬러그(location_2 같은) — 화면이 등록된 배경 이름으로 바꿔 보인다. */
  location: string
  /** 그 씬의 샷, 보드 차례. */
  shots: DirectorNode[]
}

/** 고른 씬. 열쇠가 없거나 목록에 없는 씬이면 null. */
export function cameraScene(nodes: readonly DirectorNode[], names: BoardNodeNames | null | undefined, sceneKey: string | null): CameraSceneView | null {
  if (!sceneKey) return null
  const entry = orderedScenes(nodes, names).find((scene) => scene.key === sceneKey)
  if (!entry || !isSceneData(entry.node.data)) return null
  const shots = nodes.filter((node) => isShotData(node.data) && node.data.parentSceneNodeId === entry.nodeId)
  return {
    key: entry.key,
    nodeId: entry.nodeId,
    label: directorNodeLabel(entry.node.data, names),
    location: entry.node.data.location ?? '',
    shots: sortByBoard(shots, names),
  }
}
