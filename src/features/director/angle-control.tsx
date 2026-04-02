'use client'

import { Slider } from '@/components/ui/slider'
import { CAMERA_AXIS_RANGE } from '@/lib/constants'
import type { CameraConfig } from '@/types'

const AXES: { key: keyof CameraConfig; label: string }[] = [
  { key: 'horizontal', label: 'Horizontal' },
  { key: 'vertical', label: 'Vertical' },
  { key: 'pan', label: 'Pan' },
  { key: 'tilt', label: 'Tilt' },
  { key: 'roll', label: 'Roll' },
  { key: 'zoom', label: 'Zoom' },
]

interface AngleControlProps {
  camera: CameraConfig
  onUpdate: (config: Partial<CameraConfig>) => void
}

export function AngleControl({ camera, onUpdate }: AngleControlProps) {
  // Map axis values to CSS rotation degrees (scale -10~+10 → -30~+30 deg)
  const rotateX = camera.vertical * 3
  const rotateY = camera.horizontal * 3
  const rotateZ = camera.roll * 3

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Angle Control
      </h4>

      {/* CSS 3D Cube */}
      <div className="flex justify-center py-2" style={{ perspective: '300px' }}>
        <div
          className="relative h-20 w-20"
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`,
            transition: 'transform 0.15s ease-out',
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 border border-white bg-white/10"
            style={{ transform: 'translateZ(40px)' }}
          >
            <div className="flex h-full items-center justify-center text-[10px] text-white/60">
              F
            </div>
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 border border-white/60 bg-white/5"
            style={{ transform: 'rotateY(180deg) translateZ(40px)' }}
          />
          {/* Left */}
          <div
            className="absolute inset-0 border border-white/60 bg-white/5"
            style={{
              width: '80px',
              transform: 'rotateY(-90deg) translateZ(40px)',
            }}
          />
          {/* Right */}
          <div
            className="absolute inset-0 border border-white/60 bg-white/5"
            style={{
              width: '80px',
              transform: 'rotateY(90deg) translateZ(40px)',
            }}
          />
          {/* Top */}
          <div
            className="absolute inset-0 border border-white/80 bg-white/10"
            style={{
              height: '80px',
              transform: 'rotateX(90deg) translateZ(40px)',
            }}
          />
          {/* Bottom */}
          <div
            className="absolute inset-0 border border-white/60 bg-white/5"
            style={{
              height: '80px',
              transform: 'rotateX(-90deg) translateZ(40px)',
            }}
          />
        </div>
      </div>

      {/* 6-axis sliders */}
      <div className="space-y-3">
        {AXES.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular-nums font-mono text-foreground">
                {camera[key]}
              </span>
            </div>
            <Slider
              min={CAMERA_AXIS_RANGE.min}
              max={CAMERA_AXIS_RANGE.max}
              step={1}
              value={[camera[key]]}
              onValueChange={([v]) => onUpdate({ [key]: v })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
