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
import { directorFullLabel } from '@/features/director/node-label'
import { useBoardNodeNames } from '@/features/director/hooks/use-board-node-names'
import { isShotData, isVideoData } from '@/types/director'

export function DeleteConfirmModal() {
  const t = useT()
  const info = useDirectorCanvasStore((s) => s.deleteConfirmInfo)
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const closeDeleteConfirm = useDirectorCanvasStore(
    (s) => s.closeDeleteConfirm,
  )
  const confirmDelete = useDirectorCanvasStore((s) => s.confirmDelete)
  const boardNames = useBoardNodeNames()

  if (!info) return null

  const node = nodes.find((n) => n.id === info.nodeId)
  if (!node) {
    closeDeleteConfirm()
    return null
  }

  const kind = node.data.kind
  // 이름은 보드 번호로(오너 2026-11-02 "Director 화면 샷 이름 → 보드 번호") — 내부 id("sh_02_07")를 보이지 않는다.
  //   영상 테이크는 부모 샷 이름에 테이크 번호를 붙인다("Scene 2 · Shot 8 · 테이크 1").
  const parent = isVideoData(node.data) && node.data.parentShotNodeId ? nodes.find((n) => n.id === (node.data as { parentShotNodeId: string }).parentShotNodeId) : undefined
  const label = (isVideoData(node.data) && parent && isShotData(parent.data)
    ? `${directorFullLabel(parent.data, boardNames)} · ${t('Take {n}', { n: node.data.takeNumber })}`
    : directorFullLabel(node.data, boardNames)) || '(untitled)'

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
            {t('Delete the "{label}" node?', { label })}
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
