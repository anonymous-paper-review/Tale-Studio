'use client'

import { useEffect, useState } from 'react'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

interface MovementPreset {
  id: string
  label: string
  description: string
  prompt_fragment: string
}

interface MovementControlProps {
  preset: string | null
  intensity: number
  onSelectPreset: (id: string | null) => void
  onIntensityChange: (value: number) => void
}

export function MovementControl({
  preset,
  intensity,
  onSelectPreset,
  onIntensityChange,
}: MovementControlProps) {
  const [presets, setPresets] = useState<MovementPreset[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/knowledge/movements')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setPresets(data.movements ?? [])
      })
      .catch(() => {
        if (!cancelled) setPresets([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selected = presets.find((p) => p.id === preset)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Movement
        </h4>
        {preset && (
          <button
            type="button"
            onClick={() => onSelectPreset(null)}
            className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const active = preset === p.id
          return (
            <button
              key={p.id}
              type="button"
              title={p.description}
              onClick={() => onSelectPreset(active ? null : p.id)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors',
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Intensity</span>
          <span className="tabular-nums font-mono">{intensity}/10</span>
        </div>
        <Slider
          min={0}
          max={10}
          step={1}
          value={[intensity]}
          onValueChange={([v]) => onIntensityChange(v)}
          disabled={!preset}
        />
      </div>

      {selected && (
        <p className="text-[10px] italic text-muted-foreground">
          {selected.description}
        </p>
      )}
    </div>
  )
}
