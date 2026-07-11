'use client'

import { useState } from 'react'
import { Loader2, Sparkles, Check, Share2, BookmarkCheck, BookmarkPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { WorldViewDialog } from '@/features/artist/world-view-dialog'
import { useArtistStore, type WorldShotKey } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import { registerWorldCard } from '@/stores/asset-storage-store'
import { useInventoryStore } from '@/stores/inventory-store'
import { cn } from '@/lib/utils'

export function WorldPanel() {
  const {
    sceneManifest,
    worldAssets,
    selectedLocationId,
    generatingLocations,
    generatingStartedAt,
    selectLocation,
    generateWorldAsset,
  } = useArtistStore()

  const projectId = useProjectStore((s) => s.projectId)
  const workspaceId = useProjectStore((s) => s.workspaceId)
  const saveFromAsset = useInventoryStore((s) => s.saveFromAsset)
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
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
        <div className="space-y-6">
          {worldAssets.map((world) => {
            const scene = getScene(world.sceneId)
            const isGenerating = generatingLocations.includes(world.locationId)
            const isSelected = selectedLocationId === world.locationId
            const isRegistered = registeredIds.has(world.locationId)
            const isSaved = savedIds.has(world.locationId)
            const hasImage = Boolean(world.wideShot || world.establishingShot)
            const representativeImage = world.wideShot ?? world.establishingShot ?? null

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

                {/* 샷 셀 클릭 → 프롬프트 확인/수정 + 재생성 Dialog */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    title="Wide Shot — 클릭해서 프롬프트 보기/재생성"
                    onClick={(e) => {
                      e.stopPropagation()
                      setViewDialog({
                        locationId: world.locationId,
                        shot: 'wideShot',
                      })
                    }}
                    className="block w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring hover-red-beam"
                  >
                    <ImagePlaceholder
                      label="Wide Shot"
                      aspectRatio="video"
                      imageUrl={world.wideShot}
                      generating={isGenerating && !world.wideShot}
                      generatingStartedAt={generatingStartedAt[world.locationId]}
                    />
                  </button>
                  <button
                    type="button"
                    title="Establishing — 클릭해서 프롬프트 보기/재생성"
                    onClick={(e) => {
                      e.stopPropagation()
                      setViewDialog({
                        locationId: world.locationId,
                        shot: 'establishingShot',
                      })
                    }}
                    className="block w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring hover-red-beam"
                  >
                    <ImagePlaceholder
                      label="Establishing"
                      aspectRatio="video"
                      imageUrl={world.establishingShot}
                      generating={isGenerating && !world.establishingShot}
                      generatingStartedAt={generatingStartedAt[world.locationId]}
                    />
                  </button>
                </div>

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
                        Generate Background
                      </>
                    )}
                  </Button>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isRegistered ? 'secondary' : 'default'}
                        size="sm"
                        className="hover-red-beam"
                        disabled={!hasImage || isGenerating}
                        onClick={(e) => {
                          e.stopPropagation()
                          registerWorldCard(world, projectId ?? 'default')
                          setRegisteredIds((prev) =>
                            new Set(prev).add(world.locationId),
                          )
                        }}
                      >
                        {isRegistered ? (
                          <>
                            <Check className="size-3.5" />
                            Registered
                          </>
                        ) : (
                          <>
                            <Share2 className="size-3.5" />
                            Register
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Register to Asset Storage for the Director stage
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isSaved ? 'secondary' : 'outline'}
                        size="sm"
                        className="hover-red-beam"
                        disabled={!representativeImage || !workspaceId}
                        onClick={async (e) => {
                          e.stopPropagation()
                          const item = await saveFromAsset({
                            workspaceId: workspaceId!,
                            kind: 'world',
                            name: world.name,
                            sourceImageUrl: representativeImage!,
                            sourceProjectId: projectId ?? undefined,
                          })
                          if (item) {
                            setSavedIds((prev) =>
                              new Set(prev).add(world.locationId),
                            )
                          }
                        }}
                      >
                        {isSaved ? (
                          <>
                            <BookmarkCheck className="size-3.5" />
                            저장됨
                          </>
                        ) : (
                          <>
                            <BookmarkPlus className="size-3.5" />
                            인벤토리에 저장
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {workspaceId
                        ? representativeImage
                          ? '워크스페이스 인벤토리에 저장'
                          : '이미지가 있어야 저장할 수 있습니다'
                        : '프로젝트 로드 후 사용 가능합니다'}
                    </TooltipContent>
                  </Tooltip>
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
