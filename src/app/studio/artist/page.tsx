'use client'

import { useEffect, useState } from 'react'
import { Lock, Unlock, Loader2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { HandoffButton } from '@/components/layout/handoff-button'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { useArtistStore, type ImageProvider } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import { cn } from '@/lib/utils'

const ROLE_VARIANT = {
  protagonist: 'default',
  antagonist: 'destructive',
  supporting: 'secondary',
} as const

const BOOST_PRESETS = [
  'Cinematic',
  'High-Res',
  'Film Grain',
  'Neon Noir',
  'Golden Hour',
] as const

export default function VisualPage() {
  const {
    sceneManifest,
    characterAssets,
    worldAssets,
    selectedCharacterId,
    generatingCharacterId,
    generatingLocationId,
    selectedBoostPreset,
    imageProvider,
    error,
    selectCharacter,
    lockCharacter,
    unlockCharacter,
    generateSheet,
    generateWorldAsset,
    selectBoostPreset,
    setImageProvider,
    loadMockData,
    loadData,
  } = useArtistStore()

  const projectId = useProjectStore((s) => s.projectId)

  // Self-hosted server health check
  const [selfHostedStatus, setSelfHostedStatus] = useState<'checking' | 'online' | 'offline' | 'unconfigured'>('checking')

  useEffect(() => {
    if (projectId) loadData()
  }, [projectId, loadData])

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
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const getRole = (id: string) =>
    sceneManifest?.characters.find((c) => c.characterId === id)?.role ??
    'supporting'

  const getScene = (sceneId: string) =>
    sceneManifest?.scenes.find((s) => s.sceneId === sceneId)

  if (characterAssets.length === 0 && worldAssets.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">The Visual Studio</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete the Script Room first to generate characters and locations.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* ===== Left: Character Consistency ===== */}
        <div className="flex w-full flex-col border-b border-border lg:w-1/2 lg:border-b-0 lg:border-r">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Character Consistency</h2>
          </div>

          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-4">
              {characterAssets.map((char) => {
                const role = getRole(char.characterId)
                const isSelected = selectedCharacterId === char.characterId
                const isGenerating =
                  generatingCharacterId === char.characterId

                return (
                  <div
                    key={char.characterId}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectCharacter(char.characterId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ')
                        selectCharacter(char.characterId)
                    }}
                    className={cn(
                      'cursor-pointer rounded-xl border p-4 transition-colors',
                      isSelected
                        ? 'border-primary bg-accent'
                        : 'border-border hover:bg-accent/50',
                    )}
                  >
                    {/* Header: Name + Role + Lock */}
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{char.name}</span>
                        <Badge variant={ROLE_VARIANT[role]}>{role}</Badge>
                      </div>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              char.locked
                                ? unlockCharacter(char.characterId)
                                : lockCharacter(char.characterId)
                            }}
                          >
                            {char.locked ? (
                              <Lock className="size-3.5" />
                            ) : (
                              <Unlock className="size-3.5 text-muted-foreground" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {char.locked
                            ? 'Unlock character'
                            : 'Lock character'}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* 3-View Grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {(['front', 'side', 'back'] as const).map((view) => (
                        <ImagePlaceholder
                          key={view}
                          label={view.charAt(0).toUpperCase() + view.slice(1)}
                          aspectRatio="square"
                          imageUrl={char.views[view]}
                        />
                      ))}
                    </div>

                    {/* Generate Sheet */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      disabled={isGenerating || char.locked}
                      onClick={(e) => {
                        e.stopPropagation()
                        generateSheet(char.characterId)
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
                          Generate Sheet
                        </>
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>

        <Separator orientation="vertical" className="hidden lg:block" />

        {/* ===== Right: World Model ===== */}
        <div className="flex w-full flex-col lg:w-1/2">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">World Model</h2>
          </div>

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
                      if (selfHostedStatus === 'online') setImageProvider('tailscale')
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
                        selfHostedStatus === 'checking' && 'bg-yellow-500 animate-pulse',
                        selfHostedStatus === 'unconfigured' && 'bg-gray-400',
                      )}
                    />
                    Self-hosted
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {selfHostedStatus === 'online' && 'h100-image-gen connected'}
                  {selfHostedStatus === 'offline' && 'Server offline — check h100-image-gen'}
                  {selfHostedStatus === 'checking' && 'Checking connection…'}
                  {selfHostedStatus === 'unconfigured' && 'TAILSCALE_IMAGE_API_URL not set'}
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
                const isGenerating =
                  generatingLocationId === world.locationId

                return (
                  <div
                    key={world.locationId}
                    className="rounded-xl border border-border p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-medium">{world.name}</span>
                      {scene && (
                        <Badge variant="outline" className="text-[10px]">
                          {scene.act.toUpperCase()} · {scene.timeOfDay}
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
                      onClick={() => generateWorldAsset(world.locationId)}
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
      </div>
      {error && (
        <div className="border-t border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <HandoffButton
        label="Approve & Direct"
        targetStage="director"
        disabled={characterAssets.length === 0}
      />
    </>
  )
}
