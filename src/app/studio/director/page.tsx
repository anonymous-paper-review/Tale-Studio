'use client'

import { useEffect, useState } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { HandoffButton } from '@/components/layout/handoff-button'
import { CinematographicInspector } from '@/features/director/cinematographic-inspector'
import { DirectorChat } from '@/features/director/director-chat'
import { useDirectorStore } from '@/stores/director-store'
import { useProjectStore } from '@/stores/project-store'
import { type ImageProvider } from '@/stores/artist-store'
import { cn } from '@/lib/utils'

const ACT_COLORS: Record<string, string> = {
  intro: 'bg-act-intro',
  dev: 'bg-act-dev',
  turn: 'bg-act-turn',
  conclusion: 'bg-act-conclusion',
}

export default function SetPage() {
  const {
    sceneManifest,
    characterAssets,
    worldAssets,
    shots,
    videoClips,
    selectedSceneId,
    selectedShotId,
    generatingVideoShotId,
    generatingImageShotIds,
    imageProvider,
    selectScene,
    selectShot,
    updateCamera,
    updateLighting,
    generateVideo,
    generateShotImage,
    generateAllShotImages,
    setImageProvider,
    loadData,
  } = useDirectorStore()

  const projectId = useProjectStore((s) => s.projectId)

  // Self-hosted health check
  const [selfHostedStatus, setSelfHostedStatus] = useState<'checking' | 'online' | 'offline' | 'unconfigured'>('checking')

  useEffect(() => {
    loadData()
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

  const scenes = sceneManifest?.scenes ?? []
  const sceneShots = shots.filter((s) => s.sceneId === selectedSceneId)
  const selectedShot = shots.find((s) => s.shotId === selectedShotId)

  // Helper: find world asset image for a shot's scene
  const getSceneBg = (sceneId: string) => {
    const scene = scenes.find((s) => s.sceneId === sceneId)
    if (!scene) return null
    const world = worldAssets.find(
      (w) => w.locationId === scene.location || w.sceneId === sceneId,
    )
    return world?.wideShot ?? world?.establishingShot ?? null
  }

  // Helper: find character avatars for a shot
  const getShotCharAvatars = (characterIds: string[]) =>
    characterIds
      .map((id) => characterAssets.find((c) => c.characterId === id))
      .filter(Boolean)

  if (shots.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">The Set</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete previous steps first to load scenes and shots.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Scene Navigator */}
        <div className="flex w-48 shrink-0 flex-col border-r border-border p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            Scenes
          </h3>
          <div className="space-y-2">
            {scenes.map((scene) => {
              const shotCount = shots.filter(
                (s) => s.sceneId === scene.sceneId,
              ).length
              const completedCount = videoClips.filter(
                (c) =>
                  shots.some(
                    (s) =>
                      s.sceneId === scene.sceneId && s.shotId === c.shotId,
                  ) && c.status === 'completed',
              ).length

              return (
                <button
                  key={scene.sceneId}
                  onClick={() => selectScene(scene.sceneId)}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                    selectedSceneId === scene.sceneId
                      ? 'border-primary bg-accent'
                      : 'border-border hover:bg-accent/50'
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${ACT_COLORS[scene.act] ?? 'bg-muted'}`}
                    />
                    <span className="font-medium">
                      {scene.act.toUpperCase()}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {scene.narrativeSummary}
                  </p>
                  {/* Shot progress dots */}
                  <div className="mt-2 flex gap-1">
                    {Array.from({ length: shotCount }, (_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 w-1.5 rounded-full ${
                          i < completedCount
                            ? 'bg-primary'
                            : 'bg-primary/30'
                        }`}
                      />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <Separator orientation="vertical" />

        {/* Center: Shot Grid */}
        <div className="flex flex-1 flex-col p-4">
          {/* Header: title + provider toggle + generate all */}
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Shots <span className="font-normal">({sceneShots.length})</span>
            </h3>
            <div className="flex items-center gap-2">
              {/* Provider toggle */}
              <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setImageProvider('gemini')}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors',
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
                        'flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors',
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
                    {selfHostedStatus === 'offline' && 'Server offline'}
                    {selfHostedStatus === 'checking' && 'Checking…'}
                    {selfHostedStatus === 'unconfigured' && 'Not configured'}
                  </TooltipContent>
                </Tooltip>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={generatingImageShotIds.size > 0}
                onClick={() => generateAllShotImages()}
              >
                {generatingImageShotIds.size > 0 ? (
                  <>
                    <Loader2 className="mr-1 size-3 animate-spin" />
                    {generatingImageShotIds.size} generating…
                  </>
                ) : (
                  <>
                    <ImageIcon className="mr-1 size-3" />
                    Generate All
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 overflow-y-auto">
            {sceneShots.map((shot) => {
              const imgUrl = shot.referenceImageUrl ?? getSceneBg(shot.sceneId)
              const charAvatars = getShotCharAvatars(shot.characters)
              const clip = videoClips.find((c) => c.shotId === shot.shotId)
              const isGenImg = generatingImageShotIds.has(shot.shotId)

              return (
                <button
                  key={shot.shotId}
                  onClick={() => selectShot(shot.shotId)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    selectedShotId === shot.shotId
                      ? 'border-primary bg-accent'
                      : 'border-border hover:bg-accent/50'
                  }`}
                >
                  {/* Character avatars */}
                  {charAvatars.length > 0 && (
                    <div className="mb-2 flex -space-x-1.5">
                      {charAvatars.map((char) =>
                        char!.views.front ? (
                          <img
                            key={char!.characterId}
                            src={char!.views.front}
                            alt={char!.name}
                            className="h-5 w-5 rounded-full border border-background object-cover"
                          />
                        ) : (
                          <div
                            key={char!.characterId}
                            className="flex h-5 w-5 items-center justify-center rounded-full border border-background bg-muted text-[8px] font-medium"
                          >
                            {char!.name[0]}
                          </div>
                        ),
                      )}
                    </div>
                  )}

                  {/* Shot thumbnail */}
                  <div className="group relative mb-2 flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted">
                    {isGenImg ? (
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    ) : imgUrl ? (
                      <>
                        <img
                          src={imgUrl}
                          alt={shot.actionDescription}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {shot.shotType}
                        </span>
                        {/* Hover: regenerate */}
                        <div
                          role="button"
                          tabIndex={0}
                          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            generateShotImage(shot.shotId)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation()
                              generateShotImage(shot.shotId)
                            }
                          }}
                        >
                          <ImageIcon className="size-4 text-white" />
                        </div>
                      </>
                    ) : (
                      <div
                        role="button"
                        tabIndex={0}
                        className="flex flex-col items-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          generateShotImage(shot.shotId)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation()
                            generateShotImage(shot.shotId)
                          }
                        }}
                      >
                        <ImageIcon className="size-4 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {shot.shotType}
                        </span>
                      </div>
                    )}

                    {/* Video status indicator */}
                    {clip && clip.status !== 'pending' && (
                      <span
                        className={`absolute right-1 top-1 h-2 w-2 rounded-full ${
                          clip.status === 'completed'
                            ? 'bg-green-500'
                            : clip.status === 'generating'
                              ? 'animate-pulse bg-yellow-500'
                              : 'bg-red-500'
                        }`}
                      />
                    )}
                  </div>

                  <p className="truncate text-xs">{shot.actionDescription}</p>
                  <div className="mt-1 flex gap-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {shot.generationMethod}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {shot.durationSeconds}s
                    </Badge>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <Separator orientation="vertical" />

        {/* Right: Cinematographic Inspector */}
        <div className="w-72 shrink-0 border-l border-border">
          <CinematographicInspector
            shot={selectedShot}
            onUpdateCamera={(config) =>
              selectedShotId && updateCamera(selectedShotId, config)
            }
            onUpdateLighting={(config) =>
              selectedShotId && updateLighting(selectedShotId, config)
            }
            onGenerateVideo={() =>
              selectedShotId && generateVideo(selectedShotId)
            }
            isGenerating={generatingVideoShotId === selectedShotId}
          />
        </div>
      </div>

      {/* Bottom: Director Kim Chat */}
      <DirectorChat />

      <HandoffButton
        label="Head to Editor"
        targetStage="editor"
        disabled={shots.length === 0}
      />
    </>
  )
}
