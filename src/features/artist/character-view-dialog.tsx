'use client'

import { useState } from 'react'
import { Loader2, Sparkles, RefreshCw, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { HoverBeam } from '@/components/hover-beam'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { sameCharacterAppearanceSlot, useArtistStore } from '@/stores/artist-store'
import { CHARACTER_VIEW_LABELS, type CharacterViewKey } from '@/types/asset'
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
  IMAGE_MODEL_ORDER,
  imageModelSupportsReference,
  type ImageModelKey,
} from '@/lib/image-models'
import { classifyImageStale } from '@/lib/image-provenance'
import { SAFE_RETRY_CAP } from '@/lib/artist/safe-retry'
import { useGuardedAction } from '@/hooks/use-guarded-action'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

type Props = {
  charId: string | null
  appearanceKey: string | null
  view: CharacterViewKey | null
  onClose: () => void
}

/**
 * 캐릭터 뷰 상세 — 선택 뷰 프리뷰 + 단일 뷰 재생성 (crop 폐기, 2026-06-05).
 * main = 대표 포트레이트(T2I), 방향 뷰 = main 을 reference 로 한 i2i. 각 뷰를 개별 재생성한다.
 */
export function CharacterViewDialog({ charId, appearanceKey, view, onClose }: Props) {
  const t = useT()
  const char = useArtistStore((s) =>
    s.characterAssets.find((c) => c.characterId === charId),
  )
  const generateCharacterView = useArtistStore((s) => s.generateCharacterView)
  const updateCharacterAppearance = useArtistStore((s) => s.updateCharacterAppearance)
  const selectCandidate = useArtistStore((s) => s.selectCandidate)
  const viewFailures = useArtistStore((s) => s.viewFailures)
  const retryCharacterViewSafe = useArtistStore((s) => s.retryCharacterViewSafe)
  const isGenerating = useArtistStore((s) =>
    appearanceKey && view
      ? s.generatingViews.some((slot) => sameCharacterAppearanceSlot(slot, charId ?? '', appearanceKey, view))
      : false,
  )

  // 외형 프롬프트(수정 후 재생성, 월드 다이얼로그와 대칭) — 대상(캐릭터×뷰) 전환 시 초기화.
  const [prompt, setPrompt] = useState('')
  const [promptKey, setPromptKey] = useState<string | null>(null)
  // 이미지 생성 모델 선택 — 다이얼로그가 열려 있는 동안 유지(마지막 선택 기억). 기본은 gpt-image-2.
  const [imageModel, setImageModel] = useState<ImageModelKey>(DEFAULT_IMAGE_MODEL)

  // 클릭 즉시 잠금(#double-fire) — generatingViews 는 sendCharacterPatchNow 왕복 *뒤에* 세워지므로,
  //   느린 서버에서 그 사이 버튼이 열려 있어 두 번째 클릭이 기존 중복 가드까지 통과했다.
  //   아래 훅은 store 상태를 기다리지 않고 클릭 순간 잠그고, busy 가 올라오면 잠금을 넘긴다.
  const generate = useGuardedAction({
    actionKey: `artist:character:${charId}:${appearanceKey}:${view}`,
    stage: 'artist',
    label: t('Character image'),
    busy: isGenerating,
    action: async () => {
      if (!char || !appearanceKey || !view || !appearance) return
      // 프롬프트는 선택한 모습의 원천에만 저장한다.
      const next = prompt.trim()
      const base = appearance.appearanceNative || appearance.appearance || ''
      if (view === 'main' && next && next !== base) {
        await updateCharacterAppearance(char.characterId, appearanceKey, next)
      }
      await generateCharacterView(char.characterId, appearanceKey, view, 'ui', undefined, undefined, imageModel)
    },
  })
  const safeRetry = useGuardedAction({
    actionKey: `artist:character-safe:${charId}:${appearanceKey}:${view}`,
    stage: 'artist',
    label: t('Character image (bypass retry)'),
    busy: isGenerating,
    action: async () => {
      if (!char || !appearanceKey || !view) return
      await retryCharacterViewSafe(char.characterId, appearanceKey, view, imageModel)
    },
  })

  const open = !!charId && !!appearanceKey && !!view
  const appearance = char?.appearances.find((item) => item.appearanceKey === appearanceKey) ?? null
  if (!open || !char || !appearance || !view || !appearanceKey) return null

  const imageUrl = view === 'main' ? appearance.sheetUrl : null
  const label = t(CHARACTER_VIEW_LABELS[view])
  const isObject = char.entityType === 'object'
  // object 캐릭터는 방향뷰 개념 없음 — isDirectional/needsMain 로직 미적용
  const isDirectional = !isObject && view !== 'main'
  const needsMain = isDirectional && !appearance.sheetUrl
  // 사람 main = 와이드 턴어라운드 시트 → 넓은 다이얼로그 + 16:9 프레임으로 전체 표시(잘림 방지, #4).
  const isSheet = !isObject && view === 'main'

  const initialPrompt = appearance.appearanceNative || appearance.appearance || ''
  const key = `${charId}:${appearanceKey}:${view}`
  if (promptKey !== key) {
    setPromptKey(key)
    setPrompt(initialPrompt)
  }

  // stale 원인 분류(027): look-pending(룩만 도착) vs edited(외형 변경). dialog 포커스에서만 표시.
  const candidates = appearance.viewCandidates[view] ?? []
  const selectedCandidate = candidates.find((c) => c.isSelected)
  const staleClass = classifyImageStale(appearance.appearance ?? '', char.lookFingerprint ?? null, {
    sourceHash: selectedCandidate?.sourceHash ?? null,
    appearanceHash: selectedCandidate?.appearanceHash ?? null,
  })
  // 생성 실패(reload-survivable) — moderation(콘텐츠정책) 이면 우회(safe) 재시도 버튼, cap 도달 시 비활성.
  const failure = charId && appearanceKey ? viewFailures[charId]?.[appearanceKey]?.[view] : undefined
  const capReached = (failure?.safeFailCount ?? 0) >= SAFE_RETRY_CAP

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          isSheet ? 'sm:max-w-3xl' : 'sm:max-w-lg',
          'max-h-[92vh] overflow-y-auto scrollbar-thin',
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">
            {/* #f6(2026-08-27 오너): 'Main' 계열 문구 전삭제 — 대표 뷰는 이름만. */}
            {view === 'main' ? char.name : `${char.name} — ${label}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {staleClass !== 'fresh' && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <RefreshCw className="size-3.5 shrink-0" />
              {staleClass === 'look-pending'
                ? t('This is a draft from before the final look — regenerating remakes it in the final art style')
                : t('The appearance changed — regenerating will apply the new appearance')}
            </div>
          )}

          {failure && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>
                {failure.moderation
                  ? t('Generation was declined by content policy. You can retry below with "Redo with bypass (safe)."')
                  : t('Generation failed. Please try again.')}
              </span>
            </div>
          )}

          {/* 사람 main = 시트 전체(16:9), 그 외 = 기존 1:1 프레임 */}
          <div className={cn('mx-auto w-full', !isSheet && 'max-w-sm')}>
            <ImagePlaceholder
              label={view === 'main' ? '' : label}
              aspectRatio={isSheet ? 'video' : 'square'}
              imageUrl={imageUrl}
              generating={isGenerating}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {isObject
              ? imageUrl
                ? t('Regenerating creates a new image.')
                : t('This generates the image.')
              : view === 'main'
                ? t('This is the turnaround sheet. Edit the appearance prompt below and regenerate to apply it.')
                : needsMain
                  ? t('Directional views are generated from Main. Generate Main first.')
                  : t('This view is regenerated based on the Main image.')}
          </p>

          {/* 외형 프롬프트(#4) — 월드 다이얼로그와 대칭. 수정하면 재생성 시 캐릭터 원천(appearance)에 반영. */}
          {view === 'main' && (
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                {t('Appearance prompt (edit, then regenerate)')}
              </label>
              <HoverBeam>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder={t("This character's appearance description")}
                />
              </HoverBeam>
            </div>
          )}

          {/* 후보 히스토리 스트립(#owner-keep-prev 2026-08-31) — finalize 가 슬롯당 최근 N장을 보관하므로(
              #5 단일 이미지 전량삭제 정책을 되돌림), 직전 이미지를 누르면 선택본으로 되돌릴 수 있다. 2장 이상일 때만 표시. */}
          {candidates.length >= 2 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('Candidate history')}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {candidates.map((cand) => {
                  const candClass = classifyImageStale(appearance.appearance ?? '', char.lookFingerprint ?? null, {
                    sourceHash: cand.sourceHash,
                    appearanceHash: cand.appearanceHash ?? null,
                  })
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => selectCandidate(char.characterId, appearanceKey, view, cand.id)}
                      className={cn(
                        'relative shrink-0 overflow-hidden rounded-md border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        cand.isSelected ? 'border-primary' : 'border-transparent hover:border-border',
                      )}
                      style={{ width: 64, height: 64 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cand.url} alt={t('Candidate image')} className="size-full object-cover" />
                      {candClass !== 'fresh' && (
                        <span className="absolute bottom-0 left-0 right-0 bg-amber-500/80 px-0.5 py-px text-center text-[9px] leading-tight text-white">
                          {candClass === 'look-pending' ? t('Pre-look') : t('Pre-edit')}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 이미지 생성 모델 선택(image-models 레지스트리) — 재생성창에서만 고른다. 채팅으로도 지정 가능. */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              {t('Image generation model')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {IMAGE_MODEL_ORDER.map((key) => {
                const spec = IMAGE_MODELS[key]
                const active = imageModel === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setImageModel(key)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-left text-xs transition-colors',
                      active ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                    )}
                  >
                    <span className="block font-medium">{spec.label}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {t(spec.description)}
                      {spec.pricePerImage != null ? ` · $${spec.pricePerImage}` : ''}
                    </span>
                  </button>
                )
              })}
            </div>
            {!isObject && !imageModelSupportsReference(imageModel) && (
              <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                {t('This model has no reference support — character identity may drift.')}
              </p>
            )}
          </div>

          <Button className="w-full" disabled={generate.locked || needsMain} onClick={generate.run}>
            {generate.locked ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('Generating…')}
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {view === 'main'
                  ? imageUrl
                    ? t('Regenerate image')
                    : t('Generate image')
                  : imageUrl
                    ? t('Regenerate {label}', { label })
                    : t('Generate {label}', { label })}
              </>
            )}
          </Button>

          {failure?.moderation && (
            <Button
              variant="outline"
              className="w-full"
              disabled={safeRetry.locked || capReached}
              onClick={safeRetry.run}
            >
              {safeRetry.locked ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {capReached ? t('Bypass retry limit reached') : t('Redo with bypass (safe)')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
