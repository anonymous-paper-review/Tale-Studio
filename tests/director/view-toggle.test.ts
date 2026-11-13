// Director 보기 토글은 "스토리보드 | 노드" 순서이고, 화면이 토글 순서 방향으로 미끄러져 들어온다 (시안 D1 406:3717, 리드 11/14 화면 확인 1)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(join(process.cwd(), 'src/app/studio/director/page.tsx'), 'utf8')

describe('보기 토글', () => {
  it('보기 토글은 스토리보드가 왼쪽, 노드가 오른쪽이다', () => {
    // 왜: 시안 D1 은 결과(스토리보드)를 먼저 둔다 — 지금은 노드가 왼쪽이라 시안과 거꾸로였다.
    const storyboard = page.indexOf('<TabsTrigger value="storyboard"')
    const node = page.indexOf('<TabsTrigger value="node"')
    expect(storyboard).toBeGreaterThan(-1)
    expect(node).toBeGreaterThan(storyboard)
  })

  it('노드로 바꾸면 오른쪽에서, 스토리보드로 바꾸면 왼쪽에서 화면이 미끄러져 들어온다', () => {
    // 왜: 바뀐 토글 순서와 같은 방향이어야 어느 쪽으로 갔는지 눈으로 따라간다(#e2 2026-08-03 전환 연출).
    expect(page).toMatch(/setViewSlide\(viewMode === 'node' \? 'forward' : 'back'\)/)
  })
})
