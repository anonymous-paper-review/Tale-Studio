'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { HoverBeam } from '@/components/hover-beam'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useT } from '@/lib/i18n'

/**
 * Director Canvas의 RelationModal — 사용자가 핀-핀 연결할 때 호출.
 * parent 카테고리는 Scene→Shot, Shot→Video 자동 생성 전용이라 노출 안 함.
 * 사용자 수동 연결은 항상 `relates-to` (내러티브 메모).
 */
export function RelationModal() {
  const t = useT()
  const relationModal = useDirectorCanvasStore((s) => s.relationModal)
  const closeRelationModal = useDirectorCanvasStore((s) => s.closeRelationModal)
  const addEdge = useDirectorCanvasStore((s) => s.addEdge)

  const [relationText, setRelationText] = useState('')

  if (!relationModal) return null

  const handleSubmit = () => {
    addEdge(
      relationModal.source,
      relationModal.target,
      { category: 'relates-to', relationText: relationText.trim() },
      relationModal.sourceHandle,
      relationModal.targetHandle,
    )
    setRelationText('')
    closeRelationModal()
  }

  const handleCancel = () => {
    setRelationText('')
    closeRelationModal()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && handleCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Define relationship')}</DialogTitle>
          <DialogDescription>
            {t('Record the narrative relationship between the two nodes in one line.')}
          </DialogDescription>
        </DialogHeader>

        <div>
          <label className="mb-1.5 block text-xs text-muted-foreground">
            {t('Narrative (optional)')}
          </label>
          <HoverBeam className="w-full">
            <Textarea
              rows={2}
              value={relationText}
              onChange={(e) => setRelationText(e.target.value)}
              placeholder={t('e.g. continuous action from Shot A / a different POV of the same character')}
              autoFocus
            />
          </HoverBeam>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            {t('Cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit}>
            {t('Connect')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
