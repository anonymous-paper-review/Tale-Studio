// Storyboard 작업 공간이 [스토리보드 | 대사] 두 칸에 실사 보기 보드와 지금 대사 탭을 두고, 러프를 그리는 콘티 보드는 올리지 않는지 검사한다
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ui = vi.hoisted(() => ({ activeTab: 'storyboard' as string }))
vi.mock('@/stores/writer-ui-store', () => ({ useWriterUiStore: (select: (s: unknown) => unknown) => select(ui) }))
vi.mock('@/features/storyboard/real-board-view', async () => {
  const { createElement: h } = await import('react')
  return { RealBoardView: () => h('div', null, 'REAL_BOARD') }
})
vi.mock('@/features/writer/dialogue-view', async () => {
  const { createElement: h } = await import('react')
  return { DialogueView: () => h('div', null, 'DIALOGUE') }
})
vi.mock('@/features/storyboard/storyboard-header', () => ({ STORYBOARD_TABS: ['storyboard', 'dialogue'] }))
// 샷을 다 읽은 뒤의 화면만 본다 — 읽는 동안의 기다림 카드는 tests/writer/storyboard-open-wait 가 본다.
vi.mock('@/hooks/use-stage-wait', () => ({ useStoryboardWait: () => false }))
vi.mock('@/components/feedback/stage-wait', () => ({ StageWaitCard: () => null }))

import { StoryboardWorkspace } from '@/features/storyboard/storyboard-workspace'

/** 보이는 칸의 글 — 숨긴 칸은 class="hidden". */
function visible(): string[] {
  const html = renderToStaticMarkup(createElement(StoryboardWorkspace))
  return [...html.matchAll(/<div aria-hidden="(true|false)" class="([^"]*)"><div>([A-Z_]+)<\/div><\/div>/g)]
    .filter(([, hidden, cls]) => hidden === 'false' && cls !== 'hidden')
    .map(([, , , text]) => text)
}

beforeEach(() => {
  ui.activeTab = 'storyboard'
})

describe('Storyboard 작업 공간', () => {
  // 왜(오너 S1 "현재 UI 그대로 — 스토리보드랑 대사"): 스토리보드 칸 = 실사 보기 보드, 대사 칸 = 지금 대사 탭.
  it('스토리보드 칸을 고르면 실사 보기 보드가, 대사 칸을 고르면 지금 대사 탭이 보인다', () => {
    expect(visible()).toEqual(['REAL_BOARD'])
    ui.activeTab = 'dialogue'
    expect(visible()).toEqual(['DIALOGUE'])
  })

  // 왜(혼자 정한 것): 칸 고르기는 콘티와 같은 저장소라 콘티의 관리자 V2 미리보기 칸이 넘어올 수 있다 — 빈 화면 대신 스토리보드 칸.
  it('콘티에서 고른 관리자 V2 미리보기 칸이 넘어와도 Storyboard 는 스토리보드 칸을 보인다', () => {
    ui.activeTab = 'v2'
    expect(visible()).toEqual(['REAL_BOARD'])
  })

  // 왜(오너 O1): 씬 · 샷 나누기 · 러프 그리기는 Writer 콘티가 한다 — Storyboard 에 러프 보드(들어오면 빠진 러프를 저절로 그림)를 올리지 않는다.
  it('Storyboard 작업 공간은 러프를 그리는 콘티 보드를 올리지 않는다', () => {
    const src = readFileSync('src/features/storyboard/storyboard-workspace.tsx', 'utf8')
    expect(src).not.toContain('RoughStoryboardView')
    expect(src).not.toContain('WriterWorkspace')
  })
})
