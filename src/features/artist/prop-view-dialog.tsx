'use client'

// 소품 그림 창(D7, 2026-11-22) — 인물 · 배경 상세 팝업(프로토타입 A7)과 같은 두 칸 틀(DetailFrame).
//   왼쪽: 큰 그림 · 바뀜 표시 · 바꿀 점(선택) · [다시 그리기] · 실패 안내(정책 거절이면 [순화해서 다시]). 오른쪽: 생김새(✎ 고치기 → 적용) · 나오는 곳.
//   생김새를 고쳐도 그림은 그대로다 — [다시 그리기] 전까지 "설명 바뀜". 그림은 무료(Take 없음). 약속: tests/artist/prop-image.test.ts
import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { DescriptionBox, DetailFrame, DetailSection } from '@/features/artist/detail-parts'
import { propImageStale } from '@/lib/artist/prop-image'
import { SAFE_RETRY_CAP } from '@/lib/artist/safe-retry'
import { isDemoSession } from '@/lib/demo/context'
import { styleIdOf } from '@/lib/series/snapshot'
import { useT } from '@/lib/i18n'
import { useArtistStore } from '@/stores/artist-store'
import { useProducerStore } from '@/stores/producer-store'

/** 지금 작품 그림체 id — 소품 그림 지문과 견주어 "그림체 바뀜"을 가린다(서버 styleIdOf 와 같은 값). */
export function usePropStyleId(): string | null {
  const styleKey = useProducerStore((s) => s.styleAnchorKey)
  const customStyle = useProducerStore((s) => s.customStyleAnchor)
  return styleIdOf({ style_anchor_key: styleKey, custom_style_anchor: customStyle })
}

/** 소품 그림의 지금 상태 — 카드와 창이 같은 표시를 쓴다. */
export function usePropImageState(propId: string) {
  const prop = useArtistStore((s) => s.propAssets.find((p) => p.propId === propId) ?? null)
  const generating = useArtistStore((s) => s.generatingProps.includes(propId))
  const failure = useArtistStore((s) => s.propFailures[propId] ?? null)
  const styleId = usePropStyleId()
  const stale = prop?.imageUrl ? propImageStale(prop.sourceHash, prop.appearance, styleId) : 'fresh'
  return { prop, generating, failure, stale }
}

function PropDetailLeft({ propId }: { propId: string }) {
  const t = useT()
  const { prop, generating, failure, stale } = usePropImageState(propId)
  const [instruction, setInstruction] = useState('')
  // 데모(보기 전용 공유)는 그리지 않는다 — 그림 · 바뀜 표시만 보인다.
  const demo = isDemoSession()
  if (!prop) return null
  const redraw = (safeMode = false) => {
    void useArtistStore.getState().generateProp(propId, 'ui', { instruction, safeMode })
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{t('Prop')}</span>
        {failure ? <Badge variant="destructive" className="text-[10px]">{t('Image failed')}</Badge> : null}
        {stale === 'edited' && !generating ? <Badge variant="outline" className="text-[10px] text-warning">{t('Description changed')}</Badge> : null}
        {stale === 'style' && !generating ? <Badge variant="outline" className="text-[10px] text-warning">{t('Style changed')}</Badge> : null}
      </div>
      <ImagePlaceholder label={t('Prop')} aspectRatio="square" imageUrl={prop.imageUrl} generating={generating} />
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
            {failure?.moderation ? (
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
              {t(prop.imageUrl ? 'Redraw' : 'Draw')}
            </Button>
          </div>
        </>
      )}
      {failure ? (
        <p className="text-xs text-muted-foreground" role="status">
          {failure.moderation
            ? t('Generation was declined by content policy. You can retry below with "Retry with a softer prompt."')
            : t('Generation failed. Please try again.')}
        </p>
      ) : null}
    </>
  )
}

function PropDetailRight({ propId }: { propId: string }) {
  const t = useT()
  const { prop, stale } = usePropImageState(propId)
  const usage = useArtistStore((s) => s.propUsage[propId] ?? null)
  if (!prop) return null
  return (
    <>
      <DetailSection title={t('Look description')}>
        <DescriptionBox
          caption={t('It is made from the description below. The style stays the same.')}
          value={prop.appearanceNative}
          readOnly={isDemoSession()}
          changed={stale === 'edited'}
          onApply={(next) => useArtistStore.getState().updatePropAppearance(propId, next)}
          testId="prop-detail-description"
        />
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
export function PropDetailPanels({ propId }: { propId: string }) {
  return (
    <div>
      <PropDetailLeft propId={propId} />
      <PropDetailRight propId={propId} />
    </div>
  )
}

export function PropViewDialog({ propId, onClose }: { propId: string | null; onClose: () => void }) {
  const t = useT()
  const prop = useArtistStore((s) => (propId ? s.propAssets.find((p) => p.propId === propId) ?? null : null))
  return (
    <DetailFrame
      open={!!propId && !!prop}
      onClose={onClose}
      title={t('{name} · Prop', { name: prop?.name ?? '' })}
      left={propId ? <PropDetailLeft key={propId} propId={propId} /> : null}
      right={propId ? <PropDetailRight propId={propId} /> : null}
      footer={<Button onClick={onClose}>{t('Close')}</Button>}
      testId="prop-detail"
    />
  )
}
