// 그림이 있는 카드를 다시 그릴 때는 화면 · 채팅 · 레일을 잠그지 않고 그 카드에만 기다림을 보이는지, 고치기 창은 그리기를 맡기고 바로 닫히는지 검사한다 (오너 2026-11-26 W5)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { lockingShots, redrawLocksBoard } from '@/lib/writer/board-busy'
import { redrawBlockedWhileDrawing } from '@/lib/writer/shot-edit'
import { cardWaitLook } from '@/lib/writer/board-card'
import { useBoardUiStore } from '@/features/writer/board-ui-store'
import { translate } from '@/lib/i18n/translate'
import type { RoughStoryboardImage } from '@/types'

const drawn: RoughStoryboardImage = { url: 'https://m/a.png', status: 'completed', errorMessage: null, generatedAt: 1 } as RoughStoryboardImage
const failed: RoughStoryboardImage = { url: null, status: 'failed', errorMessage: 'x', generatedAt: 1 } as unknown as RoughStoryboardImage
const shots = [
  { shotId: 'a', roughStoryboard: drawn },
  { shotId: 'b', roughStoryboard: null },
  { shotId: 'c', roughStoryboard: failed },
]
const read = (path: string) => readFileSync(path, 'utf8')

beforeEach(() => {
  useBoardUiStore.setState({ cardDrawing: {} })
})

describe('카드 위 기다림', () => {
  // 왜: W5 — 콘티 카드를 고쳐 다시 그릴 때 화면 전체를 막는 창 대신 그 카드에만 기다림을 보인다. 잠금은 그림이 없는 컷을 처음 그릴 때만 센다.
  it('그림이 있는 카드를 다시 그리는 동안에는 보드를 잠그지 않고, 그림이 없는 컷을 처음 그릴 때만 지금처럼 잠근다', () => {
    expect(lockingShots(shots).map((s) => s.shotId)).toEqual(['b', 'c'])
    // 잠그지 않으니 그리는 카드는 카드 전체를 덮는 기다림 카드로 보인다(잠금 중에는 옅은 표시).
    expect(cardWaitLook({ drawing: true, boardLocked: false, columns: 3 })).toBe('card')
  })

  // 왜(혼자 정한 것): 채팅 [러프 다시 그리기] · [남은 컷 다시 그리기]가 여러 컷을 한 번에 보낼 때도 같은 규칙 — 그림이 없는 컷이 하나라도 있으면 그 컷의 첫 그리기라 잠근다.
  it('여러 컷을 다시 그릴 때 그림이 있는 카드만이면 잠그지 않고, 그림이 없는 컷이 하나라도 있으면 지금처럼 잠근다', () => {
    expect(redrawLocksBoard(['a'], shots)).toBe(false)
    expect(redrawLocksBoard(['a', 'b'], shots)).toBe(true)
    expect(redrawLocksBoard(['c'], shots)).toBe(true)
  })

  // 왜(혼자 정한 것): 같은 샷을 두 번 맡기면 서버가 둘째를 거절하는데 고친 글은 이미 저장돼 글과 그림이 어긋난다 — 그리는 동안은 다시 그리는 단추를 끈다.
  //   대사만 고친 [적용]은 그림을 건드리지 않으니 그리는 중에도 된다.
  it('그리는 중인 카드의 고치기 창에서는 다시 그리는 [적용]이 꺼지고, 대사만 고친 [적용](저장만)은 그리는 중에도 된다', () => {
    expect(redrawBlockedWhileDrawing(true, 'redraw')).toBe(true)
    expect(redrawBlockedWhileDrawing(true, 'save')).toBe(false)
    expect(redrawBlockedWhileDrawing(false, 'redraw')).toBe(false)
    expect(translate('ko', 'This shot is being drawn. You can redraw it once it is done.')).toBe('이 샷을 그리는 중이에요. 다 그린 뒤 다시 그릴 수 있어요.')
  })

  // 왜: W5 — [연출만 다시 만들기]처럼 창이 기다리던 그리기도 창을 닫고 그 카드에 기다림을 보인다. 표시는 그 프로젝트의 그 카드에만.
  it('고치기 창이 맡긴 그리기는 끝날 때까지 그 프로젝트의 그 카드에만 기다림 표시를 남긴다', () => {
    const ui = useBoardUiStore.getState()
    ui.markCardDrawing('p1', 'a')
    expect(useBoardUiStore.getState().cardDrawing).toEqual({ a: 'p1' })
    ui.clearCardDrawing('p2', 'a')
    expect(useBoardUiStore.getState().cardDrawing).toEqual({ a: 'p1' })
    ui.clearCardDrawing('p1', 'a')
    expect(useBoardUiStore.getState().cardDrawing).toEqual({})
  })
})

describe('보드 · 고치기 창 배선', () => {
  // 왜: 위 규칙이 보드에 실제로 걸려야 한다 — 잠금은 그림 없는 컷만 세고, 그림 있는 카드만 다시 그리는 그리기는 잠그지 않는다.
  it('보드의 잠금은 그림이 없는 컷만 세고, 다시 그리기 묶음은 그림이 있는 카드만이면 잠그지 않은 채 그린다', () => {
    const board = read('src/features/writer/rough-storyboard-view.tsx')
    expect(board).toMatch(/const lockProgress = summarizeRoughProgress\(lockingShots\(withoutAddedShots\(shots, addedViews\)\)/)
    expect(board).toMatch(/const locks = redrawLocksBoard\(shotIds, useWriterStore\.getState\(\)\.shots\)/)
    expect(board).toMatch(/if \(!roughRedrawRequest \|\| pumpActive \|\| quietPump \|\| !projectId\) return/)
    expect(board).toMatch(/cardDrawing\[shotId\] === projectId/)
    expect(board).toMatch(/<StoryboardShotDialog[\s\S]{0,200}drawing=\{/)
  })

  // 왜: W5 — [적용 · 러프 다시 그리기]는 저장하고 그리기를 보드에 맡긴 뒤 창을 닫는다. 다 그릴 때까지 창 위에서 기다리지 않는다.
  it('고치기 창 [적용 · 러프 다시 그리기]는 저장하고 보드에 그리기를 맡긴 뒤 창을 닫는다 — 다 그릴 때까지 기다리지 않는다', () => {
    const dialog = read('src/features/writer/storyboard-shot-dialog.tsx')
    expect(dialog).toMatch(/useBoardUiStore\.getState\(\)\.requestRoughRedraw\(projectId, \[shot\.shotId\]\)/)
    expect(dialog).not.toMatch(/pollGenerationJob/)
    expect(dialog).not.toMatch(/<AiBusyOverlay/)
  })

  // 왜: W5 — [연출만 다시 만들기]도 창을 닫고 그 카드에 기다림을 보인다. 끝나면(실패해도) 표시를 지우고 새 그림을 읽는다.
  it('[연출만 다시 만들기]는 창을 닫고 끝날 때까지 그 카드에 기다림을 보인다', () => {
    const dialog = read('src/features/writer/storyboard-shot-dialog.tsx')
    expect(dialog).toMatch(/markCardDrawing\(projectId, shotId\)[\s\S]{0,200}onOpenChange\(false\)/)
    expect(dialog).toMatch(/finally \{[\s\S]{0,200}clearCardDrawing\(projectId, shotId\)/)
  })
})
