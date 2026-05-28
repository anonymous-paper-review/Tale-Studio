'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  getChildShots,
  nextShotPosition,
  useDirectorCanvasStore,
} from '@/stores/director-canvas-store'
import type { SceneNodeData } from '@/types/director-canvas'

type Props = {
  nodeId: string
  data: SceneNodeData
}

export function SceneNodePopup({ nodeId, data }: Props) {
  const closePopup = useDirectorCanvasStore((s) => s.closePopup)
  const updateNodeData = useDirectorCanvasStore((s) => s.updateNodeData)
  const addShotNode = useDirectorCanvasStore((s) => s.addShotNode)
  const openDeleteConfirm = useDirectorCanvasStore(
    (s) => s.openDeleteConfirm,
  )
  const childCount = useDirectorCanvasStore(
    (s) => getChildShots(s, nodeId).length,
  )

  const [label, setLabel] = useState(data.label)
  const [location, setLocation] = useState(data.location)
  const [timeOfDay, setTimeOfDay] = useState(data.timeOfDay)
  const [mood, setMood] = useState(data.mood)
  const [description, setDescription] = useState(data.description)

  // external data 변경 시 derived state 리셋 (effect 없이 render 중)
  const [prevNodeId, setPrevNodeId] = useState(nodeId)
  if (nodeId !== prevNodeId) {
    setPrevNodeId(nodeId)
    setLabel(data.label)
    setLocation(data.location)
    setTimeOfDay(data.timeOfDay)
    setMood(data.mood)
    setDescription(data.description)
  }

  const commit = () => {
    updateNodeData<'scene'>(nodeId, {
      label,
      location,
      timeOfDay,
      mood,
      description,
    })
  }

  const handleAddShot = () => {
    commit()
    const state = useDirectorCanvasStore.getState()
    const pos = nextShotPosition(state, nodeId)
    addShotNode(nodeId, pos)
  }

  const handleDelete = () => {
    closePopup()
    openDeleteConfirm(nodeId)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && closePopup()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-chart-3" />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={commit}
              className={cn(
                'border-b border-transparent bg-transparent text-sm font-medium outline-none',
                'focus:border-border',
              )}
              placeholder="Scene 라벨"
            />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Location (장소)">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onBlur={commit}
              placeholder="예: 다리 위, 폐허가 된 도시"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
          </Field>

          <Field label="Time of Day (시간대)">
            <input
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              onBlur={commit}
              placeholder="예: golden hour, midnight"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
          </Field>

          <Field label="Mood (분위기)">
            <input
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              onBlur={commit}
              placeholder="예: tense, melancholic, hopeful"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
          </Field>

          <Field label="Description (씬 설명)">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={commit}
              rows={3}
              placeholder="씬의 내러티브, 등장 인물, 사건 요약…"
            />
          </Field>
        </div>

        <Separator />

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleAddShot} className="gap-1.5">
            <Plus className="size-3.5" />
            Shot 추가 ({childCount}개 보유)
          </Button>
          <div className="ml-auto" />
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            삭제
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
