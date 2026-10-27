'use client'

import { useEffect, useState } from 'react'
import { useAiBusyHold } from '@/hooks/use-ai-busy-hold'
import { AlertTriangle, ArrowLeft, Check, Loader2, Pencil, Plus, RefreshCw, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ThumbImage } from '@/components/thumb-image'
import { AiBusyOverlay } from '@/components/ai-busy-overlay'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { DescriptionBox, DetailFrame, DetailSection, HistoryButton, RegenerateDialog, artistDetailTitleKey, lookAfterDelete } from '@/features/artist/detail-parts'
import { sameCharacterAppearanceSlot, useArtistStore } from '@/stores/artist-store'
import { useWriterStore } from '@/stores/writer-store'
import { useProducerStore } from '@/stores/producer-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { CHARACTER_VIEW_LABELS, type CharacterViewKey } from '@/types/asset'
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
  IMAGE_MODEL_ORDER,
  imageModelSupportsReference,
  type ImageModelKey,
} from '@/lib/image-models'
import { classifyLookImageStale } from '@/lib/image-provenance'
import { SAFE_RETRY_CAP } from '@/lib/artist/safe-retry'
import { sceneShotLabel } from '@/lib/writer/shot-edit'
import { useGuardedAction } from '@/hooks/use-guarded-action'
import { cn } from '@/lib/utils'
import { useLocale, useT } from '@/lib/i18n'
import { styleAnchorName } from '@/lib/style-anchor-name'

type Props = {
  charId: string | null
  appearanceKey: string | null
  view: CharacterViewKey | null
  onClose: () => void
  /** "+ 모습 추가하기" — 카드의 모습 추가 창(이름 · 시점 · 외형, 약속 C)을 연다. */
  onAddAppearance?: (charId: string) => void
}

/**
 * 인물 상세 팝업(프로토타입 A7, 2026-10-20 오너 "HTML 확인해서 팝업 수정") — 두 칸.
 *   왼쪽: 모습 이름 · 기준 · 바뀜 · 기록(시계) · [↻ 다시 만들기] / 큰 그림 / 기준 모습으로 · 이 모습을 기준으로.
 *   오른쪽: 설명(✎ 고치고 [적용] = 바로 저장, 그림은 다시 만들기로만) · 모습 목록(보기 · 지우기 · 모습 추가) · 쓰인 샷.
 *   [↻ 다시 만들기]는 확인 창(A7r: 설명 · 캐릭터성 추천 · 이미지 생성 도구)을 거쳐 그리고, 그리는 동안 화면 전체를 잠근다.
 *   모습 이름 바꾸기 · 시점 · 실패 안내 · 부드러운 문구 재시도는 우리 기능이라 남긴다(프로토타입에 없음).
 */
export function CharacterViewDialog({ charId, appearanceKey: appearanceKeyProp, view, onClose, onAddAppearance }: Props) {
  const t = useT()
  const char = useArtistStore((s) =>
    s.characterAssets.find((c) => c.characterId === charId),
  )
  const generateCharacterView = useArtistStore((s) => s.generateCharacterView)
  const updateCharacterAppearance = useArtistStore((s) => s.updateCharacterAppearance)
  const selectCandidate = useArtistStore((s) => s.selectCandidate)
  const renameAppearance = useArtistStore((s) => s.renameAppearance)
  const setDefaultAppearance = useArtistStore((s) => s.setDefaultAppearance)
  const deleteAppearance = useArtistStore((s) => s.deleteAppearance)
  const viewFailures = useArtistStore((s) => s.viewFailures)
  const retryCharacterViewSafe = useArtistStore((s) => s.retryCharacterViewSafe)
  const shots = useWriterStore((s) => s.shots)
  const sceneManifest = useWriterStore((s) => s.sceneManifest)
  // 스타일 이름은 화면 언어로(2026-10-21). 직접 올린 그림체는 붙인 이름 그대로.
  const locale = useLocale()
  const styleLabel = useProducerStore((s) => {
    if (s.customStyleAnchor) return s.customStyleAnchor.label
    const anchor = s.styleAnchors.find((item) => item.key === s.styleAnchorKey)
    return anchor ? styleAnchorName(anchor, locale) : null
  })

  // 팝업 안에서 다른 모습으로 옮겨 볼 수 있다(모습 목록 [보기]) — 카드가 연 모습에서 시작한다.
  const [viewingKey, setViewingKey] = useState<string | null>(null)
  // 다시 만들기 창의 설명(A7r) — 대상(캐릭터 × 모습 × 뷰)이 바뀌면 초기화.
  const [prompt, setPrompt] = useState('')
  const [promptKey, setPromptKey] = useState<string | null>(null)
  // 이미지 생성 모델 선택 — 다이얼로그가 열려 있는 동안 유지(마지막 선택 기억). 기본은 DEFAULT_IMAGE_MODEL.
  const [imageModel, setImageModel] = useState<ImageModelKey>(DEFAULT_IMAGE_MODEL)
  // 모습 관리(약속 C8 2026-09-04): 이름 바꾸기 인라인 입력.
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [manageBusy, setManageBusy] = useState(false)
  const [manageError, setManageError] = useState<string | null>(null)
  const [regenOpen, setRegenOpen] = useState(false)
  // 이 팝업에서 다시 만들기를 눌렀다 — 그리는 동안 화면 전체를 잠근다(프로토타입 A8).
  const [redrawing, setRedrawing] = useState(false)

  // 카드가 연 대상(인물 × 모습 × 뷰)이 바뀌거나 팝업을 닫으면 팝업 안에서 옮겨 본 모습 · 이름 고치기 · 안내 · 확인 창을 버린다
  //   (다른 인물을 열었는데 앞 인물에서 보던 모습 키가 남아 있으면 팝업이 열리지 않거나 다른 모습이 보였다, 검토 지적).
  const target = charId && appearanceKeyProp && view ? `${charId}:${appearanceKeyProp}:${view}` : null
  const [seenTarget, setSeenTarget] = useState<string | null>(null)
  if (seenTarget !== target) {
    setSeenTarget(target)
    setViewingKey(null)
    setRenaming(false)
    setRenameDraft('')
    setManageError(null)
    setRegenOpen(false)
  }
  const requestedKey = viewingKey ?? appearanceKeyProp
  // 지운 모습을 가리키면 기준 모습(없으면 첫 모습)을 보인다 — 팝업이 닫혔다 다시 열리며 깜빡이지 않게.
  const appearanceKey = !char || !requestedKey || char.appearances.some((item) => item.appearanceKey === requestedKey)
    ? requestedKey
    : (char.appearances.find((item) => item.isDefault) ?? char.appearances[0])?.appearanceKey ?? requestedKey
  const showAppearance = (key: string) => {
    setViewingKey(key)
    setRenaming(false)
    setManageError(null)
  }

  const isGenerating = useArtistStore((s) =>
    appearanceKey && view
      ? s.generatingViews.some((slot) => sameCharacterAppearanceSlot(slot, charId ?? '', appearanceKey, view))
      : false,
  )

  const open = !!charId && !!appearanceKey && !!view
  useEffect(() => {
    // 쓰인 샷을 보이려면 Storyboard 샷 목록이 필요하다 — 팝업을 열 때 한 번 읽는다(사물함 30초 신선).
    if (open) void useWriterStore.getState().loadProject()
  }, [open])

  // 클릭 즉시 잠금(#double-fire) — generatingViews 는 sendCharacterPatchNow 왕복 *뒤에* 세워지므로,
  //   느린 서버에서 그 사이 버튼이 열려 있어 두 번째 클릭이 기존 중복 가드까지 통과했다.
  //   아래 훅은 store 상태를 기다리지 않고 클릭 순간 잠그고, busy 가 올라오면 잠금을 넘긴다.
  // 그림 만들기 — 다시 만들기 창에서 고친 설명은 선택한 모습의 원천에 먼저 저장한다. 그림이 다 될 때까지 기다린다.
  //   text = 그릴 설명. 아래 [다시 만들기](바뀐 설명 안내)는 저장된 설명을 넘긴다 — 창에서 쓰다 만 글로 덮어쓰지 않게(검토 지적).
  const runGenerate = async (text: string) => {
    if (!char || !appearanceKey || !view || !appearance) return
    const next = text.trim()
    const base = appearance.appearanceNative || appearance.appearance || ''
    if (view === 'main' && next && next !== base) {
      await updateCharacterAppearance(char.characterId, appearanceKey, next)
    }
    await generateCharacterView(char.characterId, appearanceKey, view, 'ui', undefined, undefined, imageModel)
  }
  const generate = useGuardedAction({
    actionKey: `artist:character:${charId}:${appearanceKey}:${view}`,
    stage: 'artist',
    label: t('Character image'),
    busy: isGenerating,
    action: () => runGenerate(prompt),
  })
  const safeRetry = useGuardedAction({
    actionKey: `artist:character-safe:${charId}:${appearanceKey}:${view}`,
    stage: 'artist',
    label: t('Character image (softer prompt retry)'),
    busy: isGenerating,
    action: async () => {
      if (!char || !appearanceKey || !view) return
      await retryCharacterViewSafe(char.characterId, appearanceKey, view, imageModel)
    },
  })
  // 창이 열려 있고 순한 문장으로 다시 그리는 동안 왼쪽 사이드바도 막는다 — 단추 안 원만 돌아 Alt 단축키로 단계를 옮길 수 있었다(2026-10-27).
  //   닫힌 창은 막지 않는다(locked 는 그 그림을 그리는 중이기만 해도 참이다 — 뒤에서 그리는 그림 때문에 사이드바가 잠기면 안 된다).
  useAiBusyHold(open && safeRetry.locked)

  const appearance = char?.appearances.find((item) => item.appearanceKey === appearanceKey) ?? null
  if (!open || !char || !appearance || !view || !appearanceKey) return null

  const imageUrl = view === 'main' ? appearance.sheetUrl : null
  const label = t(CHARACTER_VIEW_LABELS[view])
  const isObject = char.entityType === 'object'
  // object 캐릭터는 방향뷰 개념 없음 — isDirectional/needsMain 로직 미적용
  const isDirectional = !isObject && view !== 'main'
  const needsMain = isDirectional && !appearance.sheetUrl
  // 사람 main = 와이드 턴어라운드 시트 → 16:9 프레임으로 전체 표시(잘림 방지, #4).
  const isSheet = !isObject && view === 'main'
  const defaultAppearance = char.appearances.find((item) => item.isDefault) ?? null

  const initialPrompt = appearance.appearanceNative || appearance.appearance || ''
  const key = `${charId}:${appearanceKey}:${view}:${initialPrompt}`
  if (promptKey !== key) {
    setPromptKey(key)
    setPrompt(initialPrompt)
  }

  // stale 원인 분류(027): look-pending(룩만 도착) vs edited(외형 변경).
  const candidates = appearance.viewCandidates[view] ?? []
  const selectedCandidate = candidates.find((c) => c.isSelected)
  const staleClass = classifyLookImageStale(appearance.appearance ?? '', [char.lookFingerprint, appearance.lookFingerprint], {
    sourceHash: selectedCandidate?.sourceHash ?? null,
    appearanceHash: selectedCandidate?.appearanceHash ?? null,
  })
  const descriptionChanged = !!imageUrl && staleClass === 'edited'
  // 생성 실패(reload-survivable) — moderation(콘텐츠정책) 이면 우회(safe) 재시도 버튼, cap 도달 시 비활성.
  const failure = charId && appearanceKey ? viewFailures[charId]?.[appearanceKey]?.[view] : undefined
  const capReached = (failure?.safeFailCount ?? 0) >= SAFE_RETRY_CAP

  const usedIn = shots.filter((shot) => shot.characters.includes(char.characterId))
  const usedLabels = usedIn.map((shot) => sceneShotLabel(sceneManifest, shots, shot.shotId)).filter((value): value is string => !!value)

  // 모습 지우기 — 기본 모습은 지우지 못한다(약속 C8). 팝업은 닫지 않는다 — 보던 모습을 지웠으면 기준 모습을 보인다(검토 지적).
  const shownKey = appearanceKey
  const removeLook = async (appearanceKey: string, lookLabel: string) => {
    if (!window.confirm(t('Delete the appearance "{label}"? Its images are removed from the history too.', { label: lookLabel }))) return
    setManageBusy(true)
    setManageError(null)
    try {
      await deleteAppearance(char.characterId, appearanceKey)
      const next = lookAfterDelete({ deleted: appearanceKey, viewing: shownKey, base: defaultAppearance?.appearanceKey ?? null, remaining: char.appearances.map((item) => item.appearanceKey) })
      if (next && next !== shownKey) showAppearance(next)
    } catch (e) {
      setManageError(e instanceof Error ? e.message : String(e))
    } finally {
      setManageBusy(false)
    }
  }
  const makeDefault = async () => {
    setManageBusy(true)
    setManageError(null)
    try {
      await setDefaultAppearance(char.characterId, appearanceKey)
    } catch (e) {
      setManageError(e instanceof Error ? e.message : String(e))
    } finally {
      setManageBusy(false)
    }
  }
  // 다시 만들기 창은 늘 저장된 설명에서 시작한다(앞에서 쓰다 취소한 글이 남지 않게).
  const openRegenerate = () => {
    setPrompt(initialPrompt)
    setRegenOpen(true)
  }
  // 다시 만들기 — 그림이 다 될 때까지(실패해도 끝날 때까지) 화면 전체를 잠근다(프로토타입 A8). 잠금 동안에는 다시 누를 수 없다.
  const redraw = async (text: string) => {
    setRegenOpen(false)
    setRedrawing(true)
    try {
      await runGenerate(text)
    } catch (err) {
      useGlobalChatStore.getState().notifyActionError('artist', t('Character image'), err instanceof Error ? err.message : String(err))
    } finally {
      setRedrawing(false)
    }
  }

  const title = t(artistDetailTitleKey(isObject ? 'object' : 'person'), { name: char.name })
  const timeLabel = appearance.narrativeTime ? t(appearance.narrativeTime === 'past' ? 'Past' : appearance.narrativeTime === 'future' ? 'Future' : 'Present') : ''

  const left = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {renaming ? (
          <>
            <Input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className="h-8 max-w-[220px] text-sm"
              aria-label={t('Appearance name')}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={manageBusy || !renameDraft.trim()}
              onClick={async () => {
                setManageBusy(true)
                setManageError(null)
                try {
                  await renameAppearance(char.characterId, appearanceKey, renameDraft.trim())
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
            <span className="text-sm font-semibold">{isSheet ? appearance.label : label}</span>
            {isSheet && appearance.isDefault ? <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{t('Base')}</span> : null}
            {isSheet && timeLabel && timeLabel !== appearance.label ? <span className="text-xs text-muted-foreground">{timeLabel}</span> : null}
            {descriptionChanged ? <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{t('Changed · remake to apply')}</span> : null}
            {isSheet ? (
              <Button size="icon" variant="ghost" className="size-7" aria-label={t('Rename')} title={t('Rename')} onClick={() => { setRenameDraft(appearance.label); setRenaming(true) }}>
                <Pencil className="size-3.5" />
              </Button>
            ) : null}
            <span className="ml-auto flex items-center gap-1">
              <HistoryButton candidates={candidates} onPick={(id) => selectCandidate(char.characterId, appearanceKey, view, id)} />
              <Button size="sm" variant="outline" disabled={generate.locked || needsMain} onClick={openRegenerate} data-testid="detail-regenerate-open">
                {generate.locked ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                {imageUrl ? t('Remake') : t('Make the image')}
              </Button>
            </span>
          </>
        )}
      </div>
      {manageError ? <p className="text-xs text-destructive">{manageError}</p> : null}

      <ImagePlaceholder
        label={view === 'main' ? '' : label}
        aspectRatio={isSheet ? 'video' : 'square'}
        imageUrl={imageUrl}
        generating={isGenerating}
      />

      {isSheet && !appearance.isDefault ? (
        <div className="flex flex-wrap gap-2">
          {defaultAppearance ? (
            <Button size="sm" variant="ghost" onClick={() => showAppearance(defaultAppearance.appearanceKey)}>
              <ArrowLeft className="size-3.5" />{t('Back to the base look')}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={manageBusy} onClick={() => void makeDefault()}>
            <Star className="size-3.5" />{t('Make this look the base')}
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {isObject
          ? imageUrl
            ? t('Regenerating creates a new image.')
            : t('This generates the image.')
          : view === 'main'
            ? styleLabel ? t('Turnaround sheet · style {style}', { style: styleLabel }) : t('Turnaround sheet')
            : needsMain
              ? t('Directional views are generated from Main. Generate Main first.')
              : t('This view is regenerated based on the Main image.')}
      </p>

      {staleClass === 'look-pending' ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <RefreshCw className="size-3.5 shrink-0" />
          {t('This is a draft from before the final look. Regenerating remakes it in the final art style')}
        </div>
      ) : null}

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
      {view === 'main' ? (
        <DetailSection title={t('Look description')}>
          {!appearance.isDefault && defaultAppearance ? (
            <DescriptionBox
              caption={t('Base look · {label}', { label: defaultAppearance.label })}
              value={defaultAppearance.appearanceNative || defaultAppearance.appearance || ''}
              readOnly
            />
          ) : null}
          <DescriptionBox
            key={`${char.characterId}:${appearanceKey}`}
            caption={appearance.isDefault ? t('Base look · {label}', { label: appearance.label }) : t('Changed look · {label}', { label: appearance.label })}
            value={initialPrompt}
            placeholder={t("This character's appearance description")}
            changed={descriptionChanged}
            onApply={(next) => updateCharacterAppearance(char.characterId, appearanceKey, next)}
            testId="detail-description"
          />
        </DetailSection>
      ) : null}

      {isSheet ? (
        <DetailSection title={t('Looks')} hint={t('{count} · click View to see it large on the left', { count: char.appearances.length })} testId="detail-looks">
          <ul className="flex flex-col gap-2">
            {char.appearances.map((look) => {
              const viewingThis = look.appearanceKey === appearanceKey
              return (
                <li key={look.appearanceKey} className={cn('flex items-center gap-3 rounded-lg border border-border p-2', viewingThis && 'bg-accent/40')}>
                  <div className="h-12 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40">
                    {look.sheetUrl ? <ThumbImage src={look.sheetUrl} alt={look.label} className="size-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {look.label}
                      {look.isDefault ? <span className="rounded-full border border-border px-1.5 text-[10px] font-normal text-muted-foreground">{t('Base')}</span> : null}
                      {!look.sheetUrl ? <span className="rounded-full border border-border px-1.5 text-[10px] font-normal text-muted-foreground">{t('No image')}</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{look.appearanceNative || look.appearance || ''}</p>
                  </div>
                  {viewingThis ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{t('Viewing')}</span>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => showAppearance(look.appearanceKey)}>{t('View')}</Button>
                  )}
                  {!look.isDefault ? (
                    <Button size="icon" variant="ghost" className="size-7 shrink-0 text-destructive" disabled={manageBusy} aria-label={t('Delete')} onClick={() => void removeLook(look.appearanceKey, look.label)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {onAddAppearance ? (
            <Button size="sm" variant="outline" className="self-start" onClick={() => onAddAppearance(char.characterId)}>
              <Plus className="size-3.5" />{t('Add a look')}
            </Button>
          ) : null}
        </DetailSection>
      ) : null}

      {/* 사물은 샷의 등장인물에 들지 않는다(Writer 는 사물을 props 로만 저장) — 늘 "안 쓰였어요"로 보여 숨긴다(검토 지적). */}
      {!isObject ? (
        <DetailSection title={t('Used in shots')} hint={shots.length ? undefined : t('It shows once Storyboard splits the shots')} testId="detail-used-shots">
          {shots.length === 0 ? null : usedLabels.length ? (
            <div className="flex flex-wrap gap-1.5">
              {usedLabels.map((value) => <span key={value} className="rounded-md border border-border px-2 py-0.5 font-mono text-xs">{value}</span>)}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('Not used in any shot yet')}</p>
          )}
        </DetailSection>
      ) : null}
    </>
  )

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-end gap-3">
      {descriptionChanged ? (
        <p className="mr-auto text-xs text-muted-foreground">{t('Changed description · {label}. Remake it to apply it to the image.', { label: appearance.label })}</p>
      ) : null}
      {descriptionChanged ? (
        <Button variant="outline" disabled={generate.locked} onClick={() => void redraw(initialPrompt)}>
          <RefreshCw className="size-4" />{t('Remake')}
        </Button>
      ) : null}
      <Button onClick={onClose} disabled={redrawing}>{t('Close')}</Button>
    </div>
  )

  return (
    <>
      <DetailFrame open={open} onClose={onClose} title={title} left={left} right={right} footer={footer} busy={redrawing} testId="artist-detail" />
      <RegenerateDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title={imageUrl ? t('{name} · {look}: make it again?', { name: char.name, look: appearance.label }) : t('{name} · {look}: make it?', { name: char.name, look: appearance.label })}
        intro={styleLabel ? t('It is made from the description below. The style ({style}) stays the same.', { style: styleLabel }) : t('It is made from the description below. The style stays the same.')}
        kind={isObject ? null : 'person'}
        description={prompt}
        onDescriptionChange={setPrompt}
        modelPicker={
          <div className="flex flex-col gap-1.5">
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
            {!isObject && !imageModelSupportsReference(imageModel) ? (
              <p className="text-xs text-muted-foreground">{t('This model has no reference support, so character identity may drift.')}</p>
            ) : null}
          </div>
        }
        notes={<p className="text-xs text-muted-foreground">{t('The earlier image stays in the history (clock).')}</p>}
        confirmLabel={imageUrl ? t('Remake') : t('Make the image')}
        busy={generate.locked}
        onConfirm={() => void redraw(prompt)}
      />
      <AiBusyOverlay open={redrawing} layer="dialog" title={t('Making the image')} description={t('{name} · {look}', { name: char.name, look: appearance.label })} />
    </>
  )
}
