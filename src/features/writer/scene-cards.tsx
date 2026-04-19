'use client'

import { Clapperboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { SceneManifest } from '@/types'

interface SceneCardsProps {
  manifest: SceneManifest
  shotCounts: Record<string, number>
  onOpenScene: (sceneId: string) => void
  activeSceneId?: string | null
}

export function SceneCards({
  manifest,
  shotCounts,
  onOpenScene,
  activeSceneId,
}: SceneCardsProps) {
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Scenes ({manifest.scenes.length})
      </div>
      {manifest.scenes.map((scene, idx) => {
        const isActive = activeSceneId === scene.sceneId
        const count = shotCounts[scene.sceneId] ?? 0
        return (
          <button
            key={scene.sceneId}
            type="button"
            onClick={() => onOpenScene(scene.sceneId)}
            className={cn(
              'group rounded-lg border p-3 text-left transition-colors',
              isActive
                ? 'border-primary bg-accent'
                : 'border-border hover:border-muted-foreground/40 hover:bg-accent/40',
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">
                Scene {idx + 1}
              </span>
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Clapperboard className="size-3" />
                {count}
              </Badge>
            </div>
            <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
              {scene.narrativeSummary || '—'}
            </p>
          </button>
        )
      })}
    </div>
  )
}
