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
import { useT } from '@/lib/i18n'

export function DeleteConfirmModal() {
  const t = useT()
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
        t('This also deletes {shotCount} Shots + {videoCount} Videos.', {
          shotCount: info.shotCount,
          videoCount: info.videoCount,
        }),
      )
    }
  } else if (kind === 'shot') {
    if (info.videoCount > 0) {
      cascadeLines.push(
        t('This also deletes {count} Video takes.', { count: info.videoCount }),
      )
    }
  }
  if (info.finalAffected) {
    cascadeLines.push(
      t('⚠ Includes a take marked ★ Final. This may affect the Editor handoff.'),
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
          <DialogTitle>{t('Delete node')}</DialogTitle>
          <DialogDescription>
            {t('Delete the "{label}" ({kind}) node?', { label, kind })}
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
            {t('Cancel')}
          </Button>
          <Button variant="destructive" size="sm" onClick={confirmDelete}>
            {t('Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
