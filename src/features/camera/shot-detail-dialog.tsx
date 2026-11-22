'use client'

// Camera 의 ⤢ 상세 창 — 지금 샷 상세(이미지 · 영상 탭: 판 v1 · v2, Take 쌓기 · ★, 바꿀 점, 모델 · 프롬프트 · 참고 그림)를 그대로 연다(11/14 약속).
//   Director 의 팝업(DirectorNodePopup)은 Director 스토리보드 보기에서만 샷 상세를 띄우므로 Camera 는 같은 상세를 자기 창에 담는다.
//   여는 길은 openShotDetail(상점) 하나 — Camera 화면을 떠나면 닫는다(page.tsx).
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { isShotData, isVideoData } from '@/types/director'
import { useBoardNodeNames } from '@/features/director/hooks/use-board-node-names'
import { directorNodeLabel } from '@/features/director/node-label'
import { DirectorShotDetail } from '@/features/director/shot-detail/director-shot-detail'

export function CameraShotDetailDialog() {
  const detailNodeId = useDirectorCanvasStore((s) => s.detailNodeId)
  const detailTab = useDirectorCanvasStore((s) => s.detailTab)
  const node = useDirectorCanvasStore((s) => (s.detailNodeId ? s.nodes.find((n) => n.id === s.detailNodeId) : undefined))
  const names = useBoardNodeNames()
  if (!detailNodeId || !node) return null
  const shotNodeId = isShotData(node.data) ? node.id : isVideoData(node.data) ? node.data.parentShotNodeId : null
  if (!shotNodeId) return null
  const close = () => useDirectorCanvasStore.getState().closeShotDetail()
  return (
    <Dialog open onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent frame="work" className="max-h-[92vh] overflow-y-auto sm:max-w-[1000px]">
        <DialogTitle className="sr-only">{directorNodeLabel(node.data, names)}</DialogTitle>
        <DirectorShotDetail
          key={`${detailNodeId}:${detailTab}`}
          shotNodeId={shotNodeId}
          initialTab={detailTab}
          initialTakeId={isVideoData(node.data) ? node.id : null}
          layout="popup"
          onClose={close}
        />
      </DialogContent>
    </Dialog>
  )
}
