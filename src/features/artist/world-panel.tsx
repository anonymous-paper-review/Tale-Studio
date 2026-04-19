'use client'

import { useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { useArtistStore } from '@/stores/artist-store'
import { cn } from '@/lib/utils'

const BOOST_PRESETS = [
  'Cinematic',
  'High-Res',
  'Film Grain',
  'Neon Noir',
  'Golden Hour',
] as const

export function WorldPanel() {
  const {
    sceneManifest,
    worldAssets,
    selectedLocationId,
    generatingLocationId,
    selectedBoostPreset,
    imageProvider,
    selectLocation,
    generateWorldAsset,
    selectBoostPreset,
    setImageProvider,
  } = useArtistStore()

  const [selfHostedStatus, setSelfHostedStatus] = useState<
    'checking' | 'online' | 'offline' | 'unconfigured'
  >('checking')

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch('/api/generate/health')
        const data = await res.json()
        if (!cancelled) setSelfHostedStatus(data.status)
      } catch {
        if (!cancelled) setSelfHostedStatus('offline')
      }
    }
    check()
    const interval = setInterval(check, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const getScene = (sceneId: string) =>
    sceneManifest?.scenes.find((s) => s.sceneId === sceneId)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Provider Toggle + Cinematic Boost Chips */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        {/* Image Provider Toggle */}
        <div className="mr-3 flex items-center gap-1 rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => setImageProvider('gemini')}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              imageProvider === 'gemini'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Gemini
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  if (selfHostedStatus === 'online')
                    setImageProvider('tailscale')
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  imageProvider === 'tailscale'
                    ? 'bg-primary text-primary-foreground'
                    : selfHostedStatus === 'online'
                      ? 'text-muted-foreground hover:text-foreground'
                      : 'cursor-not-allowed text-muted-foreground/50',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    selfHostedStatus === 'online' && 'bg-green-500',
                    selfHostedStatus === 'offline' && 'bg-red-500',
                    selfHostedStatus === 'checking' &&
                      'bg-yellow-500 animate-pulse',
                    selfHostedStatus === 'unconfigured' && 'bg-gray-400',
                  )}
                />
                Self-hosted
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {selfHostedStatus === 'online' && 'h100-image-gen connected'}
              {selfHostedStatus === 'offline' &&
                'Server offline — check h100-image-gen'}
              {selfHostedStatus === 'checking' && 'Checking connection…'}
              {selfHostedStatus === 'unconfigured' &&
                'TAILSCALE_IMAGE_API_URL not set'}
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="!h-5" />

        <span className="mr-1 text-xs font-medium text-muted-foreground">
          Cinematic Boost
        </span>
        {BOOST_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => selectBoostPreset(preset)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              selectedBoostPreset === preset
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
            )}
          >
            {preset}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1 px-6 py-4">
        <div className="space-y-6">
          {worldAssets.map((world) => {
            const scene = getScene(world.sceneId)
            const isGenerating = generatingLocationId === world.locationId
            const isSelected = selectedLocationId === world.locationId

            return (
              <div
                key={world.locationId}
                role="button"
                tabIndex={0}
                onClick={() => selectLocation(world.locationId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ')
                    selectLocation(world.locationId)
                }}
                className={cn(
                  'cursor-pointer rounded-xl border p-4 transition-colors',
                  isSelected
                    ? 'border-primary bg-accent'
                    : 'border-border hover:bg-accent/50',
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-medium">{world.name}</span>
                  {scene && (
                    <Badge variant="outline" className="text-[10px]">
                      {scene.timeOfDay}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ImagePlaceholder
                    label="Wide Shot"
                    aspectRatio="video"
                    imageUrl={world.wideShot}
                  />
                  <ImagePlaceholder
                    label="Establishing"
                    aspectRatio="video"
                    imageUrl={world.establishingShot}
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  disabled={isGenerating}
                  onClick={(e) => {
                    e.stopPropagation()
                    generateWorldAsset(world.locationId)
                  }}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" />
                      Generate Background
                    </>
                  )}
                </Button>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
