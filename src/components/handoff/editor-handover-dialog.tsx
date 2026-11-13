'use client'

// Director → Editor 넘기기 창(D8, 디자이너 1110 확정 · 오너 2026-11-14 답 8번) — 영상 없는 샷이 있을 때만 열린다(다 있으면 창 없이, 10/1).
//   샷마다 Editor 로 가는 Take(★ 최종 먼저, 없으면 가장 최근 완성)를 보이고, 영상 없는 샷은 빨강 줄에 까닭과 [다시 만들기]를 둔다.
//   [○ 빼고 넘기기]는 영상 있는 샷만 넘긴다(Editor 쪽 받기는 export 갈래). 목록은 Director 캔버스에서 그때그때 읽어
//   다시 만들기로 바뀌는 상태(만드는 중 → 완성)를 따라간다. 판단 · 넘김은 global-chat-store(requestNextStep · proceedToEditorWithVideos).
import { useState } from 'react'
import { ArrowRight, Loader2, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ThumbImage } from '@/components/thumb-image'
import { boardNodeNames } from '@/features/director/node-label'
import { editorHandoverView, type EditorHandoverShot } from '@/lib/director/editor-handover'
import { videoBatchTakeCosts } from '@/lib/director/video-batch-plan'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useWriterStore } from '@/stores/writer-store'

export function EditorHandoverDialog({ open }: { open: boolean }) {
  const t = useT()
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const manifest = useWriterStore((s) => s.sceneManifest)
  const writerShots = useWriterStore((s) => s.shots)
  const proceed = useGlobalChatStore((s) => s.proceedToEditorWithVideos)
  const remake = useGlobalChatStore((s) => s.remakeMissingVideo)
  const close = useGlobalChatStore((s) => s.closeHandoffConfirm)
  const [starting, setStarting] = useState<string | null>(null)
  if (!open) return null
  const view = editorHandoverView(nodes, boardNodeNames(manifest, writerShots ?? []))

  const remakeRow = async (row: EditorHandoverShot) => {
    setStarting(row.shotNodeId)
    try {
      await remake(row.shotNodeId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Failed to generate video.'))
    } finally {
      setStarting(null)
    }
  }
  // [바꾸기] — Take 는 그 샷 상세에서 고른다(★ 최종). 창을 닫고 상세를 연다; 고른 뒤 [다음: Editor로] 를 다시 누르면 된다.
  const openDetail = (row: EditorHandoverShot) => {
    close()
    useDirectorCanvasStore.getState().openPopup(row.shotNodeId)
  }
  const missingLabel =
    view.missing.length === 1
      ? t('Hand over without {label} · {cuts} cuts · {seconds}s', { label: view.missing[0].label, cuts: view.cuts, seconds: view.seconds })
      : t('Hand over without {count} shots · {cuts} cuts · {seconds}s', { count: view.missing.length, cuts: view.cuts, seconds: view.seconds })

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent size="wide" className="max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto]" data-testid="editor-handover-dialog">
        <DialogHeader>
          <DialogTitle>{t('Hand over to Editor')}</DialogTitle>
          <DialogDescription>
            {t('{done}/{total} videos · {seconds}s · Shots without video do not go into the timeline as empty slots.', { done: view.cuts, total: view.total, seconds: view.seconds })}
          </DialogDescription>
        </DialogHeader>

        <ul className="min-h-0 space-y-2 overflow-y-auto pr-1">
          {view.shots.map((row) => {
            const takes = videoBatchTakeCosts(nodes, [row.shotNodeId])[0]
            const busy = starting === row.shotNodeId || row.missing === 'generating'
            return (
              <li
                key={row.shotNodeId}
                className={cn('flex items-center gap-3 rounded-xl bg-card px-4 py-3', row.missing && 'border border-destructive')}
                data-testid={row.missing ? 'editor-handover-missing' : 'editor-handover-shot'}
              >
                {row.thumbUrl && !row.missing ? (
                  <ThumbImage src={row.thumbUrl} alt={row.label} className="h-11 w-8 shrink-0 rounded-md bg-art-placeholder object-cover" />
                ) : !row.missing ? (
                  <span className="h-11 w-8 shrink-0 rounded-md bg-art-placeholder" aria-hidden />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label font-semibold text-foreground">
                    {row.missing ? t('{label} · No video', { label: row.label }) : t('{label} · {seconds}s', { label: row.label, seconds: row.seconds })}
                  </span>
                  {row.take ? (
                    <span className="mt-0.5 flex items-center gap-1 text-caption text-muted-foreground">
                      <Star className="size-3" aria-hidden />
                      {row.take.final
                        ? t('Take {number} · Final', { number: row.take.number })
                        : t('Take {number} · Auto (latest finished)', { number: row.take.number })}
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-caption text-destructive">
                      {row.missing === 'failed'
                        ? t('Failed while making · If you leave it out, it joins Editor on its own once its video is made')
                        : row.missing === 'generating'
                          ? t('Making it now · You can hand it over from this window once it is done')
                          : t('Not made yet · If you leave it out, it joins Editor on its own once its video is made')}
                    </span>
                  )}
                </span>
                {row.missing ? (
                  <Button size="sm" variant="outline" className="shrink-0" disabled={busy} onClick={() => void remakeRow(row)} data-testid="editor-handover-remake">
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {row.missing === 'not_made' ? t('Make video · {takes} Takes', { takes }) : t('Make again · {takes} Takes', { takes })}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={() => openDetail(row)}>
                    {t('Change')}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>

        <DialogFooter>
          {view.cuts === 0 ? <p className="mr-auto self-center text-caption text-muted-foreground">{t('No video to hand over yet.')}</p> : null}
          <Button variant="secondary" onClick={close}>
            {t('Go back')}
          </Button>
          <Button onClick={() => void proceed()} disabled={view.cuts === 0} data-testid="editor-handover-proceed">
            {missingLabel}
            <ArrowRight className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
