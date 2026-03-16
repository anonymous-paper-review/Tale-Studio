'use client'

import { useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { HandoffButton } from '@/components/layout/handoff-button'
import { CinematographicInspector } from '@/features/director/cinematographic-inspector'
import { DirectorChat } from '@/features/director/director-chat'
import { useDirectorStore } from '@/stores/director-store'

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
    selectScene,
    selectShot,
    updateCamera,
    updateLighting,
    generateVideo,
    loadData,
  } = useDirectorStore()

  useEffect(() => {
    loadData()
  }, [loadData])

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
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Shots
            </h3>
            <span className="text-xs text-muted-foreground">
              {sceneShots.length} shots
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 overflow-y-auto">
            {sceneShots.map((shot) => {
              const bgUrl = getSceneBg(shot.sceneId)
              const charAvatars = getShotCharAvatars(shot.characters)
              const clip = videoClips.find((c) => c.shotId === shot.shotId)

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

                  {/* Shot thumbnail / background */}
                  <div className="relative mb-2 flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted">
                    {bgUrl ? (
                      <>
                        <img
                          src={bgUrl}
                          alt="scene bg"
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {shot.shotType}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {shot.shotType}
                      </span>
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

      <HandoffButton label="Head to Editor" targetStage="editor" />
    </>
  )
}
