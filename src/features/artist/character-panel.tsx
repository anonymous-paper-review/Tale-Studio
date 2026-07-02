'use client'

import { useState } from 'react'
import { Loader2, Sparkles, Check, Share2, BookmarkCheck, BookmarkPlus, Plus } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { HoverBeam } from '@/components/hover-beam'
import { useArtistStore, type CharacterRole } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import { registerCharacterCard } from '@/stores/asset-storage-store'
import { useInventoryStore } from '@/stores/inventory-store'
import {
  CHARACTER_VIEW_KEYS,
  CHARACTER_VIEW_LABELS,
  type CharacterViewKey,
} from '@/types/asset'

import { cn } from '@/lib/utils'

// useSyncExternalStore 안정 스냅샷: selector 가 매 호출 새 [] 를 반환하면 무한루프(getServerSnapshot
//   should be cached). 폴백은 모듈레벨 frozen 상수로 참조 고정한다.
const EMPTY_REQUIRED_IDS: readonly string[] = Object.freeze([])

const ROLE_TOGGLE: { value: CharacterRole; label: string }[] = [
  { value: 'protagonist', label: '주인공' },
  { value: 'antagonist', label: '적대자' },
  { value: 'supporting', label: '조연' },
]

export function CharacterPanel() {
  const {
    sceneManifest,
    characterAssets,
    selectedCharacterId,
    generatingViews,
    generatingStartedAt,
    viewFailures,
    selectCharacter,
    generateCharacterAllViews,
    addCharacter,
    updateCharacter,
  } = useArtistStore()

  const projectId = useProjectStore((s) => s.projectId)
  const workspaceId = useProjectStore((s) => s.workspaceId)
  const saveFromAsset = useInventoryStore((s) => s.saveFromAsset)
  const requiredCharacterIds = useProjectStore((s) => s.lifecycleStatus.artist?.requiredCharacterIds ?? EMPTY_REQUIRED_IDS)
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [viewDialog, setViewDialog] = useState<{
    charId: string
    view: CharacterViewKey
  } | null>(null)

  const getRole = (id: string) =>
    sceneManifest?.characters.find((c) => c.characterId === id)?.role ??
    'supporting'

  // 캐릭터가 등장하는 씬들 — writer 가 만든 narrativeSummary(배경/스토리) 를 hover 에 노출
  const getBackgroundScenes = (id: string) =>
    sceneManifest?.scenes.filter((s) => s.charactersPresent?.includes(id)) ??
    []

  return (
    <>
      <ScrollArea className="min-h-0 flex-1 px-6 py-4">
      <div className="space-y-4">
        {characterAssets.map((char) => {
          const role = getRole(char.characterId)
          const isSelected = selectedCharacterId === char.characterId
          const isGenerating = generatingViews.some((k) =>
            k.startsWith(`${char.characterId}:`),
          )
          const isViewGenerating = (v: CharacterViewKey) =>
            generatingViews.includes(`${char.characterId}:${v}`)
          const isRegistered = registeredIds.has(char.characterId)
          const isSaved = savedIds.has(char.characterId)
          const isObject = char.entityType === 'object'
          const hasImage = isObject ? Boolean(char.views.main) : CHARACTER_VIEW_KEYS.some((v) => char.views[v])
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
                  <HoverBeam className="min-w-0 flex-1">
                    <Input
                      value={char.name}
                      placeholder={isObject ? '사물 이름' : '캐릭터 이름'}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        updateCharacter(char.characterId, { name: e.target.value })
                      }
                      className="h-9 text-base font-medium"
                    />
                  </HoverBeam>
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
                {/* 역할 토글 — 카드에서 바로 주인공/적대자/조연 전환 (hover 색 변경으로 변경 가능 표시) */}
                {!isObject && (
                  <div className="flex gap-1.5">
                    {ROLE_TOGGLE.map(({ value, label }) => {
                      const active = role === value
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            updateCharacter(char.characterId, { role: value })
                          }}
                          className={cn(
                            'rounded-md border px-2.5 py-1 text-xs transition-colors',
                            active
                              ? 'border-primary bg-primary/15 font-medium text-foreground'
                              : 'border-border text-muted-foreground hover:border-primary/60 hover:bg-accent hover:text-foreground',
                          )}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* object: 단일 main 이미지 셀 / person: 기존 4뷰 그리드 */}
              {isObject ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setViewDialog({ charId: char.characterId, view: 'main' })
                      }}
                      className="relative block w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ImagePlaceholder
                        label={CHARACTER_VIEW_LABELS['main']}
                        aspectRatio="square"
                        imageUrl={char.views.main ?? null}
                        generating={isViewGenerating('main')}
                        generatingStartedAt={
                          generatingStartedAt[`${char.characterId}:main`]
                        }
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
              ) : (
                /* main(정면 대표) + 3방향 뷰를 동일 크기로 병렬 표시 (front 통합·hero 폐기, 2026-06-05).
                   셀 클릭 → 상세/재생성 Dialog. 각 이미지에 개별 Tooltip 부착 → 호버한 "그 이미지"의
                   좌/우(side="right" + avoidCollisions 기본)로 떠서 화면 밖으로 나가면 자동으로 반대편(left)으로
                   뒤집힘. collisionPadding 으로 뷰포트 가장자리 여백 확보 (이전: 그리드 전체를 한 트리거로 잡아
                   맨 왼/오른쪽에만 떠서 화면 밖 이탈). */
                <div className="grid grid-cols-4 gap-2">
                  {(['main', 'back', 'sideLeft', 'sideRight'] as const).map(
                    (view) => (
                      <Tooltip key={view}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setViewDialog({ charId: char.characterId, view })
                            }}
                            className="relative block w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ImagePlaceholder
                              label={CHARACTER_VIEW_LABELS[view]}
                              aspectRatio="square"
                              imageUrl={char.views[view] ?? null}
                              generating={isViewGenerating(view)}
                              generatingStartedAt={
                                generatingStartedAt[`${char.characterId}:${view}`]
                              }
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
                    ),
                  )}
                </div>
              )}

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
              {/* Actions */}
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
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
                      {isObject ? '이미지 생성' : 'Generate All Views'}
                    </>
                  )}
                </Button>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isRegistered ? 'secondary' : 'default'}
                      size="sm"
                      disabled={!hasImage || isGenerating}
                      onClick={(e) => {
                        e.stopPropagation()
                        registerCharacterCard(char, projectId ?? 'default')
                        setRegisteredIds((prev) =>
                          new Set(prev).add(char.characterId),
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
                      disabled={!hasMainImage || !workspaceId}
                      onClick={async (e) => {
                        e.stopPropagation()
                        const item = await saveFromAsset({
                          workspaceId: workspaceId!,
                          kind: 'character',
                          name: char.name,
                          sourceImageUrl: char.views.main!,
                          sourceProjectId: projectId ?? undefined,
                          sourceCharacterId: char.characterId,
                        })
                        if (item) {
                          setSavedIds((prev) =>
                            new Set(prev).add(char.characterId),
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
                      ? hasMainImage
                        ? '워크스페이스 인벤토리에 저장'
                        : 'main 이미지가 있어야 저장할 수 있습니다'
                      : '프로젝트 로드 후 사용 가능합니다'}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )
        })}

        {/* 새 인물/사물 추가 — 팝업 없이 즉시 카드 생성 후 카드에서 바로 인라인 편집 (채팅으로도 생성 가능) */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 border-dashed text-muted-foreground hover:text-foreground"
            onClick={() => addCharacter({ name: '새 캐릭터', entityType: 'person' })}
          >
            <Plus className="size-4" /> 인물
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-dashed text-muted-foreground hover:text-foreground"
            onClick={() => addCharacter({ name: '새 사물', entityType: 'object' })}
          >
            <Plus className="size-4" /> 사물
          </Button>
        </div>
      </div>
      </ScrollArea>

      <CharacterViewDialog
        charId={viewDialog?.charId ?? null}
        view={viewDialog?.view ?? null}
        onClose={() => setViewDialog(null)}
      />
    </>
  )
}
