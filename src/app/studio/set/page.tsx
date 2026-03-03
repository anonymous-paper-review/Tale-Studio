'use client'

import { useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { HandoffButton } from '@/components/layout/handoff-button'
import { useDirectorStore } from '@/stores/director-store'
import { mockSceneManifest } from '@/mocks/scene-manifest'

const ACT_COLORS: Record<string, string> = {
  intro: 'bg-act-intro',
  dev: 'bg-act-dev',
  turn: 'bg-act-turn',
  conclusion: 'bg-act-conclusion',
}

export default function SetPage() {
  const {
    shots,
    selectedSceneId,
    selectedShotId,
    selectScene,
    selectShot,
    loadMockData,
  } = useDirectorStore()

  useEffect(() => {
    loadMockData()
  }, [loadMockData])

  const scenes = mockSceneManifest.scenes
  const sceneShots = shots.filter((s) => s.sceneId === selectedSceneId)
  const selectedShot = shots.find((s) => s.shotId === selectedShotId)

  return (
    <>
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Scene Navigator */}
        <div className="flex w-48 flex-col border-r border-border p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            Scenes
          </h3>
          <div className="space-y-2">
            {scenes.map((scene) => (
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
                  <span className="font-medium">{scene.act.toUpperCase()}</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {scene.narrativeSummary}
                </p>
              </button>
            ))}
          </div>
        </div>

        <Separator orientation="vertical" />

        {/* Center: Shot Grid */}
        <div className="flex flex-1 flex-col p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            Shots
          </h3>
          <div className="grid grid-cols-3 gap-3 overflow-y-auto">
            {sceneShots.map((shot) => (
              <button
                key={shot.shotId}
                onClick={() => selectShot(shot.shotId)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  selectedShotId === shot.shotId
                    ? 'border-primary bg-accent'
                    : 'border-border hover:bg-accent/50'
                }`}
              >
                <div className="mb-2 flex aspect-video items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                  {shot.shotType}
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
            ))}
          </div>
        </div>

        <Separator orientation="vertical" />

        {/* Right: Inspector */}
        <div className="flex w-72 flex-col p-4">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            Inspector
          </h3>
          {selectedShot ? (
            <div className="space-y-4 text-sm">
              <div>
                <span className="text-muted-foreground">Type</span>
                <p className="font-medium">{selectedShot.shotType}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Action</span>
                <p>{selectedShot.actionDescription}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Camera (6-axis)</span>
                <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
                  {Object.entries(selectedShot.camera).map(([axis, val]) => (
                    <div key={axis} className="flex justify-between rounded bg-muted px-2 py-1">
                      <span className="text-muted-foreground">{axis}</span>
                      <span>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Lighting</span>
                <div className="mt-1 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Position</span>
                    <span>{selectedShot.lighting.position}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Brightness</span>
                    <span>{selectedShot.lighting.brightness}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Color Temp</span>
                    <span>{selectedShot.lighting.colorTemp}K</span>
                  </div>
                </div>
              </div>
              {selectedShot.dialogueLines.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Dialogue</span>
                  {selectedShot.dialogueLines.map((line, i) => (
                    <p key={i} className="mt-1 text-xs italic">
                      &ldquo;{line.text}&rdquo;
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a shot</p>
          )}
        </div>
      </div>
      <HandoffButton label="Head to Editor" targetStage="post" />
    </>
  )
}
