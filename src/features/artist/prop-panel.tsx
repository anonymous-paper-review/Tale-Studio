'use client'

// Artist 소품 묶음(D7, 오너 2026-11-22 "소품도 한 장이고 중요하게 생각되는 소품만") — 소품(props 행)마다 그림 한 장짜리 카드.
//   카드 = 이름 · "소품" 꼬리표 · 그림(소품 양식 16:9 한 장, m1126 A2) · 생김새 한 줄 · 나오는 씬 · 샷 수. 배경 카드(world-panel)와 같은 판 모양이다.
//   ⌘/Ctrl+클릭 = 채팅 @멘션 + 비행(D9, 인물 · 배경 카드와 같다). columns · onZoomStep 은 세 묶음 공용 축척(D13).
//   모습 줄(m1126 A3): 기본 · 저장한 모습들 · [+ 모습 추가] — 배경 카드와 같은 줄. 고른 모습의 그림 · 설명 · 그리기 상태를 보인다.
//   약속: tests/artist/prop-cards.test.ts
import { useEffect, useRef, useState } from 'react'
import { Paintbrush, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { lookChipClass } from '@/features/artist/card-parts'
import { PropAppearanceCreateDialog } from '@/features/artist/prop-appearance-create-dialog'
import { PropViewDialog, usePropStyleId } from '@/features/artist/prop-view-dialog'
import { propSlotKey } from '@/lib/artist/props'
import { failureBadge } from '@/lib/artist/failure-badge'
import { propImageStale } from '@/lib/artist/prop-image'
import { isMentionModifierClick } from '@/lib/card-mention'
import { isDemoSession } from '@/lib/demo/context'
import { chatInputHasMention, launchMentionFlight } from '@/lib/mention-flight'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { createWheelNotchStepper } from '@/lib/wheel-notch'
import { useArtistStore } from '@/stores/artist-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useProjectStore } from '@/stores/project-store'
import { DEFAULT_LOCATION_APPEARANCE_KEY, type PropAsset } from '@/types/asset'

/** 소품 카드 ⌘/Ctrl+클릭 — 채팅 입력에 @이름을 넣거나 빼고, 이름이 카드에서 채팅으로(빼면 반대로) 날아간다. */
export function mentionPropCard(name: string, clientX: number, clientY: number): void {
  const removing = chatInputHasMention(name)
  useChatUiStore.getState().requestMentionToggle(name)
  launchMentionFlight({ label: name, clickX: clientX, clickY: clientY, toChat: !removing })
}

export function PropPanel({
  columns = 1,
  onZoomStep,
  drawLocked = false,
}: {
  columns?: number
  onZoomStep?: (dir: 1 | -1) => void
  /** Artist 새 흐름(m1126 O1)의 [만들기] 전 — 카드 [그리기]를 숨긴다. 그림은 [이미지 만들기]로 시작한다(하나만 그리면 이어 그리기가 나머지를 다 그린다). */
  drawLocked?: boolean
}) {
  const t = useT()
  const projectId = useProjectStore((s) => s.projectId)
  const propAssets = useArtistStore((s) => s.propAssets)
  const propUsage = useArtistStore((s) => s.propUsage)
  const selectedPropId = useArtistStore((s) => s.selectedPropId)
  const generatingProps = useArtistStore((s) => s.generatingProps)
  const propFailures = useArtistStore((s) => s.propFailures)
  const propContentRefusals = useArtistStore((s) => s.propContentRefusals)
  const selectedPropAppearances = useArtistStore((s) => s.selectedPropAppearances)
  const mentionedRefs = useChatUiStore((s) => s.mentionedRefs)
  const styleId = usePropStyleId()
  const demo = isDemoSession()
  // 그림 창(D7) — 그림을 누르거나 카드를 두 번 누르면 연다(인물 · 배경 카드와 같다).
  const [viewing, setViewing] = useState<string | null>(null)
  // [+ 모습 추가] 창(m1126 A3) — 배경 카드와 같다.
  const [createFor, setCreateFor] = useState<string | null>(null)
  const noteSelection = (propId: string) => {
    if (projectId) useArtistStore.getState().setChatSelection({ projectId, target: 'prop', id: propId, appearanceKey: DEFAULT_LOCATION_APPEARANCE_KEY, source: 'card' })
  }
  useEffect(() => () => {
    if (useArtistStore.getState().chatSelection?.target === 'prop') useArtistStore.getState().setChatSelection(null)
  }, [])

  // Ctrl+휠 → 축척(#a1) — 인물 · 배경 묶음과 같다. passive:false 네이티브 리스너로 브라우저 페이지 줌을 막는다.
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

  if (propAssets.length === 0) return null

  const gridClass = cn(
    columns >= 3 && 'grid grid-cols-3 items-start gap-3.5',
    columns === 2 && 'grid grid-cols-2 items-start gap-3.5',
    columns <= 1 && 'space-y-3.5',
  )

  const card = (prop: PropAsset) => {
    const usage = propUsage[prop.propId] ?? { scenes: 0, shots: 0 }
    // 고른 모습(m1126 A3) — 기본 모습은 카드 자체, 다른 모습은 appearances 의 행. 그리는 중 · 실패 · 내용 검사는 그 칸(소품 × 모습)만 본다.
    const pickedKey = selectedPropAppearances[prop.propId] ?? DEFAULT_LOCATION_APPEARANCE_KEY
    const variant = pickedKey !== DEFAULT_LOCATION_APPEARANCE_KEY ? (prop.appearances ?? []).find((a) => a.appearanceKey === pickedKey) ?? null : null
    const slot = propSlotKey(prop.propId, variant?.appearanceKey)
    const shownImage = variant ? variant.imageUrl : prop.imageUrl
    const generating = generatingProps.includes(slot)
    const failure = propFailures[slot] ?? null
    // 실패 배지 — 인물 · 배경 카드와 같다(main 2026-11-25): 내용 검사에 걸렸으면 그것이 이긴다.
    //   보내기 전(Creem) 거절은 propContentRefusals, 그린 뒤(fal) 거절은 propFailures 의 moderation 에서 온다.
    const contentRefused = !!propContentRefusals[slot]
    const badge = failureBadge({ contentRefused: contentRefused || failure?.moderation === true, failed: !!failure || contentRefused })
    // 바뀜(D7 · 리드 결정 3): 생김새가 바뀌었거나("설명 바뀜") 작품 그림체가 바뀌었다("그림체 바뀜") — 그림체 재생성은 소품을 함께 다시 그리지 않는다.
    const stale = shownImage
      ? variant
        ? propImageStale(variant.sourceHash, variant.appearance, styleId)
        : propImageStale(prop.sourceHash, prop.appearance, styleId)
      : 'fresh'
    const select = () => {
      useArtistStore.getState().selectProp(prop.propId)
      noteSelection(prop.propId)
    }
    const draw = (e: React.MouseEvent) => {
      e.stopPropagation()
      void useArtistStore.getState().generateProp(prop.propId, 'ui', variant ? { appearanceKey: variant.appearanceKey } : undefined)
    }
    return (
      <div
        key={prop.propId}
        role="button"
        tabIndex={0}
        data-testid="artist-prop-card"
        data-prop-id={prop.propId}
        onClick={select}
        // ⌘/Ctrl+클릭 = 채팅 @멘션 토글(D9) — 캡처 단계에서 기본 동작(고르기)을 끊는다. 멘션하려던 클릭이 카드를 고르면 안 된다.
        onPointerDownCapture={(e) => {
          if (isMentionModifierClick(e)) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        onClickCapture={(e) => {
          if (!isMentionModifierClick(e) || !prop.name.trim()) return
          e.preventDefault()
          e.stopPropagation()
          mentionPropCard(prop.name, e.clientX, e.clientY)
        }}
        // 두 번 누르기 = 그림 누르기와 같다(인물 · 배경 카드와 같다) — 그림 창.
        onDoubleClick={() => setViewing(prop.propId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') select()
        }}
        className={cn(
          'cursor-pointer rounded-[18px] border border-transparent bg-panel px-4 pb-4 pt-3.5 shadow-panel transition-colors',
          selectedPropId === prop.propId ? 'ring-[1.5px] ring-stage' : 'hover:border-border',
          mentionedRefs.includes(prop.propId) && 'mention-flash ring-2 ring-sky-400/70 border-sky-400/50 bg-sky-400/10',
        )}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* 좁은 카드에서 이름이 잘리지 않게 두 줄까지 보인다(배경 카드와 같다). */}
          <span className="line-clamp-2 min-w-0 break-words text-body font-semibold">{prop.name}</span>
          <Badge variant="tag">{t('Prop')}</Badge>
          {badge ? <Badge variant="destructive" className="text-[10px]">{badge === 'content-check' ? t('Content check') : t('Image failed')}</Badge> : null}
          {stale === 'edited' && !generating ? <Badge variant="outline" className="text-[10px] text-warning">{t('Description changed')}</Badge> : null}
          {stale === 'style' && !generating ? <Badge variant="outline" className="text-[10px] text-warning">{t('Style changed')}</Badge> : null}
        </div>

        {/* 모습 줄(m1126 A3) — 배경 카드와 같다: 기본 + 저장한 모습들 + [+ 모습 추가](데모는 만들 수 없어 숨긴다). */}
        <div className="mb-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()} data-testid="artist-prop-looks">
          {[{ appearanceKey: DEFAULT_LOCATION_APPEARANCE_KEY, label: t('Default') }, ...(prop.appearances ?? [])].map((ap) => {
            const active = pickedKey === ap.appearanceKey
            return (
              <button
                key={ap.appearanceKey}
                type="button"
                onClick={() => useArtistStore.getState().selectPropAppearance(prop.propId, ap.appearanceKey)}
                aria-pressed={active}
                className={lookChipClass(active)}
              >
                {ap.label}
              </button>
            )
          })}
          {demo ? null : (
            <button
              type="button"
              onClick={() => setCreateFor(prop.propId)}
              className={lookChipClass(false)}
              title={t('Add appearance')}
              data-testid="artist-prop-add-appearance"
            >
              {t('+ Add appearance')}
            </button>
          )}
        </div>

        {/* 소품 = 그림 한 장(소품 양식 16:9 — 인물 시트 · 배경 카드와 같은 자리). 누르면 그림 창. */}
        <button
          type="button"
          title={t('Prop: click to view or redraw')}
          onClick={(e) => {
            e.stopPropagation()
            select()
            setViewing(prop.propId)
          }}
          className="relative block w-full overflow-hidden rounded-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring hover-red-beam"
        >
          <ImagePlaceholder label={t('Prop')} aspectRatio="video" imageUrl={shownImage} generating={generating} hideCaption />
        </button>

        {/* 그리기 · 다시 그리기(무료) — 실패했거나 바뀌었으면 다시 그리기, 그림이 없으면 그리기. 그리는 중에는 숨긴다(두 번 그리지 않게).
            데모(보기 전용 공유)는 그리지 않으므로 단추를 보이지 않는다. */}
        {generating || demo || drawLocked ? null : failure || contentRefused || (shownImage && stale !== 'fresh') ? (
          <Button size="sm" variant="outline" className="mt-2.5" onClick={draw} data-testid="artist-prop-redraw">
            <RefreshCw className="size-3.5" />{t('Redraw')}
          </Button>
        ) : !shownImage ? (
          <Button size="sm" variant="outline" className="mt-2.5" onClick={draw} data-testid="artist-prop-draw">
            <Paintbrush className="size-3.5" />{t('Draw')}
          </Button>
        ) : null}

        {/* 생김새 한 줄(화면 말) — 배경 카드의 설명 줄과 같은 자리. */}
        {(variant ? variant.appearanceNative : prop.appearanceNative) ? (
          <p className="mt-[9px] line-clamp-2 text-caption text-subtle-foreground">{variant ? variant.appearanceNative : prop.appearanceNative}</p>
        ) : null}
        <p className="mt-1.5 text-[11px] text-muted-foreground" data-testid="artist-prop-usage">
          {usage.shots > 0 || usage.scenes > 0
            ? t('Appears in: scenes {scenes} · shots {shots}', { scenes: usage.scenes, shots: usage.shots })
            : t('Not in any shot yet')}
        </p>
      </div>
    )
  }

  return (
    <div ref={wheelRef} data-testid="artist-prop-cards">
      <div className={gridClass}>{propAssets.map(card)}</div>
      <PropViewDialog propId={viewing} onClose={() => setViewing(null)} onAddAppearance={(id) => setCreateFor(id)} />
      <PropAppearanceCreateDialog propId={createFor} onClose={() => setCreateFor(null)} />
    </div>
  )
}
