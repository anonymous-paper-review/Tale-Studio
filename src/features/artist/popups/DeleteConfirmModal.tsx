'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCanvasStore } from '@/stores/canvas-store'
import { toast } from 'sonner'

export function DeleteConfirmModal() {
  const deleteConfirmNodeId = useCanvasStore((s) => s.deleteConfirmNodeId)
  const closeDeleteConfirm = useCanvasStore((s) => s.closeDeleteConfirm)
  const deleteNode = useCanvasStore((s) => s.deleteNode)
  const nodes = useCanvasStore((s) => s.nodes)

  if (!deleteConfirmNodeId) return null

  const node = nodes.find((n) => n.id === deleteConfirmNodeId)
  if (!node) {
    closeDeleteConfirm()
    return null
  }

  const statusChildren = nodes.filter(
    (n) => n.data.motherId === deleteConfirmNodeId,
  )
  const isRegistered = node.data.registered !== null

  const handleConfirm = () => {
    if (isRegistered) {
      toast('Asset Storage의 등록은 유지됩니다.', {
        description: '캔버스에서만 노드가 제거됩니다.',
      })
    }
    deleteNode(deleteConfirmNodeId)
    closeDeleteConfirm()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeDeleteConfirm()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>노드 삭제</DialogTitle>
          <DialogDescription>
            &quot;{node.data.label}&quot; 노드를 삭제할까요?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {statusChildren.length > 0 && (
            <p className="text-destructive">
              Status 자식 {statusChildren.length}개가 함께 삭제됩니다.
            </p>
          )}
          {isRegistered && (
            <p className="text-muted-foreground">
              Asset Storage의 등록은 유지됩니다.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={closeDeleteConfirm}>
            취소
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
          >
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
