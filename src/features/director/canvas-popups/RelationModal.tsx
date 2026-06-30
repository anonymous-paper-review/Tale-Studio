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

/**
 * Director Canvas의 RelationModal — 사용자가 핀-핀 연결할 때 호출.
 * parent 카테고리는 Scene→Shot, Shot→Video 자동 생성 전용이라 노출 안 함.
 * 사용자 수동 연결은 항상 `relates-to` (내러티브 메모).
 */
export function RelationModal() {
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
          <DialogTitle>관계 정의</DialogTitle>
          <DialogDescription>
            두 노드의 내러티브 관계를 한 줄로 기록할 수 있어요.
          </DialogDescription>
        </DialogHeader>

        <div>
          <label className="mb-1.5 block text-xs text-muted-foreground">
            내러티브 (선택)
          </label>
          <HoverBeam className="w-full">
            <Textarea
              rows={2}
              value={relationText}
              onChange={(e) => setRelationText(e.target.value)}
              placeholder="예: Shot A의 연속 동작 / 같은 인물의 다른 시점"
              autoFocus
            />
          </HoverBeam>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            취소
          </Button>
          <Button size="sm" onClick={handleSubmit}>
            연결
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
