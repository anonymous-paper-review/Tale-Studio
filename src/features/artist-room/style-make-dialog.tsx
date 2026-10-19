'use client'

// Artist 스타일 고르기 · 만들기(리뉴얼 1차 2026-10-19, 프로토타입 A2 "어떤 스타일로 만들까요?").
//   작품 스타일은 하나 — 고른 스타일 · 만드는 것(인물 시트 N · 배경 M) · 예상 크레딧을 보여 주고 [만들기]로 전체를 만든다.
//   [만들기] = 확정 산문 초안을 이어 가며 인물 · 배경 디자인 뒤에 멈추게 한다(artistGate). 예전 채팅 팔레트의
//   "내 그림체 올리기"도 여기서 쓴다(올린 그림체로 고정된다). 그림은 Take 가 들지 않는다(take-cost: Take 는 영상 전용).
import { useEffect, useRef, useState } from 'react'
import { Check, ImageIcon, Loader2, Lock, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ThumbImage } from '@/components/thumb-image'
import { useImageUploadConsent } from '@/components/upload/image-upload-consent'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { kindOf } from '@/lib/upload/limits'
import { ingestCreationFile } from '@/lib/project/start-new-project'
import { breakdownRows } from '@/lib/artist/breakdown'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

export function StyleMakeDialog({ open, onOpenChange, onStarted }: { open: boolean; onOpenChange: (open: boolean) => void; onStarted: () => void }) {
  const t = useT()
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
  const fileRef = useRef<HTMLInputElement>(null)
  const { requestImageUploadConsent, imageUploadConsentDialog } = useImageUploadConsent(projectId)
  const locked = custom?.locked === true
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

  const chosenLabel = custom ? custom.label : anchors.find((anchor) => anchor.key === picked)?.label ?? null
  const canMake = !making && !styleSetting && !upload?.busy && (locked || !!custom || !!picked)

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
    await useGlobalChatStore.getState().applyUploadedStyle({ id: uploaded.id, name: uploaded.name, thumbUrl: uploaded.thumbUrl, sliceUrls: uploaded.sliceUrls })
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
                {t('The art style is fixed to the picture you uploaded.')}
              </p>
            ) : null}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t('Style')}>
              <button
                type="button"
                onClick={pickFile}
                disabled={locked || upload?.busy}
                className="group flex flex-col overflow-hidden rounded-lg border border-dashed border-border-strong text-left transition-colors hover:border-primary/60 disabled:opacity-50"
                data-testid="artist-style-upload"
              >
                <span className="flex aspect-square items-center justify-center bg-muted/30">
                  {upload?.busy || styleSetting ? <Loader2 className="size-5 animate-spin" aria-hidden /> : custom ? <ThumbImage src={custom.url} alt={custom.label} className="size-full object-cover" /> : <Plus className="size-5 text-muted-foreground" aria-hidden />}
                </span>
                <span className="px-2 py-1.5 text-xs">
                  <span className="line-clamp-1 font-medium">{custom ? custom.label : t('Upload my art style')}</span>
                  {upload?.error ? <span className="line-clamp-2 text-destructive">{upload.error}</span> : styleSetting ? <span className="text-muted-foreground">{t('Reading the art style…')}</span> : null}
                </span>
              </button>
              {anchors.map((anchor) => {
                const on = !custom && picked === anchor.key
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
                      {anchor.previewUrl ? <ThumbImage src={anchor.previewUrl} alt={anchor.label} className="size-full object-cover" /> : <ImageIcon className="size-5 text-muted-foreground opacity-40" aria-hidden />}
                    </span>
                    {on ? <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span> : null}
                    <span className="line-clamp-1 px-2 py-1.5 text-xs font-medium">{anchor.label}</span>
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
