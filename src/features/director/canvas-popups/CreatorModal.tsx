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
import { useT } from '@/lib/i18n'

type Props = {
  open: boolean
  position: XYPosition | null
  onClose: () => void
}

type Kind = 'scene' | 'shot'

export function CreatorModal({ open, position, onClose }: Props) {
  const t = useT()
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

  // #context-menu 2026-08-31: Shot 은 Scene 없이도 만든다(Higgsfield 식 독립 이미지 노드).
  //   기본 종류도 shot — 캔버스의 주인공은 이미지다.
  const [kind, setKind] = useState<Kind>('shot')
  const [parentSceneId, setParentSceneId] = useState<string | null>(
    defaultParentScene,
  )

  // open이 false→true로 바뀔 때 기본값 리셋 (effect 없이 render 중 derived-state 갱신)
  const [wasOpen, setWasOpen] = useState(open)
  if (open && !wasOpen) {
    setWasOpen(true)
    setKind('shot')
    setParentSceneId(defaultParentScene)
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }

  const handleCreate = () => {
    if (!position) return
    if (kind === 'scene') {
      addSceneNode(position)
    } else {
      // Shot: Scene 은 선택 — null 이면 부모 엣지 없는 독립 이미지 노드.
      addShotNode(parentSceneId, position)
    }
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Create new node')}</DialogTitle>
          <DialogDescription>
            {t('What kind of node do you want to create?')}
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
            <span className="text-xs text-muted-foreground">{t('Scene container')}</span>
          </button>
          <button
            onClick={() => setKind('shot')}
            className={cn(
              'group flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors',
              kind === 'shot'
                ? 'border-chart-4 bg-chart-4/10'
                : 'border-chart-4/40 bg-card hover:bg-accent',
            )}
          >
            <Clapperboard className="size-5 text-chart-4" />
            <span className="text-sm font-medium">Shot</span>
            <span className="text-xs text-muted-foreground">
              {t('Video generation unit')}
            </span>
          </button>
        </div>

        {kind === 'shot' && hasScene && (
          <div className="space-y-1.5">
            <label className="block text-xs text-muted-foreground">
              {t('Which Scene should it go in?')}
            </label>
            <select
              value={parentSceneId ?? ''}
              onChange={(e) => setParentSceneId(e.target.value || null)}
              className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
            >
              <option value="">{t('Standalone (no scene)')}</option>
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
            {t('Cancel')}
          </Button>
          <Button size="sm" onClick={handleCreate}>
            {t('Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Branch 시 Shot 자동 위치 helper export */
export { nextShotPosition }
