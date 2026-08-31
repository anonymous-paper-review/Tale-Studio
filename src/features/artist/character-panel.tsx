'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { CharacterViewDialog } from '@/features/artist/character-view-dialog'
import { TurnaroundRegionCycle } from '@/features/artist/turnaround-region-cycle'
import { sameCharacterAppearanceSlot, useArtistStore } from '@/stores/artist-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { chatInputHasMention, launchMentionFlight } from '@/lib/mention-flight'
import { type CharacterViewKey } from '@/types/asset'

import { cn } from '@/lib/utils'
import { createWheelNotchStepper } from '@/lib/wheel-notch'
import { useT } from '@/lib/i18n'

// columns: 보드 축척(#d1) — 1(기존 세로 스택)~3열 그리드. 페이지 헤더의 슬라이더가 결정.
// onZoomStep: Ctrl+휠 축척(#d1 2026-07-15) — 이벤트 방향당 1단계(쿨다운), 브라우저 줌 차단.
export function CharacterPanel({
  columns = 1,
  onZoomStep,
}: { columns?: number; onZoomStep?: (dir: 1 | -1) => void } = {}) {
  // #g4(2026-08-27): 카드 안에서 고른 모습. 캐릭터당 하나씩 기억한다.
  //   모습이 하나뿐인 캐릭터는 탭 자체가 안 뜨므로 이 상태를 쓰지 않는다.
  const [pickedAppearance, setPickedAppearance] = useState<Record<string, string>>({})

  /** 선택한 모습의 시트만 표시한다. 다른 모습이나 legacy view_main으로 대체하지 않는다. */
  const selectedAppearance = (c: { characterId: string; appearances: Array<{ appearanceKey: string; isDefault: boolean; sheetUrl: string | null }> }) => {
    const key = pickedAppearance[c.characterId] ?? c.appearances.find((appearance) => appearance.isDefault)?.appearanceKey
    return c.appearances.find((appearance) => appearance.appearanceKey === key) ?? null
  }
  const t = useT()
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

  return (
    <div ref={wheelRef} className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1 px-6 py-4">
      <div
        className={cn(
          columns >= 3 && 'grid grid-cols-3 items-start gap-4',
          columns === 2 && 'grid grid-cols-2 items-start gap-4',
          columns <= 1 && 'space-y-4',
        )}
      >
        {characterAssets.map((char) => {
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
          const charTooltipBody = (
            <>
              <p className="font-medium">
                {char.name}
                <span className="font-normal text-background/60">
                  {' · '}
                  {role}
                </span>
              </p>
              {char.description ? (
                <p className="leading-snug text-background/80">
                  {char.description}
                </p>
              ) : null}
              {(char.appearanceNative || char.fixedPrompt) ? (
                <p className="leading-snug text-background/70">
                  <span className="text-background/50">{t('Appearance')} · </span>
                  {char.appearanceNative || char.fixedPrompt}
                </p>
              ) : null}
              {bgScenes.length > 0 ? (
                <div className="space-y-0.5 border-t border-background/20 pt-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-background/50">
                    {t('Scenes appeared · background')}
                  </p>
                  {bgScenes.slice(0, 3).map((s) => (
                    <p
                      key={s.sceneId}
                      className="leading-snug text-background/80"
                    >
                      • {s.narrativeSummary}
                    </p>
                  ))}
                  {bgScenes.length > 3 ? (
                    <p className="text-background/50">
                      {t('+{count} more scenes', { count: bgScenes.length - 3 })}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {!char.description &&
              !char.fixedPrompt &&
              bgScenes.length === 0 ? (
                <p className="text-background/60">{t('No profile info yet.')}</p>
              ) : null}
            </>
          )

          return (
            <div
              key={char.characterId}
              role="button"
              tabIndex={0}
              onClick={() => selectCharacter(char.characterId)}
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
                appearance && setViewDialog({ charId: char.characterId, appearanceKey: appearance.appearanceKey, view: 'main' })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ')
                  selectCharacter(char.characterId)
              }}
              className={cn(
                'cursor-pointer rounded-xl border p-4 transition-colors',
                isSelected
                  ? 'border-primary bg-accent'
                  : 'border-border hover:bg-accent/50',
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
                <div className="flex items-center gap-2">
                  {/* 이름은 채팅으로만 변경 — 수동 편집 불가(#2). */}
                  <span className="min-w-0 flex-1 truncate text-base font-medium">
                    {char.name || (isObject ? t('Object') : t('Character'))}
                  </span>
                  {isObject ? <Badge variant="secondary">{t('Object')}</Badge> : null}
                  {viewFailures[char.characterId] &&
                    Object.keys(viewFailures[char.characterId]).length > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {t('Image failed')}
                      </Badge>
                    )}
                </div>
              </div>

              {/* 모습 탭(#g4 2026-08-27) — 옥화 ┬ 현재 └ 젊은 시절.
                  모습이 하나뿐이면 그리지 않는다: 지금까지의 카드와 똑같이 보인다.
                  카드를 늘리는 대신 여기서 갈아끼우는 이유는, 카드를 나누면
                  "이 둘이 같은 사람"이라는 정보가 화면에서 사라지기 때문이다. */}
              {(char.appearances?.length ?? 0) > 1 && (
                <div className="mb-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                  {char.appearances!.map((ap) => {
                    const active =
                      (pickedAppearance[char.characterId] ??
                        char.appearances!.find((a) => a.isDefault)?.appearanceKey) ===
                      ap.appearanceKey
                    return (
                      <button
                        key={ap.appearanceKey}
                        type="button"
                        onClick={() =>
                          setPickedAppearance((prev) => ({
                            ...prev,
                            [char.characterId]: ap.appearanceKey,
                          }))
                        }
                        className={cn(
                          'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                          active
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {ap.label}
                      </button>
                    )
                  })}
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
                      if (appearance) setViewDialog({ charId: char.characterId, appearanceKey: appearance.appearanceKey, view: 'main' })
                    }}
                    className="relative block w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring hover-red-beam"
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

              {/* 카드 인라인 설정/외형 편집 제거(#d4 2026-08-03) — World 탭과 같은 이미지 중심
                  카드로. 텍스트 수정·이미지 재생성은 상세 팝업(사진/더블 클릭)과 채팅 경로가 담당한다. */}
              {/* 카드 생성 버튼 제거(2026-08-31 오너) — 생성/재생성은 상세 팝업과 채팅으로만.
                  카드에서 실수로 과금 생성이 눌리는 것을 막고, 이미지 모델 선택도 팝업/채팅에 둔다. */}
            </div>
          )
        })}

        {/* 인물/사물 추가 버튼 제거(#d2 2026-07-15) — 캐스트 구성은 Producer 단계·채팅 경로로만. */}
      </div>
      </ScrollArea>

      <CharacterViewDialog
        charId={viewDialog?.charId ?? null}
        appearanceKey={viewDialog?.appearanceKey ?? null}
        view={viewDialog?.view ?? null}
        onClose={() => setViewDialog(null)}
      />
    </div>
  )
}
