'use client'

import { useDirectorCanvasStore } from '@/stores/director-canvas-store'
import {
  isSceneData,
  isShotData,
  isVideoData,
} from '@/types/director-canvas'
import { SceneNodePopup } from './SceneNodePopup'
import { ShotNodePopup } from './ShotNodePopup'
import { VideoNodePopup } from './VideoNodePopup'

/**
 * popupNodeId 기반으로 노드 종류별 popup으로 라우팅.
 * Scene/Shot/Video 각각 자체 Dialog를 렌더.
 */
export function DirectorNodePopup() {
  const popupNodeId = useDirectorCanvasStore((s) => s.popupNodeId)
  const node = useDirectorCanvasStore((s) =>
    s.nodes.find((n) => n.id === popupNodeId),
  )

  if (!popupNodeId || !node) return null

  if (isSceneData(node.data))
    return <SceneNodePopup nodeId={node.id} data={node.data} />
  if (isShotData(node.data))
    return <ShotNodePopup nodeId={node.id} data={node.data} />
  if (isVideoData(node.data))
    return <VideoNodePopup nodeId={node.id} data={node.data} />
  return null
}
