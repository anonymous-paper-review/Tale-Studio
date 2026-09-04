'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Loader2, Pencil, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { HoverBeam } from '@/components/hover-beam'
import { useGuardedAction } from '@/hooks/use-guarded-action'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { useArtistStore, worldFailureKey, type WorldShotKey } from '@/stores/artist-store'
import { DEFAULT_LOCATION_APPEARANCE_KEY } from '@/types/asset'
import {
  DEFAULT_WORLD_IMAGE_MODEL,
  IMAGE_MODELS,
  IMAGE_MODEL_ORDER,
  type ImageModelKey,
} from '@/lib/image-models'
import { classifyWorldImageStale } from '@/lib/image-provenance'
import { SAFE_RETRY_CAP } from '@/lib/artist/safe-retry'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

type Props = {
  locationId: string | null
  shot: WorldShotKey | null
  /** 배경 모습(약속 C10) — 없거나 'default' 면 기본 모습(locations 행). */
  appearanceKey?: string | null
  onClose: () => void
}

/** 팝업 텍스트 상자의 초기값 — 배경 설명(원천). 유저 언어 원문이 있으면 그것, 없으면 영어 base. */
export function worldDescriptionDraft(world: { visualDescriptionNative?: string | null; visualDescription?: string | null } | null | undefined): string {
  return world?.visualDescriptionNative || world?.visualDescription || ''
}

/**
 * 배경 상세 + 재생성 Dialog — 약속 B(2026-09-04): 캐릭터 팝업과 같은 기능.
 *   설명(원천) 편집 → 저장(Writer 씬 반영) → 재생성, 후보 히스토리(최근 5장) 되돌리기, 모델 선택,
 *   "설명 바뀜"·실패 표시, 콘텐츠 정책 거절 시 우회(safe) 재시도. 차이는 프롬프트에 사람이 없다는 것뿐(서버 보장).
 */
export function WorldViewDialog({ locationId, shot, appearanceKey: appearanceKeyProp, onClose }: Props) {
  const t = useT()
  const world = useArtistStore((s) =>
    s.worldAssets.find((w) => w.locationId === locationId),
  )
  const generateWorldShot = useArtistStore((s) => s.generateWorldShot)
  const updateLocationDescription = useArtistStore((s) => s.updateLocationDescription)
  const updateLocationAppearanceDescription = useArtistStore((s) => s.updateLocationAppearanceDescription)
  const renameLocationAppearance = useArtistStore((s) => s.renameLocationAppearance)
  const deleteLocationAppearance = useArtistStore((s) => s.deleteLocationAppearance)
  const selectLocationCandidate = useArtistStore((s) => s.selectLocationCandidate)
  const retryWorldShotSafe = useArtistStore((s) => s.retryWorldShotSafe)
  const variantKey = appearanceKeyProp && appearanceKeyProp !== DEFAULT_LOCATION_APPEARANCE_KEY ? appearanceKeyProp : null
  const failure = useArtistStore((s) => (locationId ? s.worldFailures[worldFailureKey(locationId, variantKey)] : undefined))
  const isGenerating = useArtistStore((s) =>
    locationId ? s.generatingLocations.includes(locationId) : false,
  )

  // 설명(원천) 편집 — 대상 전환 시 초기화. 캐릭터 팝업의 외형 프롬프트와 같은 계약.
  const [description, setDescription] = useState('')
  const [descriptionKey, setDescriptionKey] = useState<string | null>(null)
  // 변형 관리(약속 C10): 이름 바꾸기 / 지우기.
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [manageBusy, setManageBusy] = useState(false)
  const [manageError, setManageError] = useState<string | null>(null)
  // 이미지 생성 모델 — 배경 기본값은 지금 것(GPT Image 2, 오너 B5). 팝업이 열려 있는 동안 마지막 선택을 기억.
  const [imageModel, setImageModel] = useState<ImageModelKey>(DEFAULT_WORLD_IMAGE_MODEL)

  const generate = useGuardedAction({
    actionKey: `artist:world:${locationId}:${shot}`,
    stage: 'artist',
    label: t('Background image'),
    busy: isGenerating,
    action: async () => {
      if (!world || !shot) return
      // 설명을 고쳤으면 원천에 먼저 저장한다 — 닫았다 열어도 남고 Writer 씬도 같은 설명을 읽는다.
      const next = description.trim()
      const variant = variantKey ? world.appearances?.find((a) => a.appearanceKey === variantKey) ?? null : null
      const base = variant ? worldDescriptionDraft(variant) : worldDescriptionDraft(world)
      if (next && next !== base) {
        if (variantKey) await updateLocationAppearanceDescription(world.locationId, variantKey, next)
        else await updateLocationDescription(world.locationId, next)
      }
      await generateWorldShot(world.locationId, shot, undefined, 'ui', imageModel, { appearanceKey: variantKey })
    },
  })
  const safeRetry = useGuardedAction({
    actionKey: `artist:world-safe:${locationId}:${shot}`,
    stage: 'artist',
    label: t('Background image (bypass retry)'),
    busy: isGenerating,
    action: async () => {
      if (!world) return
      await retryWorldShotSafe(world.locationId, imageModel, variantKey)
    },
  })

  const open = !!locationId && !!shot
  if (!open || !world || !shot) return null

  const variant = variantKey ? world.appearances?.find((a) => a.appearanceKey === variantKey) ?? null : null
  if (variantKey && !variant) return null
  const key = `${locationId}:${shot}:${variantKey ?? 'default'}`
  if (descriptionKey !== key) {
    setDescriptionKey(key)
    setDescription(variant ? worldDescriptionDraft(variant) : worldDescriptionDraft(world))
  }

  const imageUrl = variant ? variant.wideShot : (world[shot] ?? null)
  const candidates = variant ? variant.candidates : (world.candidates ?? [])
  const selectedCandidate = candidates.find((c) => c.isSelected)
  const staleClass = classifyWorldImageStale(variant ? variant.visualDescription : world.visualDescription, selectedCandidate)
  const capReached = (failure?.safeFailCount ?? 0) >= SAFE_RETRY_CAP
  const timeLabel = (time: string | null) => (time === 'past' ? t('Past') : time === 'future' ? t('Future') : time === 'present' ? t('Present') : '')

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto scrollbar-thin sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-sm">{variant ? `${world.name} · ${variant.label}` : world.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* 모습 관리(약속 C10) — 변형만: 이름 바꾸기 / 지우기. 기본 모습은 배경 자체라 지우지 않는다. */}
          {variant && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
              {renaming ? (
                <>
                  <Input value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} className="h-7 max-w-[200px] text-xs" aria-label={t('Appearance name')} />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={manageBusy || !renameDraft.trim()}
                    onClick={async () => {
                      setManageBusy(true)
                      setManageError(null)
                      try {
                        await renameLocationAppearance(world.locationId, variant.appearanceKey, renameDraft.trim())
                        setRenaming(false)
                      } catch (e) {
                        setManageError(e instanceof Error ? e.message : String(e))
                      } finally {
                        setManageBusy(false)
                      }
                    }}
                  >
                    <Check className="size-3.5" /> {t('Save')}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => setRenaming(false)}>{t('Cancel')}</Button>
                </>
              ) : (
                <>
                  <span className="font-medium">{variant.label}</span>
                  <span className="text-muted-foreground">{timeLabel(variant.narrativeTime)}</span>
                  <span className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => { setRenameDraft(variant.label); setRenaming(true) }}>
                      <Pencil className="size-3.5" /> {t('Rename')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-destructive"
                      disabled={manageBusy}
                      onClick={async () => {
                        if (!window.confirm(t('Delete the appearance "{label}"? Its images are removed from the history too.', { label: variant.label }))) return
                        setManageBusy(true)
                        setManageError(null)
                        try {
                          await deleteLocationAppearance(world.locationId, variant.appearanceKey)
                          onClose()
                        } catch (e) {
                          setManageError(e instanceof Error ? e.message : String(e))
                        } finally {
                          setManageBusy(false)
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" /> {t('Delete')}
                    </Button>
                  </span>
                </>
              )}
              {manageError && <p className="w-full text-destructive">{manageError}</p>}
            </div>
          )}

          {staleClass !== 'fresh' && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <RefreshCw className="size-3.5 shrink-0" />
              {t('The description changed. Regenerating will apply the new description')}
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

          <ImagePlaceholder label="" aspectRatio="video" imageUrl={imageUrl} generating={isGenerating} />

          <p className="text-xs text-muted-foreground">
            {t('This is the background image. Edit the description below and regenerate to apply it.')}
          </p>

          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              {t('Background description (edit, then regenerate)')}
            </label>
            <HoverBeam>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder={t("This background's description")}
              />
            </HoverBeam>
          </div>

          {/* 후보 히스토리(약속 B4) — finalize 가 슬롯당 최근 5장을 보관하므로 직전 이미지로 되돌릴 수 있다. */}
          {candidates.length >= 2 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('History')}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {candidates.map((cand) => {
                  const candClass = classifyWorldImageStale(variant ? variant.visualDescription : world.visualDescription, cand)
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => void selectLocationCandidate(world.locationId, cand.id, variantKey)}
                      className={cn(
                        'relative shrink-0 overflow-hidden rounded-md border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        cand.isSelected ? 'border-primary' : 'border-transparent hover:border-border',
                      )}
                      style={{ width: 96, height: 54 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cand.url} alt={t('Candidate image')} className="size-full object-cover" />
                      {candClass !== 'fresh' && (
                        <span className="absolute bottom-0 left-0 right-0 bg-amber-500/80 px-0.5 py-px text-center text-[9px] leading-tight text-white">
                          {t('Pre-change')}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

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
          </div>

          <Button className="w-full" disabled={generate.locked || !description.trim()} onClick={generate.run}>
            {generate.locked ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('Generating…')}
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {imageUrl ? t('Regenerate image') : t('Generate image')}
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
