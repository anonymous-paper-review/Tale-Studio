// 콘티(단계 id writer)가 Writer 탭 안의 칸이라 Writer 와 같은 색 · 같은 옷 Lumi 로 보이는지 검사한다 (D1 오너 2026-11-22 · 리드 결정 2)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STAGE_BADGE_CLASS, STAGE_FACE_COLOR } from '@/lib/constants'
import { STAGE_PERSONA } from '@/lib/lumi'
import { projectStageDot } from '@/features/projects/project-list'

describe('콘티의 색 · Lumi', () => {
  it('콘티 화면은 Writer 와 같은 색 · 같은 옷 Lumi 를 쓴다 — 화면 색 · 위 막대 칩 · 채팅 머리 · 넘김 창', () => {
    // 왜(리드 결정 2): 한 레일 칸(Writer) 안의 두 칸이 서로 다른 색이면 다른 단계로 간 것처럼 보인다. 옛 Storyboard 색 · 옷 · 네 칸 아이콘은 Camera 가 물려받는다.
    expect(STAGE_PERSONA.writer).toBe(STAGE_PERSONA.producer)
    expect(STAGE_PERSONA.writer).toBe('writer')
    expect(STAGE_BADGE_CLASS.writer).toBe(STAGE_BADGE_CLASS.producer)
    expect(STAGE_FACE_COLOR.writer).toBe('var(--stage-writer)')
  })

  it('프로젝트 목록에서 콘티 단계 프로젝트의 단계 점도 Writer 색이다', () => {
    // 왜: 목록 점 색이 화면 색과 다르면 같은 단계를 다른 단계로 읽는다.
    expect(projectStageDot('writer')).toBe(projectStageDot('producer'))
  })

  it('콘티에서 기다릴 때 나오는 Lumi(씬 · 샷 나누기 잠금 · 러프 그리는 카드)도 Writer 옷이다', () => {
    // 왜: 리드 결정 2 — 콘티 안에서만 옛 Storyboard 옷 Lumi 가 나오면 화면 색과 어긋난다.
    const board = readFileSync('src/features/writer/rough-storyboard-view.tsx', 'utf8')
    expect(board).not.toMatch(/lumi=\{?["']storyboard["']/)
    expect(board).toMatch(/lumi=\{busy\.lumi \? 'writer' : undefined\}/)
    expect(board).toMatch(/lumi="writer"/)
  })
})
