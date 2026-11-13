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
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DirectorShotDetail } from '@/features/director/shot-detail/director-shot-detail'
import { useBoardNodeNames } from '@/features/director/hooks/use-board-node-names'
import { directorNodeLabel } from '@/features/director/node-label'

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
  // 샷 · 샷의 Take 는 샷 상세 팝업(디자이너 11/13 D6 — 스토리보드형은 팝업, 노드형 왼쪽 패널과 같은 내용).
  //   Take 에서 열면 그 샷의 영상 탭이 그 Take 를 먼저 보인다. 마더 샷이 없는 독립 영상은 지금 팝업.
  const shotNodeId = !node ? null : isShotData(node.data) ? node.id : isVideoData(node.data) ? node.data.parentShotNodeId : null
  const shotNode = useDirectorCanvasStore((s) => (shotNodeId ? s.nodes.find((n) => n.id === shotNodeId) : undefined))
  const boardNames = useBoardNodeNames()

  if (!popupNodeId || !node) return null
  if (!popupVisibleInView(viewMode, node.data.kind)) return null

  if (isSceneData(node.data))
    return <SceneNodePopup nodeId={node.id} data={node.data} />
  if (shotNodeId) {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) useDirectorCanvasStore.getState().closePopup() }}>
        <DialogContent frame="work" className="max-h-[92vh] overflow-y-auto sm:max-w-[1000px]">
          <DialogTitle className="sr-only">{shotNode ? directorNodeLabel(shotNode.data, boardNames) : ''}</DialogTitle>
          <DirectorShotDetail
            key={node.id}
            shotNodeId={shotNodeId}
            initialTab={isVideoData(node.data) ? 'video' : 'image'}
            initialTakeId={isVideoData(node.data) ? node.id : null}
            layout="popup"
            onClose={() => useDirectorCanvasStore.getState().closePopup()}
          />
        </DialogContent>
      </Dialog>
    )
  }
  if (isShotData(node.data))
    return <ShotNodePopup nodeId={node.id} data={node.data} />
  if (isVideoData(node.data))
    return <VideoNodePopup nodeId={node.id} data={node.data} />
  return null
}
