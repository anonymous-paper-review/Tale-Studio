// Storyboard 보드에서 그리는 카드가 어떤 기다림 모습(가벼운 표시 · 카드 전체 기다림 카드 · 좁은 카드 줄임)을 쓰는지 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cardWaitLook } from '@/lib/writer/board-card'

describe('그리는 카드의 기다림 모습', () => {
  // 왜: 보드가 잠긴 동안은 잠금 화면이 보드를 덮어 카드가 보이지 않고, 러프는 여러 장을 한꺼번에 그려 카드마다 움직이는 Lumi 를 띄우면
  //   그 수만큼 WebGL 이 생긴다(eaa42d21, 리드 확인 2026-11-09). 잠금 없이 그리는 카드(더한 샷)만 11/5 SYS 노드 · 카드 위 기다림으로 덮는다.
  it('그리는 카드는 보드가 잠긴 동안 예전 가벼운 표시를 쓰고, 잠기지 않았으면 카드 전체 기다림 카드를 쓴다', () => {
    expect(cardWaitLook({ drawing: true, boardLocked: true, columns: 3 })).toBe('light')
    expect(cardWaitLook({ drawing: true, boardLocked: false, columns: 3 })).toBe('card')
    const board = readFileSync('src/features/writer/rough-storyboard-view.tsx', 'utf8')
    expect(board).toContain('cardWaitLook(')
  })

  // 왜: 축척 5 · 6열 카드(174 · 143px)에는 Lumi S · 제목 · 설명 · 여백 18 이 다 들어가지 않는다(11/9 실측) — 설명을 빼고 여백을 줄인다.
  it('축척 5 · 6열의 좁은 카드는 기다림 카드에서 설명을 빼고 여백을 줄이며, 4열까지는 그대로다', () => {
    expect(cardWaitLook({ drawing: true, boardLocked: false, columns: 4 })).toBe('card')
    expect(cardWaitLook({ drawing: true, boardLocked: false, columns: 5 })).toBe('card-compact')
    expect(cardWaitLook({ drawing: true, boardLocked: false, columns: 6 })).toBe('card-compact')
    expect(cardWaitLook({ drawing: true, boardLocked: true, columns: 6 })).toBe('light')
  })

  // 왜: 정상 경로 고정 — 그리는 중이 아닌 카드(다 그림 · 자리 기다림 · 실패 · 스토리 없음)는 기다림 표시를 하지 않는다.
  it('그리지 않는 카드에는 기다림 표시가 없다', () => {
    expect(cardWaitLook({ drawing: false, boardLocked: true, columns: 3 })).toBe('none')
    expect(cardWaitLook({ drawing: false, boardLocked: false, columns: 6 })).toBe('none')
  })
})
