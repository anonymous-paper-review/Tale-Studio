'use client'

// Artist 완료 확인(리뉴얼 1차 2026-10-19, 프로토타입 A9 "완료하고 Storyboard로 넘길까요?").
//   [예, 완료하기]면 Storyboard 가 열린다(/api/writer/artist-complete). 씬 · 샷 나누기와 러프는 [만들기] 때부터 이어서
//   만들고 있다(2026-10-20) — 아직 덜 됐으면 Storyboard 에서 이어서 본다.
//   완료한 뒤에도 Artist 로 돌아와 그림을 고칠 수 있다(Artist ⇄ Storyboard).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/lib/i18n'
import { withDemoShare } from '@/lib/demo/context'
import { restartWriterStatus } from '@/lib/writer/use-writer-status'
import { useProjectStore } from '@/stores/project-store'

export function completeError(code: string | undefined, missing?: { characters?: string[]; locations?: string[] }): { key: string; params?: Record<string, string> } {
  if (code === 'artist_images_missing') {
    const names = [...(missing?.characters ?? []), ...(missing?.locations ?? [])].join(', ')
    return { key: 'Make the images for these first: {names}', params: { names } }
  }
  if (code === 'artist_not_started' || code === 'artist_not_waiting' || code === 'artist_design_unfinished') return { key: 'The images are still being designed. Try again once they are ready.' }
  return { key: 'Could not complete. Please try again.' }
}

export function ArtistCompleteDialog({ open, onOpenChange, summary }: { open: boolean; onOpenChange: (open: boolean) => void; summary: { persons: number; places: number; style: string | null } }) {
  const t = useT()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const complete = async () => {
    const projectId = useProjectStore.getState().projectId
    if (busy || !projectId) return
    setBusy(true)
    try {
      const response = await fetch('/api/writer/artist-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const body = await response.json().catch(() => ({})) as { code?: string; missing?: { characters?: string[]; locations?: string[] } }
      if (!response.ok) {
        const error = completeError(body.code, body.missing)
        toast.error(t(error.key, error.params))
        return
      }
      if (useProjectStore.getState().projectId !== projectId) return
      restartWriterStatus(projectId)
      useProjectStore.getState().unlockThrough('writer')
      onOpenChange(false)
      router.push(withDemoShare('/studio/writer'))
    } catch {
      toast.error(t('Could not complete. Please try again.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-md" showCloseButton={!busy} data-testid="artist-complete">
        <DialogHeader>
          <DialogTitle>{t('Complete and move on to Storyboard?')}</DialogTitle>
          <DialogDescription className="sr-only">{t('Check what moves on to Storyboard.')}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-3 text-sm">
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted-foreground">{t('Moves on')}</dt>
            <dd>{t('Confirmed prose · characters {persons} · backgrounds {places}', { persons: summary.persons, places: summary.places })}{summary.style ? ` · ${summary.style}` : ''}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted-foreground">{t('Next')}</dt>
            <dd>{t('Storyboard opens. Scenes, shots and roughs that are still being made continue there.')}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted-foreground">{t('Later')}</dt>
            <dd>{t('You can still fix looks and images in Storyboard, or come back to Artist.')}</dd>
          </div>
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t('No')}</Button>
          <Button onClick={() => void complete()} disabled={busy} data-testid="artist-complete-yes">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{t('Yes, complete it')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
