'use client'

// Artist [불러오기 · 기록 N] 창 "생성 기록"(2026-10-28 오너, 프로토타입 AV) — 새 버전부터 줄마다 v{n} · 스타일 이름 · 지금 표시 ·
//   인물(기본 모습 대표 얼굴) · 배경(기본 그림) 썸네일 한 줄, 지금이 아닌 줄에는 [불러오기]. 불러오면 그림과 작품 스타일이 그 버전으로 돌아간다.
//   다른 모습이 있는 배경은 불러와도 지금 그림 그대로라 한 줄로 먼저 알린다(2026-10-31 오너 결정 A) — 몇 곳인지는 버전마다 달라
//   불러온 뒤 알림이 센다(재검토 지적: 창과 알림의 수가 달랐다).
import { ImageOff, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ThumbImage } from '@/components/thumb-image'
import { useAiBusyHold } from '@/hooks/use-ai-busy-hold'
import { useLocale, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { historyOrder, versionStyleLabel } from '@/lib/artist/style-versions'
import { useArtistStore } from '@/stores/artist-store'
import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useProducerStore } from '@/stores/producer-store'

export function VersionHistoryDialog({ canLoad }: { canLoad: boolean }) {
  const t = useT()
  const locale = useLocale()
  const open = useArtistVersionStore((s) => s.historyDialogOpen)
  const versions = useArtistVersionStore((s) => s.versions)
  const busy = useArtistVersionStore((s) => s.busy)
  const anchors = useProducerStore((s) => s.styleAnchors)
  const hasKeptBackgrounds = useArtistStore((s) => s.worldAssets.some((world) => (world.appearances?.length ?? 0) > 0))
  useAiBusyHold(open && busy === 'load')
  const close = () => { if (!busy) useArtistVersionStore.getState().closeHistory() }
  const load = async (n: number) => {
    if (!(await useArtistVersionStore.getState().loadVersion(n))) {
      toast.error(useArtistVersionStore.getState().lastError ?? t('Could not load the version. Please try again.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
      <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-2xl" showCloseButton={!busy} data-testid="artist-version-history">
        <DialogHeader>
          <DialogTitle>{t('Generation history')}</DialogTitle>
          <DialogDescription>{t('Load a version you liked. The work has one style, so loading a version also switches the style to that version.')}</DialogDescription>
          {hasKeptBackgrounds ? (
            <p className="text-sm text-muted-foreground" data-testid="artist-history-kept-backgrounds">{t('Backgrounds with other looks keep their current pictures when you load a version.')}</p>
          ) : null}
        </DialogHeader>
        <ul className="min-h-0 space-y-2 overflow-y-auto py-1">
          {versions.length === 0 ? (
            <li className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden /></li>
          ) : null}
          {historyOrder(versions).map((version) => (
            <li key={version.n} className={cn('flex flex-col gap-2 rounded-lg border px-3 py-2.5', version.current ? 'border-primary' : 'border-border')} data-testid="artist-version-row" data-n={version.n}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <b className="font-mono">v{version.n}</b>
                <span>{versionStyleLabel(version, anchors, locale)}</span>
                {version.current ? <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{t('Now')}</span> : null}
                {version.current ? null : (
                  <Button size="sm" variant="outline" className="ml-auto" disabled={!canLoad || !!busy} onClick={() => void load(version.n)} data-testid="artist-version-load">
                    {busy === 'load' ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                    {t('Load')}
                  </Button>
                )}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {version.thumbs.map((thumb) => (
                  <span
                    key={`${thumb.kind}:${thumb.id}`}
                    className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40', thumb.kind === 'location' ? 'h-12 w-20' : 'size-12')}
                    title={thumb.name}
                  >
                    {thumb.url ? <ThumbImage src={thumb.url} alt={thumb.name} className="size-full object-cover" /> : <ImageOff className="size-4 text-muted-foreground" aria-label={t('No image')} />}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <DialogFooter className="border-t border-border pt-4">
          <Button variant="outline" onClick={close} disabled={!!busy}>{t('Close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
