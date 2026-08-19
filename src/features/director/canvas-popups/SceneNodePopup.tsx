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
import { HoverBeam } from '@/components/hover-beam'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  getChildShots,
  nextShotPosition,
  useDirectorCanvasStore,
} from '@/stores/director-store'
import type { SceneNodeData } from '@/types/director'
import { useT } from '@/lib/i18n'

type Props = {
  nodeId: string
  data: SceneNodeData
}

export function SceneNodePopup({ nodeId, data }: Props) {
  const t = useT()
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
            <HoverBeam>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={commit}
                className={cn(
                  'border-b border-transparent bg-transparent text-sm font-medium outline-none',
                  'focus:border-border',
                )}
                placeholder={t('Scene label')}
              />
            </HoverBeam>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Field label={t('Location')}>
            <HoverBeam className="w-full">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onBlur={commit}
                placeholder={t('e.g. on a bridge, a ruined city')}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
            </HoverBeam>
          </Field>

          <Field label={t('Time of Day')}>
            <HoverBeam className="w-full">
              <input
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                onBlur={commit}
                placeholder={t('e.g. golden hour, midnight')}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
            </HoverBeam>
          </Field>

          <Field label={t('Mood')}>
            <HoverBeam className="w-full">
              <input
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                onBlur={commit}
                placeholder={t('e.g. tense, melancholic, hopeful')}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
            </HoverBeam>
          </Field>

          <Field label={t('Description')}>
            <HoverBeam className="w-full">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={commit}
                rows={3}
                placeholder={t('Narrative, characters, and event summary for the scene…')}
              />
            </HoverBeam>
          </Field>
        </div>

        <Separator />

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleAddShot} className="gap-1.5">
            <Plus className="size-3.5" />
            {t('Add Shot ({count} so far)', { count: childCount })}
          </Button>
          <div className="ml-auto" />
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            {t('Delete')}
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
