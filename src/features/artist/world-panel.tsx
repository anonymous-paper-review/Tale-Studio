'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { classifyWorldImageStale } from '@/lib/image-provenance'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { RegenCardMark, VersionBadge, lookChipClass, useCardVersion, useRegenCardMarks } from '@/features/artist/card-parts'
import { WorldViewDialog } from '@/features/artist/world-view-dialog'
import { LocationAppearanceCreateDialog } from '@/features/artist/location-appearance-create-dialog'
import { useArtistStore, worldFailureKey, type WorldShotKey } from '@/stores/artist-store'
import { DEFAULT_LOCATION_APPEARANCE_KEY, type WorldAsset } from '@/types/asset'
import { groupSeriesAssets } from '@/features/series/artist-series'
import { useSeriesInfo } from '@/features/series/use-series-info'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useProjectStore } from '@/stores/project-store'
import { chatInputHasMention, launchMentionFlight } from '@/lib/mention-flight'
import { cn } from '@/lib/utils'
import { createWheelNotchStepper } from '@/lib/wheel-notch'
import { useT } from '@/lib/i18n'

// columns: 보드 축척(#d1) — 1(기존 세로 스택)~3열 그리드. 페이지 헤더의 슬라이더가 결정.
// onZoomStep: Ctrl+휠 축척(#a1 2026-07-15) — 캐릭터 탭과 동일한 굴림당 1단계.
// v3 A5(2026-11-03): 카드 = 배경 묶음 판 — 이름 · "배경" 꼬리표 · 모습 수, 모습 칩, 그림(판 배지 v1 · v2 …), 모습 설명 한 줄.
//   스크롤은 Artist 화면이 한 번에 한다 — 이 판은 자기 스크롤이 없다.
export function WorldPanel({
  columns = 1,
  onZoomStep,
}: { columns?: number; onZoomStep?: (dir: 1 | -1) => void } = {}) {
  const projectId = useProjectStore(s => s.projectId)
  const noteSelection = (id: string, appearanceKey: string, source: 'card' | 'appearance' | 'image') => {
    if (projectId) useArtistStore.getState().setChatSelection({ projectId, target: 'background', id, appearanceKey, source })
  }
  useEffect(() => () => {
    if (useArtistStore.getState().chatSelection?.target === 'background') useArtistStore.getState().setChatSelection(null)
  }, [])
  const t = useT()
  const versionOf = useCardVersion()
  const regenMarkOf = useRegenCardMarks()
  const {
    sceneManifest,
    worldAssets,
    selectedLocationId,
    generatingLocations,
    worldFailures,
    selectLocation,
    selectedLocationAppearances,
    selectLocationAppearance,
  } = useArtistStore()

  const [viewDialog, setViewDialog] = useState<{
    locationId: string
    shot: WorldShotKey
    appearanceKey: string | null
  } | null>(null)
  // 약속 C10: 카드 안에서 고른 모습(기본 = 'default'). 캐릭터 카드의 pickedAppearance 와 같다.
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

  const gridClass = cn(
    columns >= 3 && 'grid grid-cols-3 items-start gap-3.5',
    columns === 2 && 'grid grid-cols-2 items-start gap-3.5',
    columns <= 1 && 'space-y-3.5',
  )
  // 시리즈 다음 화(2026-10-26): 앞 화에서 이어받은 배경에 표시를 붙이고, 이번 화 산문에 안 나오는 것은 맨 아래 "보관" 묶음으로 내린다.
  //   보관 카드도 같은 카드 함수로 그린다 — 지금 카드가 하는 일(고르기 · 멘션 · 팝업)을 그대로 쓴다.
  const { view: series } = useSeriesInfo(projectId)
  const groups = groupSeriesAssets(series, { characters: [], locations: worldAssets.map((world) => world.locationId) })
  const liveCards = worldAssets.filter((world) => !groups.locations[world.locationId].kept)
  const keptCards = worldAssets.filter((world) => groups.locations[world.locationId].kept)

  const card = (world: WorldAsset) => {
    const mark = groups.locations[world.locationId]
    const scene = getScene(world.sceneId)
    const isSelected = selectedLocationId === world.locationId
    // 약속 C10: 고른 모습(탭). 기본 모습은 배경 자체, 변형은 appearances 의 행.
    const pickedKey = selectedLocationAppearances[world.locationId] ?? DEFAULT_LOCATION_APPEARANCE_KEY
    const variant = pickedKey !== DEFAULT_LOCATION_APPEARANCE_KEY ? (world.appearances ?? []).find((a) => a.appearanceKey === pickedKey) ?? null : null
    const variantKey = variant ? variant.appearanceKey : null
    const isGenerating = generatingLocations.includes(worldFailureKey(world.locationId, variantKey))
    // 작품 스타일을 다시 그리는 동안 이 카드가 보이는 모습 칸의 표시(11/5 시안 AR) — 기본 모습이면 기본 배경 칸.
    const regenMark = regenMarkOf({ kind: 'location', id: world.locationId, appearanceKey: variantKey })
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
        onClick={() => { selectLocation(world.locationId); noteSelection(world.locationId, variantKey ?? DEFAULT_LOCATION_APPEARANCE_KEY, 'card') }}
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
        onDoubleClick={() => {
          noteSelection(world.locationId, variantKey ?? DEFAULT_LOCATION_APPEARANCE_KEY, 'image')
          setViewDialog({ locationId: world.locationId, shot: 'wideShot', appearanceKey: variantKey })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            selectLocation(world.locationId)
            noteSelection(world.locationId, variantKey ?? DEFAULT_LOCATION_APPEARANCE_KEY, 'card')
          }
        }}
        className={cn(
          'cursor-pointer rounded-[18px] border border-transparent bg-panel px-4 pb-4 pt-3.5 shadow-panel transition-colors',
          isSelected
            ? 'ring-[1.5px] ring-stage'
            : 'hover:border-border',
          mentionedLocationIds.has(world.locationId) &&
            'mention-flash ring-2 ring-sky-400/70 border-sky-400/50 bg-sky-400/10',
        )}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* 좁은 카드에서 이름이 잘리지 않게 두 줄까지 보인다(2026-10-27 QA). */}
          <span className="line-clamp-2 min-w-0 break-words text-body font-semibold">{world.name}</span>
          {/* v3 A5 꼬리표. */}
          <Badge variant="tag">{t('Background')}</Badge>
          {/* 시리즈 다음 화: 앞 화에서 그림까지 이어받은 배경인가. */}
          {mark.inherited ? (
            <Badge variant="outline" className="shrink-0 text-[10px]" data-testid="artist-series-inherited">
              {t('Carried over from the previous episode')}
            </Badge>
          ) : null}
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
          {scene && !variant && (
            <Badge variant="outline" className="text-[10px]">
              {scene.timeOfDay}
            </Badge>
          )}
          {/* 모습 수(v3 A5 "모습 1") — 기본 모습 + 변형. */}
          <span className="ml-auto shrink-0 text-caption text-subtle-foreground">{t('Looks {count}', { count: 1 + (world.appearances?.length ?? 0) })}</span>
        </div>

        {/* 모습 탭(약속 C10) — 캐릭터 카드와 같은 줄: 기본 + 변형들 + "+ 모습 추가". 항상 보인다. */}
        <div className="mb-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
          {[{ appearanceKey: DEFAULT_LOCATION_APPEARANCE_KEY, label: t('Default') }, ...(world.appearances ?? [])].map((ap) => {
            const active = pickedKey === ap.appearanceKey
            return (
              <button
                key={ap.appearanceKey}
                type="button"
                onClick={() => { selectLocationAppearance(world.locationId, ap.appearanceKey); noteSelection(world.locationId, ap.appearanceKey, 'appearance') }}
                aria-pressed={active}
                className={lookChipClass(active)}
              >
                {ap.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setCreateFor(world.locationId)}
            className={lookChipClass(false)}
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
            noteSelection(world.locationId, variantKey ?? DEFAULT_LOCATION_APPEARANCE_KEY, 'image')
            setViewDialog({ locationId: world.locationId, shot: 'wideShot', appearanceKey: variantKey })
          }}
          className="relative block w-full overflow-hidden rounded-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring hover-red-beam"
        >
          <ImagePlaceholder
            label={t('Background')}
            aspectRatio="video"
            imageUrl={shownImage}
            generating={isGenerating && !regenMark}
            hideCaption
          />
          {/* 판 배지(v3 A5) — 이 그림을 그린 때의 작품 스타일 버전. 그리는 중 · 그림이 없으면 없다. */}
          <VersionBadge n={isGenerating ? null : versionOf(shownImage, candidates)} />
          <RegenCardMark mark={regenMark} />
        </button>

        {/* 모습 설명(v3 A5 그림 아래 한 줄, 그림과 사이 9 — 11/5 시안) — 유저 언어 설명만. */}
        {(variant ? variant.visualDescriptionNative : world.visualDescriptionNative) ? (
          <p className="mt-[9px] line-clamp-2 text-caption text-subtle-foreground">{variant ? variant.visualDescriptionNative : world.visualDescriptionNative}</p>
        ) : null}

        {/* 시리즈 다음 화: 앞 화 그림을 참고해 이 화 그림체로 다시 그릴 카드만 한 줄 알린다. */}
        {mark.use === 'redraw' ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground" data-testid="artist-series-redraw">
            {t('We redraw it in this episode style using the previous picture as the guide')}
          </p>
        ) : null}

        {/* 카드 생성 버튼 제거(약속 B2, 2026-09-04) — 캐릭터 카드와 같이 생성/재생성은 팝업과 채팅으로만. */}
      </div>
    )
  }

  return (
    <div ref={wheelRef} data-testid="artist-world-cards">
      {/* 모델(provider)·톤(boost) 선택 툴바 제거(#10). 생성은 store 기본값으로 수행. */}
      <div className={gridClass}>{liveCards.map(card)}</div>
      {keptCards.length > 0 ? (
        <section className="mt-6 border-t border-border pt-4" data-testid="artist-series-kept">
          <div className="mb-3 flex flex-wrap items-baseline gap-2">
            <h2 className="text-body font-semibold">{t('Kept')}</h2>
            <p className="text-caption text-muted-foreground">{t('Not in this episode. The picture stays as it is and carries over to the next episode.')}</p>
          </div>
          <div className={gridClass}>{keptCards.map(card)}</div>
        </section>
      ) : null}

      <WorldViewDialog
        locationId={viewDialog?.locationId ?? null}
        shot={viewDialog?.shot ?? null}
        appearanceKey={viewDialog?.appearanceKey ?? null}
        onAddAppearance={(id) => setCreateFor(id)}
        onClose={() => setViewDialog(null)}
      />
      <LocationAppearanceCreateDialog locationId={createFor} onClose={() => setCreateFor(null)} />
    </div>
  )
}
