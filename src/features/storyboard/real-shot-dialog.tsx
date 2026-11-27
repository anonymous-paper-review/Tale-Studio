'use client'

// Storyboard 샷 상세(오너 2026-11-26 m1126 O7 · 혼자 정한 것 g · h) — 카드를 누르면(대사 탭의 연필도) 열린다. 시안 없음.
//   왼쪽: 큰 그림(실사, 없으면 콘티 그림에 "콘티" 꼬리표) · 샷 글. 오른쪽: 대사(읽기만) · "바꾸고 싶은 점" + [채팅으로 고치기].
//   대사 칸은 늘 보인다(오너 2026-11-27 P1) — 대사가 있으면 이 화면의 대사 탭에서 바로 고칠 수 있다고, 없으면 "대사 없음"과 Writer 콘티에서 넣는다고 안내한다
//   (대사 탭은 있는 줄의 글만 고친다 — 검토 rev-flow-2-2 3번, components/shot-dialogue, Director 상세와 같은 부품).
//   고치기는 생성 요청을 바로 부르지 않는다 — Director 샷 상세(O5)와 같은 [Lumi 에게 고쳐 달라고 하기]로 채팅에 보내고 창을 닫는다(lib/storyboard/fix-in-chat).
//   채팅이 그 샷 실사를 다시 그리고,
//   그리는 동안 그 카드에만 기다림이 뜬다. 그 샷을 그리는 중이면 고치기를 끄고 까닭을 보인다(같은 샷 두 번 맡기기는 서버가 거절한다).
//   이야기 · 화살표 · 대사는 Writer 콘티에서 고친다(O7) — 여기서는 보기만 한다.
//   지난 판(오너 2026-11-26 S3): 카드의 지난 판 줄에서 연 판이면 큰 그림 자리에 그 판을 보이고, 그 아래 보는 판 줄의 [채택]이
//   Director 와 같은 이미지 판 고르기 길로 그 판을 지금 그림으로 만든다(lib/storyboard/adopt-version, 다시 그리지 않음). 그리는 중이면 끈다.
//   실사 가운데 장 화살표(오너 2026-11-27 N4b): 큰 그림 아래 [화살표 고치기] — 큰 그림 자리에 콘티와 같은 편집기(실사 길)가 열리고,
//   저장하면 묻지 않고 끝 장을 다시 그린다(그 카드에만 기다림). 그린 것이 있으면 창을 닫기 전에 묻는다(features/storyboard/real-arrow-edit).
//   약속: tests/writer/real-dialog.test.ts · real-history.test.ts · real-history-view.test.ts · real-arrow-dialog.test.ts
import { useState } from 'react'
import { ImageOff, MessageCircle, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { RoughFrameCycle } from '@/components/rough-frame-cycle'
import { ShotDialogue } from '@/components/shot-dialogue'
import { sceneShotName } from '@/lib/board-names'
import { useActiveGenerationJobs } from '@/lib/generation-queue'
import { useLocale, useT } from '@/lib/i18n'
import { sendFixToChat } from '@/lib/storyboard/fix-in-chat'
import { storyboardMentionLabels } from '@/lib/storyboard/mention'
import { realDrawingShotIds, storyboardCardPicture } from '@/lib/storyboard/real-board'
import { useStoryboardRealImages } from '@/lib/storyboard/real-images-store'
import { adoptStoryboardVersion } from '@/lib/storyboard/adopt-version'
import { currentStoryboardVersion, storyboardImageVersions } from '@/lib/director/storyboard-image-versions'
import { VersionViewingBar } from '@/components/version-history/version-viewing-bar'
import { useBoardUiStore } from '@/features/writer/board-ui-store'
import { EndRedrawAsk, UnsavedArrowsConfirm, useUnsavedArrowsGuard } from '@/features/writer/unsaved-arrows-confirm'
import { RealArrowEditPane, fixSendRequest, sameProjectReload } from '@/features/storyboard/real-arrow-edit'
import { realArrowEntry } from '@/lib/storyboard/real-arrow-edit'
import type { StoryboardImage } from '@/types/director'
import { boardShots } from '@/lib/writer/board-summary'
import { manifestEntities, resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

const NO_IMAGES: Readonly<Record<string, unknown>> = {}

type Guard = ReturnType<typeof useUnsavedArrowsGuard>

export function RealShotDialog({ shotId, onOpenChange }: { shotId: string | null; onOpenChange: (open: boolean) => void }) {
  // 화살표 편집기에 저장하지 않은 것이 있으면 닫기 전에 묻는다(콘티와 같은 물음) — 끝 장 물음 창(줄 적기 · 고쳐서 다시 그리기)도 여기서 연다.
  const guard = useUnsavedArrowsGuard(() => onOpenChange(false))
  return (
    <>
      <Dialog open={!!shotId} onOpenChange={(open) => { if (!open) guard.requestClose() }}>
        {shotId ? <RealShotDialogBody key={shotId} shotId={shotId} onClose={() => onOpenChange(false)} guard={guard} /> : null}
      </Dialog>
      <UnsavedArrowsConfirm {...guard.confirm} />
      <EndRedrawAsk {...guard.endAsk} />
    </>
  )
}

function RealShotDialogBody({ shotId, onClose, guard }: { shotId: string; onClose: () => void; guard: Guard }) {
  const t = useT()
  const locale = useLocale()
  const projectId = useProjectStore((state) => state.projectId)
  const sceneManifest = useWriterStore((state) => state.sceneManifest)
  const shots = useWriterStore((state) => state.shots)
  const images = useStoryboardRealImages((state) => (state.projectId === projectId ? state.images : NO_IMAGES))
  const activeJobs = useActiveGenerationJobs(projectId)
  const [change, setChange] = useState('')
  const [busyNotice, setBusyNotice] = useState(false)
  // 지난 판 줄에서 연 판(S3) — 이 샷 상세를 그 판으로 열었을 때만. [채택]을 저장하는 중 · 저장 실패.
  const viewingId = useBoardUiStore((state) => (state.shotEditId === shotId ? state.shotEditVersionId : null))
  // 실사 가운데 장 화살표 편집을 연 샷(N4b).
  const arrowEditing = useBoardUiStore((state) => state.realArrowShotId === shotId)
  const [adopting, setAdopting] = useState(false)
  const [adoptError, setAdoptError] = useState<string | null>(null)

  const entry = boardShots(sceneManifest, shots).find((item) => item.shot.shotId === shotId)
  if (!entry) return null
  const shot = entry.shot
  const label = sceneShotName(locale, entry.sceneNo, entry.shotNo)
  const mentionLabel = storyboardMentionLabels(sceneManifest, shots, locale).shots.get(shotId)
  const picture = storyboardCardPicture(shot.roughStoryboard, images[shotId])
  // 큐에 떠 있는 실사 작업 + 끝 장 작업이 큐에 오르기 전 틈(cardDrawing — 화살표 저장 뒤 · 물음 창 [다시 그리기], 검토 rev-realarrow 2).
  const cardDrawing = useBoardUiStore((state) => !!projectId && state.cardDrawing[shotId] === projectId)
  const drawing = realDrawingShotIds(activeJobs).has(shotId) || cardDrawing
  const entityNames = manifestEntities(sceneManifest)
  const nameOf = new Map((sceneManifest?.characters ?? []).map((c) => [c.characterId, c.name]))
  const canSend = !!mentionLabel && !!change.trim() && !drawing
  // 보고 있는 지난 판 — 지금 그림인 판이면 없다(채택하면 지금 그림이 되어 저절로 사라진다).
  const raw = images[shotId] && typeof images[shotId] === 'object' ? (images[shotId] as StoryboardImage) : null
  const current = currentStoryboardVersion(raw)
  const viewing = viewingId && viewingId !== current?.id ? storyboardImageVersions(raw).find((version) => version.id === viewingId) ?? null : null
  const backToCurrent = () => useBoardUiStore.getState().openShotVersion(shotId, null)
  // [화살표 고치기] — 지금 그림이 세 장 실사일 때만(지난 판을 보는 동안은 아님), 그 샷을 그리는 중이면 잠근다(혼자 정한 것 h · g).
  const arrows = realArrowEntry({ image: images[shotId], viewingPast: !!viewing, drawing })
  const editingArrows = arrowEditing && arrows.show
  // 끝 장은 1분 넘게 걸린다 — 그사이 다른 프로젝트로 옮겼으면 다시 읽지 않는다(검토 rev-realarrow 4).
  const reloadReal = projectId
    ? sameProjectReload(projectId, () => useProjectStore.getState().projectId, () => useStoryboardRealImages.getState().load(projectId, { fresh: true }))
    : async () => {}
  // [채택] — Director 상세와 같은 판 고르기(다시 그리지 않는다). 카드 그림을 새로 읽은 뒤 보는 판을 닫는다. 못 고르면 보던 판에 남아 까닭을 보인다.
  const adopt = async () => {
    if (!viewing || drawing || !projectId) return
    setAdopting(true)
    setAdoptError(null)
    try {
      if (await adoptStoryboardVersion(projectId, shotId, viewing.id)) backToCurrent()
      else setAdoptError(t('Could not adopt this version. Please try again.'))
    } finally {
      setAdopting(false)
    }
  }

  const send = () => {
    if (!canSend || !mentionLabel) return
    const deliver = () => {
      const result = sendFixToChat(mentionLabel, change)
      // 채팅이 다른 말을 처리하는 중이면 보내지 않았다 — 창을 닫지 않고 까닭을 보인다(Director 상세와 같다).
      setBusyNotice(result === 'busy')
      if (result === 'sent') onClose()
    }
    // 저장하지 않은 화살표가 있으면 보내기(창이 닫힌다) 전에 먼저 묻는다(검토 rev-realarrow 6) — 저장 · 버리기를 고르면 보낸다.
    if (fixSendRequest(guard.dirty) === 'ask') guard.requestLeave(deliver)
    else deliver()
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
          {editingArrows && projectId ? (
            // 큰 그림 자리를 실사 편집기가 차지한다 — [그림으로 돌아가기]는 그린 것이 있으면 먼저 묻는다.
            <RealArrowEditPane
              projectId={projectId}
              shotId={shotId}
              image={images[shotId]}
              drawing={drawing}
              guard={guard}
              onChanged={reloadReal}
              onBack={() => useBoardUiStore.getState().setRealArrowShotId(null)}
            />
          ) : viewing ? (
            // 지난 판(S3) — 그 판의 시작 · 연출 · 끝을 같은 순환으로 보인다.
            <div className="relative overflow-hidden rounded-[14px]">
              <RoughFrameCycle
                key={viewing.id}
                panel={{ url: viewing.frames?.start ?? viewing.url, generatedAt: viewing.generatedAt, ...(viewing.frames ? { frames: viewing.frames } : {}) }}
                alt={label}
                introPlay
                sizeToImage
                frameTag
              />
            </div>
          ) : picture.kind === 'none' ? (
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
          {arrows.show && !editingArrows ? (
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              disabled={arrows.locked}
              onClick={() => useBoardUiStore.getState().setRealArrowShotId(shotId)}
              data-testid="real-arrow-edit-open"
            >
              <PenLine className="size-3.5" aria-hidden />
              {t('Edit arrows')}
            </Button>
          ) : null}
          {viewing ? (
            <VersionViewingBar
              text={current ? t('Viewing v{n} · Current v{current}', { n: viewing.n, current: current.n }) : t('Viewing v{n}', { n: viewing.n })}
              adoptDisabled={drawing}
              adoptReason={drawing ? t('You can adopt it after the image is remade.') : null}
              busy={adopting}
              error={adoptError}
              onAdopt={adopt}
              onBack={() => { setAdoptError(null); backToCurrent() }}
              testId="storyboard-detail-viewing"
              adoptTestId="storyboard-detail-adopt"
            />
          ) : null}
          <p className="text-body leading-relaxed text-foreground">{resolveEntityNames(shot.actionDescription, entityNames)}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-4 border-t border-border-subtle p-6 md:overflow-y-auto md:border-l md:border-t-0">
          <ShotDialogue
            lines={shot.dialogueLines}
            characterNames={nameOf}
            entityNames={entityNames}
            hint={t('You can also edit the dialogue right in the Dialogue tab of this screen.')}
            emptyHint={t('Add dialogue in the rough storyboard on the Writer screen.')}
          />
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
          <Button onClick={send} disabled={!canSend} className="self-start" data-testid="storyboard-fix-in-chat">
            <MessageCircle className="size-4" aria-hidden />
            {t('Ask Lumi to fix')}
          </Button>
          {busyNotice ? <p className="text-caption text-destructive">{t('Lumi is busy with another request. Try again when it is done.')}</p> : null}
          {/* 실사 그림의 화살표는 이 창의 [화살표 고치기]로 고친다(오너 2026-11-27 N4b) — 이야기 · 대사만 Writer 콘티로 안내한다. */}
          <p className="text-caption text-subtle-foreground">{t('Fix the story and dialogue in Writer.')}</p>
        </div>
      </div>
    </DialogContent>
  )
}
