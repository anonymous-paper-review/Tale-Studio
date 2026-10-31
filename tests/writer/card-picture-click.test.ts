// Storyboard 보드 카드의 그림을 누르면 그 샷 고치기 팝업이 열리는지(그림 누르기가 멈춤으로 먹히지 않는지) 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { frameClickAction } from '@/components/rough-frame-cycle'

const board = readFileSync('src/features/writer/rough-storyboard-view.tsx', 'utf8')

describe('보드 카드 그림 누르기', () => {
  // 왜: 2026-10-31 오너 전달 피드백 "스토리보드 수정 기능이 죽어 있다" — 카드의 대부분이 그림인데, 그림을 누르면 세 장 순환만 멈추고
  //   고치기 팝업이 열리지 않았다(글 줄을 눌러야만 열림). 프로토타입 S1 은 카드를 누르면 언제나 상세다.
  it('Storyboard 보드에서 카드의 그림을 누르면 순환을 멈추지 않고 그 샷 고치기 팝업이 열린다', () => {
    expect(frameClickAction({ frameCount: 3, pauseOnClick: false })).toBe('card')
    const cycle = board.slice(board.indexOf('<RoughFrameCycle'), board.indexOf('/>', board.indexOf('<RoughFrameCycle')))
    expect(cycle).toContain('pauseOnClick={false}')
    expect(board).toContain('onClick={() => openDetail(shot.shotId)}')
  })

  // 왜: Director 그리드 · 샷 노드는 그림을 눌러 한 장에 멈춰 보는 쓰임이 그대로다(2026-08-06 #ux-batch-0806). 정상 경로 고정.
  it('따로 정하지 않은 곳(Director 그리드)에서 세 장 그림을 누르면 지금처럼 순환이 멈추고, 한 장짜리는 카드 누르기로 넘긴다', () => {
    expect(frameClickAction({ frameCount: 3, pauseOnClick: true })).toBe('pause')
    expect(frameClickAction({ frameCount: 1, pauseOnClick: true })).toBe('card')
  })
})
