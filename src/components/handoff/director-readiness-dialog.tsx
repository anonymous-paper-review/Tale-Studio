'use client'

// Director 로 넘기기 전 준비 창(2026-10-01 오너 "director 넘어갈 때 미완성 팝업", "그래도 진행을 줘야해").
//   프로토타입(tale-proto-v04 art:next)처럼 준비된 샷 / 덜 된 샷 수를 보이고, 덜 된 샷마다 이유와 "채우러 가기"를 둔다.
//   프로토타입의 샷 골라 생성하기는 이번 범위가 아니다 — "그래도 진행"은 모든 샷을 그대로 Director 로 넘긴다.
import { AlertTriangle, ImageOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ThumbImage } from '@/components/thumb-image'
import type { DirectorReadinessReport, ShotGap } from '@/lib/director-readiness'
import { useT } from '@/lib/i18n'
import { useArtistStore } from '@/stores/artist-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'

function useGapLabel() {
  const t = useT()
  return (gap: ShotGap): string => {
    if (gap.kind === 'generating') return t('{name}: image in progress', { name: gap.name })
    if (gap.kind === 'info') return t('{name}: description missing', { name: gap.name })
    return gap.target === 'character'
      ? t('{name}: no character image', { name: gap.name })
      : t('{name}: no background image', { name: gap.name })
  }
}

export function DirectorReadinessDialog({
  open,
  report,
  gateGaps,
}: {
  open: boolean
  report: DirectorReadinessReport | null
  gateGaps: string[]
}) {
  const t = useT()
  const gapLabel = useGapLabel()
  const proceed = useGlobalChatStore((s) => s.proceedToDirectorAnyway)
  const close = useGlobalChatStore((s) => s.closeHandoffConfirm)
  const incompleteScenes = (report?.scenes ?? [])
    .map((scene) => ({ ...scene, shots: scene.shots.filter((shot) => !shot.ready) }))
    .filter((scene) => scene.shots.length > 0)
  const readyCount = report?.readyCount ?? 0
  const incompleteCount = report?.incompleteCount ?? 0

  // "채우러 가기" — 창을 닫고 Artist 에서 그 인물·배경 카드를 고른다(넘기지 않는다).
  const fillIn = (gap: ShotGap) => {
    const artist = useArtistStore.getState()
    if (gap.target === 'character') {
      artist.setUiTab('characters')
      artist.selectCharacter(gap.id)
    } else {
      artist.setUiTab('world')
      artist.selectLocation(gap.id)
    }
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent className="max-h-[90vh] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-2xl" data-testid="director-readiness-dialog">
        <DialogHeader>
          <DialogTitle>{t('Hand over to Director')}</DialogTitle>
          <DialogDescription>
            {t('Some shots are missing character or background images. Fill them in first, or proceed anyway.')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="font-mono text-xl tabular-nums">{readyCount}</div>
            <div className="text-xs text-muted-foreground">{t('Ready shots')}</div>
          </div>
          <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
            <div className="font-mono text-xl tabular-nums text-warning">{incompleteCount || gateGaps.length}</div>
            <div className="text-xs text-muted-foreground">{t('Shots not ready')}</div>
          </div>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            {t('Shots with every character and background image ready come out best. Shots that are not ready still open in Director: a shot missing a character image waits until that image exists, and a shot missing a background image is drawn without the background reference.')}
          </p>

          {incompleteScenes.map((scene) => (
            <section key={scene.sceneId} className="overflow-hidden rounded-xl border border-border">
              <header className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs">
                <span className="font-mono font-semibold">S{scene.sceneNumber}</span>
                <span className="truncate text-muted-foreground">
                  {[scene.locationName, scene.timeOfDay].filter(Boolean).join(' · ')}
                </span>
              </header>
              <ul className="divide-y divide-border">
                {scene.shots.map((shot) => (
                  <li key={shot.shotId} className="flex items-start gap-3 px-4 py-3">
                    <span className="w-9 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">{shot.code}</span>
                    <span className="flex shrink-0 gap-1">
                      {shot.rough ? (
                        <>
                          <ThumbImage src={shot.rough.start} alt={t('Start frame')} className="h-10 w-auto rounded border border-border bg-muted object-cover" />
                          <ThumbImage src={shot.rough.end} alt={t('End frame')} className="h-10 w-auto rounded border border-border bg-muted object-cover" />
                        </>
                      ) : (
                        <span className="flex h-10 w-16 items-center justify-center rounded border border-dashed border-border text-muted-foreground">
                          <ImageOff className="size-4" aria-label={t('No rough storyboard')} />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm">{shot.description}</span>
                      <span className="mt-1 block text-xs text-warning">{shot.gaps.map(gapLabel).join(' · ')}</span>
                    </span>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => fillIn(shot.gaps[0])}>
                      {t('Fill in')}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {incompleteScenes.length === 0 && gateGaps.length > 0 ? (
            <ul className="space-y-1 rounded-xl border border-border px-4 py-3 text-sm">
              {gateGaps.map((gap) => (
                <li key={gap} className="text-warning">· {gap}</li>
              ))}
            </ul>
          ) : null}

          {readyCount > 0 ? (
            <p className="text-xs text-muted-foreground">{t('{count} shots are ready.', { count: readyCount })}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t('Fill in first')}
          </Button>
          <Button onClick={() => void proceed()} data-testid="director-proceed-anyway">
            {t('Proceed anyway')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
