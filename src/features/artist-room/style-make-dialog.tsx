'use client'

// Artist 스타일 고르기 · 만들기(리뉴얼 1차 2026-10-19, 프로토타입 A2 "어떤 스타일로 만들까요?").
//   작품 스타일은 하나 — 고른 스타일 · 만드는 것(인물 시트 N · 배경 M) · 예상 크레딧을 보여 주고 [만들기]로 전체를 만든다.
//   [만들기] = 확정 산문 초안을 이어 가며 인물 · 배경 디자인 뒤에 멈추게 한다(artistGate). 그림은 Take 가 들지 않는다(take-cost: Take 는 영상 전용).
//   "내 그림체 올리기" 카드는 2026-10-27 오너 지시로 내렸다("추후 정비해서 다시 올릴거야") — 이미 올린 그림체가 있는 프로젝트는
//   그 그림체 카드와 지우기(✕)만 보인다. 올리기 · 분석 서버 경로와 Writer 채팅의 그림체 첨부는 그대로다.
import { useEffect, useState } from 'react'
import { Check, ImageIcon, Loader2, Lock, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmLumi } from '@/components/handoff/confirm-lumi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ThumbImage } from '@/components/thumb-image'
import { useLocale, useT } from '@/lib/i18n'
import { directionParticle } from '@/lib/korean-particles'
import { styleAnchorName } from '@/lib/style-anchor-name'
import { cn } from '@/lib/utils'
import { breakdownRows, rowsToDraw } from '@/lib/artist/breakdown'
import { useAiBusyHold } from '@/hooks/use-ai-busy-hold'
import { seriesMakeCounts } from '@/features/series/artist-series'
import { useSeriesInfo } from '@/features/series/use-series-info'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore, type StyleAnchor } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

export function StyleMakeDialog({ open, onOpenChange, onStarted }: { open: boolean; onOpenChange: (open: boolean) => void; onStarted: () => void }) {
  const t = useT()
  // 스타일 이름은 화면 언어로(2026-10-21) — DB 이름은 한국어 하나뿐이다.
  const locale = useLocale()
  const projectId = useProjectStore((s) => s.projectId)
  const anchors = useProducerStore((s) => s.styleAnchors)
  const savedKey = useProducerStore((s) => s.styleAnchorKey)
  const custom = useProducerStore((s) => s.customStyleAnchor)
  const cast = useProducerStore((s) => s.cast)
  const backgrounds = useProducerStore((s) => s.backgrounds)
  const styleSetting = useGlobalChatStore((s) => !!projectId && s.styleSettingFor === projectId)
  const [picked, setPicked] = useState<string | null>(savedKey)
  const [making, setMaking] = useState(false)
  const [removing, setRemoving] = useState(false)
  // [만들기]로 디자인 실행을 거는 동안 왼쪽 사이드바도 막는다 — 창이 마우스는 막아도 Alt 단축키는 막지 못했다(2026-10-27).
  useAiBusyHold(making)
  const locked = custom?.locked === true
  // 시리즈 다음 화(2026-10-26): 앞 화 그림체로 시작한다 — style_anchor_key 가 이미 복사돼 있어 아래 picked 가 savedKey(= 앞 화 그림체)에서 시작한다.
  //   그 자리에 "앞 화 그림체" 표시만 붙이고 고를 값은 바꾸지 않는다(올린 그림체가 잠긴 프로젝트는 지금처럼 못 바꾼다).
  const { view: series } = useSeriesInfo(projectId)
  const prevStyleId = series?.styleId ?? null
  const prevIsCustom = !!custom && !!prevStyleId && prevStyleId === savedKey
  // 레퍼런스로 올린 그림은 그대로 쓴다(2026-10-27 오너) — 그리는 수(시리즈면 앞 화 그림 수까지)에서 빼고 아래 칸에 따로 센다.
  const { draw: rows, asIs } = rowsToDraw(breakdownRows(cast, backgrounds))
  const persons = rows.filter((row) => row.kind === 'person').length
  const places = rows.length - persons
  // "만드는 것"은 정말 새로 그리는 수만 센다(2026-10-27 오너 승인) — 앞 화 그림을 그대로 쓰거나 보관하는 것은 아래 칸에 따로 보인다.
  //   그림체는 지금 고른 값으로 본다 — 올린 그림체가 있으면 그것으로 고정된다(savedKey).
  const makeCounts = series ? seriesMakeCounts(rows, series, custom ? savedKey : picked) : null
  const prevImageParts = makeCounts
    ? [
        makeCounts.reuse > 0 ? t('Used as is {count}', { count: makeCounts.reuse }) : null,
        makeCounts.redraw > 0 ? t('Redrawn in this style {count}', { count: makeCounts.redraw }) : null,
        makeCounts.kept > 0 ? t('Kept {count}', { count: makeCounts.kept }) : null,
      ].filter((part): part is string => part !== null)
    : []

  useEffect(() => {
    if (open && anchors.length === 0) void useProducerStore.getState().loadStyleAnchors()
  }, [open, anchors.length])
  // 열 때마다 저장된 스타일에서 시작한다(렌더 중 맞춤 — set-state-in-effect 회피).
  const [openedWith, setOpenedWith] = useState<boolean>(open)
  if (open !== openedWith) {
    setOpenedWith(open)
    if (open) setPicked(savedKey)
  }

  const chosenAnchor = anchors.find((anchor) => anchor.key === picked)
  const chosenLabel = custom ? custom.label : chosenAnchor ? styleAnchorName(chosenAnchor, locale) : null
  const canMake = !making && !styleSetting && (locked || !!custom || !!picked)

  // 올린 내 그림체 지우기(2026-10-27 QA #03 · 오너 "지우기(X) 추가") — 지우면 고정이 풀려 다른 스타일을 고를 수 있다.
  const removeCustom = async () => {
    if (removing || !window.confirm(t('Remove my art style? You can pick another style after removing it.'))) return
    setRemoving(true)
    try {
      if (await useProducerStore.getState().removeCustomStyleAnchor()) setPicked(null)
      else toast.error(useProducerStore.getState().error ?? t('Could not remove my art style. Please try again.'))
    } finally {
      setRemoving(false)
    }
  }

  const make = async () => {
    if (!canMake) return
    setMaking(true)
    try {
      const producer = useProducerStore.getState()
      if (!locked && !producer.customStyleAnchor && picked && picked !== producer.styleAnchorKey) {
        if (!(await producer.setStyleAnchor(picked))) {
          toast.error(useProducerStore.getState().error ?? t('Could not save the style. Please try again.'))
          return
        }
      }
      const ok = await useProducerStore.getState().saveAndHandoff({ artistGate: true })
      if (!ok) {
        toast.error(useProducerStore.getState().error ?? t('Could not start making the images. Please try again.'))
        return
      }
      onOpenChange(false)
      onStarted()
    } finally {
      setMaking(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!making) onOpenChange(next) }}>
        {/* 11/5 SYS 넓은 팝업(AS 스타일 고르기) — 틀 · 단추 모양은 ui/dialog 가 정한다. */}
        <DialogContent size="wide" className="flex max-h-[88vh] flex-col" showCloseButton={!making} data-testid="artist-style-make">
          <DialogHeader>
            {/* v3(오너 2026-11-03 결정 8): 그림을 만들기 전에 묻는 창 — 큰 Lumi(Artist 옷 · 기본 모습), 11/5 SYS "팝업 제목 위" 크기. */}
            <ConfirmLumi stage="artist" />
            <DialogTitle>{t('Which style should we draw it in?')}</DialogTitle>
            <DialogDescription>{t('This work has one style. Every character and background image is made in the style you pick. Later you can pick another style with Regenerate, and the earlier version stays in the history.')}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto py-1">
            {locked ? (
              <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>
                  {t('The art style is fixed to the picture you uploaded.')}{' '}
                  <span className="text-muted-foreground">{t('To pick another style, remove my art style with ✕.')}</span>
                </span>
              </p>
            ) : null}
            {prevStyleId ? (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="artist-style-series">
                {t('If the style stays the same, the carried-over pictures are used as they are. If you change it, the carried-over characters and backgrounds in this episode are redrawn in this style.')}
              </p>
            ) : null}
            <StyleGrid
              anchors={anchors}
              picked={picked}
              onPick={setPicked}
              custom={custom}
              locked={locked}
              styleSetting={styleSetting}
              removing={removing}
              busy={making}
              onRemoveCustom={() => void removeCustom()}
              prevStyleId={prevStyleId}
              prevIsCustom={prevIsCustom}
            />
          </div>
          <DialogFooter className="sm:items-center">
            {/* 11/5 시안 AS — 단추 왼쪽 한 줄 "인물 3 · 배경 1"(걸리는 시간은 어림할 근거가 없어 뺀다). 레퍼런스 · 앞 화 그림 · Take 안내는 그 아래 작은 줄. */}
            <div className="flex min-w-0 flex-col gap-0.5 text-caption text-subtle-foreground sm:mr-auto">
              <p data-testid="artist-make-new">{makeCounts ? t('New character sheets {persons} · backgrounds {places}', { persons: makeCounts.newPersons, places: makeCounts.newPlaces }) : t('Character sheets {persons} · backgrounds {places}', { persons, places })}</p>
              {asIs > 0 ? (
                <p data-testid="artist-make-as-is">{t('Reference')} · {t('Used as is {count}', { count: asIs })}</p>
              ) : null}
              {prevImageParts.length > 0 ? (
                <p data-testid="artist-make-prev">{t('Previous episode images')} · {prevImageParts.join(' · ')}</p>
              ) : null}
              <p>{t('Images do not use Takes.')}</p>
            </div>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={making}>{t('Cancel')}</Button>
            <Button onClick={() => void make()} disabled={!canMake} data-testid="artist-style-make-go">
              {making ? <Loader2 className="size-4 animate-spin" /> : null}
              {makeButtonText(t, chosenLabel)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** 만들기 단추 글(11/5 시안 AS "실사로 그리기") — 한국어는 스타일 이름 받침에 맞춰 '으로 · 로'를 붙인다("3D 애니메이션으로 그리기").
 *  스타일을 아직 고르지 않았으면 이름 없이 [그리기]. 약속: tests/artist/style-make-button.test.ts */
export function makeButtonText(t: (text: string, params?: Record<string, string | number>) => string, style: string | null): string {
  return style ? t('Draw it in {style}', { style, ro: directionParticle(style) }) : t('Draw')
}

// v3 AS(11/5 시안) 스타일 칸의 그림 — 164×112 비율 · 모서리 12 · 그림자리 바탕. 고른 칸은 그림 안쪽 2px 지금 단계 색 테두리,
//   이름은 그림 밖 아래(고른 것 흰 600 · 나머지 회색 500).
const TILE_ART = 'relative flex aspect-[41/28] items-center justify-center overflow-hidden rounded-[12px] bg-art-placeholder outline-2 -outline-offset-2 transition-colors'

/**
 * 스타일 격자 — 처음 만드는 창(A2)과 재생성 창(A6, regenerate-style-dialog)이 같이 쓴다.
 *   이미 올린 내 그림체가 있으면 그 카드(보기 · ✕)가 맨 앞이고, 그 그림체를 쓰는 동안 다른 스타일은 고를 수 없다(✕로 내려야 고른다).
 *   currentKey = 재생성 창의 지금 작품 스타일("지금" 표시, 직접 올린 그림체면 'custom').
 */
export function StyleGrid({ anchors, picked, onPick, custom, locked, styleSetting, removing, busy, onRemoveCustom, prevStyleId, prevIsCustom, currentKey = null }: {
  anchors: readonly StyleAnchor[]
  picked: string | null
  onPick: (key: string) => void
  custom: { url: string; label: string } | null
  locked: boolean
  styleSetting: boolean
  removing: boolean
  busy: boolean
  onRemoveCustom: () => void
  prevStyleId: string | null
  prevIsCustom: boolean
  currentKey?: string | null
}) {
  const t = useT()
  const locale = useLocale()
  const pickable = !(locked || custom)
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-3.5 sm:grid-cols-4" role="radiogroup" aria-label={t('Style')}>
      {/* 이미 올린 내 그림체(올리기 카드는 2026-10-27 내림) — 보기 · 지우기만. 쓰는 동안은 늘 고른 칸이다. */}
      {custom ? (
        <div className="flex min-w-0 flex-col gap-2" data-testid="artist-style-custom">
          <span className={cn(TILE_ART, 'outline-stage')}>
            {styleSetting ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ThumbImage src={custom.url} alt={custom.label} className="size-full object-cover" />}
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="absolute right-1.5 top-1.5 size-6 rounded-full bg-background/90"
              onClick={onRemoveCustom}
              aria-label={t('Remove my art style')}
              title={t('Remove my art style')}
              disabled={removing || styleSetting || busy} data-testid="artist-style-remove"
            >
              {removing ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <X className="size-3" aria-hidden />}
            </Button>
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-1.5">
              <PickedMark />
              <span className="truncate text-[13px] font-semibold leading-4 text-foreground">{custom.label}</span>
            </span>
            {prevIsCustom ? <span className="truncate text-[10px] text-subtle-foreground">{t('Previous episode style')}</span> : null}
            {currentKey === 'custom' ? <span className="truncate text-[10px] text-subtle-foreground">{t('Now')}</span> : null}
            {styleSetting ? <span className="truncate text-[10px] text-subtle-foreground">{t('Reading the art style…')}</span> : null}
          </span>
        </div>
      ) : null}
      {anchors.map((anchor) => {
        const on = !custom && picked === anchor.key
        const name = styleAnchorName(anchor, locale)
        return (
          <button
            key={anchor.key}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={locked || !!custom}
            onClick={() => onPick(anchor.key)}
            className="group flex min-w-0 flex-col gap-2 text-left focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="artist-style-option"
          >
            <span className={cn(TILE_ART, on ? 'outline-stage' : 'outline-transparent group-focus-visible:outline-ring', !on && pickable && 'group-hover:outline-border-strong')}>
              {anchor.previewUrl ? <ThumbImage src={anchor.previewUrl} alt={name} className="size-full object-cover" /> : <ImageIcon className="size-5 text-muted-foreground opacity-40" aria-hidden />}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-1.5">
                {on ? <PickedMark /> : null}
                <span className={cn('truncate text-[13px] leading-4', on ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>{name}</span>
              </span>
              {/* 재생성 창(A6): 지금 작품 스타일 자리 — 같은 스타일로 다시 만들 수 있다. */}
              {currentKey === anchor.key ? (
                <span className="truncate text-[10px] text-subtle-foreground" data-testid="artist-style-current">{t('Now')}</span>
              ) : null}
              {/* 시리즈 다음 화: 앞 화 그림체 자리를 알려 그대로 두는 것이 "이어받기"라는 것을 보인다. */}
              {prevStyleId === anchor.key ? (
                <span className="truncate text-[10px] text-subtle-foreground">{t('Previous episode style')}</span>
              ) : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** 고른 칸 표시 — 이름 앞 크림 동그라미 ✓(v3 AS 11/5 시안). */
function PickedMark() {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground text-on-stage" aria-hidden>
      <Check className="size-2.5" strokeWidth={3} />
    </span>
  )
}
