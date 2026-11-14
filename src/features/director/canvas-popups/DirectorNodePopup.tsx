'use client'

import { useDirectorCanvasStore } from '@/stores/director-store'
import {
  isSceneData,
  isShotData,
  isVideoData,
} from '@/types/director'
import { popupVisibleInView } from '@/features/director/canvas-interaction'
import { SceneNodePopup } from './SceneNodePopup'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DirectorShotDetail } from '@/features/director/shot-detail/director-shot-detail'
import { useBoardNodeNames } from '@/features/director/hooks/use-board-node-names'
import { directorNodeLabel } from '@/features/director/node-label'

/**
 * popupNodeId 기반으로 노드 종류별 popup으로 라우팅.
 * Scene 은 자체 Dialog, 샷 · 샷의 Take 는 샷 상세 팝업을 렌더한다. 마더 샷이 없는 독립 영상은 팝업이 없다 — 노드형 왼쪽 패널
 * (VideoDetailPanel)에서 연다. 옛 샷 편집 팝업 · 영상 팝업은 오너 답(11/14) "지워줘"로 뺐다.
 *
 * 노드 뷰(viewMode==='node')에서는 Shot/Video 상세를 좌측 패널이 담당하므로
 * 모달은 Scene만 허용한다(두 뷰 격리 방어 가드). 그리드 뷰는 기존대로 전부 허용.
 */
export function DirectorNodePopup() {
  const popupNodeId = useDirectorCanvasStore((s) => s.popupNodeId)
  const viewMode = useDirectorCanvasStore((s) => s.viewMode)
  // 샷 상세(openShotDetail)는 스토리보드형에서 팝업 — 노드형은 왼쪽 패널(DirectorDetailPanel)이 맡는다.
  const detailNodeId = useDirectorCanvasStore((s) => s.detailNodeId)
  const detailTab = useDirectorCanvasStore((s) => s.detailTab)
  const shownId = viewMode === 'storyboard' && detailNodeId ? detailNodeId : popupNodeId
  const node = useDirectorCanvasStore((s) =>
    s.nodes.find((n) => n.id === shownId),
  )
  // 샷 · 샷의 Take 는 샷 상세 팝업(디자이너 11/13 D6 — 스토리보드형은 팝업, 노드형 왼쪽 패널과 같은 내용).
  //   Take 에서 열면 그 샷의 영상 탭이 그 Take 를 먼저 보인다. 마더 샷이 없는 독립 영상은 팝업이 없다(옛 영상 팝업도 그리지 않았다).
  const shotNodeId = !node ? null : isShotData(node.data) ? node.id : isVideoData(node.data) ? node.data.parentShotNodeId : null
  const shotNode = useDirectorCanvasStore((s) => (shotNodeId ? s.nodes.find((n) => n.id === shotNodeId) : undefined))
  const boardNames = useBoardNodeNames()

  if (!shownId || !node) return null
  if (!popupVisibleInView(viewMode, node.data.kind)) return null

  if (isSceneData(node.data))
    return <SceneNodePopup nodeId={node.id} data={node.data} />
  if (shotNodeId) {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) useDirectorCanvasStore.getState().closeShotDetail() }}>
        <DialogContent frame="work" className="max-h-[92vh] overflow-y-auto sm:max-w-[1000px]">
          <DialogTitle className="sr-only">{shotNode ? directorNodeLabel(shotNode.data, boardNames) : ''}</DialogTitle>
          <DirectorShotDetail
            key={`${node.id}:${shownId === detailNodeId ? detailTab : ''}`}
            shotNodeId={shotNodeId}
            initialTab={shownId === detailNodeId ? detailTab : isVideoData(node.data) ? 'video' : 'image'}
            initialTakeId={isVideoData(node.data) ? node.id : null}
            layout="popup"
            onClose={() => useDirectorCanvasStore.getState().closeShotDetail()}
          />
        </DialogContent>
      </Dialog>
    )
  }
  return null
}
