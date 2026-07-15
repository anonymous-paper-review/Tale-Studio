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
import { Textarea } from '@/components/ui/textarea'
import { HoverBeam } from '@/components/hover-beam'
import { useArtistStore, type CharacterRole } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import {
  CHARACTER_VIEW_LABELS,
  type CharacterViewKey,
} from '@/types/asset'

import { cn } from '@/lib/utils'
import { createWheelNotchStepper } from '@/lib/wheel-notch'

// useSyncExternalStore 안정 스냅샷: selector 가 매 호출 새 [] 를 반환하면 무한루프(getServerSnapshot
//   should be cached). 폴백은 모듈레벨 frozen 상수로 참조 고정한다.
const EMPTY_REQUIRED_IDS: readonly string[] = Object.freeze([])

const ROLE_TOGGLE: { value: CharacterRole; label: string }[] = [
  { value: 'protagonist', label: '주인공' },
  { value: 'antagonist', label: '적대자' },
  { value: 'supporting', label: '조연' },
]

// columns: 보드 축척(#d1) — 1(기존 세로 스택)~3열 그리드. 페이지 헤더의 슬라이더가 결정.
// onZoomStep: Ctrl+휠 축척(#d1 2026-07-15) — 이벤트 방향당 1단계(쿨다운), 브라우저 줌 차단.
export function CharacterPanel({
  columns = 1,
  onZoomStep,
}: { columns?: number; onZoomStep?: (dir: 1 | -1) => void } = {}) {
  const {
    sceneManifest,
    characterAssets,
    selectedCharacterId,
    generatingViews,
    generatingStartedAt,
    viewFailures,
    selectCharacter,
    generateCharacterAllViews,
    updateCharacter,
  } = useArtistStore()

  const requiredCharacterIds = useProjectStore((s) => s.lifecycleStatus.artist?.requiredCharacterIds ?? EMPTY_REQUIRED_IDS)
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
                  <span className="text-background/50">외형 · </span>
                  {char.appearanceNative || char.fixedPrompt}
                </p>
              ) : null}
              {bgScenes.length > 0 ? (
                <div className="space-y-0.5 border-t border-background/20 pt-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-background/50">
                    등장 씬 · 배경
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
                      +{bgScenes.length - 3}개 씬 더
                    </p>
                  ) : null}
                </div>
              ) : null}
              {!char.description &&
              !char.fixedPrompt &&
              bgScenes.length === 0 ? (
                <p className="text-background/60">아직 설정 정보가 없습니다.</p>
              ) : null}
            </>
          )

          return (
            <div
              key={char.characterId}
              role="button"
              tabIndex={0}
              onClick={() => selectCharacter(char.characterId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ')
                  selectCharacter(char.characterId)
              }}
              className={cn(
                'cursor-pointer rounded-xl border p-4 transition-colors',
                isSelected
                  ? 'border-primary bg-accent'
                  : 'border-border hover:bg-accent/50',
              )}
            >
              {/* Header: 편집 가능한 이름 + 역할 토글 + 배지 (인라인 편집 — 팝업 없음) */}
              <div className="mb-3 space-y-2">
                <div className="flex items-center gap-2">
                  {/* 이름은 채팅으로만 변경 — 수동 편집 불가(#2). */}
                  <span className="min-w-0 flex-1 truncate text-base font-medium">
                    {char.name || (isObject ? '사물' : '캐릭터')}
                  </span>
                  {isObject ? <Badge variant="secondary">사물</Badge> : null}
                  {isRequired && (
                    <Badge variant={hasMainImage ? 'outline' : 'destructive'} className="text-[10px]">
                      필수
                    </Badge>
                  )}
                  {viewFailures[char.characterId] &&
                    Object.keys(viewFailures[char.characterId]).length > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        이미지 실패
                      </Badge>
                    )}
                </div>
                {/* 역할은 채팅으로만 변경 — 수동 편집 불가(#3). 현재 역할만 읽기전용 배지로 표시. */}
                {!isObject && (
                  <Badge variant="outline" className="w-fit text-xs font-normal">
                    {ROLE_TOGGLE.find((r) => r.value === role)?.label ?? role}
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
                    <ImagePlaceholder
                      label={isObject ? CHARACTER_VIEW_LABELS['main'] : '턴어라운드 (모든 뷰)'}
                      aspectRatio={isObject ? 'square' : 'video'}
                      imageUrl={char.views.main ?? null}
                      generating={isViewGenerating('main')}
                      generatingStartedAt={generatingStartedAt[`${char.characterId}:main`]}
                    />
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

              {/* 설정 / 외형 — 카드에서 바로 편집 (팝업 없음). hover 시 빨간 빔으로 입력 가능 표시. */}
              <div className="mt-3 space-y-2">
                <HoverBeam>
                  <Textarea
                    value={char.description ?? ''}
                    rows={2}
                    placeholder={isObject ? '사물의 특성·용도·서사적 의미' : '성격·역할·서사적 배경'}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      updateCharacter(char.characterId, { description: e.target.value })
                    }
                    className="text-xs"
                  />
                </HoverBeam>
                <HoverBeam>
                  <Textarea
                    value={char.fixedPrompt ?? ''}
                    rows={2}
                    placeholder={isObject ? '외형: 형태·재질·특징 (이미지 프롬프트)' : '외형: 헤어·의상·특징 (이미지 프롬프트)'}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      updateCharacter(char.characterId, { appearance: e.target.value })
                    }
                    className="text-xs"
                  />
                </HoverBeam>
              </div>
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
                      이미지 생성
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
