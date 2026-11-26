'use client'

// 실사 가운데(연출) 장 화살표 고치기 칸(오너 2026-11-27 N4b "실사 이미지에서 화살표 수정하면 뒤에 마지막 프레임 수정해줘. (이미지만)") — 시안 없음.
//   Storyboard 실사 카드 상세(real-shot-dialog — 왼쪽 큰 그림 자리)와 Director 샷 팝업 이미지 탭(겹창 RealArrowEditDialog)이 같은 칸을 쓴다.
//   편집기는 콘티와 같은 부품(층 나누기 · 펜 · 지우개 · 저장)이고 요청만 실사 길로 간다(surface 'real').
//   저장하면 묻지 않고 끝 장을 다시 그린다(1분 넘게) — 그 카드에만 기다림, 화면 · 채팅은 그대로. 영상은 만들지 않는다.
//   AI 가 읽은 한 줄은 편집기 아래에 보이고, [고쳐서 끝 장 다시 그리기]는 콘티와 같은 물음 창(실사 길)으로 연다.
//   규칙: lib/storyboard/real-arrow-edit · 약속: tests/writer/real-arrow-dialog.test.ts · tests/director/real-arrow-popup.test.ts
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DirectingArrowEditor } from '@/features/writer/directing-arrow-editor'
import { EndRedrawAsk, UnsavedArrowsConfirm, closeRequest, endRedrawDeps, runEndRedraw, useUnsavedArrowsGuard, type EndAskTarget } from '@/features/writer/unsaved-arrows-confirm'
import { useBoardUiStore } from '@/features/writer/board-ui-store'
import { refreshGenerationQueue } from '@/lib/generation-queue'
import { useT } from '@/lib/i18n'
import { realEditorPanel } from '@/lib/storyboard/real-arrow-edit'
import { directingEditUrl } from '@/lib/writer/directing-edit-url'

type Guard = ReturnType<typeof useUnsavedArrowsGuard>

/** 실사 끝 장 대상 — 실사 길로 보내고, 그리는 동안(저장 뒤 자동 · 물음 창 [다시 그리기] 모두) 그 카드 표시(cardDrawing)를 켜고 끈다(검토 rev-realarrow 2).
 *  카드 표시는 보드 카드 기다림 · 상세 잠금 · 편집기 잠금이 같이 본다 — 큐에 오르기 전 틈도 잠긴다. */
export function realEndTarget(projectId: string, shotId: string, onChanged: () => Promise<void>): EndAskTarget {
  return {
    projectId,
    shotId,
    onRedrawn: onChanged,
    endpoint: directingEditUrl('real'),
    track: (busy) => {
      const board = useBoardUiStore.getState()
      if (busy) board.markCardDrawing(projectId, shotId)
      else board.clearCardDrawing(projectId, shotId)
    },
  }
}

/** [Lumi 에게 고쳐 달라고 하기] — 저장하지 않은 화살표가 있으면 보내기 전에 먼저 묻는다(보내면 창이 닫혀 그린 것을 잃는다, 검토 rev-realarrow 6). 순수 함수. */
export function fixSendRequest(dirty: boolean): 'ask' | 'send' {
  return closeRequest(dirty) === 'ask' ? 'ask' : 'send'
}

/** 끝 장이 늦게 끝나 다시 읽을 때 — 지금 프로젝트가 그 프로젝트일 때만(그사이 옮겼으면 옛 프로젝트 그림으로 지금 화면을 덮지 않는다, 검토 rev-realarrow 4). */
export function sameProjectReload(projectId: string, currentProjectId: () => string | null, reload: () => Promise<void>): () => Promise<void> {
  return async () => {
    if (currentProjectId() === projectId) await reload()
  }
}

/**
 * 화살표를 저장한 뒤 — 묻지 않고 실사 끝 장을 다시 그린다(N4b). 작업을 받으면 바로 다시 읽어 읽은 줄을 편집기 아래에 보이고,
 *   못 읽었으면 줄을 직접 적는 물음 창을 연다. 다 그릴 때까지 그 카드에 기다림(cardDrawing — 큐에 오르기 전 틈도). 다 그리면 true.
 */
export function startRealEndRedraw(input: {
  projectId: string
  shotId: string
  onChanged: () => Promise<void>
  t: ReturnType<typeof useT>
  askLine: (target: EndAskTarget) => void
}): Promise<boolean> {
  const { projectId, shotId, onChanged, t, askLine } = input
  const target = realEndTarget(projectId, shotId, onChanged)
  return runEndRedraw(target, {
    ...endRedrawDeps(target, t),
    accepted: async () => {
      refreshGenerationQueue()
      await onChanged()
    },
    unreadable: () => askLine(target),
  })
}

/** 편집 칸 — 머리(제목 · 설명 · [그림으로 돌아가기]) + 실사 편집기. onBack 이 없으면(겹창) 머리를 그리지 않는다 — 창 머리가 대신한다. */
export function RealArrowEditPane({
  projectId,
  shotId,
  image,
  drawing,
  guard,
  onChanged,
  onBack,
}: {
  projectId: string
  shotId: string
  /** shots.storyboard_image 그대로. */
  image: unknown
  /** 그 샷 실사를 그리는 중(작업 큐) — 고칠 수 없게 잠근다(혼자 정한 것 g). */
  drawing: boolean
  guard: Guard
  /** 실사 시트를 다시 읽는다(Storyboard = 실사 그림 저장소, Director = 캔버스). */
  onChanged: () => Promise<void>
  onBack?: () => void
}) {
  const t = useT()
  // 끝 장을 다시 그리는 중(저장 뒤 ~ 다 그릴 때까지) — 큐에 오르기 전 틈에도 다시 저장하지 못하게 잠근다. 물음 창 [다시 그리기] 길은
  //   그 카드 표시(cardDrawing)로 잠긴다(같은 표시를 이 화면도 본다 — Director 에서도).
  const [redrawing, setRedrawing] = useState(false)
  const cardDrawing = useBoardUiStore((state) => state.cardDrawing[shotId] === projectId)
  const panel = realEditorPanel(image)
  const target = realEndTarget(projectId, shotId, onChanged)
  const redraw = () => {
    setRedrawing(true)
    void startRealEndRedraw({ projectId, shotId, onChanged, t, askLine: (next) => void guard.askEnd(next) }).finally(() => setRedrawing(false))
  }
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="real-arrow-edit">
      {onBack ? (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-label font-semibold text-foreground">{t('Edit the arrows on the middle frame')}</p>
            <p className="break-keep text-caption text-muted-foreground">{t('When you save, the end frame is redrawn to match your arrows. It takes over a minute.')}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => guard.requestSwitch('edit', 'view', onBack)} data-testid="real-arrow-edit-back">
            {t('Back to the picture')}
          </Button>
        </div>
      ) : null}
      {panel ? (
        <DirectingArrowEditor
          key={shotId}
          projectId={projectId}
          shotId={shotId}
          panel={panel}
          surface="real"
          lockedReason={drawing || redrawing || cardDrawing ? t('This shot is being drawn. You can change it when it is done.') : null}
          onSaved={() => void onChanged()}
          ref={guard.editorRef}
          onDirtyChange={guard.setDirty}
          // 저장하면 묻지 않고 끝 장을 다시 그린다(N4b — 콘티처럼 [그대로]를 고르는 물음이 없다).
          onArrowsSaved={redraw}
          onRedrawEnd={() => void guard.askEnd(target)}
        />
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-center text-caption text-muted-foreground">
          {t('This shot has no three-frame image to edit. Make the image first.')}
        </p>
      )}
    </div>
  )
}

/** Director 샷 팝업 이미지 탭의 겹창 — 같은 칸을 창 하나에. 그린 것이 있으면 닫기 전에 묻고(콘티와 같은 물음), 끝 장 물음 창도 여기서 연다. */
export function RealArrowEditDialog({
  open,
  onOpenChange,
  projectId,
  shotId,
  image,
  drawing,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  shotId: string
  image: unknown
  drawing: boolean
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const guard = useUnsavedArrowsGuard(() => onOpenChange(false))
  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next) guard.requestClose() }}>
        <DialogContent frame="work" className="flex max-h-[92vh] flex-col gap-3 overflow-y-auto sm:max-w-[720px]" data-testid="real-arrow-edit-dialog">
          <DialogHeader>
            <DialogTitle>{t('Edit the arrows on the middle frame')}</DialogTitle>
            <DialogDescription className="break-keep">{t('When you save, the end frame is redrawn to match your arrows. It takes over a minute.')}</DialogDescription>
          </DialogHeader>
          {open ? <RealArrowEditPane projectId={projectId} shotId={shotId} image={image} drawing={drawing} guard={guard} onChanged={onChanged} /> : null}
        </DialogContent>
      </Dialog>
      <UnsavedArrowsConfirm {...guard.confirm} />
      <EndRedrawAsk {...guard.endAsk} />
    </>
  )
}
