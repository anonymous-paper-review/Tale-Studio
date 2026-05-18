'use client'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import type { Shot, VideoClip } from '@/types'

interface ClipInspectorProps {
  shot: Shot | undefined
  clip: VideoClip | undefined
  onTrim: (trimStart: number, trimEnd: number) => void
  onSpeed: (speed: number) => void
}

const SPEED_TICKS = [0.25, 0.5, 1, 2, 4] as const

export function ClipInspector({
  shot,
  clip,
  onTrim,
  onSpeed,
}: ClipInspectorProps) {
  if (!shot || !clip) {
    return (
      <aside className="flex w-72 shrink-0 flex-col items-center justify-center border-l border-border p-4">
        <p className="text-center text-xs text-muted-foreground">
          Select a clip to edit
        </p>
      </aside>
    )
  }

  const duration = shot.durationSeconds
  const trimStart = clip.trimStart ?? 0
  const trimEnd = clip.trimEnd ?? duration
  const speed = clip.speed ?? 1.0

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">Clip {shot.shotId}</h3>
        <p className="text-[10px] text-muted-foreground">
          {shot.shotType} · {duration}s
        </p>
      </div>

      {/* Trim */}
      <section className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Trim
        </label>
        <Slider
          min={0}
          max={duration}
          step={0.1}
          value={[trimStart, trimEnd]}
          onValueChange={([s, e]) => {
            if (typeof s === 'number' && typeof e === 'number') onTrim(s, e)
          }}
        />
        <p className="text-[10px] text-muted-foreground">
          {trimStart.toFixed(1)}s – {trimEnd.toFixed(1)}s
        </p>
      </section>

      <Separator />

      {/* Speed */}
      <section className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Speed
        </label>
        <Slider
          min={0.25}
          max={4.0}
          step={0.05}
          value={[speed]}
          onValueChange={([v]) => {
            if (typeof v === 'number') onSpeed(v)
          }}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium tabular-nums">
            {speed.toFixed(2)}x
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => onSpeed(1.0)}
          >
            Reset
          </Button>
        </div>
        <div className="flex justify-between gap-1 pt-1">
          {SPEED_TICKS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onSpeed(t)}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t}x
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
}
