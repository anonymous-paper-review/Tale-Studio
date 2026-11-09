// Storyboard 러프 보드 카드의 액션 글 크기가 열 수(축척)에 따라 어떻게 정해지는지 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STORYBOARD_ZOOM_DEFAULT, storyboardColumns } from '@/components/generating-frame'
import { boardStoryFontSize } from '@/lib/writer/board-card'

describe('러프 보드 카드 액션 글 크기', () => {
  // 왜: 11/5 시안 S1 카드 액션 글은 13.5px(UI/Label 500)이다 — 기본 축척(3열)에서 시안과 같은 크기여야 한다(오너 2026-11-09 "새 버전으로 적용").
  //   Director 격자와 같이 쓰던 크기표는 3열에 12px 이라 시안보다 작았다(11/9 실측).
  it('기본 축척(3열)에서 카드 액션 글은 시안처럼 13.5px 이다', () => {
    expect(boardStoryFontSize(3)).toBe('13.5px')
  })

  // 왜: 축척을 줄여 열이 늘면 카드가 좁아져 글도 같이 줄어야 글 전체가 들어간다(#zoom-desc) — 열이 줄면 커진다.
  it('열이 늘면 글이 작아지고 열이 줄면 커지며, 1~6열 밖은 가장 가까운 끝 값을 쓴다', () => {
    const sizes = [1, 2, 3, 4, 5, 6].map((columns) => parseFloat(boardStoryFontSize(columns)))
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThan(sizes[i - 1])
    expect(boardStoryFontSize(0)).toBe(boardStoryFontSize(1))
    expect(boardStoryFontSize(9)).toBe(boardStoryFontSize(6))
  })

  // 왜: 13.5px 는 "처음 여는 보드 = 3열"을 전제로 한 값이다 — 기본 축척이 바뀌면 처음 여는 보드의 글이 시안과 달라진다(검토 C 4, 리드 2026-11-09).
  it('축척을 만진 적 없는 보드는 3열로 열린다', () => {
    expect(storyboardColumns(STORYBOARD_ZOOM_DEFAULT)).toBe(3)
  })

  // 왜: 크기표가 맞아도 보드가 Director 격자와 같이 쓰던 옛 크기표(3열 12px)를 읽으면 화면 글은 시안보다 작다 — 크기표만 보는 검사로는 못 잡는다(검토 C 4).
  it('보드 카드 액션 글은 지금 축척의 열 수로 보드 전용 크기표를 읽는다', () => {
    const board = readFileSync('src/features/writer/rough-storyboard-view.tsx', 'utf8')
    expect(board).toContain('const cols = storyboardColumns(zoomLevel)')
    expect(board).toContain('const descFontSize = boardStoryFontSize(cols)')
    expect(board).toContain('style={{ fontSize: descFontSize }}')
    expect(board).not.toContain('storyboardDescriptionFontSize')
  })
})
