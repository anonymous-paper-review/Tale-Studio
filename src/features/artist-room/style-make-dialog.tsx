'use client'

// Artist 스타일 고르기 · 만들기(리뉴얼 1차 2026-10-19, 프로토타입 A2 "어떤 스타일로 만들까요?").
//   작품 스타일은 하나 — 고른 스타일 · 만드는 것(인물 시트 N · 배경 M) · 예상 크레딧을 보여 주고 [만들기]로 전체를 만든다.
//   [만들기] = 확정 산문 초안을 이어 가며 인물 · 배경 디자인 뒤에 멈추게 한다(artistGate). 예전 채팅 팔레트의
//   "내 그림체 올리기"도 여기서 쓴다(올린 그림체로 고정된다). 그림은 Take 가 들지 않는다(take-cost: Take 는 영상 전용).
import { useEffect, useRef, useState } from 'react'
import { Check, ImageIcon, Loader2, Lock, Plus, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ThumbImage } from '@/components/thumb-image'
import { useImageUploadConsent } from '@/components/upload/image-upload-consent'
import { useLocale, useT } from '@/lib/i18n'
import { styleAnchorName } from '@/lib/style-anchor-name'
import { cn } from '@/lib/utils'
import { kindOf } from '@/lib/upload/limits'
import { ingestCreationFile } from '@/lib/project/start-new-project'
import { breakdownRows } from '@/lib/artist/breakdown'
import { useSeriesInfo } from '@/features/series/use-series-info'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
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
  const [upload, setUpload] = useState<{ busy: boolean; error: string | null } | null>(null)
  const [removing, setRemoving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { requestImageUploadConsent, imageUploadConsentDialog } = useImageUploadConsent(projectId)
  const locked = custom?.locked === true
  // 시리즈 다음 화(2026-10-26): 앞 화 그림체로 시작한다 — style_anchor_key 가 이미 복사돼 있어 아래 picked 가 savedKey(= 앞 화 그림체)에서 시작한다.
  //   그 자리에 "앞 화 그림체" 표시만 붙이고 고를 값은 바꾸지 않는다(올린 그림체가 잠긴 프로젝트는 지금처럼 못 바꾼다).
  const { view: series } = useSeriesInfo(projectId)
  const prevStyleId = series?.styleId ?? null
  const prevIsCustom = !!custom && !!prevStyleId && prevStyleId === savedKey
  const rows = breakdownRows(cast, backgrounds)
  const persons = rows.filter((row) => row.kind === 'person').length
  const places = rows.length - persons

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
  const canMake = !making && !styleSetting && !upload?.busy && (locked || !!custom || !!picked)

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

  const pickFile = () => {
    if (!upload?.busy && !locked) fileRef.current?.click()
  }
  const onFile = async (file: File) => {
    if (!projectId) return
    const pid = projectId
    if (kindOf(file.name) !== 'image') {
      setUpload({ busy: false, error: t('Choose a picture file.') })
      return
    }
    if (!(await requestImageUploadConsent([file]))) return
    if (useProjectStore.getState().projectId !== pid) return
    setUpload({ busy: true, error: null })
    const uploaded = await ingestCreationFile(pid, file)
    if (useProjectStore.getState().projectId !== pid) return
    if ('error' in uploaded || uploaded.kind !== 'image') {
      setUpload({ busy: false, error: 'error' in uploaded ? uploaded.error : t('Choose a picture file.') })
      return
    }
    setUpload(null)
    // Artist 화면의 일이라 말풍선 · 안내도 Artist 이름으로 남긴다(2026-10-27 디자이너 QA 1차 관찰 49).
    await useGlobalChatStore.getState().applyUploadedStyle({ id: uploaded.id, name: uploaded.name, thumbUrl: uploaded.thumbUrl, sliceUrls: uploaded.sliceUrls }, { stage: 'artist' })
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
        <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-2xl" showCloseButton={!making} data-testid="artist-style-make">
          <DialogHeader>
            <DialogTitle>{t('Which style should we make it in?')}</DialogTitle>
            <DialogDescription>{t('This work has one style. Every character and background image is made in the style you pick.')}</DialogDescription>
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
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t('Style')}>
              <div className="relative flex">
              <button
                type="button"
                onClick={pickFile}
                disabled={locked || upload?.busy}
                className="group flex w-full flex-col overflow-hidden rounded-lg border border-dashed border-border-strong text-left transition-colors hover:border-primary/60 disabled:opacity-50"
                data-testid="artist-style-upload"
              >
                <span className="flex aspect-square items-center justify-center bg-muted/30">
                  {upload?.busy || styleSetting ? <Loader2 className="size-5 animate-spin" aria-hidden /> : custom ? <ThumbImage src={custom.url} alt={custom.label} className="size-full object-cover" /> : <Plus className="size-5 text-muted-foreground" aria-hidden />}
                </span>
                <span className="px-2 py-1.5 text-xs">
                  <span className="line-clamp-1 font-medium">{custom ? custom.label : t('Upload my art style')}</span>
                  {prevIsCustom ? <span className="block text-[10px] text-muted-foreground">{t('Previous episode style')}</span> : null}
                  {upload?.error
                    ? <span className="line-clamp-2 text-destructive">{upload.error}</span>
                    : styleSetting
                      ? <span className="text-muted-foreground">{t('Reading the art style…')}</span>
                      : !custom
                        ? <span className="line-clamp-3 text-muted-foreground">{t('The picture goes to an analysis model to describe its art style, and the style is then fixed.')}</span>
                        : null}
                </span>
              </button>
              {custom ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="absolute right-1.5 top-1.5 size-6 rounded-full bg-background/90"
                  onClick={() => void removeCustom()}
                  aria-label={t('Remove my art style')}
                  title={t('Remove my art style')}
                  disabled={removing || styleSetting || making || !!upload?.busy} data-testid="artist-style-remove"
                >
                  {removing ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <X className="size-3" aria-hidden />}
                </Button>
              ) : null}
              </div>
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
                    onClick={() => setPicked(anchor.key)}
                    className={cn(
                      'relative flex flex-col overflow-hidden rounded-lg border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                      on ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-border-strong',
                    )}
                    data-testid="artist-style-option"
                  >
                    <span className="flex aspect-square items-center justify-center bg-muted">
                      {anchor.previewUrl ? <ThumbImage src={anchor.previewUrl} alt={name} className="size-full object-cover" /> : <ImageIcon className="size-5 text-muted-foreground opacity-40" aria-hidden />}
                    </span>
                    {on ? <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span> : null}
                    <span className={cn('line-clamp-1 px-2 text-xs font-medium', prevStyleId === anchor.key ? 'pt-1.5' : 'py-1.5')}>{name}</span>
                    {/* 시리즈 다음 화: 앞 화 그림체 자리를 알려 그대로 두는 것이 "이어받기"라는 것을 보인다. */}
                    {prevStyleId === anchor.key ? (
                      <span className="line-clamp-1 px-2 pb-1.5 text-[10px] text-muted-foreground">{t('Previous episode style')}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void onFile(file)
              }}
            />
            <dl className="space-y-2 rounded-lg border border-border px-3 py-2.5 text-sm">
              <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted-foreground">{t('What gets made')}</dt><dd>{t('Character sheets {persons} · backgrounds {places}', { persons, places })}</dd></div>
              <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted-foreground">{t('Style')}</dt><dd>{chosenLabel ?? t('Pick a style')}</dd></div>
              <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted-foreground">{t('Estimated credits')}</dt><dd>{t('Images do not use Takes.')}</dd></div>
            </dl>
          </div>
          <DialogFooter className="border-t border-border pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={making}>{t('Cancel')}</Button>
            <Button onClick={() => void make()} disabled={!canMake} data-testid="artist-style-make-go">
              {making ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {chosenLabel ? t('Make it in {style}', { style: chosenLabel }) : t('Make')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {imageUploadConsentDialog}
    </>
  )
}
