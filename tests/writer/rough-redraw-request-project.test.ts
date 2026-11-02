// 채팅의 [러프 다시 그리기]가 그 프로젝트의 Storyboard 보드에서만 그려지는지(다른 프로젝트 보드로 새지 않는지) 검사한다
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { useBoardUiStore } from '@/features/writer/board-ui-store'
import { roughRedrawOfferHere } from '@/lib/writer/chat-rough-redraw'

const board = readFileSync('src/features/writer/rough-storyboard-view.tsx', 'utf8')
const chatPanel = readFileSync('src/components/layout/global-chat.tsx', 'utf8')

beforeEach(() => {
  useBoardUiStore.setState({ boardProjectId: null, roughRedrawRequest: null })
})

describe('[러프 다시 그리기] 요청은 그 프로젝트 것', () => {
  // 왜: 2026-11-01 리뷰 B1 · 2026-11-02 개발 서버 재현 — 프로젝트 A 의 요청이 남은 채 프로젝트 B Storyboard 를 열자 B 의 같은 id 샷(sh_01_02)을
  //   돈 들여 다시 그렸다(연출 화살표도 지워짐). 요청에 프로젝트를 싣고 다른 프로젝트 보드는 버린다.
  it('[러프 다시 그리기] 요청은 그 프로젝트 보드에서만 그린다 — 다른 프로젝트 보드가 열리면 요청을 버린다', () => {
    useBoardUiStore.getState().requestRoughRedraw('project-a', ['sh_01_02'])
    expect(useBoardUiStore.getState().takeRoughRedraw('project-b')).toBeNull()
    expect(useBoardUiStore.getState().roughRedrawRequest).toBeNull()

    useBoardUiStore.getState().requestRoughRedraw('project-a', ['sh_01_02'])
    expect(useBoardUiStore.getState().takeRoughRedraw('project-a')).toEqual(['sh_01_02'])
    expect(useBoardUiStore.getState().roughRedrawRequest).toBeNull()
    expect(board).toMatch(/takeRoughRedraw\(projectId\)/)
  })

  // 왜: 보드가 그리는 중이라 기다리던 요청이, 보드를 떠난 뒤 다음에 열리는 보드에서 그려지면 안 된다.
  it('Storyboard 보드를 떠나거나 다른 프로젝트로 바뀌면 남은 [러프 다시 그리기] 요청을 지운다', () => {
    useBoardUiStore.getState().openBoard('project-a')
    useBoardUiStore.getState().requestRoughRedraw('project-a', ['sh_01_02'])
    useBoardUiStore.getState().closeBoard('project-a')
    expect(useBoardUiStore.getState().roughRedrawRequest).toBeNull()
    expect(useBoardUiStore.getState().boardProjectId).toBeNull()
    expect(board).toMatch(/openBoard\(projectId\)[\s\S]{0,200}closeBoard\(projectId\)/)
  })

  // 왜: Artist · Director 화면에서도 제안 카드가 보여 눌린 요청이 다음 보드로 넘어갔다 — 그 프로젝트 보드가 열려 있을 때만 보이고 눌린다.
  it('[러프 다시 그리기] 카드는 그 프로젝트의 Storyboard 보드가 열려 있을 때만 보이고 눌린다', () => {
    const action = { kind: 'roughRedraw' as const, projectId: 'project-a', shotIds: ['sh_01_02'], label: '러프 다시 그리기' }
    expect(roughRedrawOfferHere(action, 'project-a')).toBe(true)
    expect(roughRedrawOfferHere(action, null)).toBe(false)
    expect(roughRedrawOfferHere(action, 'project-b')).toBe(false)
    expect(roughRedrawOfferHere({ kind: 'handoff' }, null)).toBe(true)
    expect(chatPanel).toMatch(/roughRedrawOfferHere\(suggestion\.action, boardProjectId\)/)
    expect(chatPanel).toMatch(/requestRoughRedraw\(action\.projectId, action\.shotIds\)/)
  })
})
