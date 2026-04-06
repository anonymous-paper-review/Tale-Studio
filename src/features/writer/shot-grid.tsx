'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { Shot, SceneManifest } from '@/types'

const SHOT_TYPE_LABEL: Record<string, string> = {
  ECU: 'Extreme CU',
  CU: 'Close-Up',
  MCU: 'Med Close-Up',
  MS: 'Medium',
  MFS: 'Med Full',
  FS: 'Full Shot',
  WS: 'Wide',
  EWS: 'Extreme Wide',
  OTS: 'Over-the-Shoulder',
  POV: 'POV',
  TRACK: 'Tracking',
  '2S': 'Two-Shot',
}

interface ShotGridProps {
  shots: Shot[]
  selectedShotId: string | null
  manifest: SceneManifest
  onSelectShot: (id: string) => void
}

export function ShotGrid({
  shots,
  selectedShotId,
  manifest,
  onSelectShot,
}: ShotGridProps) {
  const getCharName = (charId: string) =>
    manifest.characters.find((c) => c.characterId === charId)?.name ?? charId

  if (shots.length === 0) {
    return (
      <div className="flex items-center justify-center px-6 py-8 text-sm text-muted-foreground">
        No shots generated for this scene yet.
      </div>
    )
  }

  return (
    <div className="border-b border-border px-6 py-4">
      <div className="mb-2 text-xs font-medium text-muted-foreground">
        SHOTS ({shots.length})
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {shots.map((shot) => {
          const isSelected = selectedShotId === shot.shotId
          return (
            <button
              key={shot.shotId}
              type="button"
              onClick={() => onSelectShot(shot.shotId)}
              className={cn(
                'flex min-w-[140px] max-w-[180px] shrink-0 flex-col rounded-lg border p-3 text-left transition-all',
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border hover:border-muted-foreground/30',
              )}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider text-muted-foreground">
                  {(() => {
                    const m = shot.shotId.match(/sh_(\d+)_(\d+)/)
                    return m ? `Scene #${parseInt(m[1])} Shot #${parseInt(m[2])}` : shot.shotId
                  })()}
                </span>
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  {shot.shotType}
                </Badge>
              </div>
              <p className="mb-2 line-clamp-2 text-xs leading-tight">
                {shot.actionDescription || 'No description'}
              </p>
              <div className="flex flex-wrap gap-1">
                {shot.characters.slice(0, 2).map((c) => (
                  <span
                    key={c}
                    className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground"
                  >
                    {getCharName(c)}
                  </span>
                ))}
                {shot.characters.length > 2 && (
                  <span className="text-[9px] text-muted-foreground">
                    +{shot.characters.length - 2}
                  </span>
                )}
              </div>
              {shot.dialogueLines.length > 0 && (
                <p className="mt-1.5 line-clamp-1 text-[10px] italic text-muted-foreground">
                  &ldquo;{shot.dialogueLines[0].text}&rdquo;
                </p>
              )}
              <span className="mt-1 text-[9px] text-muted-foreground">
                {shot.durationSeconds}s · {SHOT_TYPE_LABEL[shot.shotType] ?? shot.shotType}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
