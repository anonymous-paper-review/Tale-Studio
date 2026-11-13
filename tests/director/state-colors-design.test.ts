// Director 생성 상태 색(주황 · 파랑 · 보라 · 초록 · 빨강)이 디자인 정본에 예외로 적혀 있는지 (오너 2026-11-14 "추천대로", 시안 R 416:4941)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const design = readFileSync('specs/design.md', 'utf8')
const css = readFileSync('src/app/globals.css', 'utf8')

describe('Director 생성 상태 색', () => {
  it('Director 생성 상태 색은 design.md 에 예외로 적혀 있고 새로 더한 토큰은 영상 보라 하나다', () => {
    // 왜: 한 화면 한 단계 색 규칙(§1 규칙 3)과 부딪히는 자리라, 예외를 정본에 남겨야 다음 작업이 지킨다.
    expect(design).toContain('Director 생성 상태')
    expect(css).toMatch(/--state-video:\s*#[0-9a-f]{6}/i)
    expect(css).toContain('--color-state-video: var(--state-video)')
  })

  it('상태 색 예외는 Director 본 화면과 샷 상세(팝업 · 왼쪽 패널)의 점 · 진행 막대까지다', () => {
    // 왜: 시안 D6 · D7 상세도 같은 상태 점 · 보라 진행 막대를 쓴다(prose 요청 11/14). 예외 범위를 정본에 적어 둔다.
    const section = design.slice(design.indexOf('**Director 생성 상태**'), design.indexOf('**새로 써진 글**'))
    expect(section).toContain('샷 상세(팝업 · 왼쪽 패널)')
    expect(section).not.toContain('Director 본 화면(카드 · 노드 · 상태 고르기 · 진행 막대)만 쓰는 예외')
  })
})
