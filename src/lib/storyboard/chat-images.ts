'use client'

// Storyboard 채팅 답의 실사 그림 요청(generateImage)을 화면이 맡기는 길(오너 2026-11-26 m1126 O7 "채팅으로").
//   Director 채팅 generateImage 와 같은 뜻: 샷 하나 = 그 샷 한 장 다시 그리기(Director 상세 [이미지 고치기]와 같은 요청 — lib/storyboard/redraw-image),
//   샷 없음 = [시작]과 같은 샷들(실사 없음 · 콘티 있음)을 같은 일괄로(lib/storyboard/start-real).
//   못 맡기면 까닭을 채팅 한 줄(⚠)로 남긴다 — 그리는 중 · 콘티 그림 없음 · 없는 샷 · 시트 없음 · 맡긴 뒤 실패. 자리 부족 · 내용 규칙은 공용 안내가 이미 말한다.
//   카드 기다림은 작업 큐가 맡는다(맡기자마자 큐를 다시 읽는다). 약속: tests/chat/storyboard-chat-images.test.ts
import { shotName } from '@/lib/board-names'
import { activeJobsSnapshot } from '@/lib/generation-queue'
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import type { StoryboardImageUpdate } from '@/lib/storyboard/chat-image-tool'
import { realDrawingShotIds, realPanelOf, storyboardStartView } from '@/lib/storyboard/real-board'
import { useStoryboardRealImages } from '@/lib/storyboard/real-images-store'
import { redrawStoryboardImage } from '@/lib/storyboard/redraw-image'
import { startStoryboardReal } from '@/lib/storyboard/start-real'
import { boardShots } from '@/lib/writer/board-summary'
import { isRoughDrawn } from '@/lib/writer/rough-progress'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useWriterStore } from '@/stores/writer-store'

/** 실사 그림 요청을 맡긴다. notify = 채팅 한 줄(그 채팅 언어로 지은 글), locale = 그 글의 언어. */
export async function runStoryboardImageUpdates(
  projectId: string,
  updates: readonly StoryboardImageUpdate[],
  opts: { locale: AppLocale; notify: (line: string) => void; traceId?: string },
): Promise<void> {
  const { locale, notify } = opts
  const writer = useWriterStore.getState()
  const board = boardShots(writer.sceneManifest, writer.shots)
  const stored = useStoryboardRealImages.getState()
  const images: Readonly<Record<string, unknown>> = stored.projectId === projectId ? stored.images : {}
  const drawing = realDrawingShotIds(activeJobsSnapshot(projectId))
  const director = useDirectorCanvasStore.getState()
  for (const update of updates) {
    if (!update.id) {
      // [시작]과 같은 샷 — 실사 없음 · 콘티 있음 · 그리는 중 아님, 보드 순서.
      const view = storyboardStartView({
        shots: board.map((entry) => entry.shot),
        realOf: (shotId) => images[shotId],
        drawing,
        batch: { busy: director.realBatchBusy, cancelled: director.realBatchCancelled, shotIds: director.realBatchShotIds },
      })
      if (view.targets.length > 0) await startStoryboardReal(projectId, view.targets)
      continue
    }
    const entry = board.find((item) => item.shot.shotId === update.id)
    if (!entry) {
      notify(`⚠ ${translate(locale, "Couldn't find the shot to draw. Ask again with the shot name.")}`)
      continue
    }
    const name = shotName(locale, entry.shotNo)
    if (drawing.has(entry.shot.shotId)) {
      notify(`⚠ ${translate(locale, '{shot} is being drawn right now. Ask again when it is done.', { shot: name })}`)
      continue
    }
    if (!realPanelOf(images[entry.shot.shotId]) && !(entry.shot.roughStoryboard && isRoughDrawn(entry.shot.roughStoryboard))) {
      notify(`⚠ ${translate(locale, '{shot} has no rough storyboard. Draw it in Writer, then ask again.', { shot: name })}`)
      continue
    }
    const outcome = await redrawStoryboardImage({ projectId, shot: entry.shot, change: update.change ?? '', traceId: opts.traceId })
    if (outcome.ok) {
      void outcome.done.then((done) => {
        if (done === 'failed') notify(`⚠ ${translate(locale, "Couldn't redraw {shot}. Please ask again.", { shot: name })}`)
      })
      continue
    }
    if (outcome.reason === 'busy') notify(`⚠ ${translate(locale, '{shot} is being drawn right now. Ask again when it is done.', { shot: name })}`)
    else if (outcome.reason === 'missing_sheets' || outcome.reason === 'error') notify(`⚠ ${outcome.message}`)
  }
}
