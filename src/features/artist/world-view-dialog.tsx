'use client'

import { useEffect, useState } from 'react'
import { useAiBusyHold } from '@/hooks/use-ai-busy-hold'
import { AlertTriangle, ArrowLeft, Check, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ThumbImage } from '@/components/thumb-image'
import { AiBusyOverlay } from '@/components/ai-busy-overlay'
import { useGuardedAction } from '@/hooks/use-guarded-action'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { DescriptionBox, DetailFrame, DetailSection, HistoryButton, RegenerateDialog, artistDetailTitleKey } from '@/features/artist/detail-parts'
import { useArtistStore, worldFailureKey, type WorldShotKey } from '@/stores/artist-store'
import { useWriterStore } from '@/stores/writer-store'
import { useProducerStore } from '@/stores/producer-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { DEFAULT_LOCATION_APPEARANCE_KEY } from '@/types/asset'
import {
  DEFAULT_WORLD_IMAGE_MODEL,
  IMAGE_MODELS,
  IMAGE_MODEL_ORDER,
  type ImageModelKey,
} from '@/lib/image-models'
import { classifyWorldImageStale } from '@/lib/image-provenance'
import { SAFE_RETRY_CAP } from '@/lib/artist/safe-retry'
import { sceneShotLabel } from '@/lib/writer/shot-edit'
import { cn } from '@/lib/utils'
import { useLocale, useT } from '@/lib/i18n'
import { styleAnchorName } from '@/lib/style-anchor-name'
import { useHistoryStyle } from '@/features/artist-room/use-history-style'

type Props = {
  locationId: string | null
  shot: WorldShotKey | null
  /** 배경 모습(약속 C10) — 없거나 'default' 면 기본 모습(locations 행). */
  appearanceKey?: string | null
  onClose: () => void
  /** "+ 모습 추가하기" — 카드의 배경 모습 추가 창(약속 C10)을 연다. */
  onAddAppearance?: (locationId: string) => void
}

/** 팝업 텍스트 상자의 초기값 — 배경 설명(원천). 유저 언어 원문이 있으면 그것, 없으면 영어 base. */
export function worldDescriptionDraft(world: { visualDescriptionNative?: string | null; visualDescription?: string | null } | null | undefined): string {
  return world?.visualDescriptionNative || world?.visualDescription || ''
}

/**
 * 배경 상세 팝업(프로토타입 A7 배경판, 2026-10-20 오너 "HTML 확인해서 팝업 수정") — 인물 상세와 같은 두 칸.
 *   왼쪽: 모습 이름 · 기준 · 바뀜 · 기록(시계) · [↻ 다시 만들기] / 큰 그림. 오른쪽: 설명(✎ 고치고 [적용] = 원천에 바로 저장, Writer 씬도
 *   같은 설명을 읽는다) · 모습 목록(약속 C10, 우리 기능) · 쓰인 샷. [↻ 다시 만들기]는 확인 창(공간의 성격 추천 · 이미지 생성 도구)을 거친다.
 *   약속 B(2026-09-04): 캐릭터 팝업과 같은 기능 — 후보 히스토리(최근 5장) 되돌리기, 모델 선택, 실패 표시, 우회(safe) 재시도.
 */
export function WorldViewDialog({ locationId, shot, appearanceKey: appearanceKeyProp, onClose, onAddAppearance }: Props) {
  const t = useT()
  // 기록(시계)은 지금 작품 스타일 그림만 불러온다 — 다른 스타일 버전 그림은 꺼 두고 어느 버전인지 보인다(2026-10-28).
  const historyStyle = useHistoryStyle()
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
  const shots = useWriterStore((s) => s.shots)
  const sceneManifest = useWriterStore((s) => s.sceneManifest)
  // 스타일 이름은 화면 언어로(2026-10-21). 직접 올린 그림체는 붙인 이름 그대로.
  const locale = useLocale()
  const styleLabel = useProducerStore((s) => {
    if (s.customStyleAnchor) return s.customStyleAnchor.label
    const anchor = s.styleAnchors.find((item) => item.key === s.styleAnchorKey)
    return anchor ? styleAnchorName(anchor, locale) : null
  })

  // 팝업 안에서 다른 모습으로 옮겨 볼 수 있다(모습 목록 [보기]) — 카드가 연 모습에서 시작한다. null = 카드가 연 모습, { key: null } = 기본 모습.
  const [viewing, setViewing] = useState<{ key: string | null } | null>(null)
  // 다시 만들기 창의 설명 — 대상 전환 시 초기화. 캐릭터 팝업과 같은 계약.
  const [description, setDescription] = useState('')
  const [descriptionKey, setDescriptionKey] = useState<string | null>(null)
  // 변형 관리(약속 C10): 이름 바꾸기 / 지우기.
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [manageBusy, setManageBusy] = useState(false)
  const [manageError, setManageError] = useState<string | null>(null)
  // 이미지 생성 모델 — 배경 기본값은 지금 것(GPT Image 2, 오너 B5). 팝업이 열려 있는 동안 마지막 선택을 기억.
  const [imageModel, setImageModel] = useState<ImageModelKey>(DEFAULT_WORLD_IMAGE_MODEL)
  const [regenOpen, setRegenOpen] = useState(false)
  const [redrawing, setRedrawing] = useState(false)

  // 카드가 연 대상(배경 × 모습)이 바뀌거나 팝업을 닫으면 팝업 안에서 옮겨 본 모습 · 이름 고치기 · 안내 · 확인 창을 버린다(검토 지적).
  const target = locationId && shot ? `${locationId}:${shot}:${appearanceKeyProp ?? DEFAULT_LOCATION_APPEARANCE_KEY}` : null
  const [seenTarget, setSeenTarget] = useState<string | null>(null)
  if (seenTarget !== target) {
    setSeenTarget(target)
    setViewing(null)
    setRenaming(false)
    setRenameDraft('')
    setManageError(null)
    setRegenOpen(false)
  }
  const viewedKey = viewing ? viewing.key : appearanceKeyProp ?? null
  const requestedVariant = viewedKey && viewedKey !== DEFAULT_LOCATION_APPEARANCE_KEY ? viewedKey : null
  // 지운 모습을 가리키면 기본 모습을 보인다 — 팝업이 닫혔다 다시 열리며 깜빡이지 않게.
  const variantKey = requestedVariant && world?.appearances?.some((item) => item.appearanceKey === requestedVariant) ? requestedVariant : null
  const showLook = (key: string | null) => {
    setViewing({ key })
    setRenaming(false)
    setManageError(null)
  }
  const failure = useArtistStore((s) => (locationId ? s.worldFailures[worldFailureKey(locationId, variantKey)] : undefined))
  const isGenerating = useArtistStore((s) =>
    locationId ? s.generatingLocations.includes(worldFailureKey(locationId, variantKey)) : false,
  )

  const open = !!locationId && !!shot
  useEffect(() => {
    // 쓰인 샷을 보이려면 Storyboard 샷 목록이 필요하다 — 팝업을 열 때 한 번 읽는다.
    if (open) void useWriterStore.getState().loadProject()
  }, [open])

  // 그림 만들기 — 설명을 고쳤으면 원천에 먼저 저장한다(닫았다 열어도 남고 Writer 씬도 같은 설명을 읽는다). 그림이 다 될 때까지 기다린다.
  //   text = 그릴 설명. 아래 [다시 만들기](바뀐 설명 안내)는 저장된 설명을 넘긴다 — 창에 남은 옛 글로 방금 적용한 설명을 되돌리지 않게(검토 지적).
  const runGenerate = async (text: string) => {
    if (!world || !shot) return
    const next = text.trim()
    const variant = variantKey ? world.appearances?.find((a) => a.appearanceKey === variantKey) ?? null : null
    const base = variant ? worldDescriptionDraft(variant) : worldDescriptionDraft(world)
    if (next && next !== base) {
      if (variantKey) await updateLocationAppearanceDescription(world.locationId, variantKey, next)
      else await updateLocationDescription(world.locationId, next)
    }
    await generateWorldShot(world.locationId, shot, undefined, 'ui', imageModel, { appearanceKey: variantKey })
  }
  const generate = useGuardedAction({
    actionKey: `artist:world:${locationId}:${variantKey ?? 'default'}:${shot}`,
    stage: 'artist',
    label: t('Background image'),
    busy: isGenerating,
    action: () => runGenerate(description),
  })
  const safeRetry = useGuardedAction({
    actionKey: `artist:world-safe:${locationId}:${variantKey ?? 'default'}:${shot}`,
    stage: 'artist',
    label: t('Background image (softer prompt retry)'),
    busy: isGenerating,
    action: async () => {
      if (!world) return
      await retryWorldShotSafe(world.locationId, imageModel, variantKey)
    },
  })
  // 창이 열려 있고 순한 문장으로 다시 그리는 동안 왼쪽 사이드바도 막는다 — 단추 안 원만 돌아 Alt 단축키로 단계를 옮길 수 있었다(2026-10-27).
  //   닫힌 창은 막지 않는다(locked 는 그 그림을 그리는 중이기만 해도 참이다 — 뒤에서 그리는 그림 때문에 사이드바가 잠기면 안 된다).
  useAiBusyHold(open && safeRetry.locked)

  if (!open || !world || !shot) return null

  const variant = variantKey ? world.appearances?.find((a) => a.appearanceKey === variantKey) ?? null : null
  if (variantKey && !variant) return null
  // 저장된 설명이 바뀌면(✎ [적용]) 창의 설명도 새로 맞춘다 — 인물 팝업처럼 키에 저장된 글을 넣는다(검토 지적).
  const savedDescription = variant ? worldDescriptionDraft(variant) : worldDescriptionDraft(world)
  const key = `${locationId}:${shot}:${variantKey ?? 'default'}:${savedDescription}`
  if (descriptionKey !== key) {
    setDescriptionKey(key)
    setDescription(savedDescription)
  }

  const imageUrl = variant ? variant.wideShot : (world[shot] ?? null)
  const candidates = variant ? variant.candidates : (world.candidates ?? [])
  const hasHistory = candidates.length >= 2
  const selectedCandidate = candidates.find((c) => c.isSelected)
  const staleClass = classifyWorldImageStale(variant ? variant.visualDescription : world.visualDescription, selectedCandidate)
  const descriptionChanged = !!imageUrl && staleClass !== 'fresh'
  const capReached = (failure?.safeFailCount ?? 0) >= SAFE_RETRY_CAP
  const timeLabel = (time: string | null) => (time === 'past' ? t('Past') : time === 'future' ? t('Future') : time === 'present' ? t('Present') : '')
  const lookLabel = variant ? variant.label : t('Default')

  const sceneIds = new Set((sceneManifest?.scenes ?? []).filter((scene) => scene.location === world.locationId).map((scene) => scene.sceneId))
  const usedLabels = shots.filter((item) => sceneIds.has(item.sceneId)).map((item) => sceneShotLabel(sceneManifest, shots, item.shotId)).filter((value): value is string => !!value)

  // 다시 만들기 창은 늘 저장된 설명에서 시작한다(앞에서 쓰다 취소한 글이 남지 않게).
  const openRegenerate = () => {
    setDescription(savedDescription)
    setRegenOpen(true)
  }
  // 다시 만들기 — 그림이 다 될 때까지(실패해도 끝날 때까지) 화면 전체를 잠근다(프로토타입 A8).
  const redraw = async (text: string) => {
    setRegenOpen(false)
    setRedrawing(true)
    try {
      await runGenerate(text)
    } catch (err) {
      useGlobalChatStore.getState().notifyActionError('artist', t('Background image'), err instanceof Error ? err.message : String(err))
    } finally {
      setRedrawing(false)
    }
  }

  const left = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {variant && renaming ? (
          <>
            <Input value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} className="h-8 max-w-[220px] text-sm" aria-label={t('Appearance name')} />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
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
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setRenaming(false)}>{t('Cancel')}</Button>
          </>
        ) : (
          <>
            <span className="text-sm font-semibold">{lookLabel}</span>
            {!variant ? <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{t('Base')}</span> : null}
            {variant ? <span className="text-xs text-muted-foreground">{timeLabel(variant.narrativeTime)}</span> : null}
            {descriptionChanged ? <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{t('Changed · remake to apply')}</span> : null}
            {variant ? (
              <Button size="icon" variant="ghost" className="size-7" aria-label={t('Rename')} title={t('Rename')} onClick={() => { setRenameDraft(variant.label); setRenaming(true) }}>
                <Pencil className="size-3.5" />
              </Button>
            ) : null}
            <span className="ml-auto flex items-center gap-1">
              <HistoryButton candidates={hasHistory ? candidates : []} onPick={(id) => void selectLocationCandidate(world.locationId, id, variantKey)} describe={historyStyle.describe} hint={historyStyle.hint} />
              <Button size="sm" variant="outline" disabled={generate.locked} onClick={openRegenerate} data-testid="detail-regenerate-open">
                {generate.locked ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                {imageUrl ? t('Remake') : t('Make the image')}
              </Button>
            </span>
          </>
        )}
      </div>
      {manageError ? <p className="text-xs text-destructive">{manageError}</p> : null}

      <ImagePlaceholder label="" aspectRatio="video" imageUrl={imageUrl} generating={isGenerating} />

      {variant ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => showLook(null)}>
            <ArrowLeft className="size-3.5" />{t('Back to the base look')}
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {styleLabel ? t('Background image · style {style}', { style: styleLabel }) : t('Background image')}
      </p>

      {failure ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>
            {failure.moderation
              ? t('Generation was declined by content policy. You can retry below with "Retry with a softer prompt."')
              : t('Generation failed. Please try again.')}
          </span>
        </div>
      ) : null}
      {failure?.moderation ? (
        <Button variant="outline" disabled={safeRetry.locked || capReached} onClick={safeRetry.run}>
          {safeRetry.locked ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {capReached ? t('Softer prompt retry limit reached') : t('Retry with a softer prompt')}
        </Button>
      ) : null}
    </>
  )

  const right = (
    <>
      <DetailSection title={t('Look description')}>
        {variant ? (
          <DescriptionBox caption={t('Base look · {label}', { label: t('Default') })} value={worldDescriptionDraft(world)} readOnly />
        ) : null}
        <DescriptionBox
          key={`${world.locationId}:${variantKey ?? 'default'}`}
          caption={variant ? t('Changed look · {label}', { label: variant.label }) : t('Base look · background')}
          value={savedDescription}
          placeholder={t("This background's description")}
          changed={descriptionChanged}
          onApply={async (next) => {
            if (variant) await updateLocationAppearanceDescription(world.locationId, variant.appearanceKey, next)
            else await updateLocationDescription(world.locationId, next)
          }}
          testId="detail-description"
        />
      </DetailSection>

      <DetailSection title={t('Looks')} hint={t('{count} · click View to see it large on the left', { count: 1 + (world.appearances?.length ?? 0) })} testId="detail-looks">
        <ul className="flex flex-col gap-2">
          {[{ appearanceKey: null as string | null, label: t('Default'), wideShot: world.wideShot, text: worldDescriptionDraft(world) }, ...(world.appearances ?? []).map((item) => ({ appearanceKey: item.appearanceKey as string | null, label: item.label, wideShot: item.wideShot, text: worldDescriptionDraft(item) }))].map((look) => {
            const viewingThis = (look.appearanceKey ?? null) === variantKey
            return (
              <li key={look.appearanceKey ?? 'default'} className={cn('flex items-center gap-3 rounded-lg border border-border p-2', viewingThis && 'bg-accent/40')}>
                <div className="h-12 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40">
                  {look.wideShot ? <ThumbImage src={look.wideShot} alt={look.label} className="size-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {look.label}
                    {look.appearanceKey === null ? <span className="rounded-full border border-border px-1.5 text-[10px] font-normal text-muted-foreground">{t('Base')}</span> : null}
                    {!look.wideShot ? <span className="rounded-full border border-border px-1.5 text-[10px] font-normal text-muted-foreground">{t('No image')}</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{look.text}</p>
                </div>
                {viewingThis ? (
                  <span className="shrink-0 text-xs text-muted-foreground">{t('Viewing')}</span>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => showLook(look.appearanceKey)}>{t('View')}</Button>
                )}
              </li>
            )
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          {onAddAppearance ? (
            <Button size="sm" variant="outline" onClick={() => onAddAppearance(world.locationId)}>
              <Plus className="size-3.5" />{t('Add a look')}
            </Button>
          ) : null}
          {variant ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={manageBusy}
              onClick={async () => {
                if (!window.confirm(t('Delete the appearance "{label}"? Its images are removed from the history too.', { label: variant.label }))) return
                setManageBusy(true)
                setManageError(null)
                try {
                  await deleteLocationAppearance(world.locationId, variant.appearanceKey)
                  // 팝업은 닫지 않는다 — 지운 것은 보던 모습이라 기본 모습을 보인다(검토 지적).
                  showLook(null)
                } catch (e) {
                  setManageError(e instanceof Error ? e.message : String(e))
                } finally {
                  setManageBusy(false)
                }
              }}
            >
              <Trash2 className="size-3.5" /> {t('Delete this look')}
            </Button>
          ) : null}
        </div>
      </DetailSection>

      <DetailSection title={t('Used in shots')} hint={shots.length ? undefined : t('It shows once Storyboard splits the shots')} testId="detail-used-shots">
        {shots.length === 0 ? null : usedLabels.length ? (
          <div className="flex flex-wrap gap-1.5">
            {usedLabels.map((value) => <span key={value} className="rounded-md border border-border px-2 py-0.5 font-mono text-xs">{value}</span>)}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('Not used in any shot yet')}</p>
        )}
      </DetailSection>
    </>
  )

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-end gap-3">
      {descriptionChanged ? (
        <p className="mr-auto text-xs text-muted-foreground">{t('Changed description · {label}. Remake it to apply it to the image.', { label: lookLabel })}</p>
      ) : null}
      {descriptionChanged ? (
        <Button variant="outline" disabled={generate.locked} onClick={() => void redraw(savedDescription)}>
          <RefreshCw className="size-4" />{t('Remake')}
        </Button>
      ) : null}
      <Button onClick={onClose} disabled={redrawing}>{t('Close')}</Button>
    </div>
  )

  return (
    <>
      <DetailFrame open={open} onClose={onClose} title={t(artistDetailTitleKey('background'), { name: world.name })} left={left} right={right} footer={footer} busy={redrawing} testId="artist-detail" />
      <RegenerateDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title={imageUrl ? t('{name} · {look}: make it again?', { name: world.name, look: lookLabel }) : t('{name} · {look}: make it?', { name: world.name, look: lookLabel })}
        intro={styleLabel ? t('It is made from the description below. The style ({style}) stays the same.', { style: styleLabel }) : t('It is made from the description below. The style stays the same.')}
        kind="background"
        description={description}
        onDescriptionChange={setDescription}
        modelPicker={
          <Select value={imageModel} onValueChange={(value) => setImageModel(value as ImageModelKey)}>
            <SelectTrigger className="w-full" aria-label={t('Image generation tool')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {IMAGE_MODEL_ORDER.map((modelKey) => {
                const spec = IMAGE_MODELS[modelKey]
                return (
                  <SelectItem key={modelKey} value={modelKey}>
                    {spec.label}
                    <span className="text-muted-foreground"> · {t(spec.description)}{spec.pricePerImage != null ? ` · $${spec.pricePerImage}` : ''}</span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        }
        notes={<p className="text-xs text-muted-foreground">{t('The earlier image stays in the history (clock).')}</p>}
        confirmLabel={imageUrl ? t('Remake') : t('Make the image')}
        busy={generate.locked}
        onConfirm={() => void redraw(description)}
      />
      <AiBusyOverlay open={redrawing} layer="dialog" title={t('Making the image')} description={t('{name} · {look}', { name: world.name, look: lookLabel })} />
    </>
  )
}
