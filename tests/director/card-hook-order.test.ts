// 스토리보드 카드(ShotCell)는 모든 훅을 조기 반환보다 앞에서 부른다 — 렌더마다 훅 순서가 같아야 화면이 깨지지 않는다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const grid = readFileSync('src/features/director/canvas-views/StoryboardGridView.tsx', 'utf8')

describe('스토리보드 카드 훅 순서', () => {
  it('스토리보드 카드는 샷이 아니면 일찍 빠지기 전에 모든 훅을 부른다', () => {
    // 왜: 1단계 S1+S3(14783021)이 고르기 훅(togglePickedShot)을 조기 반환 뒤에 둬 react-hooks/rules-of-hooks 오류가 났다
    //   (CI 는 전체 eslint 를 돌지 않아 못 잡음). 같은 자리의 옛 주석 "훅은 조기 반환보다 앞에 둔다"를 시험으로 고정한다.
    const start = grid.indexOf('function ShotCell(')
    const end = grid.indexOf('\nexport function StoryboardGridView(', start)
    const body = grid.slice(start, end)
    expect(end).toBeGreaterThan(start)
    const early = body.indexOf('if (!isShotData(node.data)) return null')
    expect(early).toBeGreaterThan(-1)
    expect(body.slice(early)).not.toMatch(/\buse[A-Z]\w*\(/)
  })
})
