'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { classifyWorldImageStale } from '@/lib/image-provenance'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { WorldViewDialog } from '@/features/artist/world-view-dialog'
import { LocationAppearanceCreateDialog } from '@/features/artist/location-appearance-create-dialog'
import { useArtistStore, worldFailureKey, type WorldShotKey } from '@/stores/artist-store'
import { DEFAULT_LOCATION_APPEARANCE_KEY } from '@/types/asset'
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
    worldFailures,
    selectLocation,
  } = useArtistStore()

  const [viewDialog, setViewDialog] = useState<{
    locationId: string
    shot: WorldShotKey
    appearanceKey: string | null
  } | null>(null)
  // 약속 C10: 카드 안에서 고른 모습(기본 = 'default'). 캐릭터 카드의 pickedAppearance 와 같다.
  const [pickedAppearance, setPickedAppearance] = useState<Record<string, string>>({})
  const [createFor, setCreateFor] = useState<string | null>(null)

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
            // 약속 C10: 고른 모습(탭). 기본 모습은 배경 자체, 변형은 appearances 의 행.
            const pickedKey = pickedAppearance[world.locationId] ?? DEFAULT_LOCATION_APPEARANCE_KEY
            const variant = pickedKey !== DEFAULT_LOCATION_APPEARANCE_KEY ? (world.appearances ?? []).find((a) => a.appearanceKey === pickedKey) ?? null : null
            const variantKey = variant ? variant.appearanceKey : null
            const shownImage = variant ? variant.wideShot : world.wideShot
            // 약속 B7·B8: 설명이 바뀐 뒤 재생성 전이면 "설명 바뀜", 최근 생성이 실패했으면 "이미지 실패".
            const candidates = variant ? variant.candidates : (world.candidates ?? [])
            const selectedCandidate = candidates.find((c) => c.isSelected)
            const descriptionChanged = classifyWorldImageStale(variant ? variant.visualDescription : world.visualDescription, selectedCandidate) !== 'fresh'
            const failed = !!worldFailures[worldFailureKey(world.locationId, variantKey)]

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
                  setViewDialog({ locationId: world.locationId, shot: 'wideShot', appearanceKey: variantKey })
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
                <div className="mb-3 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{world.name}</span>
                  {failed && (
                    <Badge variant="destructive" className="text-[10px]">
                      {t('Image failed')}
                    </Badge>
                  )}
                  {descriptionChanged && !isGenerating && (
                    <Badge variant="outline" className="text-[10px] text-warning">
                      {t('Description changed')}
                    </Badge>
                  )}
                  {scene && (
                    <Badge variant="outline" className="text-[10px]">
                      {scene.timeOfDay}
                    </Badge>
                  )}
                </div>

                {/* 모습 탭(약속 C10) — 캐릭터 카드와 같은 줄: 기본 + 변형들 + "+ 모습 추가". 항상 보인다. */}
                <div className="mb-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                  {[{ appearanceKey: DEFAULT_LOCATION_APPEARANCE_KEY, label: t('Default') }, ...(world.appearances ?? [])].map((ap) => {
                    const active = pickedKey === ap.appearanceKey
                    return (
                      <button
                        key={ap.appearanceKey}
                        type="button"
                        onClick={() => setPickedAppearance((prev) => ({ ...prev, [world.locationId]: ap.appearanceKey }))}
                        className={cn(
                          'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                          active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {ap.label}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setCreateFor(world.locationId)}
                    className="rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent"
                    title={t('Add appearance')}
                  >
                    {t('+ Add appearance')}
                  </button>
                </div>

                {/* 배경 = 이미지 1장(#6·#9): establishing 셀 제거, wide 1컷만. 클릭 → 프롬프트/재생성 Dialog. */}
                <button
                  type="button"
                  title={t('Background: click to view or regenerate the prompt')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setViewDialog({ locationId: world.locationId, shot: 'wideShot', appearanceKey: variantKey })
                  }}
                  className="block w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring hover-red-beam"
                >
                  <ImagePlaceholder
                    label={t('Background')}
                    aspectRatio="video"
                    imageUrl={shownImage}
                    generating={isGenerating && !shownImage}
                    hideCaption
                  />
                </button>

                {/* 카드 생성 버튼 제거(약속 B2, 2026-09-04) — 캐릭터 카드와 같이 생성/재생성은 팝업과 채팅으로만. */}
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <WorldViewDialog
        locationId={viewDialog?.locationId ?? null}
        shot={viewDialog?.shot ?? null}
        appearanceKey={viewDialog?.appearanceKey ?? null}
        onClose={() => setViewDialog(null)}
      />
      <LocationAppearanceCreateDialog locationId={createFor} onClose={() => setCreateFor(null)} />
    </div>
  )
}
