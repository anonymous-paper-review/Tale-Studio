'use client'

import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HandoffButton } from '@/components/layout/handoff-button'
import { CharacterPanel } from '@/features/artist/character-panel'
import { WorldPanel } from '@/features/artist/world-panel'
import { InventoryGrid } from '@/features/artist/inventory-grid'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'

type ArtistTab = 'characters' | 'world' | 'inventory'

export default function VisualPage() {
  const {
    characterAssets,
    worldAssets,
    error,
    selectCharacter,
    selectLocation,
    loadData,
  } = useArtistStore()

  const projectId = useProjectStore((s) => s.projectId)
  const [tab, setTab] = useState<ArtistTab>('characters')

  useEffect(() => {
    if (projectId) loadData()
  }, [projectId, loadData])

  if (characterAssets.length === 0 && worldAssets.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">The Visual Studio</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete the Script Room first to generate characters and
            locations.
          </p>
        </div>
      </div>
    )
  }

  const handleInventorySelect = (
    kind: 'character' | 'location',
    id: string,
  ) => {
    if (kind === 'character') {
      selectCharacter(id)
      setTab('characters')
    } else {
      selectLocation(id)
      setTab('world')
    }
  }

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as ArtistTab)}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="border-b border-border px-6 py-3">
          <TabsList>
            <TabsTrigger value="characters">Characters</TabsTrigger>
            <TabsTrigger value="world">World</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="characters"
          className="flex flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <CharacterPanel />
        </TabsContent>

        <TabsContent
          value="world"
          className="flex flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <WorldPanel />
        </TabsContent>

        <TabsContent
          value="inventory"
          className="flex flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <InventoryGrid onSelect={handleInventorySelect} />
        </TabsContent>
      </Tabs>

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
