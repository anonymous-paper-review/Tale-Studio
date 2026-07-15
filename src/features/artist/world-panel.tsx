'use client'

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { WorldViewDialog } from '@/features/artist/world-view-dialog'
import { useArtistStore, type WorldShotKey } from '@/stores/artist-store'
import { cn } from '@/lib/utils'

// columns: 보드 축척(#d1) — 1(기존 세로 스택)~3열 그리드. 페이지 헤더의 슬라이더가 결정.
export function WorldPanel({ columns = 1 }: { columns?: number } = {}) {
  const {
    sceneManifest,
    worldAssets,
    selectedLocationId,
    generatingLocations,
    generatingStartedAt,
    selectLocation,
    generateWorldAsset,
  } = useArtistStore()

  const [viewDialog, setViewDialog] = useState<{
    locationId: string
    shot: WorldShotKey
  } | null>(null)

  const getScene = (sceneId: string) =>
    sceneManifest?.scenes.find((s) => s.sceneId === sceneId)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* 모델(provider)·톤(boost) 선택 툴바 제거(#10). 생성은 store 기본값으로 수행. */}
      <ScrollArea className="min-h-0 flex-1 px-6 py-4">
        <div
          className={cn(
            columns >= 3 && 'grid grid-cols-3 items-start gap-4',
            columns === 2 && 'grid grid-cols-2 items-start gap-4',
            columns <= 1 && 'space-y-6',
          )}
        >
          {worldAssets.map((world) => {
            const scene = getScene(world.sceneId)
            const isGenerating = generatingLocations.includes(world.locationId)
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

                {/* 배경 = 이미지 1장(#6·#9): establishing 셀 제거, wide 1컷만. 클릭 → 프롬프트/재생성 Dialog. */}
                <button
                  type="button"
                  title="배경 — 클릭해서 프롬프트 보기/재생성"
                  onClick={(e) => {
                    e.stopPropagation()
                    setViewDialog({ locationId: world.locationId, shot: 'wideShot' })
                  }}
                  className="block w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring hover-red-beam"
                >
                  <ImagePlaceholder
                    label="배경"
                    aspectRatio="video"
                    imageUrl={world.wideShot}
                    generating={isGenerating && !world.wideShot}
                    generatingStartedAt={generatingStartedAt[world.locationId]}
                  />
                </button>

                {/* Actions(#d3 2026-07-15) — Register(에셋은 진입 시 DB 하이드레이트로 자동 공급)·
                    인벤토리 저장 버튼 제거, 생성 버튼 문구는 '이미지 생성'으로 통일. */}
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 hover-red-beam"
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
                        이미지 생성
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <WorldViewDialog
        locationId={viewDialog?.locationId ?? null}
        shot={viewDialog?.shot ?? null}
        onClose={() => setViewDialog(null)}
      />
    </div>
  )
}
