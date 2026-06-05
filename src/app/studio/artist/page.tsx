'use client'

import { useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HandoffButton } from '@/components/layout/handoff-button'
import { CharacterPanel } from '@/features/artist/character-panel'
import { WorldPanel } from '@/features/artist/world-panel'
import { InventoryGrid } from '@/features/artist/inventory-grid'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import { WriterProgress } from '@/components/layout/writer-progress'
import { useWriterStatus } from '@/lib/writer/use-writer-status'

type ArtistTab = 'characters' | 'world' | 'inventory'

export default function VisualPage() {
  const {
    characterAssets,
    worldAssets,
    error,
    selectCharacter,
    selectLocation,
    loadData,
    autoGenerateBaseImages,
  } = useArtistStore()

  const projectId = useProjectStore((s) => s.projectId)
  const [tab, setTab] = useState<ArtistTab>('characters')

  // writer-pipeline 진행상황 (producer→artist 직행 시 백그라운드 생성 진행 표시용, decisions #37)
  const { status: writerStatus } = useWriterStatus(projectId)

  // 프로젝트당 1회만 자동생성 트리거 (마운트/재진입 중복 방지)
  const autoGenTriggeredRef = useRef<string | null>(null)

  useEffect(() => {
    if (projectId) loadData()
  }, [projectId, loadData])

  // 백그라운드 generate-scenes가 DB(scenes/characters/locations)를 채울 때까지 폴링 재로드.
  // loadData는 idempotent — 데이터가 들어오면 빈 화면(progress)에서 카드 UI로 자동 전환.
  const hasArtistData = characterAssets.length > 0 || worldAssets.length > 0
  useEffect(() => {
    if (!projectId || hasArtistData) return
    const id = setInterval(() => loadData(), 3000)
    return () => clearInterval(id)
  }, [projectId, hasArtistData, loadData])

  // Writer→Artist 첫 진입 시 기본 필수 이미지 자동생성 (1회+캐시).
  // 데이터가 채워진 뒤, 이미 없는(null) 이미지만 내부에서 생성하므로 안전.
  useEffect(() => {
    if (!projectId) return
    if (characterAssets.length === 0 && worldAssets.length === 0) return
    if (autoGenTriggeredRef.current === projectId) return
    autoGenTriggeredRef.current = projectId
    void autoGenerateBaseImages()
  }, [projectId, characterAssets.length, worldAssets.length, autoGenerateBaseImages])

  // 데이터 미준비 = 백그라운드 생성 진행 중 → progress bar 블로킹 (decisions #37).
  // writer 스테이지가 숨겨졌으므로 "Complete the Script Room first" 안내는 더 이상 유효치 않음.
  if (characterAssets.length === 0 && worldAssets.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        {writerStatus?.pipeline_failed ? (
          <div className="mx-auto w-full max-w-md text-center">
            <h1 className="text-xl font-bold text-destructive">
              AI 자동 생성 실패
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {writerStatus.error ?? '백그라운드 생성에 실패했습니다. Producer로 돌아가 다시 시도하세요.'}
            </p>
          </div>
        ) : (
          <WriterProgress status={writerStatus} />
        )}
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
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
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
          className="flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <CharacterPanel />
        </TabsContent>

        <TabsContent
          value="world"
          className="flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <WorldPanel />
        </TabsContent>

        <TabsContent
          value="inventory"
          className="flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
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
