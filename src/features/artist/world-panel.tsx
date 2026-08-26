'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { WorldViewDialog } from '@/features/artist/world-view-dialog'
import { useArtistStore, type WorldShotKey } from '@/stores/artist-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { chatInputHasMention, launchMentionFlight } from '@/lib/mention-flight'
import { cn } from '@/lib/utils'
import { createWheelNotchStepper } from '@/lib/wheel-notch'
import { useT } from '@/lib/i18n'

// columns: 보드 축척(#d1) — 1(기존 세로 스택)~3열 그리드. 페이지 헤더의 슬라이더가 결정.
// onZoomStep: Ctrl+휠 축척(#a1 2026-07-15) — 캐릭터 탭과 동일한 굴림당 1단계.
export function WorldPanel({
  columns = 1,
  onZoomStep,
}: { columns?: number; onZoomStep?: (dir: 1 | -1) => void } = {}) {
  const t = useT()
  const {
    sceneManifest,
    worldAssets,
    selectedLocationId,
    generatingLocations,
    selectLocation,
    generateWorldAsset,
  } = useArtistStore()

  const [viewDialog, setViewDialog] = useState<{
    locationId: string
    shot: WorldShotKey
  } | null>(null)

  // 입력창에 @멘션돼 있는 카드 하이라이트(#artist-mention) — mentionItems 의 id = locationId.
  const mentionedRefs = useChatUiStore((s) => s.mentionedRefs)
  const mentionedLocationIds = new Set(
    worldAssets.filter((w) => mentionedRefs.includes(w.locationId)).map((w) => w.locationId),
  )

  // Ctrl+휠 → 축척(#a1). passive:false 네이티브 리스너로 브라우저 페이지 줌을 막는다.
  const wheelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = wheelRef.current
    if (!el || !onZoomStep) return
    const step = createWheelNotchStepper(onZoomStep)
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      step(e)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onZoomStep])

  const getScene = (sceneId: string) =>
    sceneManifest?.scenes.find((s) => s.sceneId === sceneId)

  return (
    <div ref={wheelRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
                // ⌘/Ctrl+클릭 = 채팅 @멘션 토글 (#artist-mention 2026-08-11, 캐릭터 카드와 동일).
                onPointerDownCapture={(e) => {
                  if (e.metaKey || e.ctrlKey) {
                    e.preventDefault()
                    e.stopPropagation()
                  }
                }}
                onClickCapture={(e) => {
                  if (!(e.metaKey || e.ctrlKey) || !world.name?.trim()) return
                  e.preventDefault()
                  e.stopPropagation()
                  const removing = chatInputHasMention(world.name)
                  useChatUiStore.getState().requestMentionToggle(world.name)
                  launchMentionFlight({
                    label: world.name,
                    clickX: e.clientX,
                    clickY: e.clientY,
                    toChat: !removing,
                  })
                }}
                // 더블 클릭 = 사진 클릭과 동일(#d5 2026-08-03) — 프롬프트/재생성 팝업
                onDoubleClick={() =>
                  setViewDialog({ locationId: world.locationId, shot: 'wideShot' })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ')
                    selectLocation(world.locationId)
                }}
                className={cn(
                  'cursor-pointer rounded-xl border p-4 transition-colors',
                  isSelected
                    ? 'border-primary bg-accent'
                    : 'border-border hover:bg-accent/50',
                  mentionedLocationIds.has(world.locationId) &&
                    'mention-flash ring-2 ring-sky-400/70 border-sky-400/50 bg-sky-400/10',
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
                  title={t('Background — click to view/regenerate the prompt')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setViewDialog({ locationId: world.locationId, shot: 'wideShot' })
                  }}
                  className="block w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring hover-red-beam"
                >
                  <ImagePlaceholder
                    label={t('Background')}
                    aspectRatio="video"
                    imageUrl={world.wideShot}
                    generating={isGenerating && !world.wideShot}
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
                        {t('Generate image')}
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
