'use client'

import { useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { HandoffButton } from '@/components/layout/handoff-button'
import { useArtistStore } from '@/stores/artist-store'

export default function VisualPage() {
  const {
    characterAssets,
    worldAssets,
    selectedCharacterId,
    selectCharacter,
    loadMockData,
  } = useArtistStore()

  useEffect(() => {
    loadMockData()
  }, [loadMockData])

  return (
    <>
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Character Consistency */}
        <div className="flex w-1/2 flex-col border-r border-border p-6">
          <h2 className="mb-4 text-lg font-semibold">Character Consistency</h2>
          <div className="space-y-4 overflow-y-auto">
            {characterAssets.map((char) => (
              <button
                key={char.characterId}
                onClick={() => selectCharacter(char.characterId)}
                className={`w-full rounded-lg border p-4 text-left transition-colors ${
                  selectedCharacterId === char.characterId
                    ? 'border-primary bg-accent'
                    : 'border-border hover:bg-accent/50'
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-medium">{char.name}</span>
                  <Badge variant={char.locked ? 'default' : 'secondary'}>
                    {char.locked ? 'Locked' : 'Unlocked'}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['front', 'side', 'back'] as const).map((view) => (
                    <div
                      key={view}
                      className="flex aspect-square items-center justify-center rounded-md bg-muted text-xs text-muted-foreground"
                    >
                      {char.views[view] ? '🖼' : view}
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        <Separator orientation="vertical" />

        {/* Right: World Model */}
        <div className="flex w-1/2 flex-col p-6">
          <h2 className="mb-4 text-lg font-semibold">World Model</h2>
          <div className="space-y-4 overflow-y-auto">
            {worldAssets.map((world) => (
              <div
                key={world.locationId}
                className="rounded-lg border border-border p-4"
              >
                <span className="font-medium">{world.name}</span>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="flex aspect-video items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                    {world.wideShot ? '🖼' : 'Wide Shot'}
                  </div>
                  <div className="flex aspect-video items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                    {world.establishingShot ? '🖼' : 'Establishing'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <HandoffButton label="Approve & Direct" targetStage="set" />
    </>
  )
}
