'use client'

// Storyboard 샷 상세(오너 2026-11-26 m1126 O7 · 혼자 정한 것 g · h) — 카드를 누르면(대사 탭의 연필도) 열린다. 시안 없음.
//   왼쪽: 큰 그림(실사, 없으면 콘티 그림에 "콘티" 꼬리표) · 샷 글. 오른쪽: 대사(읽기만) · "바꾸고 싶은 점" + [채팅으로 고치기].
//   고치기는 생성 요청을 바로 부르지 않는다 — 채팅에 "@샷 N 바꿀 점"을 보내고 창을 닫는다(lib/storyboard/fix-in-chat). 채팅이 그 샷 실사를 다시 그리고,
//   그리는 동안 그 카드에만 기다림이 뜬다. 그 샷을 그리는 중이면 고치기를 끄고 까닭을 보인다(같은 샷 두 번 맡기기는 서버가 거절한다).
//   이야기 · 화살표 · 대사는 Writer 콘티에서 고친다(O7) — 여기서는 보기만 한다. 지난 판 · [채택](m-history)은 이 창에 붙는다.
//   약속: tests/writer/real-dialog.test.ts
import { useState } from 'react'
import { ImageOff, MessageSquareText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { RoughFrameCycle } from '@/components/rough-frame-cycle'
import { sceneShotName } from '@/lib/board-names'
import { useActiveGenerationJobs } from '@/lib/generation-queue'
import { useLocale, useT } from '@/lib/i18n'
import { sendFixToChat } from '@/lib/storyboard/fix-in-chat'
import { storyboardMentionLabels } from '@/lib/storyboard/mention'
import { realDrawingShotIds, storyboardCardPicture } from '@/lib/storyboard/real-board'
import { useStoryboardRealImages } from '@/lib/storyboard/real-images-store'
import { boardShots } from '@/lib/writer/board-summary'
import { manifestEntities, resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

const NO_IMAGES: Readonly<Record<string, unknown>> = {}

export function RealShotDialog({ shotId, onOpenChange }: { shotId: string | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!shotId} onOpenChange={onOpenChange}>
      {shotId ? <RealShotDialogBody key={shotId} shotId={shotId} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  )
}

function RealShotDialogBody({ shotId, onClose }: { shotId: string; onClose: () => void }) {
  const t = useT()
  const locale = useLocale()
  const projectId = useProjectStore((state) => state.projectId)
  const sceneManifest = useWriterStore((state) => state.sceneManifest)
  const shots = useWriterStore((state) => state.shots)
  const images = useStoryboardRealImages((state) => (state.projectId === projectId ? state.images : NO_IMAGES))
  const activeJobs = useActiveGenerationJobs(projectId)
  const [change, setChange] = useState('')
  const [sending, setSending] = useState(false)

  const entry = boardShots(sceneManifest, shots).find((item) => item.shot.shotId === shotId)
  if (!entry) return null
  const shot = entry.shot
  const label = sceneShotName(locale, entry.sceneNo, entry.shotNo)
  const mentionLabel = storyboardMentionLabels(sceneManifest, shots, locale).shots.get(shotId)
  const picture = storyboardCardPicture(shot.roughStoryboard, images[shotId])
  const drawing = realDrawingShotIds(activeJobs).has(shotId)
  const entityNames = manifestEntities(sceneManifest)
  const nameOf = new Map((sceneManifest?.characters ?? []).map((c) => [c.characterId, c.name]))
  const lines = (shot.dialogueLines ?? []).filter((line) => line.text?.trim())
  const canSend = !!mentionLabel && !!change.trim() && !drawing && !sending

  const send = async () => {
    if (!canSend || !mentionLabel) return
    setSending(true)
    try {
      onClose()
      await sendFixToChat(mentionLabel, change)
    } finally {
      setSending(false)
    }
  }

  return (
    <DialogContent frame="work" className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-[960px]" data-testid="storyboard-shot-detail">
      <DialogHeader className="shrink-0 border-b border-border-subtle px-6 py-4">
        <DialogTitle>{label}</DialogTitle>
        <DialogDescription>
          {t('{seconds}s', { seconds: shot.durationSeconds })} · {shot.shotType}
        </DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:overflow-hidden">
        <div className="flex min-w-0 flex-col gap-3 p-6 md:overflow-y-auto">
          {picture.kind === 'none' ? (
            <div className="flex aspect-video flex-col items-center justify-center gap-1.5 rounded-[14px] bg-art-placeholder p-3 text-center">
              <ImageOff className="size-6 text-subtle-foreground" aria-hidden />
              <p className="text-caption font-medium text-muted-foreground">{t('No rough storyboard yet')}</p>
              <p className="text-micro text-subtle-foreground">{t('Draw it in Writer, then press Start.')}</p>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-[14px]">
              <RoughFrameCycle
                panel={picture.panel}
                alt={picture.kind === 'real' ? label : t('{label} (previz)', { label })}
                introPlay
                sizeToImage
                frameTag
              />
              {picture.kind === 'conti' ? (
                <span className="pointer-events-none absolute left-2 top-2 z-[1] rounded-full bg-background/85 px-2 py-0.5 text-tag font-semibold text-muted-foreground">
                  {t('Rough sketch')}
                </span>
              ) : null}
            </div>
          )}
          <p className="text-body leading-relaxed text-foreground">{resolveEntityNames(shot.actionDescription, entityNames)}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-4 border-t border-border-subtle p-6 md:overflow-y-auto md:border-l md:border-t-0">
          {lines.length > 0 ? (
            <ul className="flex flex-col gap-1.5 text-label">
              {lines.map((line, i) => (
                <li key={i} className="leading-relaxed">
                  <span className="font-semibold text-foreground">{line.characterId ? (nameOf.get(line.characterId) ?? line.characterId) : 'V.O.'}</span>{' '}
                  <span className="text-muted-foreground">&ldquo;{resolveEntityNames(line.text, entityNames)}&rdquo;</span>
                </li>
              ))}
            </ul>
          ) : null}
          <label className="flex flex-col gap-2">
            <span className="text-label font-semibold text-foreground">{t('What to change')}</span>
            <Textarea
              value={change}
              onChange={(event) => setChange(event.target.value)}
              disabled={drawing}
              rows={4}
              placeholder={t('Write only what you want to change in the picture. The rest stays as it is (e.g. show the umbrella handle, keep the face).')}
            />
          </label>
          {drawing ? <p className="text-caption text-muted-foreground" role="status">{t('This shot is being drawn. You can change it when it is done.')}</p> : null}
          <Button onClick={() => void send()} disabled={!canSend} className="self-start" data-testid="storyboard-fix-in-chat">
            <MessageSquareText className="size-4" aria-hidden />
            {t('Fix in chat')}
          </Button>
          <p className="text-caption text-subtle-foreground">{t('Fix the story, arrows, and dialogue in Writer.')}</p>
        </div>
      </div>
    </DialogContent>
  )
}
