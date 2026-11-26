// 콘티 화면의 채팅이 Storyboard 채팅과 같은 씬 · 샷 고치기 채팅이고, 그 답 · [러프 다시 그리기]가 콘티 채팅에 남는지 검사한다 (오너 2026-11-26 O1, 리드 구조 C)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ workflow: vi.fn(), execute: vi.fn() }))
vi.mock('@/stores/chat-workflow-bindings', () => ({ createStudioWorkflow: () => mocks.workflow, workflowPermission: () => true }))
vi.mock('@/stores/chat-tool-bindings', () => ({ createStudioToolResources: () => ({}) }))
vi.mock('@/lib/chat-tools/executor', async (original) => ({ ...(await original<object>()), createChatToolExecutor: () => mocks.execute }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useBoardUiStore } from '@/features/writer/board-ui-store'
import type { Scene, SceneManifest, Shot } from '@/types'

const completed = { url: 'https://m/s.png', status: 'completed' as const, errorMessage: null, generatedAt: 1, frames: { start: 'https://m/s.png', direction: 'https://m/d.png', end: 'https://m/e.png' } }
function shot(shotId: string, rough: boolean): Shot {
  return {
    shotId, sceneId: 'sc_01', actionDescription: '민호가 자판기 앞에 선다', shotType: 'MS', characters: ['min_ho'], durationSeconds: 5,
    generationMethod: 'T2V', dialogueLines: [{ characterId: 'min_ho', text: '아', emotion: '', delivery: '', durationHint: 1 }],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
    roughStoryboard: rough ? completed : null,
  }
}
const scene: Scene = { sceneId: 'sc_01', narrativeSummary: '자판기', originalTextQuote: '', location: 'corridor', timeOfDay: '밤', mood: '피로', charactersPresent: ['min_ho'], estimatedDurationSeconds: 10 }
const manifest: SceneManifest = { scenes: [scene], characters: [], locations: [] }
const fetchMock = vi.fn()
const boardRequests = () => fetchMock.mock.calls.filter(([url]) => String(url) === '/api/writer/chat')

/** 모델이 도구로 샷 하나를 고치고 답하는 한 턴. 도구는 화면 상태에 저장 결과를 반영한다. */
function modelEditsShot(id: string, patch: Partial<Shot>) {
  let calls = 0
  fetchMock.mockImplementation(async (url: string) => {
    if (url !== '/api/writer/chat') return Response.json({})
    calls += 1
    return Response.json(calls === 1
      ? { toolTurn: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'edit-1', name: 'edit_project', input: { resource: 'shots', id, revision: 'r1', patch } }] } }
      : { reply: '바꿔서 저장했어요.' })
  })
  mocks.execute.mockImplementation(async () => {
    useWriterStore.setState((s) => ({ shots: s.shots.map((x) => (x.shotId === id ? { ...x, ...patch } : x)) }))
    return { status: 'ok' }
  })
}

beforeEach(() => {
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ projectId: 'p-conti', currentStage: 'conti', reachedStage: 'conti', projectLocale: 'ko', projectLocaleLocked: true })
  useWriterStore.setState({ sceneManifest: manifest, shots: [shot('sh_01_01', true), shot('sh_01_02', false)], error: null })
  useBoardUiStore.setState({ boardProjectId: 'p-conti', roughRedrawRequest: null })
  mocks.workflow.mockReset().mockResolvedValue({ status: 'ok' })
  mocks.execute.mockReset().mockResolvedValue({ status: 'ok' })
  fetchMock.mockReset().mockImplementation(async () => Response.json({ reply: '네, 봤어요.' }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  chat.getState().reset()
})

describe('콘티 채팅', () => {
  // 왜: O1 — 콘티는 지금 Storyboard 보드(씬 · 샷 · 러프 · 대사)를 그대로 쓴다. 채팅도 같은 씬 · 샷 고치기 채팅이어야 "샷 2를 클로즈업으로" 같은 부탁이 된다.
  it('콘티 채팅에 씬 · 샷 고치기를 부탁하면 Storyboard 채팅과 같은 씬 · 샷 고치기 채팅이 지금 씬 · 샷을 읽고 받는다', async () => {
    await chat.getState().sendMessage('씬1 샷1을 클로즈업으로 바꿔줘')
    expect(boardRequests()).toHaveLength(1)
    const body = JSON.parse(String((boardRequests()[0][1] as RequestInit).body))
    expect(body).toMatchObject({ message: '씬1 샷1을 클로즈업으로 바꿔줘', projectId: 'p-conti' })
    expect(body.writerContext).toContain('sh_01_01')
  })

  // 왜(혼자 정한 것): 같은 보드 채팅이라도 말은 콘티 채팅에 남아야 한다 — Storyboard 채팅에 섞이면 콘티에서 한 이야기가 다음 단계에서 갑자기 보인다.
  it('콘티 채팅의 답은 콘티 채팅에 남는다', async () => {
    await chat.getState().sendMessage('씬1 샷1을 클로즈업으로 바꿔줘')
    const stages = chat.getState().messages.map((m) => m.stage)
    expect(stages.length).toBeGreaterThan(0)
    expect(stages.every((s) => s === 'conti')).toBe(true)
  })

  // 왜(혼자 정한 것): 콘티에서 러프를 다시 그리는 길이 콘티 채팅에 있어야 한다 — 단추가 Storyboard 채팅에 뜨면 콘티 화면에서는 보이지 않는다.
  it('콘티 채팅으로 러프가 있는 샷의 그림에 보이는 내용을 고치면 [러프 다시 그리기]가 콘티 채팅에 뜬다', async () => {
    modelEditsShot('sh_01_01', { shotType: 'CU' })
    await chat.getState().sendMessage('씬1 샷1을 클로즈업으로 바꿔줘')
    const suggestion = chat.getState().suggestion
    expect(suggestion?.stage).toBe('conti')
    expect(suggestion?.action).toEqual({ kind: 'roughRedraw', projectId: 'p-conti', shotIds: ['sh_01_01'], label: '러프 다시 그리기' })
  })

  // 왜: 정상 경로 고정 — Storyboard 채팅은 지금 그대로 Storyboard 채팅에 [러프 다시 그리기]를 띄운다.
  it('Storyboard 채팅의 [러프 다시 그리기]는 지금처럼 Storyboard 채팅에 뜬다', async () => {
    project.setState({ currentStage: 'writer', reachedStage: 'writer' })
    modelEditsShot('sh_01_01', { shotType: 'CU' })
    await chat.getState().sendMessage('씬1 샷1을 클로즈업으로 바꿔줘')
    expect(chat.getState().suggestion?.stage).toBe('writer')
  })
})
