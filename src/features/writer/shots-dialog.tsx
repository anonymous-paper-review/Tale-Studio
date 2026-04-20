'use client'

import { useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useWriterStore } from '@/stores/writer-store'
import type { DialogueLine, SceneManifest, Shot, ShotType } from '@/types'

const SHOT_TYPES: ShotType[] = [
  'ECU', 'CU', 'MCU', 'MS', 'MFS', 'FS', 'WS', 'EWS', 'OTS', 'POV', 'TRACK', '2S',
]

interface ShotsDialogProps {
  sceneId: string | null
  manifest: SceneManifest
  shots: Shot[]
  onClose: () => void
}

export function ShotsDialog({
  sceneId,
  manifest,
  shots,
  onClose,
}: ShotsDialogProps) {
  const {
    updateShot,
    addShot,
    deleteShot,
    addDialogueLine,
    removeDialogueLine,
    updateDialogueLine,
    regeneratingSceneId,
  } = useWriterStore()

  const scene = sceneId
    ? manifest.scenes.find((s) => s.sceneId === sceneId)
    : null
  const sceneIdx = sceneId
    ? manifest.scenes.findIndex((s) => s.sceneId === sceneId)
    : -1
  const sceneShots = sceneId
    ? shots.filter((s) => s.sceneId === sceneId)
    : []
  const isRegenerating = regeneratingSceneId === sceneId

  return (
    <Dialog
      open={!!sceneId}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-3 text-base">
            <span>Scene {sceneIdx + 1}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {sceneShots.length} shot{sceneShots.length === 1 ? '' : 's'}
            </span>
          </DialogTitle>
          {scene?.narrativeSummary && (
            <p className="text-xs text-muted-foreground">
              {scene.narrativeSummary}
            </p>
          )}
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 px-6 py-4">
          {isRegenerating && (
            <div className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Regenerating shots…
            </div>
          )}
          {sceneShots.length === 0 && !isRegenerating && (
            <div className="rounded-md border border-dashed border-border px-6 py-10 text-center text-xs text-muted-foreground">
              No shots yet. Add one below.
            </div>
          )}

          <div className="space-y-3">
            {sceneShots.map((shot, i) => (
              <ShotCard
                key={shot.shotId}
                shot={shot}
                index={i}
                manifest={manifest}
                onUpdateShot={updateShot}
                onDeleteShot={deleteShot}
                onAddDialogue={addDialogueLine}
                onRemoveDialogue={removeDialogueLine}
                onUpdateDialogue={updateDialogueLine}
              />
            ))}
          </div>
        </ScrollArea>

        <div className="shrink-0 border-t border-border px-6 py-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => sceneId && addShot(sceneId)}
            disabled={!sceneId || isRegenerating}
          >
            <Plus className="size-3.5" />
            Add Shot
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface ShotCardProps {
  shot: Shot
  index: number
  manifest: SceneManifest
  onUpdateShot: (id: string, changes: Partial<Shot>) => void
  onDeleteShot: (shotId: string) => Promise<void>
  onAddDialogue: (shotId: string, line: DialogueLine) => void
  onRemoveDialogue: (shotId: string, index: number) => void
  onUpdateDialogue: (
    shotId: string,
    index: number,
    changes: Partial<DialogueLine>,
  ) => void
}

function ShotCard({
  shot,
  index,
  manifest,
  onUpdateShot,
  onDeleteShot,
  onAddDialogue,
  onRemoveDialogue,
  onUpdateDialogue,
}: ShotCardProps) {
  const [dialogueOpen, setDialogueOpen] = useState(false)

  const handleAddDialogue = () => {
    const firstChar =
      shot.characters[0] ?? manifest.characters[0]?.characterId ?? ''
    onAddDialogue(shot.shotId, {
      characterId: firstChar,
      text: '',
      emotion: 'neutral',
      delivery: 'normal',
      durationHint: 2,
    })
    setDialogueOpen(true)
  }

  return (
    <div className="group relative rounded-lg border border-border p-3">
      <button
        type="button"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        onClick={() => onDeleteShot(shot.shotId)}
        aria-label="Delete shot"
      >
        <Trash2 className="size-3.5" />
      </button>

      <div className="mb-2 flex items-center gap-3 pr-8">
        <span className="text-xs font-semibold">Shot {index + 1}</span>
        <select
          className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
          value={shot.shotType}
          onChange={(e) =>
            onUpdateShot(shot.shotId, {
              shotType: e.target.value as ShotType,
            })
          }
        >
          {SHOT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="number"
            min={1}
            max={30}
            className="w-14 rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
            value={shot.durationSeconds}
            onChange={(e) =>
              onUpdateShot(shot.shotId, {
                durationSeconds: Number(e.target.value) || 5,
              })
            }
          />
          <span>s</span>
        </div>
      </div>

      <Textarea
        className="min-h-[54px] resize-y text-sm"
        placeholder="Describe what happens in this shot…"
        value={shot.actionDescription}
        onChange={(e) =>
          onUpdateShot(shot.shotId, { actionDescription: e.target.value })
        }
      />

      <button
        type="button"
        onClick={() => setDialogueOpen((v) => !v)}
        className="mt-2 flex w-full items-center justify-between rounded-md px-1 py-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <span>
          Dialogue ({shot.dialogueLines.length})
        </span>
        <ChevronDown
          className={cn(
            'size-3.5 transition-transform',
            dialogueOpen && 'rotate-180',
          )}
        />
      </button>

      {dialogueOpen && (
        <div className="mt-2 space-y-2">
          {shot.dialogueLines.map((dl, i) => (
            <div
              key={i}
              className="rounded-md border border-border bg-background/50 p-2"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <select
                  className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] focus:border-primary focus:outline-none"
                  value={dl.characterId}
                  onChange={(e) =>
                    onUpdateDialogue(shot.shotId, i, {
                      characterId: e.target.value,
                    })
                  }
                >
                  {manifest.characters.map((c) => (
                    <option key={c.characterId} value={c.characterId}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onRemoveDialogue(shot.shotId, i)}
                  aria-label="Remove dialogue line"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
              <input
                type="text"
                className="mb-1 w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                placeholder="Dialogue text…"
                value={dl.text}
                onChange={(e) =>
                  onUpdateDialogue(shot.shotId, i, { text: e.target.value })
                }
              />
              <div className="flex gap-1.5">
                <input
                  type="text"
                  className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-[11px] focus:border-primary focus:outline-none"
                  placeholder="Emotion"
                  value={dl.emotion}
                  onChange={(e) =>
                    onUpdateDialogue(shot.shotId, i, {
                      emotion: e.target.value,
                    })
                  }
                />
                <input
                  type="text"
                  className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-[11px] focus:border-primary focus:outline-none"
                  placeholder="Delivery"
                  value={dl.delivery}
                  onChange={(e) =>
                    onUpdateDialogue(shot.shotId, i, {
                      delivery: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-full gap-1 text-[11px]"
            onClick={handleAddDialogue}
          >
            <Plus className="size-3" />
            Add Line
          </Button>
        </div>
      )}
    </div>
  )
}
