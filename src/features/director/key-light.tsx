'use client'

import { Slider } from '@/components/ui/slider'
import type { LightingConfig } from '@/types'

const POSITIONS = ['left', 'top', 'right', 'front'] as const
const POS_LABELS: Record<string, string> = {
  left: 'L',
  top: 'T',
  right: 'R',
  front: 'F',
}

// Position angle in degrees for the indicator dot on the circle
const POS_ANGLE: Record<string, number> = {
  left: 180,
  top: 270,
  right: 0,
  front: 90,
}

interface KeyLightProps {
  lighting: LightingConfig
  onUpdate: (config: Partial<LightingConfig>) => void
}

export function KeyLight({ lighting, onUpdate }: KeyLightProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Key Light
        </h4>
        <button
          type="button"
          onClick={() => onUpdate({ position: 'front', brightness: 50, colorTemp: 5000 })}
          className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Reset
        </button>
      </div>

      {/* Light position circle */}
      <div className="flex justify-center py-2">
        <div className="relative h-24 w-24">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-2 border-muted" />
          {/* Inner glow based on brightness */}
          <div
            className="absolute inset-2 rounded-full"
            style={{
              background: `radial-gradient(circle, hsl(${((lighting.colorTemp - 2000) / 8000) * 40 + 20}, 80%, ${40 + lighting.brightness * 0.4}%) 0%, transparent 70%)`,
              opacity: lighting.brightness / 100,
            }}
          />
          {/* Position buttons */}
          {POSITIONS.map((pos) => {
            const angle = (POS_ANGLE[pos] * Math.PI) / 180
            const x = 48 + Math.cos(angle) * 40
            const y = 48 + Math.sin(angle) * 40
            const isActive = lighting.position === pos
            return (
              <button
                key={pos}
                onClick={() => onUpdate({ position: pos })}
                className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
                style={{ left: x, top: y }}
              >
                {POS_LABELS[pos]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Brightness */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Brightness</span>
          <span className="font-mono tabular-nums">{lighting.brightness}%</span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[lighting.brightness]}
          onValueChange={([v]) => onUpdate({ brightness: v })}
        />
      </div>

      {/* Color Temperature */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Color Temp</span>
          <span className="font-mono tabular-nums">{lighting.colorTemp}K</span>
        </div>
        <div className="relative">
          <div
            className="absolute inset-0 h-1.5 rounded-full"
            style={{
              background: 'linear-gradient(to right, #ff8a2b, #fff5e6, #a8c4e0, #6b9fd4)',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
          <Slider
            min={2000}
            max={10000}
            step={100}
            value={[lighting.colorTemp]}
            onValueChange={([v]) => onUpdate({ colorTemp: v })}
            className="relative"
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Warm</span>
          <span>Cool</span>
        </div>
      </div>
    </div>
  )
}
