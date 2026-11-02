// 보드 밖에서 숨은 [러프 다시 그리기] 카드가 채팅의 하나뿐인 제안 자리를 막지 않고, 눌린 카드는 그리기가 시작될 때까지 남는지 검사한다
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { useGlobalChatStore, type ChatSuggestion } from '@/stores/global-chat-store'
import { useBoardUiStore } from '@/features/writer/board-ui-store'
import { useProjectStore } from '@/stores/project-store'

const redrawCard: ChatSuggestion = {
  id: 'rough-redraw:trace-1',
  stage: 'writer',
  content: '고친 샷 1개의 러프 그림은 아직 예전 그대로예요.',
  action: { kind: 'roughRedraw', projectId: 'p', shotIds: ['sh_01_02'], label: '러프 다시 그리기' },
}
const editorHandoff: ChatSuggestion = {
  id: 'handoff:director:p',
  stage: 'director',
  content: '영상이 다 됐어요. Editor 로 넘어갈까요?',
  action: { kind: 'handoff', utterance: 'Editor 로 넘어가자', label: 'Editor 로' },
}
const chat = () => useGlobalChatStore.getState()
const chatPanel = readFileSync('src/components/layout/global-chat.tsx', 'utf8')
const board = readFileSync('src/features/writer/rough-storyboard-view.tsx', 'utf8')

beforeEach(() => {
  chat().reset()
  useProjectStore.setState({ projectId: 'p' })
  useBoardUiStore.setState({ boardProjectId: null, roughRedrawRequest: null })
  useGlobalChatStore.setState({ suggestion: redrawCard, recordedSuggestionIds: [redrawCard.id, editorHandoff.id] })
})

describe('숨은 [러프 다시 그리기] 카드와 제안 자리', () => {
  // 왜: 2026-11-02 리뷰 M1 — 카드는 그 프로젝트 Storyboard 보드에서만 보이는데 제안 자리는 하나라, 보드를 떠나 숨은 카드가 자리를 차지해
  //   Director 의 "Editor 로 넘어갈까요?" 같은 제안이 뜨지 못했다. 새로 고침 뒤에도 카드는 저장된 채로 돌아오므로, 보드를 떠날 때가 아니라
  //   새 제안이 올 때 비켜 준다 — 다른 제안이 없으면 카드는 보드로 돌아왔을 때 그대로 보인다.
  it('보드를 떠나 숨은 [러프 다시 그리기] 카드는 다른 제안이 오면 "나중에"로 비켜 준다', () => {
    chat().offerSuggestion(editorHandoff)
    expect(chat().suggestion?.id).toBe(editorHandoff.id)
    expect(chat().deferredSuggestions.map((item) => item.id)).toEqual([redrawCard.id])
  })

  // 왜: 정상 경로 고정 — 보드 위에서 보이는 카드는 지금처럼 다른 제안이 소리 없이 밀어내지 않는다(#handoff-starved 의 "암묵 교체 금지").
  it('그 프로젝트 보드가 열려 있으면 [러프 다시 그리기] 카드는 지금처럼 자리를 지킨다', () => {
    useBoardUiStore.setState({ boardProjectId: 'p' })
    chat().offerSuggestion(editorHandoff)
    expect(chat().suggestion?.id).toBe(redrawCard.id)
    expect(chat().deferredSuggestions).toEqual([])
  })

  // 왜: 보드 밖에서 다시 열면 카드는 또 숨은 채 자리를 막는다 — "나중에"의 [다시 열기]는 그 보드가 열려 있을 때만 된다.
  it('"나중에"로 간 [러프 다시 그리기]는 그 프로젝트 보드가 열려 있을 때만 다시 열 수 있다', () => {
    chat().offerSuggestion(editorHandoff)
    chat().dismissSuggestion()
    expect(chat().restoreSuggestion(redrawCard.id)).toBe(false)
    useBoardUiStore.setState({ boardProjectId: 'p' })
    expect(chat().restoreSuggestion(redrawCard.id)).toBe(true)
    expect(chat().suggestion?.id).toBe(redrawCard.id)
    expect(chatPanel).toMatch(/restoreSuggestion\(item\.id\)/)
    expect(chatPanel).toMatch(/disabled=\{suggestion\?\.dismissible === false \|\| !roughRedrawOfferHere\(item\.action, boardProjectId\)\}/)
  })
})

describe('눌린 [러프 다시 그리기]는 그리기가 시작될 때까지', () => {
  // 왜: 2026-11-02 리뷰 L7 — 누르는 순간 카드를 내렸는데, 보드가 다른 그림을 그리는 중이면 요청은 기다리다 보드를 떠날 때 소리 없이 지워졌다.
  //   카드는 보드가 실제로 그리기 시작할 때 내린다.
  it('[러프 다시 그리기]를 눌러도 보드가 그리기 시작할 때까지 카드는 남고, 시작하면 내려간다', () => {
    useBoardUiStore.setState({ boardProjectId: 'p' })
    const branch = chatPanel.slice(chatPanel.indexOf("if (action.kind === 'roughRedraw') {"), chatPanel.indexOf("if (action.kind === 'roughRedraw') {") + 500)
    expect(branch).toContain('requestRoughRedraw(action.projectId, action.shotIds)')
    expect(branch).not.toContain('dismissSuggestion()')
    chat().settleRoughRedraw('p', ['sh_01_02'])
    expect(chat().suggestion).toBeNull()
    expect(board).toMatch(/takeRoughRedraw\(projectId\)[\s\S]{0,300}settleRoughRedraw\(projectId, shotIds\)[\s\S]{0,120}drawShots\(shotIds\)/)
  })

  // 왜: 시작 전에 보드를 떠나면 요청(그릴 일)은 지우지만 카드는 남긴다 — 돌아오면 다시 누를 수 있고, 그사이 다른 제안이 오면 "나중에"로 간다(M1 과 같은 길).
  it('그리기가 시작되기 전에 보드를 떠나면 그릴 일은 지우고 카드는 남아, 다른 제안이 오면 "나중에"로 간다', () => {
    useBoardUiStore.getState().openBoard('p')
    useBoardUiStore.getState().requestRoughRedraw('p', ['sh_01_02'])
    useBoardUiStore.getState().closeBoard('p')
    expect(useBoardUiStore.getState().roughRedrawRequest).toBeNull()
    expect(chat().suggestion?.id).toBe(redrawCard.id)
    chat().offerSuggestion(editorHandoff)
    expect(chat().deferredSuggestions.map((item) => item.id)).toEqual([redrawCard.id])
  })

  // 왜: 다른 프로젝트나 다른 샷의 그리기가 시작될 때 엉뚱한 카드를 내리지 않는다(정상 경로 고정).
  it('다른 프로젝트나 다른 샷의 그리기가 시작되면 카드를 그대로 둔다', () => {
    chat().settleRoughRedraw('q', ['sh_01_02'])
    chat().settleRoughRedraw('p', ['sh_09_09'])
    expect(chat().suggestion?.id).toBe(redrawCard.id)
  })
})

describe('눌린 [러프 다시 그리기]를 "나중에" · Esc 로 내리면', () => {
  // 왜: 2026-11-02 리뷰 3차 M3 — 보드가 다른 그림을 그리는 동안 누른 카드는 그리기가 시작될 때까지 남는데, 그 카드를 [나중에]나 Esc 로
  //   내려도 기다리던 요청은 남아 보드가 나중에 돈 드는 다시 그리기를 했다. 카드를 내리면 그 카드의 요청(같은 프로젝트 · 같은 샷)도 지운다.
  it('[러프 다시 그리기]를 누른 뒤 [나중에]나 Esc로 카드를 내리면 기다리던 다시 그리기도 지운다', () => {
    useBoardUiStore.setState({ boardProjectId: 'p' })
    useBoardUiStore.getState().requestRoughRedraw('p', ['sh_01_02'])
    chat().deferSuggestion()
    expect(useBoardUiStore.getState().roughRedrawRequest).toBeNull()

    useGlobalChatStore.setState({ suggestion: redrawCard })
    useBoardUiStore.getState().requestRoughRedraw('p', ['sh_01_02'])
    chat().dismissSuggestion()
    expect(useBoardUiStore.getState().roughRedrawRequest).toBeNull()
  })

  // 왜: 지운 요청은 사람이 다시 누를 때 다시 맡긴다 — "나중에"에서 다시 열어 누르면 그때 그린다.
  it('"나중에"에서 다시 열어 [러프 다시 그리기]를 누르면 다시 맡긴다', () => {
    useBoardUiStore.setState({ boardProjectId: 'p' })
    useBoardUiStore.getState().requestRoughRedraw('p', ['sh_01_02'])
    chat().deferSuggestion()
    expect(chat().restoreSuggestion(redrawCard.id)).toBe(true)
    const branch = chatPanel.slice(chatPanel.indexOf("if (action.kind === 'roughRedraw') {"), chatPanel.indexOf("if (action.kind === 'roughRedraw') {") + 500)
    expect(branch).toContain('requestRoughRedraw(action.projectId, action.shotIds)')
  })

  // 왜: 다른 프로젝트 · 다른 샷의 요청이나, 사람이 채팅을 이어 말해 카드가 저절로 내려간 경우는 지우지 않는다 —
  //   이미 누른 다시 그리기는 그대로 맡겨 둔다(정상 경로 고정).
  it('다른 샷의 요청이나 채팅을 이어 말해 카드가 저절로 내려간 경우에는 기다리던 다시 그리기를 그대로 둔다', () => {
    useBoardUiStore.setState({ boardProjectId: 'p' })
    useBoardUiStore.getState().requestRoughRedraw('p', ['sh_09_09'])
    chat().deferSuggestion()
    expect(useBoardUiStore.getState().roughRedrawRequest?.shotIds).toEqual(['sh_09_09'])

    useGlobalChatStore.setState({ suggestion: redrawCard })
    useBoardUiStore.getState().requestRoughRedraw('p', ['sh_01_02'])
    chat().dismissSuggestion({ implicit: true })
    expect(useBoardUiStore.getState().roughRedrawRequest?.shotIds).toEqual(['sh_01_02'])
  })
})
