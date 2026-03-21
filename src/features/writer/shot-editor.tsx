'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Shot, DialogueLine, SceneManifest, ShotType } from '@/types'

const SHOT_TYPES: ShotType[] = [
  'ECU', 'CU', 'MCU', 'MS', 'MFS', 'FS', 'WS', 'EWS', 'OTS', 'POV', 'TRACK', '2S',
]

interface ShotEditorProps {
  shot: Shot
  manifest: SceneManifest
  onUpdateShot: (id: string, changes: Partial<Shot>) => void
  onAddDialogue: (shotId: string, line: DialogueLine) => void
  onRemoveDialogue: (shotId: string, index: number) => void
  onUpdateDialogue: (
    shotId: string,
    index: number,
    changes: Partial<DialogueLine>,
  ) => void
}

export function ShotEditor({
  shot,
  manifest,
  onUpdateShot,
  onAddDialogue,
  onRemoveDialogue,
  onUpdateDialogue,
}: ShotEditorProps) {
  const scene = manifest.scenes.find((s) => s.sceneId === shot.sceneId)
  const locationName = scene
    ? (manifest.locations.find((l) => l.locationId === scene.location)?.name ??
      scene.location)
    : '—'

  const getCharName = (charId: string) =>
    manifest.characters.find((c) => c.characterId === charId)?.name ?? charId

  const handleAddDialogue = () => {
    const firstChar = shot.characters[0] ?? manifest.characters[0]?.characterId ?? ''
    onAddDialogue(shot.shotId, {
      characterId: firstChar,
      text: '',
      emotion: 'neutral',
      delivery: 'normal',
      durationHint: 2,
    })
  }

  return (
    <ScrollArea className="flex-1 px-6 py-4">
      <div className="space-y-4">
        {/* Shot header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">
              Shot {shot.shotId}
            </span>
            <span className="text-xs text-muted-foreground">
              Scene: {shot.sceneId}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            Edit fields below to customize this shot
          </span>
        </div>

        {/* Shot Type + Duration */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              SHOT TYPE
            </label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
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
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              DURATION (sec)
            </label>
            <input
              type="number"
              min={1}
              max={30}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
              value={shot.durationSeconds}
              onChange={(e) =>
                onUpdateShot(shot.shotId, {
                  durationSeconds: Number(e.target.value) || 5,
                })
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              LOCATION
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground"
              value={locationName}
              readOnly
            />
          </div>
        </div>

        {/* Action Description */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            SHOT DESCRIPTION
          </label>
          <Textarea
            className="min-h-[60px] resize-y text-sm"
            value={shot.actionDescription}
            onChange={(e) =>
              onUpdateShot(shot.shotId, {
                actionDescription: e.target.value,
              })
            }
          />
        </div>

        {/* Characters — toggle to add/remove */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            CHARACTERS <span className="font-normal">(click to toggle)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {manifest.characters.map((c) => {
              const isActive = shot.characters.includes(c.characterId)
              return (
                <button
                  key={c.characterId}
                  type="button"
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                  }`}
                  onClick={() => {
                    const next = isActive
                      ? shot.characters.filter((id) => id !== c.characterId)
                      : [...shot.characters, c.characterId]
                    onUpdateShot(shot.shotId, { characters: next })
                  }}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Dialogue Lines */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              DIALOGUE ({shot.dialogueLines.length})
            </label>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 text-xs"
              onClick={handleAddDialogue}
            >
              <Plus className="size-3" />
              Add Line
            </Button>
          </div>
          {shot.dialogueLines.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No dialogue in this shot.
            </p>
          )}
          <div className="space-y-2">
            {shot.dialogueLines.map((dl, i) => (
              <div
                key={i}
                className="rounded-md border border-border p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <select
                    className="rounded border border-border bg-background px-2 py-0.5 text-xs focus:border-primary focus:outline-none"
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
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onRemoveDialogue(shot.shotId, i)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
                <input
                  type="text"
                  className="mb-1.5 w-full rounded border border-border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                  placeholder="Dialogue text…"
                  value={dl.text}
                  onChange={(e) =>
                    onUpdateDialogue(shot.shotId, i, { text: e.target.value })
                  }
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs focus:border-primary focus:outline-none"
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
                    className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs focus:border-primary focus:outline-none"
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
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}
