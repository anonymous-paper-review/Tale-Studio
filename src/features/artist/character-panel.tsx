'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { CharacterViewDialog } from '@/features/artist/character-view-dialog'
import { TurnaroundRegionCycle } from '@/features/artist/turnaround-region-cycle'
import { useArtistStore, type CharacterRole } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { chatInputHasMention, launchMentionFlight } from '@/lib/mention-flight'
import {
  CHARACTER_VIEW_LABELS,
  type CharacterViewKey,
} from '@/types/asset'

import { cn } from '@/lib/utils'
import { createWheelNotchStepper } from '@/lib/wheel-notch'
import { useT } from '@/lib/i18n'

// useSyncExternalStore 안정 스냅샷: selector 가 매 호출 새 [] 를 반환하면 무한루프(getServerSnapshot
//   should be cached). 폴백은 모듈레벨 frozen 상수로 참조 고정한다.
const EMPTY_REQUIRED_IDS: readonly string[] = Object.freeze([])

// 라벨은 영어 원문 = i18n 사전 키 (#i18n-s5) — 렌더에서 t() 를 통과한다.
const ROLE_TOGGLE: { value: CharacterRole; label: string }[] = [
  { value: 'protagonist', label: 'Protagonist' },
  { value: 'antagonist', label: 'Antagonist' },
  { value: 'supporting', label: 'Supporting' },
]

// columns: 보드 축척(#d1) — 1(기존 세로 스택)~3열 그리드. 페이지 헤더의 슬라이더가 결정.
// onZoomStep: Ctrl+휠 축척(#d1 2026-07-15) — 이벤트 방향당 1단계(쿨다운), 브라우저 줌 차단.
export function CharacterPanel({
  columns = 1,
  onZoomStep,
}: { columns?: number; onZoomStep?: (dir: 1 | -1) => void } = {}) {
  const t = useT()
  const {
    sceneManifest,
    characterAssets,
    selectedCharacterId,
    generatingViews,
    viewFailures,
    selectCharacter,
    generateCharacterAllViews,
  } = useArtistStore()

  const requiredCharacterIds = useProjectStore((s) => s.lifecycleStatus.artist?.requiredCharacterIds ?? EMPTY_REQUIRED_IDS)
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
          const role = getRole(char.characterId)
          const isSelected = selectedCharacterId === char.characterId
          const isGenerating = generatingViews.some((k) =>
            k.startsWith(`${char.characterId}:`),
          )
          const isViewGenerating = (v: CharacterViewKey) =>
            generatingViews.includes(`${char.characterId}:${v}`)
          const isObject = char.entityType === 'object'
          // 캐릭터=턴어라운드 시트 1장, 사물=단일 이미지 — 둘 다 main 하나로 판정(#7).
          const hasMainImage = Boolean(char.views.main)
          const isRequired = requiredCharacterIds.includes(char.characterId)
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
                setViewDialog({ charId: char.characterId, view: 'main' })
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
              {/* Header: 편집 가능한 이름 + 역할 토글 + 배지 (인라인 편집 — 팝업 없음) */}
              <div className="mb-3 space-y-2">
                <div className="flex items-center gap-2">
                  {/* 이름은 채팅으로만 변경 — 수동 편집 불가(#2). */}
                  <span className="min-w-0 flex-1 truncate text-base font-medium">
                    {char.name || (isObject ? t('Object') : t('Character'))}
                  </span>
                  {isObject ? <Badge variant="secondary">{t('Object')}</Badge> : null}
                  {isRequired && (
                    <Badge
                      variant={hasMainImage ? 'outline' : 'destructive'}
                      className="text-[10px]"
                      // #f7(2026-08-26 오너): '필수'의 색 의미가 불명이었다 — 뜻을 툴팁으로 말한다.
                      title={
                        hasMainImage
                          ? t('Required for Director: this character appears in shots, and its main image is ready.')
                          : t('Required for Director: this character appears in shots — red means its main image is still missing.')
                      }
                    >
                      {t('Required')}
                    </Badge>
                  )}
                  {viewFailures[char.characterId] &&
                    Object.keys(viewFailures[char.characterId]).length > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {t('Image failed')}
                      </Badge>
                    )}
                </div>
                {/* 역할은 채팅으로만 변경 — 수동 편집 불가(#3). 현재 역할만 읽기전용 배지로 표시. */}
                {!isObject && (
                  <Badge variant="outline" className="w-fit text-xs font-normal">
                    {t(ROLE_TOGGLE.find((r) => r.value === role)?.label ?? role)}
                  </Badge>
                )}
              </div>

              {/* 캐릭터 = 턴어라운드 시트 1장(모든 뷰, 와이드 3:2) / 사물 = 단일 이미지(정사각). 둘 다 main 하나(#7).
                  셀 클릭 → 상세/재생성 Dialog. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setViewDialog({ charId: char.characterId, view: 'main' })
                    }}
                    className="relative block w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring hover-red-beam"
                  >
                    {/* 사람 시트는 hover 리전 순환(#d2) — 컨셉→디테일→스케치→표정을 잘라 옮겨
                        다닌다. 생성 중·이미지 없음·사물은 기존 placeholder 경로 그대로. */}
                    {!isObject && char.views.main && !isViewGenerating('main') ? (
                      <TurnaroundRegionCycle
                        url={char.views.main}
                        alt={t('{name} turnaround sheet', { name: char.name || t('Character') })}
                      />
                    ) : (
                      <ImagePlaceholder
                        label={isObject ? t(CHARACTER_VIEW_LABELS['main']) : t('Turnaround (all views)')}
                        aspectRatio={isObject ? 'square' : 'video'}
                        imageUrl={char.views.main ?? null}
                        generating={isViewGenerating('main')}
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
                  카드로. 텍스트 수정은 상세 팝업(사진/더블 클릭)과 채팅 경로가 담당한다. */}
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
                    generateCharacterAllViews(char.characterId)
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

        {/* 인물/사물 추가 버튼 제거(#d2 2026-07-15) — 캐스트 구성은 Producer 단계·채팅 경로로만. */}
      </div>
      </ScrollArea>

      <CharacterViewDialog
        charId={viewDialog?.charId ?? null}
        view={viewDialog?.view ?? null}
        onClose={() => setViewDialog(null)}
      />
    </div>
  )
}
