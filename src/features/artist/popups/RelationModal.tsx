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
import { cn } from '@/lib/utils'
import {
  useCanvasStore,
  type EdgeCategory,
} from '@/stores/canvas-store'

// F-D1 (specs/decisions.md #32): parent 카테고리는 Status Branch 자동 생성 전용.
// 사용자 수동 connect는 in-world / references 만 노출.
const CATEGORIES: {
  value: EdgeCategory
  label: string
  description: string
}[] = [
  {
    value: 'references',
    label: 'References',
    description: '내러티브 관계 메모 (예: 쌍둥이, 라이벌, 스승-제자). 속성 상속 없음',
  },
  {
    value: 'in-world',
    label: 'In-world',
    description: 'Actor가 어느 World 안에 있는지 배치',
  },
]

export function RelationModal() {
  const relationModal = useCanvasStore((s) => s.relationModal)
  const closeRelationModal = useCanvasStore((s) => s.closeRelationModal)
  const addEdge = useCanvasStore((s) => s.addEdge)

  const [category, setCategory] = useState<EdgeCategory>('references')
  const [relationText, setRelationText] = useState('')

  if (!relationModal) return null

  const handleSubmit = () => {
    addEdge(
      relationModal.source,
      relationModal.target,
      {
        category,
        relationText: relationText.trim(),
      },
      relationModal.sourceHandle,
      relationModal.targetHandle,
    )
    setCategory('references')
    setRelationText('')
    closeRelationModal()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeRelationModal()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>관계 정의</DialogTitle>
          <DialogDescription>
            두 노드의 관계 종류를 선택하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-md border p-2 text-left transition-colors',
                  category === c.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent',
                )}
              >
                <span
                  className={cn(
                    'mt-1 h-2 w-2 rounded-full',
                    category === c.value
                      ? 'bg-primary'
                      : 'bg-muted-foreground/40',
                  )}
                />
                <div>
                  <div className="text-sm font-medium">{c.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.description}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              내러티브 (선택)
            </label>
            <Textarea
              rows={2}
              value={relationText}
              onChange={(e) => setRelationText(e.target.value)}
              placeholder="이 관계를 한 줄로 설명 (예: Kai의 멘토)"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={closeRelationModal}>
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
