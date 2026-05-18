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
import { Copy, GitFork } from 'lucide-react'

export function BranchOptionModal() {
  const branchModalNodeId = useCanvasStore((s) => s.branchModalNodeId)
  const closeBranchModal = useCanvasStore((s) => s.closeBranchModal)
  const branchStatus = useCanvasStore((s) => s.branchStatus)
  const duplicateNode = useCanvasStore((s) => s.duplicateNode)

  if (!branchModalNodeId) return null

  const handleStatus = () => {
    branchStatus(branchModalNodeId)
    closeBranchModal()
  }

  const handleIndependent = () => {
    duplicateNode(branchModalNodeId)
    closeBranchModal()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeBranchModal()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Branch — 자식 노드 만들기</DialogTitle>
          <DialogDescription>
            어떤 종류의 자식을 만들까요?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <button
            onClick={handleStatus}
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
          >
            <GitFork className="size-5 text-muted-foreground" />
            <div className="text-sm font-medium">Status 노드</div>
            <div className="text-center text-xs text-muted-foreground">
              마더와 연동되는 변형.
              <br />
              마더 변경 시 함께 갱신.
            </div>
          </button>
          <button
            onClick={handleIndependent}
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
          >
            <Copy className="size-5 text-muted-foreground" />
            <div className="text-sm font-medium">독립 자식</div>
            <div className="text-center text-xs text-muted-foreground">
              마더 속성 복제 후 독립.
              <br />
              마더 변경에 영향 안 받음.
            </div>
          </button>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={closeBranchModal}>
            취소
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
