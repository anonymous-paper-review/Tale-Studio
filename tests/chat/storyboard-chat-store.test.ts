// Storyboard 채팅이 실사 그림 도구 표시를 싣고, 답의 그림 요청을 씬 · 샷 고치기와 따로 맡기며 못 맡긴 까닭을 Storyboard 채팅에 남기는지, 글 고치기는 다시 요구하지 않는지(N3) — 콘티 채팅은 그대로인지 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ workflow: vi.fn(), execute: vi.fn(), images: vi.fn(async (_projectId: string, _updates: unknown[], _opts: unknown) => {}) }))
vi.mock('@/stores/chat-workflow-bindings', () => ({ createStudioWorkflow: () => mocks.workflow, workflowPermission: () => true }))
vi.mock('@/stores/chat-tool-bindings', () => ({ createStudioToolResources: () => ({}) }))
vi.mock('@/lib/chat-tools/executor', async (original) => ({ ...(await original<object>()), createChatToolExecutor: () => mocks.execute }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/storyboard/chat-images', () => ({ runStoryboardImageUpdates: mocks.images }))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import type { Scene, SceneManifest, Shot } from '@/types'

const completed = { url: 'https://m/s.png', status: 'completed' as const, errorMessage: null, generatedAt: 1, frames: { start: 'https://m/s.png', direction: 'https://m/d.png', end: 'https://m/e.png' } }
function shot(shotId: string): Shot {
  return {
    shotId, sceneId: 'sc_01', actionDescription: '미나가 돌아본다', shotType: 'MS', characters: [], durationSeconds: 5,
    generationMethod: 'T2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
    roughStoryboard: completed,
  }
}
const scene: Scene = { sceneId: 'sc_01', narrativeSummary: '정류장', originalTextQuote: '', location: 'bus_stop', timeOfDay: '밤', mood: '쓸쓸', charactersPresent: [], estimatedDurationSeconds: 10 }
const manifest: SceneManifest = { scenes: [scene], characters: [], locations: [] }
const fetchMock = vi.fn()
const chatRequests = () => fetchMock.mock.calls.filter(([url]) => String(url) === '/api/writer/chat')
const IMAGE = { type: 'generateImage', id: 'sh_01_02', change: 'Make her expression sadder' }
const apply = vi.fn(async () => ({ applied: 0, appliedChanges: [], skipped: [], pendingDialogueShrinks: [] }))

function at(stage: 'writer' | 'conti') {
  project.setState({ projectId: 'p-sb', currentStage: stage, reachedStage: 'writer', projectLocale: 'ko', projectLocaleLocked: true })
}

beforeEach(() => {
  chat.getState().reset()
  project.getState().resetProject()
  at('writer')
  useWriterStore.setState({ sceneManifest: manifest, shots: [shot('sh_01_01'), shot('sh_01_02')], error: null, applyChatUpdates: apply } as never)
  mocks.workflow.mockReset().mockResolvedValue({ status: 'ok' })
  mocks.execute.mockReset().mockResolvedValue({ status: 'ok' })
  mocks.images.mockClear()
  apply.mockClear()
  fetchMock.mockReset().mockImplementation(async (url: string) =>
    url === '/api/writer/chat' ? Response.json({ reply: '샷 2를 더 슬픈 표정으로 다시 그릴게요.', updates: [IMAGE] }) : Response.json({}),
  )
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  chat.getState().reset()
})

describe('Storyboard 채팅의 실사 그림 요청', () => {
  // 왜(오너 O7): Storyboard 채팅만 실사 그림 도구를 쓴다 — 서버가 이 표시를 보고 도구 안내 · 실사 상태를 싣는다.
  it('Storyboard 채팅 요청에는 실사 그림 도구 표시를 싣는다', async () => {
    await chat.getState().sendMessage('@샷 2 이미지를 고쳐서 다시 만들어 줘: 표정을 더 슬프게')
    const body = JSON.parse(String((chatRequests()[0][1] as RequestInit).body))
    expect(body.storyboardImages).toBe(true)
  })

  // 왜(오너 O7): 채팅이 고른 샷 실사를 다시 그린다 — 그림 요청은 씬 · 샷 고치기(글 저장)가 아니라 그림 맡기기로 간다.
  it('Storyboard 채팅 답의 그림 요청은 그 샷 그림 맡기기로 가고 씬 · 샷 고치기에는 넘기지 않는다', async () => {
    await chat.getState().sendMessage('@샷 2 이미지를 고쳐서 다시 만들어 줘: 표정을 더 슬프게')
    await vi.waitFor(() => expect(mocks.images).toHaveBeenCalledTimes(1))
    const [projectId, updates, opts] = mocks.images.mock.calls[0] as unknown as [string, unknown[], { locale: string; traceId?: string }]
    expect(projectId).toBe('p-sb')
    expect(updates).toEqual([IMAGE])
    expect(opts.locale).toBe('ko')
    expect(typeof opts.traceId).toBe('string')
    for (const call of apply.mock.calls as unknown as Array<[Array<{ type: string }>]>) expect(call[0].some((u) => u.type === 'generateImage')).toBe(false)
  })

  // 왜: 못 맡긴 까닭(그리는 중 · 시트 없음 등)이 Storyboard 를 보는 사람에게 보여야 한다 — 다른 단계 채팅에 남으면 못 본다.
  it('못 맡긴 까닭은 Storyboard 채팅에 한 줄로 남는다', async () => {
    await chat.getState().sendMessage('@샷 2 이미지를 고쳐서 다시 만들어 줘: 표정을 더 슬프게')
    await vi.waitFor(() => expect(mocks.images).toHaveBeenCalledTimes(1))
    const { notify } = mocks.images.mock.calls[0][2] as unknown as { notify: (line: string) => void }
    notify('⚠ 샷 2은(는) 지금 그리는 중이에요. 다 그린 뒤 다시 부탁해 주세요.')
    const last = chat.getState().messages.at(-1)
    expect(last).toMatchObject({ stage: 'writer', content: '⚠ 샷 2은(는) 지금 그리는 중이에요. 다 그린 뒤 다시 부탁해 주세요.' })
  })

  // 왜(혼자 정한 것 j): 콘티 채팅은 Artist 앞이라 실사를 못 그린다 — 표시를 싣지 않고, 답에 그림 요청이 섞여도 맡기지 않는다.
  it('Writer 콘티 채팅 요청에는 실사 그림 도구 표시가 없고 그림 요청도 맡기지 않는다', async () => {
    at('conti')
    await chat.getState().sendMessage('샷 2 다시 그려줘')
    const body = JSON.parse(String((chatRequests()[0][1] as RequestInit).body))
    expect(body.storyboardImages).toBeUndefined()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.images).not.toHaveBeenCalled()
  })

  // 왜(오너 2026-11-27 N3 — Storyboard 채팅은 실사 고치기만, 글은 콘티로 안내): 글 · 그림이 섞인 부탁에서 그림 부분은 Storyboard 가 할 일이다 —
  //   예전처럼 글 고치기를 다시 요구하면 그림 요청까지 버리고 "실행을 확인하지 못했습니다"로 끝난다. 대사는 콘티 · 대사 탭에서 고친다.
  it('대사를 바꾸고 다시 그려 달라는 부탁에는 다시 묻지 않고 답의 그림 요청을 맡긴다 — 대사는 콘티에서 고친다', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/writer/chat' ? Response.json({ toolSupport: true, reply: '대사는 Writer 콘티에서 고칠 수 있어요. 그림은 다시 그릴게요.', updates: [IMAGE] }) : Response.json({}),
    )
    await chat.getState().sendMessage("@샷 2 대사를 '잘 가'로 바꾸고 다시 그려 줘")
    await vi.waitFor(() => expect(mocks.images).toHaveBeenCalledTimes(1))
    expect(chatRequests()).toHaveLength(1)
    expect(chat.getState().messages.some((message) => message.content.includes('요청한 변경의 실행을 확인하지 못했습니다'))).toBe(false)
  })

  // 왜(오너 2026-11-27 N3): Storyboard 채팅은 글을 고치지 않는다 — 글만 고쳐 달라는 말에 고치기를 다시 요구하면 콘티로 가라는 안내 대신
  //   "요청한 변경의 실행을 확인하지 못했습니다"가 남는다.
  it('Storyboard 채팅은 글을 고쳐 달라는 부탁에도 고치기를 다시 요구하지 않고 안내 답을 그대로 보인다', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/writer/chat' ? Response.json({ toolSupport: true, reply: '대사는 Writer 콘티에서 고칠 수 있어요. 대사 탭에서 바로 고칠 수도 있어요.', updates: [] }) : Response.json({}),
    )
    await chat.getState().sendMessage("@샷 2 대사를 '잘 가'로 바꿔 줘")
    await vi.waitFor(() => expect(chat.getState().loading).toBe(false))
    expect(chatRequests()).toHaveLength(1)
    expect(chat.getState().messages.at(-1)?.content).toContain('대사는 Writer 콘티에서 고칠 수 있어요')
    expect(mocks.images).not.toHaveBeenCalled()
  })

  // 왜(오너 O7 · 2026-11-26 개발 서버 실측): 그림만 고쳐 달라는 부탁은 그림 요청만으로 다 한 것이다 — 실행 확인 없이 그 그림을 맡긴다.
  it('그림만 고쳐 달라는 부탁에 그림 요청만으로 답하면 실행 확인 없이 그 그림을 맡긴다', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/writer/chat' ? Response.json({ toolSupport: true, reply: '샷 2를 더 슬픈 표정으로 다시 그릴게요.', updates: [IMAGE] }) : Response.json({}),
    )
    await chat.getState().sendMessage('@샷 2 이미지를 고쳐서 다시 만들어 줘: 표정을 더 슬프게')
    await vi.waitFor(() => expect(mocks.images).toHaveBeenCalledTimes(1))
    expect(chatRequests()).toHaveLength(1)
  })
})
