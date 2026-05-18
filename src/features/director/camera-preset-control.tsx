'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { CameraPreset } from '@/types'

interface BrandDef {
  id: string
  label: string
  full_name: string
  characteristics: string
}

interface WhiteBalanceDef {
  id: string
  label: string
  kelvin: number
}

interface CameraGearData {
  brands: BrandDef[]
  focalLengths: number[]
  apertures: number[]
  whiteBalances: WhiteBalanceDef[]
}

interface CameraPresetControlProps {
  preset: CameraPreset
  onUpdate: (changes: Partial<CameraPreset>) => void
}

const FALLBACK: CameraGearData = {
  brands: [],
  focalLengths: [24, 35, 50, 85],
  apertures: [1.4, 2, 2.8, 4, 5.6, 8],
  whiteBalances: [
    { id: 'tungsten', label: 'Tungsten', kelvin: 3200 },
    { id: 'daylight', label: 'Daylight', kelvin: 5600 },
    { id: 'cloudy', label: 'Cloudy', kelvin: 6500 },
  ],
}

export function CameraPresetControl({
  preset,
  onUpdate,
}: CameraPresetControlProps) {
  const [gear, setGear] = useState<CameraGearData>(FALLBACK)

  useEffect(() => {
    let cancelled = false
    fetch('/api/knowledge/cameras')
      .then((r) => r.json())
      .then((data: CameraGearData) => {
        if (!cancelled && data.brands) setGear(data)
      })
      .catch(() => {
        if (!cancelled) setGear(FALLBACK)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const activeBrand = gear.brands.find((b) => b.id === preset.brand)
  const promptPreview = `Shot on ${activeBrand?.full_name ?? preset.brand}, ${preset.focalLength}mm, f/${preset.aperture}, WB ${preset.whiteBalance}K`

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Camera
      </h4>

      <Row label="Brand">
        {gear.brands.map((b) => (
          <Chip
            key={b.id}
            active={preset.brand === b.id}
            onClick={() => onUpdate({ brand: b.id })}
            title={b.characteristics}
          >
            {b.label}
          </Chip>
        ))}
      </Row>

      <Row label="Lens">
        {gear.focalLengths.map((f) => (
          <Chip
            key={f}
            active={preset.focalLength === f}
            onClick={() => onUpdate({ focalLength: f })}
          >
            {f}mm
          </Chip>
        ))}
      </Row>

      <Row label="Aperture">
        {gear.apertures.map((a) => (
          <Chip
            key={a}
            active={preset.aperture === a}
            onClick={() => onUpdate({ aperture: a })}
          >
            f/{a}
          </Chip>
        ))}
      </Row>

      <Row label="WB">
        {gear.whiteBalances.map((w) => (
          <Chip
            key={w.id}
            active={preset.whiteBalance === w.kelvin}
            onClick={() => onUpdate({ whiteBalance: w.kelvin })}
            title={w.label}
          >
            {w.kelvin}K
          </Chip>
        ))}
      </Row>

      <p className="text-[10px] italic text-muted-foreground">{promptPreview}</p>
    </div>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
