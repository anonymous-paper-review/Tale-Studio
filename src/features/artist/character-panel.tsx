'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { CharacterViewDialog } from '@/features/artist/character-view-dialog'
import { AppearanceCreateDialog } from '@/features/artist/appearance-create-dialog'
import { CharacterDeleteButton } from '@/features/artist/character-delete-button'
import { TurnaroundRegionCycle } from '@/features/artist/turnaround-region-cycle'
import { VersionBadge, lookChipClass, useCardVersion } from '@/features/artist/card-parts'
import { sameCharacterAppearanceSlot, useArtistStore } from '@/stores/artist-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useProjectStore } from '@/stores/project-store'
import { chatInputHasMention, launchMentionFlight } from '@/lib/mention-flight'
import { type CharacterAsset, type CharacterViewKey } from '@/types/asset'
import { groupSeriesAssets } from '@/features/series/artist-series'
import { useSeriesInfo } from '@/features/series/use-series-info'

import { cn } from '@/lib/utils'
import { createWheelNotchStepper } from '@/lib/wheel-notch'
import { useT } from '@/lib/i18n'

// columns: 보드 축척(#d1) — 1(기존 세로 스택)~3열 그리드. 페이지 헤더의 슬라이더가 결정.
// onZoomStep: Ctrl+휠 축척(#d1 2026-07-15) — 이벤트 방향당 1단계(쿨다운), 브라우저 줌 차단.
// v3 A5(2026-11-03): 카드 = 인물 묶음 판 — 이름 · "인물" 꼬리표 · 모습 수, 모습 칩, 시트(판 배지 v1 · v2 …), 모습 설명 한 줄.
//   스크롤은 Artist 화면이 한 번에 한다(모두 칸은 인물 · 배경 묶음을 이어 보인다) — 이 판은 자기 스크롤이 없다.
export function CharacterPanel({
  columns = 1,
  onZoomStep,
}: { columns?: number; onZoomStep?: (dir: 1 | -1) => void } = {}) {
  // #g4(2026-08-27): 카드 안에서 고른 모습. 캐릭터당 하나씩 기억한다.
  //   모습이 하나뿐인 캐릭터는 탭 자체가 안 뜨므로 이 상태를 쓰지 않는다.
  const [pickedAppearance, setPickedAppearance] = useState<Record<string, string>>({})

  /** 선택한 모습의 시트만 표시한다. 다른 모습이나 legacy view_main으로 대체하지 않는다. */
  const selectedAppearance = <A extends { appearanceKey: string; isDefault: boolean; sheetUrl: string | null }>(c: { characterId: string; appearances: A[] }) => {
    const key = pickedAppearance[c.characterId] ?? c.appearances.find((appearance) => appearance.isDefault)?.appearanceKey
    return c.appearances.find((appearance) => appearance.appearanceKey === key) ?? null
  }
  const projectId = useProjectStore(s => s.projectId)
  const noteSelection = (id: string, appearanceKey: string, source: 'card' | 'appearance' | 'image') => {
    if (projectId) useArtistStore.getState().setChatSelection({ projectId, target: 'character', id, appearanceKey, source })
  }
  useEffect(() => () => {
    if (useArtistStore.getState().chatSelection?.target === 'character') useArtistStore.getState().setChatSelection(null)
  }, [])
  const t = useT()
  const versionOf = useCardVersion()
  const {
    sceneManifest,
    characterAssets,
    selectedCharacterId,
    generatingViews,
    viewFailures,
    selectCharacter,
  } = useArtistStore()

  // 입력창에 @멘션돼 있는 카드 하이라이트(#artist-mention) — producer 카드와 동일. artist 의
  //   mentionItems 는 이름을 라벨로 쓰므로(id 아님) 이름 기준으로 대조한다.
  const mentionedRefs = useChatUiStore((s) => s.mentionedRefs)
  const mentionedNames = new Set(
    characterAssets
      .filter((c) => mentionedRefs.includes(c.characterId))
      .map((c) => c.name),
  )
  const [viewDialog, setViewDialog] = useState<{
    charId: string
    appearanceKey: string
    view: CharacterViewKey
  } | null>(null)
  const openImage = (charId: string, appearanceKey: string) => {
    noteSelection(charId, appearanceKey, 'image')
    setViewDialog({ charId, appearanceKey, view: 'main' })
  }
  // "+ 모습 추가"(약속 C1·C2 2026-09-04) — 탭 줄은 모습이 하나뿐이어도 항상 보인다.
  const [createFor, setCreateFor] = useState<string | null>(null)

  // Ctrl+휠 → 축척(#d1). passive:false 네이티브 리스너로 브라우저 페이지 줌을 막는다.
  //   굴림 판정은 공용 스텝퍼(wheel-notch, #a1) — burst = 1단계, OS 스크롤 설정과 무관.
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

  const getRole = (id: string) =>
    sceneManifest?.characters.find((c) => c.characterId === id)?.role ??
    'supporting'

  // 캐릭터가 등장하는 씬들 — writer 가 만든 narrativeSummary(배경/스토리) 를 hover 에 노출
  const getBackgroundScenes = (id: string) =>
    sceneManifest?.scenes.filter((s) => s.charactersPresent?.includes(id)) ??
    []

  const gridClass = cn(
    columns >= 3 && 'grid grid-cols-3 items-start gap-3.5',
    columns === 2 && 'grid grid-cols-2 items-start gap-3.5',
    columns <= 1 && 'space-y-3.5',
  )
  // 시리즈 다음 화(2026-10-26): 앞 화에서 이어받은 인물에 표시를 붙이고, 이번 화 산문에 안 나오는 사람은 맨 아래 "보관" 묶음으로 내린다.
  //   보관 카드도 같은 카드 함수로 그린다 — 지금 카드가 하는 일(고르기 · 모습 탭 · 팝업)을 그대로 쓴다.
  const { view: series } = useSeriesInfo(projectId)
  const groups = groupSeriesAssets(series, { characters: characterAssets.map((char) => char.characterId), locations: [] })
  const liveCards = characterAssets.filter((char) => !groups.characters[char.characterId].kept)
  const keptCards = characterAssets.filter((char) => groups.characters[char.characterId].kept)

  const card = (char: CharacterAsset) => {
    const mark = groups.characters[char.characterId]
    const appearance = selectedAppearance(char)
    const role = getRole(char.characterId)
    const isSelected = selectedCharacterId === char.characterId
    const isViewGenerating = (v: CharacterViewKey) =>
      appearance
        ? generatingViews.some((slot) => sameCharacterAppearanceSlot(slot, char.characterId, appearance.appearanceKey, v))
        : false
    const isObject = char.entityType === 'object'
    const bgScenes = getBackgroundScenes(char.characterId)


    // hover 정보 본문 — 4개 뷰 이미지의 개별 Tooltip 에 공유(같은 캐릭터 정보).
    //   v3(2026-11-03): 툴팁이 어두운 말풍선이 됐다 — 밝은 툴팁용 반전 글자 대신 글자 3단 토큰.
    const charTooltipBody = (
      <>
        <p className="font-medium">
          {char.name}
          <span className="font-normal text-muted-foreground">
            {' · '}
            {role}
          </span>
        </p>
        {char.description ? (
          <p className="leading-snug text-foreground/90">
            {char.description}
          </p>
        ) : null}
        {(char.appearanceNative || char.fixedPrompt) ? (
          <p className="leading-snug text-muted-foreground">
            <span className="text-subtle-foreground">{t('Appearance')} · </span>
            {char.appearanceNative || char.fixedPrompt}
          </p>
        ) : null}
        {bgScenes.length > 0 ? (
          <div className="space-y-0.5 border-t border-border pt-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-subtle-foreground">
              {t('Scenes appeared · background')}
            </p>
            {bgScenes.slice(0, 3).map((s) => (
              <p
                key={s.sceneId}
                className="leading-snug text-foreground/90"
              >
                • {s.narrativeSummary}
              </p>
            ))}
            {bgScenes.length > 3 ? (
              <p className="text-subtle-foreground">
                {t('+{count} more scenes', { count: bgScenes.length - 3 })}
              </p>
            ) : null}
          </div>
        ) : null}
        {!char.description &&
        !char.fixedPrompt &&
        bgScenes.length === 0 ? (
          <p className="text-muted-foreground">{t('No profile info yet.')}</p>
        ) : null}
      </>
    )

    return (
      <div
        key={char.characterId}
        role="button"
        tabIndex={0}
        onClick={() => { selectCharacter(char.characterId); if (appearance) noteSelection(char.characterId, appearance.appearanceKey, 'card'); else useArtistStore.getState().setChatSelection(null) }}
        // ⌘/Ctrl+클릭 = 채팅 @멘션 토글 (#artist-mention 2026-08-11, producer 카드와 동일 문법).
        //   캡처 단계에서 기본 동작(선택)을 끊는다 — 멘션하려던 클릭이 카드를 선택하면 안 된다.
        onPointerDownCapture={(e) => {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        onClickCapture={(e) => {
          if (!(e.metaKey || e.ctrlKey) || !char.name?.trim()) return
          e.preventDefault()
          e.stopPropagation()
          const removing = chatInputHasMention(char.name)
          useChatUiStore.getState().requestMentionToggle(char.name)
          launchMentionFlight({
            label: char.name,
            clickX: e.clientX,
            clickY: e.clientY,
            toChat: !removing,
          })
        }}
        // 더블 클릭 = 사진 클릭과 동일(#d5 2026-08-03) — 상세/재생성 팝업
        onDoubleClick={() =>
          appearance && openImage(char.characterId, appearance.appearanceKey)
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            selectCharacter(char.characterId)
            if (appearance) noteSelection(char.characterId, appearance.appearanceKey, 'card'); else useArtistStore.getState().setChatSelection(null)
          }
        }}
        className={cn(
          'cursor-pointer rounded-[18px] border border-transparent bg-panel px-4 pb-4 pt-3.5 shadow-panel transition-colors',
          isSelected
            ? 'ring-[1.5px] ring-stage'
            : 'hover:border-border',
          mentionedNames.has(char.name) &&
            'mention-flash ring-2 ring-sky-400/70 border-sky-400/50 bg-sky-400/10',
        )}
      >
        {/* Header: 편집 가능한 이름만(#f8 2026-08-31 오너) — 역할·필수 배지는 카드 얼굴에서
            걷어냈다(과밀 신고). 역할은 원래도 카드에서 편집 불가(채팅 전용, #3)라 표시만
            사라지고 기능 손실은 없다. requiredCharacterIds 게이트 로직(lib/lifecycle.ts)는
            이 컴포넌트와 무관하게 그대로 유지된다 — 파생 표시용 변수(hasMainImage/isRequired)만
            카드에서 거뒀다. */}
        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* 이름은 채팅으로만 변경 — 수동 편집 불가(#2). 좁은 카드에서 잘리지 않게 두 줄까지 보인다(2026-10-27 QA). */}
            <span className="line-clamp-2 min-w-0 break-words text-body font-semibold">
              {char.name || (isObject ? t('Object') : t('Character'))}
            </span>
            {/* v3 A5 꼬리표 — 인물 · (예전 흐름의) 사물. */}
            <Badge variant="tag">{isObject ? t('Object') : t('Person')}</Badge>
            {/* 시리즈 다음 화: 앞 화에서 그림까지 이어받은 인물인가. */}
            {mark.inherited ? (
              <Badge variant="outline" className="shrink-0 text-[10px]" data-testid="artist-series-inherited">
                {t('Carried over from the previous episode')}
              </Badge>
            ) : null}
            {viewFailures[char.characterId] &&
              Object.keys(viewFailures[char.characterId]).length > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {t('Image failed')}
                </Badge>
              )}
            {/* 산문 밖에서(예전 채팅) 만들어진 인물만 지우기 단추가 있다(2026-10-27 디자이너 QA 1차 #04). */}
            <CharacterDeleteButton character={char} />
            {/* 모습 수(v3 A5 "모습 2") — 사물은 모습이 없다. */}
            {!isObject ? (
              <span className="ml-auto shrink-0 text-caption text-subtle-foreground">{t('Looks {count}', { count: char.appearances?.length ?? 0 })}</span>
            ) : null}
          </div>
        </div>

        {/* 모습 탭(#g4 2026-08-27) — 옥화 ┬ 현재 └ 젊은 시절. 카드를 나누면 "이 둘이 같은 사람"이라는
            정보가 사라지므로 같은 카드 안에서 갈아끼운다. 약속 C1(2026-09-04): 모습이 하나뿐이어도 탭 줄을
            항상 보여 "+ 모습 추가" 자리를 둔다. 사물(object)은 모습 개념이 없다. */}
        {!isObject && (
          <div className="mb-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
            {(char.appearances ?? []).map((ap) => {
              const active =
                (pickedAppearance[char.characterId] ??
                  char.appearances!.find((a) => a.isDefault)?.appearanceKey) ===
                ap.appearanceKey
              return (
                <button
                  key={ap.appearanceKey}
                  type="button"
                  onClick={() => {
                    noteSelection(char.characterId, ap.appearanceKey, 'appearance')
                    setPickedAppearance((prev) => ({
                      ...prev,
                      [char.characterId]: ap.appearanceKey,
                    }))
                  }}
                  aria-pressed={active}
                  className={lookChipClass(active)}
                >
                  {ap.label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setCreateFor(char.characterId)}
              className={lookChipClass(false)}
              title={t('Add appearance')}
            >
              {t('+ Add appearance')}
            </button>
          </div>
        )}

        {/* 캐릭터 = 턴어라운드 시트 1장(모든 뷰, 와이드 3:2) / 사물 = 단일 이미지(정사각). 둘 다 main 하나(#7).
            셀 클릭 → 상세/재생성 Dialog. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (appearance) openImage(char.characterId, appearance.appearanceKey)
              }}
              className="relative block w-full overflow-hidden rounded-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring hover-red-beam"
            >
              {/* 사람 시트는 hover 리전 순환(#d2) — 컨셉→디테일→스케치→표정을 잘라 옮겨
                  다닌다. 생성 중·이미지 없음·사물은 기존 placeholder 경로 그대로. */}
              {!isObject && appearance?.sheetUrl && !isViewGenerating('main') ? (
                <TurnaroundRegionCycle
                  url={appearance.sheetUrl}
                  alt={t('{name} turnaround sheet', { name: char.name || t('Character') })}
                />
              ) : (
                <ImagePlaceholder
                  label={isObject ? '' : t('Turnaround (all views)')}
                  aspectRatio={isObject ? 'square' : 'video'}
                  imageUrl={appearance?.sheetUrl ?? null}
                  generating={isViewGenerating('main')}
                  hideCaption
                />
              )}
              {/* 판 배지(v3 A5) — 이 그림을 그린 때의 작품 스타일 버전. 그리는 중 · 그림이 없으면 없다. */}
              <VersionBadge n={isViewGenerating('main') ? null : versionOf(appearance?.sheetUrl, appearance?.viewCandidates?.main)} />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            align="center"
            sideOffset={8}
            collisionPadding={12}
            className="max-w-[260px] space-y-1.5 whitespace-normal text-left"
          >
            {charTooltipBody}
          </TooltipContent>
        </Tooltip>
        {/* 모습 설명(v3 A5 그림 아래 한 줄) — 유저 언어 외형만(영어 생성 지시문은 보이지 않는다). */}
        {(appearance?.appearanceNative || (appearance?.isDefault ? char.appearanceNative : null)) ? (
          <p className="mt-2 line-clamp-2 text-caption text-subtle-foreground">{appearance?.appearanceNative || char.appearanceNative}</p>
        ) : null}
        {/* #image-to-artist(2026-09-17, 오너 결정): 사용자가 올린 원본은 시트와 별개로 그대로 남는다 — 시트는 이 원본을
            참조해 만들어졌다는 뜻이다. 원본이 있는 모습에서만 시트 아래에 작게 보인다. */}
        {appearance?.sourceImageUrl && (
          <div className="mt-1.5 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-1.5 py-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 원본(보관함 public URL), 최적화 불필요 */}
            <img
              src={appearance.sourceImageUrl}
              alt={t('Original picture')}
              className="size-9 shrink-0 rounded object-cover"
              loading="lazy"
            />
            <span className="truncate text-[11px] text-muted-foreground">
              {t('Original picture')} · {t('The sheet follows this picture')}
            </span>
          </div>
        )}

        {/* 카드 인라인 설정/외형 편집 제거(#d4 2026-08-03) — World 탭과 같은 이미지 중심
            카드로. 텍스트 수정·이미지 재생성은 상세 팝업(사진/더블 클릭)과 채팅 경로가 담당한다. */}
        {/* 시리즈 다음 화: 앞 화 그림을 참고해 이 화 그림체로 다시 그릴 카드만 한 줄 알린다. */}
        {mark.use === 'redraw' ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground" data-testid="artist-series-redraw">
            {t('We redraw it in this episode style using the previous picture as the guide')}
          </p>
        ) : null}

        {/* 카드 생성 버튼 제거(2026-08-31 오너) — 생성/재생성은 상세 팝업과 채팅으로만.
            카드에서 실수로 과금 생성이 눌리는 것을 막고, 이미지 모델 선택도 팝업/채팅에 둔다. */}
      </div>
    )
  }

  return (
    <div ref={wheelRef} data-testid="artist-character-cards">
      <div className={gridClass}>{liveCards.map(card)}</div>
      {/* 인물/사물 추가 버튼 제거(#d2 2026-07-15) — 캐스트 구성은 Producer 단계·채팅 경로로만. */}
      {keptCards.length > 0 ? (
        <section className="mt-6 border-t border-border pt-4" data-testid="artist-series-kept">
          <div className="mb-3 flex flex-wrap items-baseline gap-2">
            <h2 className="text-body font-semibold">{t('Kept')}</h2>
            <p className="text-caption text-muted-foreground">{t('Not in this episode. The picture stays as it is and carries over to the next episode.')}</p>
          </div>
          <div className={gridClass}>{keptCards.map(card)}</div>
        </section>
      ) : null}

      <CharacterViewDialog
        charId={viewDialog?.charId ?? null}
        appearanceKey={viewDialog?.appearanceKey ?? null}
        view={viewDialog?.view ?? null}
        onClose={() => setViewDialog(null)}
        onAddAppearance={(id) => setCreateFor(id)}
      />
      <AppearanceCreateDialog charId={createFor} onClose={() => setCreateFor(null)} />
    </div>
  )
}
