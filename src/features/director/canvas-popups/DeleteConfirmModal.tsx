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
import { useDirectorCanvasStore } from '@/stores/director-store'

export function DeleteConfirmModal() {
  const info = useDirectorCanvasStore((s) => s.deleteConfirmInfo)
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const closeDeleteConfirm = useDirectorCanvasStore(
    (s) => s.closeDeleteConfirm,
  )
  const confirmDelete = useDirectorCanvasStore((s) => s.confirmDelete)

  if (!info) return null

  const node = nodes.find((n) => n.id === info.nodeId)
  if (!node) {
    closeDeleteConfirm()
    return null
  }

  const kind = node.data.kind
  const label = node.data.label || '(untitled)'

  const cascadeLines: string[] = []
  if (kind === 'scene') {
    if (info.shotCount > 0) {
      cascadeLines.push(
        `Shot ${info.shotCount}개 + Video ${info.videoCount}개가 함께 삭제됩니다.`,
      )
    }
  } else if (kind === 'shot') {
    if (info.videoCount > 0) {
      cascadeLines.push(
        `Video 테이크 ${info.videoCount}개가 함께 삭제됩니다.`,
      )
    }
  }
  if (info.finalAffected) {
    cascadeLines.push(
      '⚠ ★ Final로 마킹된 테이크가 포함됩니다. Editor 핸드오프에 영향이 있을 수 있어요.',
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && closeDeleteConfirm()}>
      {/* Enter=삭제 확정, Esc=취소(radix 기본). (#e3 2026-07-18) */}
      <DialogContent
        className="sm:max-w-md"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            confirmDelete()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>노드 삭제</DialogTitle>
          <DialogDescription>
            &quot;{label}&quot; ({kind}) 노드를 삭제할까요?
          </DialogDescription>
        </DialogHeader>

        {cascadeLines.length > 0 && (
          <div className="space-y-1 text-sm">
            {cascadeLines.map((line, i) => (
              <p
                key={i}
                className={
                  line.startsWith('⚠')
                    ? 'text-warning'
                    : 'text-destructive'
                }
              >
                {line}
              </p>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={closeDeleteConfirm}>
            취소
          </Button>
          <Button variant="destructive" size="sm" onClick={confirmDelete}>
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
