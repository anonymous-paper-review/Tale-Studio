'use client'

import { useState } from 'react'
import type { XYPosition } from '@xyflow/react'
import { Clapperboard, Film } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useDirectorCanvasStore,
  nextShotPosition,
} from '@/stores/director-store'
import { isSceneData } from '@/types/director'

type Props = {
  open: boolean
  position: XYPosition | null
  onClose: () => void
}

type Kind = 'scene' | 'shot'

export function CreatorModal({ open, position, onClose }: Props) {
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const selectedNodeId = useDirectorCanvasStore((s) => s.selectedNodeId)
  const addSceneNode = useDirectorCanvasStore((s) => s.addSceneNode)
  const addShotNode = useDirectorCanvasStore((s) => s.addShotNode)

  const scenes = nodes.filter((n) => isSceneData(n.data))
  const hasScene = scenes.length > 0

  // 기본 부모 Scene: selectedNode가 Scene이면 그것, 아니면 첫 Scene
  const defaultParentScene = (() => {
    if (selectedNodeId) {
      const sel = nodes.find((n) => n.id === selectedNodeId)
      if (sel && isSceneData(sel.data)) return sel.id
    }
    return scenes[0]?.id ?? null
  })()

  const [kind, setKind] = useState<Kind>(hasScene ? 'shot' : 'scene')
  const [parentSceneId, setParentSceneId] = useState<string | null>(
    defaultParentScene,
  )

  // open이 false→true로 바뀔 때 기본값 리셋 (effect 없이 render 중 derived-state 갱신)
  const [wasOpen, setWasOpen] = useState(open)
  if (open && !wasOpen) {
    setWasOpen(true)
    setKind(hasScene ? 'shot' : 'scene')
    setParentSceneId(defaultParentScene)
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }

  const handleCreate = () => {
    if (!position) return
    if (kind === 'scene') {
      addSceneNode(position)
    } else {
      // Shot: parent Scene 필수
      const parent = parentSceneId ?? scenes[0]?.id ?? null
      if (!parent) return
      // 자동 배치 (#18) 대신 사용자가 클릭한 위치 사용
      addShotNode(parent, position)
    }
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>새 노드 만들기</DialogTitle>
          <DialogDescription>
            어떤 종류의 노드를 만들까요?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <button
            onClick={() => setKind('scene')}
            className={cn(
              'group flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors',
              kind === 'scene'
                ? 'border-chart-3 bg-chart-3/10'
                : 'border-chart-3/40 bg-card hover:bg-accent',
            )}
          >
            <Film className="size-5 text-chart-3" />
            <span className="text-sm font-medium">Scene</span>
            <span className="text-xs text-muted-foreground">씬 컨테이너</span>
          </button>
          <button
            onClick={() => hasScene && setKind('shot')}
            disabled={!hasScene}
            className={cn(
              'group flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors',
              kind === 'shot'
                ? 'border-chart-4 bg-chart-4/10'
                : hasScene
                  ? 'border-chart-4/40 bg-card hover:bg-accent'
                  : 'cursor-not-allowed border-border bg-card opacity-40',
            )}
          >
            <Clapperboard className="size-5 text-chart-4" />
            <span className="text-sm font-medium">Shot</span>
            <span className="text-xs text-muted-foreground">
              {hasScene ? '영상 생성 단위' : 'Scene 먼저 필요'}
            </span>
          </button>
        </div>

        {kind === 'shot' && hasScene && (
          <div className="space-y-1.5">
            <label className="block text-xs text-muted-foreground">
              어느 Scene 안에 만들까요?
            </label>
            <select
              value={parentSceneId ?? ''}
              onChange={(e) => setParentSceneId(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
            >
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {isSceneData(s.data) ? s.data.label : s.id}
                </option>
              ))}
            </select>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={kind === 'shot' && !parentSceneId}
          >
            만들기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Branch 시 Shot 자동 위치 helper export */
export { nextShotPosition }
