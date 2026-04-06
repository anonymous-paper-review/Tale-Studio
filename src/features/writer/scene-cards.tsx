'use client'

import { MapPin, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Act, SceneManifest } from '@/types'

const ACT_LABELS: Record<Act, string> = {
  intro: 'INTRODUCTION SCENE',
  dev: 'DEVELOPMENT SCENE',
  turn: 'TURN SCENE',
  conclusion: 'CONCLUSION SCENE',
}

const ACT_COLORS: Record<Act, string> = {
  intro: 'border-blue-500/50 bg-blue-500/5',
  dev: 'border-amber-500/50 bg-amber-500/5',
  turn: 'border-red-500/50 bg-red-500/5',
  conclusion: 'border-emerald-500/50 bg-emerald-500/5',
}

const ACT_ACCENT: Record<Act, string> = {
  intro: 'bg-blue-500',
  dev: 'bg-amber-500',
  turn: 'bg-red-500',
  conclusion: 'bg-emerald-500',
}

interface SceneCardsProps {
  manifest: SceneManifest
  selectedSceneId: string | null
  onSelectScene: (id: string) => void
}

export function SceneCards({
  manifest,
  selectedSceneId,
  onSelectScene,
}: SceneCardsProps) {
  const getLocationName = (locId: string) =>
    manifest.locations.find((l) => l.locationId === locId)?.name ?? locId

  return (
    <div className="border-b border-border px-6 py-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {manifest.scenes.map((scene) => {
          const isSelected = selectedSceneId === scene.sceneId
          return (
            <button
              key={scene.sceneId}
              type="button"
              onClick={() => onSelectScene(scene.sceneId)}
              className={cn(
                'rounded-lg border-2 p-3 text-left transition-all',
                ACT_COLORS[scene.act],
                isSelected
                  ? 'border-primary ring-1 ring-primary/30'
                  : 'hover:brightness-110',
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <div
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    ACT_ACCENT[scene.act],
                  )}
                />
                <span className="text-[10px] font-bold tracking-wider text-muted-foreground">
                  {ACT_LABELS[scene.act]}
                </span>
              </div>
              <p className="mb-2 line-clamp-2 text-sm font-medium leading-tight">
                {scene.narrativeSummary.split(' ').slice(0, 6).join(' ')}…
              </p>
              <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {getLocationName(scene.location)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {scene.timeOfDay}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
