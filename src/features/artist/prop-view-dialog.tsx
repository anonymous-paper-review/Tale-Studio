'use client'

// 소품 그림 창(D7, 2026-11-22) — 인물 · 배경 상세 팝업(프로토타입 A7)과 같은 두 칸 틀(DetailFrame).
//   왼쪽: 큰 그림 · 바뀜 표시 · 바꿀 점(선택) · [다시 그리기] · 실패 안내(정책 거절이면 [순화해서 다시]). 오른쪽: 생김새(✎ 고치기 → 적용) · 나오는 곳.
//   생김새를 고쳐도 그림은 그대로다 — [다시 그리기] 전까지 "설명 바뀜". 그림은 무료(Take 없음). 약속: tests/artist/prop-image.test.ts
//   소품 모습(m1126 A3): 카드에서 고른 모습의 그림 · 설명을 보이고 그 모습을 다시 그린다. [+ 모습 추가] · [이 모습 지우기]는 배경 창과 같다.
import { useRef, useState } from 'react'
import { Loader2, Plus, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { DescriptionBox, DetailFrame, DetailSection } from '@/features/artist/detail-parts'
import { failureBadge, failureNotice } from '@/lib/artist/failure-badge'
import { propImageStale } from '@/lib/artist/prop-image'
import { DEFAULT_PROP_APPEARANCE_KEY, propSlotKey } from '@/lib/artist/props'
import { DEFAULT_LOCATION_APPEARANCE_KEY } from '@/types/asset'
import { SAFE_RETRY_CAP } from '@/lib/artist/safe-retry'
import { BREAKDOWN_IMAGE_ERROR_TEXT } from '@/lib/artist/breakdown-image'
import { addPropImage } from '@/lib/artist/prop-upload'
import { useImageUploadConsent } from '@/components/upload/image-upload-consent'
import { useProjectStore } from '@/stores/project-store'
import { isDemoSession } from '@/lib/demo/context'
import { styleIdOf } from '@/lib/series/snapshot'
import { useT } from '@/lib/i18n'
import { useArtistStore } from '@/stores/artist-store'
import { useProducerStore } from '@/stores/producer-store'
import { VersionViewingBar } from '@/components/version-history/version-viewing-bar'
import { relativeTime } from '@/lib/i18n/relative-time'
import { useHistoryStyle } from '@/features/artist-room/use-history-style'

/** 지금 작품 그림체 id — 소품 그림 지문과 견주어 "그림체 바뀜"을 가린다(서버 styleIdOf 와 같은 값). */
export function usePropStyleId(): string | null {
  const styleKey = useProducerStore((s) => s.styleAnchorKey)
  const customStyle = useProducerStore((s) => s.customStyleAnchor)
  return styleIdOf({ style_anchor_key: styleKey, custom_style_anchor: customStyle })
}

/** 소품 그림의 지금 상태 — 카드와 창이 같은 표시를 쓴다. 카드에서 고른 모습(m1126 A3)이 있으면 그 모습 칸의 그림 · 설명 · 상태. */
export function usePropImageState(propId: string) {
  const prop = useArtistStore((s) => s.propAssets.find((p) => p.propId === propId) ?? null)
  const pickedKey = useArtistStore((s) => s.selectedPropAppearances[propId] ?? DEFAULT_LOCATION_APPEARANCE_KEY)
  const variant = pickedKey !== DEFAULT_LOCATION_APPEARANCE_KEY ? (prop?.appearances ?? []).find((a) => a.appearanceKey === pickedKey) ?? null : null
  const slot = propSlotKey(propId, variant?.appearanceKey)
  const generating = useArtistStore((s) => s.generatingProps.includes(slot))
  const failure = useArtistStore((s) => s.propFailures[slot] ?? null)
  // 보내기 전 내용 검사에 걸렸다(main 2026-11-25, 인물 · 배경과 같다) — 작업 기록이 없어 화면이 기억한 것.
  const contentRefused = useArtistStore((s) => !!s.propContentRefusals[slot])
  const styleId = usePropStyleId()
  const imageUrl = variant ? variant.imageUrl : (prop?.imageUrl ?? null)
  const stale = imageUrl
    ? variant
      ? propImageStale(variant.sourceHash, variant.appearance, styleId)
      : propImageStale(prop?.sourceHash, prop?.appearance, styleId)
    : 'fresh'
  return { prop, variant, imageUrl, generating, failure, contentRefused, stale }
}

function PropDetailLeft({ propId, viewCandidateId = null }: { propId: string; viewCandidateId?: string | null }) {
  const t = useT()
  const { prop, variant, imageUrl, generating, failure, contentRefused, stale } = usePropImageState(propId)
  // 지난 그림 줄(m1126 A4)에서 연 그림 — [지금 그림 보기]로 닫은 그림 · [채택]을 저장하는 중 · 저장 실패. 다른 작품 스타일 판이면 채택할 수 없다(상세 기록과 같은 판정).
  const historyStyle = useHistoryStyle()
  const selectPropCandidate = useArtistStore((s) => s.selectPropCandidate)
  const [dismissedCandidate, setDismissedCandidate] = useState<string | null>(null)
  const [adopting, setAdopting] = useState(false)
  const [adoptError, setAdoptError] = useState<string | null>(null)
  // 배지 · 안내는 인물 · 배경 창과 같은 규칙(lib/artist/failure-badge) — 그린 뒤 거절이면 순화 단추, 보내기 전 거절이면 설명 고치기만.
  const badge = failureBadge({ contentRefused: contentRefused || failure?.moderation === true, failed: !!failure || contentRefused })
  const notice = failureNotice({ failure, contentRefused })
  const [instruction, setInstruction] = useState('')
  // 데모(보기 전용 공유)는 그리지 않는다 — 그림 · 바뀜 표시만 보인다.
  const demo = isDemoSession()
  // 그림 올리기(D7) — 글 목록 레퍼런스 올리기와 같은 순서 · 같은 그림 사용 권리 확인. 올린 그림은 그대로 이 소품의 그림이 된다.
  const projectId = useProjectStore((s) => s.projectId)
  const { requestImageUploadConsent, imageUploadConsentDialog } = useImageUploadConsent(projectId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const onFile = async (file: File) => {
    if (!projectId) return
    setUploadError(null)
    const result = await addPropImage({ projectId, propId }, file, { confirm: requestImageUploadConsent, onBusy: setUploading })
    if (result.status === 'error') setUploadError(t(BREAKDOWN_IMAGE_ERROR_TEXT[result.error]))
  }
  if (!prop) return null
  // 카드가 보이는 모습(그 칸)의 지난 그림 — 카드 그림이 아닌 것. 채택하면 카드 그림이 되어 저절로 사라진다.
  const slotCandidates = variant ? variant.candidates : prop.candidates
  const viewing = viewCandidateId && dismissedCandidate !== viewCandidateId
    ? slotCandidates?.find((c) => c.id === viewCandidateId && c.url !== imageUrl) ?? null
    : null
  const viewingState = viewing ? historyStyle.describe?.(viewing) ?? null : null
  // [채택] — 그 칸의 소품 그림을 고른다(select-prop-candidate, 다시 그리지 않는다). 못 고르면 보던 그림에 남아 까닭을 보인다.
  const adopt = async () => {
    if (!viewing || viewingState?.disabled) return
    setAdopting(true)
    setAdoptError(null)
    try {
      const result = await selectPropCandidate(propId, variant?.appearanceKey ?? DEFAULT_PROP_APPEARANCE_KEY, viewing.id)
      if (!result.ok && result.code !== 'other_style') setAdoptError(t('Could not adopt this version. Please try again.'))
    } catch {
      setAdoptError(t('Could not adopt this version. Please try again.'))
    } finally {
      setAdopting(false)
    }
  }
  const redraw = (safeMode = false) => {
    void useArtistStore.getState().generateProp(propId, 'ui', { instruction, safeMode, ...(variant ? { appearanceKey: variant.appearanceKey } : {}) })
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{variant ? variant.label : t('Prop')}</span>
        {badge ? <Badge variant="destructive" className="text-[10px]">{badge === 'content-check' ? t('Content check') : t('Image failed')}</Badge> : null}
        {stale === 'edited' && !generating ? <Badge variant="outline" className="text-[10px] text-warning">{t('Description changed')}</Badge> : null}
        {stale === 'style' && !generating ? <Badge variant="outline" className="text-[10px] text-warning">{t('Style changed')}</Badge> : null}
      </div>
      <ImagePlaceholder label={t('Prop')} aspectRatio="video" imageUrl={viewing ? viewing.url : imageUrl} generating={viewing ? false : generating} />
      {viewing ? (
        <VersionViewingBar
          text={t('Viewing an earlier picture · {time}', { time: relativeTime(viewing.generatedAt, t) })}
          note={viewingState?.note}
          adoptDisabled={!!viewingState?.disabled}
          adoptReason={viewingState?.disabled ? t('It is in another style, so it cannot be adopted') : null}
          busy={adopting}
          error={adoptError}
          onAdopt={adopt}
          onBack={() => { setAdoptError(null); setDismissedCandidate(viewing.id) }}
          testId="artist-detail-viewing"
          adoptTestId="artist-detail-adopt"
        />
      ) : null}
      {demo ? null : (
        <>
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={2}
            placeholder={t('What to change (optional)')}
            aria-label={t('What to change (optional)')}
            data-testid="prop-detail-instruction"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* 올린 그림은 기본 그림 자리(props 행)에만 들어간다 — 모습 칸을 보는 동안은 숨긴다(m1126 A3, 헷갈림 막기). */}
            {variant ? null : (
              <Button
                size="sm"
                variant="outline"
                disabled={generating || uploading}
                onClick={() => fileRef.current?.click()}
                data-testid="prop-detail-upload"
              >
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {t('Upload a reference image')}
              </Button>
            )}
            {notice === 'content-check-softer' && failure ? (
              <Button
                variant="outline"
                size="sm"
                disabled={generating || failure.safeFailCount >= SAFE_RETRY_CAP}
                onClick={() => redraw(true)}
                data-testid="prop-detail-safe-retry"
              >
                {t('Retry with a softer prompt')}
              </Button>
            ) : null}
            <Button size="sm" disabled={generating} onClick={() => redraw()} data-testid="prop-detail-redraw">
              {generating ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {t(imageUrl ? 'Redraw' : 'Draw')}
            </Button>
          </div>
          {uploadError ? <p className="text-xs text-destructive" role="alert">{uploadError}</p> : null}
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void onFile(file)
            }}
          />
          {imageUploadConsentDialog}
        </>
      )}
      {notice ? (
        <p className="text-xs text-muted-foreground" role="status">
          {notice === 'content-check-softer'
            ? t('This description did not pass the content check, so it was not drawn. Press "Retry with a softer prompt" below, or edit the description and draw again.')
            : notice === 'content-check-edit'
              ? t('This description did not pass the content check, so it was not drawn. Edit the description and draw again.')
              : t('Generation failed. Please try again.')}
        </p>
      ) : null}
    </>
  )
}

function PropDetailRight({ propId, onAddAppearance }: { propId: string; onAddAppearance?: (propId: string) => void }) {
  const t = useT()
  const { prop, variant, stale } = usePropImageState(propId)
  const usage = useArtistStore((s) => s.propUsage[propId] ?? null)
  const [busy, setBusy] = useState(false)
  const [manageError, setManageError] = useState<string | null>(null)
  if (!prop) return null
  const demo = isDemoSession()
  return (
    <>
      <DetailSection title={t('Look description')}>
        {variant ? <DescriptionBox caption={t('Base look · {label}', { label: t('Default') })} value={prop.appearanceNative} readOnly /> : null}
        <DescriptionBox
          key={variant?.appearanceKey ?? 'default'}
          caption={t('It is made from the description below. The style stays the same.')}
          value={variant ? variant.appearanceNative : prop.appearanceNative}
          readOnly={demo}
          changed={stale === 'edited'}
          onApply={(next) =>
            variant
              ? useArtistStore.getState().updatePropAppearanceVariant(propId, variant.appearanceKey, next)
              : useArtistStore.getState().updatePropAppearance(propId, next)
          }
          testId="prop-detail-description"
        />
        {/* 모습 더하기 · 지우기(m1126 A3) — 배경 창과 같은 자리 · 같은 말. 데모는 만들거나 지울 수 없다. */}
        {demo ? null : (
          <div className="mt-2 flex flex-wrap gap-2">
            {onAddAppearance ? (
              <Button size="sm" variant="outline" onClick={() => onAddAppearance(propId)} data-testid="prop-detail-add-appearance">
                <Plus className="size-3.5" />{t('Add a look')}
              </Button>
            ) : null}
            {variant ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                data-testid="prop-detail-delete-appearance"
                onClick={async () => {
                  if (!window.confirm(t('Delete the appearance "{label}"? Its images are removed from the history too.', { label: variant.label }))) return
                  setBusy(true)
                  setManageError(null)
                  try {
                    await useArtistStore.getState().deletePropAppearance(propId, variant.appearanceKey)
                  } catch (e) {
                    setManageError(e instanceof Error ? e.message : String(e))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <Trash2 className="size-3.5" /> {t('Delete this look')}
              </Button>
            ) : null}
          </div>
        )}
        {manageError ? <p className="mt-1 text-xs text-destructive" role="alert">{manageError}</p> : null}
      </DetailSection>
      <DetailSection title={t('Used in shots')}>
        <p className="text-sm text-muted-foreground" data-testid="prop-detail-usage">
          {usage && (usage.shots > 0 || usage.scenes > 0)
            ? t('Appears in: scenes {scenes} · shots {shots}', { scenes: usage.scenes, shots: usage.shots })
            : t('Not in any shot yet')}
        </p>
      </DetailSection>
    </>
  )
}

/** 창의 두 칸을 한 번에 — 화면 테스트(정적 그리기)용. 창은 같은 두 칸을 DetailFrame 에 나눠 싣는다. */
export function PropDetailPanels({ propId, viewCandidateId = null }: { propId: string; viewCandidateId?: string | null }) {
  return (
    <div>
      <PropDetailLeft propId={propId} viewCandidateId={viewCandidateId} />
      <PropDetailRight propId={propId} />
    </div>
  )
}

export function PropViewDialog({ propId, viewCandidateId = null, onClose, onAddAppearance }: {
  propId: string | null
  /** 카드의 지난 그림 줄(m1126 A4)에서 누른 그림 — 그 그림을 먼저 보이고 [채택]을 단다. */
  viewCandidateId?: string | null
  onClose: () => void
  onAddAppearance?: (propId: string) => void
}) {
  const t = useT()
  const prop = useArtistStore((s) => (propId ? s.propAssets.find((p) => p.propId === propId) ?? null : null))
  return (
    <DetailFrame
      open={!!propId && !!prop}
      onClose={onClose}
      title={t('{name} · Prop', { name: prop?.name ?? '' })}
      left={propId ? <PropDetailLeft key={`${propId}:${viewCandidateId ?? ''}`} propId={propId} viewCandidateId={viewCandidateId} /> : null}
      right={propId ? <PropDetailRight propId={propId} onAddAppearance={onAddAppearance} /> : null}
      footer={<Button onClick={onClose}>{t('Close')}</Button>}
      testId="prop-detail"
    />
  )
}
