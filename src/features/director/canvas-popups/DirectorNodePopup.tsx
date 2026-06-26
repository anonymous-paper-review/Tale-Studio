'use client'

import { useDirectorCanvasStore } from '@/stores/director-store'
import {
  isSceneData,
  isShotData,
  isVideoData,
} from '@/types/director'
import { popupVisibleInView } from '@/features/director/canvas-interaction'
import { SceneNodePopup } from './SceneNodePopup'
import { ShotNodePopup } from './ShotNodePopup'
import { VideoNodePopup } from './VideoNodePopup'

/**
 * popupNodeId 기반으로 노드 종류별 popup으로 라우팅.
 * Scene/Shot/Video 각각 자체 Dialog를 렌더.
 *
 * 노드 뷰(viewMode==='node')에서는 Shot/Video 상세를 좌측 패널이 담당하므로
 * 모달은 Scene만 허용한다(두 뷰 격리 방어 가드). 그리드 뷰는 기존대로 전부 허용.
 */
export function DirectorNodePopup() {
  const popupNodeId = useDirectorCanvasStore((s) => s.popupNodeId)
  const viewMode = useDirectorCanvasStore((s) => s.viewMode)
  const node = useDirectorCanvasStore((s) =>
    s.nodes.find((n) => n.id === popupNodeId),
  )

  if (!popupNodeId || !node) return null
  if (!popupVisibleInView(viewMode, node.data.kind)) return null

  if (isSceneData(node.data))
    return <SceneNodePopup nodeId={node.id} data={node.data} />
  if (isShotData(node.data))
    return <ShotNodePopup nodeId={node.id} data={node.data} />
  if (isVideoData(node.data))
    return <VideoNodePopup nodeId={node.id} data={node.data} />
  return null
}
