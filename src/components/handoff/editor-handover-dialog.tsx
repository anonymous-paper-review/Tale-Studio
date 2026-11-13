'use client'

// Director → Editor 넘기기 창(D8, 디자이너 1110 확정 · 오너 2026-11-14 답 8번) — 영상 없는 샷이 있을 때만 열린다(다 있으면 창 없이, 10/1).
//   샷마다 Editor 로 가는 Take(★ 최종 먼저, 없으면 가장 최근 완성)를 보이고, 영상 없는 샷은 빨강 줄에 까닭과 [다시 만들기]를 둔다.
//   [○ 빼고 넘기기]는 영상 있는 샷만 넘긴다(Editor 쪽 받기는 export 갈래). 목록은 Director 캔버스에서 그때그때 읽어
//   다시 만들기로 바뀌는 상태(만드는 중 → 완성)를 따라간다. 판단 · 넘김은 global-chat-store(requestNextStep · proceedToEditorWithVideos).
import { useEffect, useState } from 'react'
import { ArrowRight, Loader2, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ThumbImage } from '@/components/thumb-image'
import { boardNodeNames } from '@/features/director/node-label'
import { editorHandoverView, handoverHeaderLine, proceedButtonLabel, remakeButton, remakeNotice, withRowNotice, withStartingRow, type EditorHandoverShot } from '@/lib/director/editor-handover'
import { useTakeBalance } from '@/lib/billing/use-take-balance'
import { takeValuesShown } from '@/lib/billing/take-cost'
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
  const changeTake = useGlobalChatStore((s) => s.changeHandoverTake)
  // 일괄이 도는 중이면 줄 단추를 끄고 까닭을 적는다(검토 b 낮음 1). Take 값은 과금이 꺼져 있을 때만 숨긴다 — 잔액을 못 읽으면 센 값을 보인다(2차 낮음 1).
  const batch = useDirectorCanvasStore((s) => (s.realBatchBusy ? 'images' : s.videoBatchBusy ? 'videos' : null))
  const showTakes = takeValuesShown(useTakeBalance())
  // [다시 만들기]를 누른 줄들 — 줄마다 따로 둔다(먼저 누른 줄이 끝나도 나중에 누른 다른 줄의 스피너는 그대로, 리드 11/14).
  const [starting, setStarting] = useState<ReadonlySet<string>>(() => new Set())
  // [다시 만들기]를 시작하지 못한 까닭 — 그 줄 아래에 보인다(검토 b 2차 낮음 3). 줄마다 따로 둔다 — 다른 줄을 누르거나 끝나도 남는다(검토 b 낮음).
  const [notices, setNotices] = useState<ReadonlyMap<string, string>>(() => new Map())
  // 창을 닫았다 다시 열면 앞에서 남은 까닭은 지운다 — 이 부품은 늘 붙어 있고 open 만 바뀌어, 다시 열면 그새 바뀐 상황에
  //   옛 까닭이 그대로 보였다(검토 a 낮음, 리드 11/14). 돌기 표시는 다시 만들기가 끝날 때(finally) 비운다.
  useEffect(() => {
    setNotices(new Map())
  }, [open])
  if (!open) return null
  const view = editorHandoverView(nodes, boardNodeNames(manifest, writerShots ?? []))

  const remakeRow = async (row: EditorHandoverShot) => {
    setStarting((current) => withStartingRow(current, row.shotNodeId, true))
    setNotices((current) => withRowNotice(current, row.shotNodeId, null))
    try {
      const result = await remake(row.shotNodeId)
      const message = result.started ? null : remakeNotice(result.reason, t)
      setNotices((current) => withRowNotice(current, row.shotNodeId, message))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Failed to generate video.'))
    } finally {
      setStarting((current) => withStartingRow(current, row.shotNodeId, false))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent size="wide" className="max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto]" data-testid="editor-handover-dialog">
        <DialogHeader>
          <DialogTitle>{t('Hand over to Editor')}</DialogTitle>
          <DialogDescription>{handoverHeaderLine(view, t)}</DialogDescription>
        </DialogHeader>

        <ul className="min-h-0 space-y-2 overflow-y-auto pr-1">
          {view.shots.map((row) => {
            const button = row.missing ? remakeButton(nodes, row, { showTakes, batch }, t) : null
            const busy = starting.has(row.shotNodeId) || row.missing === 'generating'
            const rowNotice = notices.get(row.shotNodeId)
            return (
              <li
                key={row.shotNodeId}
                className={cn('flex items-center gap-x-3 gap-y-2 rounded-xl bg-card px-4 py-3', row.missing && 'flex-wrap border border-destructive sm:flex-nowrap')}
                data-testid={row.missing ? 'editor-handover-missing' : 'editor-handover-shot'}
              >
                {row.thumbUrl && !row.missing ? (
                  <ThumbImage src={row.thumbUrl} alt={row.label} className="h-11 w-8 shrink-0 rounded-md bg-art-placeholder object-cover" />
                ) : !row.missing ? (
                  <span className="h-11 w-8 shrink-0 rounded-md bg-art-placeholder" aria-hidden />
                ) : null}
                {/* 좁은 화면(시안 없음)에서는 영상 없는 줄의 긴 단추가 줄 아래로 내려가 샷 이름이 잘리지 않는다(리드 2026-11-14). */}
                <span className={cn('min-w-0 flex-1', row.missing && 'basis-48')}>
                  <span className={cn('block text-label font-semibold text-foreground', row.missing ? 'break-words sm:truncate' : 'truncate')}>
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
                        ? t('Failed. Leave it out and it joins Editor once its video is ready')
                        : row.missing === 'generating'
                          ? t('Making it now · You can hand it over from this window once it is done')
                          : t('Not made yet. Leave it out and it joins Editor once its video is ready')}
                    </span>
                  )}
                  {rowNotice ? (
                    <span className="mt-0.5 block text-caption text-muted-foreground" role="status" data-testid="editor-handover-notice">
                      {rowNotice}
                    </span>
                  ) : null}
                </span>
                {button ? (
                  <Button size="sm" variant="outline" className="shrink-0" disabled={busy || button.disabled} onClick={() => void remakeRow(row)} data-testid="editor-handover-remake">
                    {busy || batch ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {button.label}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={() => changeTake(row.shotNodeId)}>
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
          {/* 좁은 화면에서는 긴 넘기기 글이 창을 밀어내지 않게 줄을 바꾼다(시안 없음). */}
          <Button onClick={() => void proceed()} disabled={view.cuts === 0} className="whitespace-normal break-keep text-center sm:whitespace-nowrap" data-testid="editor-handover-proceed">
            {proceedButtonLabel(view, t)}
            <ArrowRight className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
