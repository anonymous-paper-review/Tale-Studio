'use client'

// Artist [재생성하기] 창(2026-10-28 오너, 프로토타입 A6) "어떤 스타일로 다시 만들까요?" — 같은 스타일로도 다른 스타일로도 다시 만든다.
//   지금 버전은 기록에 남는다. 스타일 격자는 처음 만드는 창(A2)의 것을 그대로 쓴다(내 그림체 올리기 없음 — 이미 올린 내 그림체 카드는 그대로 보인다).
//   내 그림체를 쓰는 동안 다른 스타일은 고를 수 없다 — ✕로 내리면 고를 수 있고, 내 그림체는 지금 버전 기록에 남는다(혼자 정한 것).
//   고른 스타일로 만든 이전 버전이 있으면 다시 만들지 않고 불러오는 길을 보인다. [다시 만들기] → artist-version-store.regenerate.
//   요약의 "인물 N · 배경 M"은 서버와 같은 규칙(buildRegenPlan)으로 센다 — 올린 그림(그대로 쓰기) 칸은 그대로 두고 그 장수를 보인다(2026-10-31 오너 결정 C).
import { useState } from 'react'
import { Loader2, Lock, RotateCcw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAiBusyHold } from '@/hooks/use-ai-busy-hold'
import { useLocale, useT } from '@/lib/i18n'
import { fixKoreanParticles } from '@/lib/korean-particles'
import { styleAnchorName } from '@/lib/style-anchor-name'
import { buildRegenPlan, previousVersionWithStyle, regenCounts, regenKeptUploads, regenStyleNote, versionStyleLabel, type RegenPlanInput } from '@/lib/artist/style-versions'
import { StyleGrid } from '@/features/artist-room/style-make-dialog'
import { useArtistStore } from '@/stores/artist-store'
import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

export function RegenerateStyleDialog() {
  const t = useT()
  const locale = useLocale()
  const open = useArtistVersionStore((s) => s.regenDialogOpen)
  const busy = useArtistVersionStore((s) => s.busy)
  const versions = useArtistVersionStore((s) => s.versions)
  const currentN = useArtistVersionStore((s) => s.currentN)
  const projectId = useProjectStore((s) => s.projectId)
  const anchors = useProducerStore((s) => s.styleAnchors)
  const savedKey = useProducerStore((s) => s.styleAnchorKey)
  const custom = useProducerStore((s) => s.customStyleAnchor)
  const styleSetting = useGlobalChatStore((s) => !!projectId && s.styleSettingFor === projectId)
  const characterAssets = useArtistStore((s) => s.characterAssets)
  const worldAssets = useArtistStore((s) => s.worldAssets)
  const planInput: RegenPlanInput = {
    projectId,
    characters: characterAssets.map((c) => ({ characterId: c.characterId, entityType: c.entityType })),
    appearances: characterAssets.flatMap((c) => c.appearances.map((a) => ({ characterId: c.characterId, appearanceKey: a.appearanceKey, isDefault: a.isDefault, sheetUrl: a.sheetUrl }))),
    locations: worldAssets.map((w) => ({ locationId: w.locationId, wideShot: w.wideShot })),
    locationAppearances: worldAssets.flatMap((w) => (w.appearances ?? []).map((a) => ({ locationId: w.locationId, appearanceKey: a.appearanceKey, wideShot: a.wideShot }))),
  }
  const { persons, places } = regenCounts(buildRegenPlan(planInput))
  const keptUploads = regenKeptUploads(planInput)
  const [picked, setPicked] = useState<string | null>(savedKey)
  // ✕ — 이번 재생성에서 내 그림체를 쓰지 않는다(지우지 않는다: 지금 버전 기록에 남는다).
  const [dropCustom, setDropCustom] = useState(false)
  useAiBusyHold(open && busy !== null)

  // 열 때마다 지금 작품 스타일에서 시작한다(렌더 중 맞춤 — set-state-in-effect 회피).
  const [openedWith, setOpenedWith] = useState<boolean>(open)
  if (open !== openedWith) {
    setOpenedWith(open)
    if (open) {
      setPicked(savedKey)
      setDropCustom(false)
    }
  }

  const keptCustom = custom && !dropCustom ? custom : null
  const chosenKey = keptCustom ? savedKey : picked
  const currentLabel = versionStyleLabel({ styleKey: savedKey, customStyle: custom }, anchors, locale)
  const chosenAnchor = anchors.find((anchor) => anchor.key === chosenKey)
  const chosenLabel = keptCustom ? keptCustom.label : chosenAnchor ? styleAnchorName(chosenAnchor, locale) : null
  const earlier = chosenKey ? previousVersionWithStyle(versions, chosenKey) : null
  const earlierView = earlier ? versions.find((version) => version.n === earlier.n) ?? null : null
  const canRemake = !busy && !styleSetting && !!chosenKey
  const close = () => { if (!busy) useArtistVersionStore.getState().closeRegenerate() }

  const remake = async () => {
    if (!canRemake || !chosenKey) return
    if (!(await useArtistVersionStore.getState().regenerate(chosenKey))) {
      toast.error(useArtistVersionStore.getState().lastError ?? t('Could not start the regeneration. Please try again.'))
    }
  }
  const loadEarlier = async () => {
    if (!earlier || busy) return
    if (!(await useArtistVersionStore.getState().loadVersion(earlier.n))) {
      toast.error(useArtistVersionStore.getState().lastError ?? t('Could not load the version. Please try again.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
      <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-2xl" showCloseButton={!busy} data-testid="artist-regen-dialog">
        <DialogHeader>
          <DialogTitle>{t('Which style should we remake it in?')}</DialogTitle>
          <DialogDescription>
            {t('You can remake it in the same style or pick another one. The current version (v{n} · {style}) stays in the history, so you can load it any time.', { n: currentN, style: currentLabel })}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto py-1">
          {keptCustom ? (
            <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                {keptCustom.locked ? <>{t('The art style is fixed to the picture you uploaded.')}{' '}</> : null}
                <span className="text-muted-foreground">{t('To remake it in another style, press ✕ on my art style. It stays in the current version in the history.')}</span>
              </span>
            </p>
          ) : null}
          <StyleGrid
            anchors={anchors}
            picked={chosenKey}
            onPick={setPicked}
            custom={keptCustom}
            locked={false}
            styleSetting={styleSetting}
            removing={false}
            busy={busy !== null}
            onRemoveCustom={() => { setDropCustom(true); setPicked(null) }}
            prevStyleId={null}
            prevIsCustom={false}
            currentKey={custom ? (keptCustom ? 'custom' : null) : savedKey}
          />
          {earlier && earlierView ? (
            <p className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm" data-testid="artist-regen-earlier">
              <span className="min-w-0 flex-1">
                {fixKoreanParticles(t('✦ v{n} was made in {style}. You can load it instead of remaking it.', { n: earlier.n, style: versionStyleLabel(earlierView, anchors, locale) }), [versionStyleLabel(earlierView, anchors, locale)])}
              </span>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void loadEarlier()} data-testid="artist-regen-load-earlier">
                {busy === 'load' ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                {t('Load v{n}', { n: earlier.n })}
              </Button>
            </p>
          ) : null}
          <dl className="space-y-2 rounded-lg border border-border px-3 py-2.5 text-sm" data-testid="artist-regen-summary">
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">{t('What gets remade')}</dt>
              <dd>
                {t('Characters {persons} · backgrounds {places}, all of them', { persons, places })}
                {keptUploads > 0 ? <span className="block text-muted-foreground" data-testid="artist-regen-kept-uploads">{t('{count} uploaded pictures stay as they are', { count: keptUploads })}</span> : null}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">{t('Style')}</dt>
              <dd>
                {chosenLabel
                  ? regenStyleNote(chosenKey, savedKey) === 'same'
                    ? t('{style} (unchanged)', { style: chosenLabel })
                    : t('{style} · the work style changes to this', { style: chosenLabel })
                  : t('Pick a style')}
              </dd>
            </div>
            <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted-foreground">{t('Estimated credits')}</dt><dd>{t('Images do not use Takes.')}</dd></div>
          </dl>
        </div>
        <DialogFooter className="border-t border-border pt-4">
          <Button variant="outline" onClick={close} disabled={!!busy}>{t('Cancel')}</Button>
          <Button onClick={() => void remake()} disabled={!canRemake} data-testid="artist-regen-go">
            {busy === 'regenerate' ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {t('Remake')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
