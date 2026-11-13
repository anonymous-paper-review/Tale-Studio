// Editor 채팅의 "yes · 응 · 좋아"는 어떤 대기 카드도 승인하지 않고 조언 질문으로 가며, 카드를 낸 단계에서는 지금처럼 말로 승인되는지 검사한다 (오너 2026-11-14 10번 · 검토 b 보통 3)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorNode } from '@/types/director'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
// Take 카드를 승인하면 묶인 영상이 시작된다 — 잔액 · 일괄 러너만 바꿔 끼운다(승인 말 판단은 그대로).
const run = vi.hoisted(() => vi.fn(async () => ({ total: 1, started: 1, failed: 0 })))
vi.mock('@/lib/billing/use-take-balance', () => ({ fetchTakeBalance: vi.fn(async () => ({ balance: 40, mode: 'enforce', failed: false, loading: false })), refetchTakeBalance: vi.fn() }))
vi.mock('@/lib/director/video-batch-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/director/video-batch-client')>(), runVideoBatch: run }))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useWriterStore as writer } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'

function shot(id: string): DirectorNode {
  return { id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: `w-${id}`, writerShotId: `w-${id}`, derivedPrompt: `base prompt ${id}`, promptOverride: null, camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5600 }, cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }, provider: 'seedance', durationSeconds: 3, storyboardImage: null, referenceImages: [], imageInputs: [] } } as unknown as DirectorNode
}
const promptOf = (id: string) => (director.getState().nodes.find((n) => n.id === id)!.data as { promptOverride: string | null }).promptOverride
const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ currentStage: 'director', reachedStage: 'editor', projectId: 'p-dir', projectLocale: 'en', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'en' })
  writer.setState({ sceneManifest: { scenes: [{ sceneId: 'sc1' }] } as never, shots: [{ shotId: 'w-s1', sceneId: 'sc1' }] as never })
  director.setState({ projectId: 'p-dir', nodes: [shot('s1')], edges: [] })
  fetchMock.mockImplementation(async (url: string) =>
    String(url).includes('/api/editor/chat')
      ? Response.json({ reply: 'Trim the end of cut 2.' })
      : Response.json({ reply: 'Rewrote it.', updates: [{ type: 'updateShot', id: 's1', patch: { prompt: 'Lumi prompt' } }] }),
  )
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('대기 카드를 승인하는 말', () => {
  // 왜: 검토 b 보통 3 — Editor 채팅의 "yes"가 Director 글 고침 카드를 승인해 작업물이 바뀌었다(오너 10번 "작업물에는 터치 못 하게").
  it('Editor 채팅에서 "yes · 응 · 좋아"라고 해도 다른 단계의 대기 카드를 승인하지 않고, 그 말은 조언 질문으로 간다', async () => {
    await chat.getState().sendMessage('Rewrite shot 1')
    expect(chat.getState().pendingProposal?.kind).toBe('directorTextEdit')
    project.setState({ currentStage: 'editor' })
    for (const word of ['yes', '응', '좋아']) {
      await chat.getState().sendMessage(word)
      expect(promptOf('s1')).toBeNull()
      expect(chat.getState().pendingProposal?.kind).toBe('directorTextEdit')
    }
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/editor/chat'))).toHaveLength(3)
  })

  // 왜: 리드 판단(재검토 b 낮음 5) — Take 를 쓰는 카드는 그 카드를 낸 화면에서만 말로 승인한다. 다른 탭에서는 단추로만(Take 없는 카드는 9/22 약속대로 말 승인).
  it('Take 를 쓰는 카드는 다른 단계 탭에서 "응"이라고 해도 승인되지 않는다', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/api/director/chat')
        ? Response.json({ reply: 'Ready.', updates: [{ type: 'updateShot', id: 's1', patch: { prompt: 'Lumi prompt' } }, { type: 'generateVideos', shotIds: ['s1'] }] })
        : Response.json({ reply: 'Okay.', updates: [] }),
    )
    await chat.getState().sendMessage('Rewrite shot 1 and make its video')
    expect(chat.getState().pendingProposal?.payload.then).toMatchObject({ videos: ['s1'] })
    project.setState({ currentStage: 'writer' })
    for (const word of ['응', 'yes', '좋아']) {
      await chat.getState().sendMessage(word)
      expect(promptOf('s1')).toBeNull()
      expect(chat.getState().pendingProposal?.kind).toBe('directorTextEdit')
    }
  })

  // 왜: 재재검토 b 보통 D — "좋아?"는 되묻는 말이다. Take 를 쓰는 카드는 물음표 대답으로 승인하지 않고 다시 묻는다.
  it('Take 를 쓰는 카드에 "좋아?"처럼 되묻는 말로 답하면 승인하지 않고 다시 묻는다', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/api/director/chat')
        ? Response.json({ reply: 'Ready.', updates: [{ type: 'updateShot', id: 's1', patch: { prompt: 'Lumi prompt' } }, { type: 'generateVideos', shotIds: ['s1'] }] })
        : Response.json({ reply: 'Okay.', updates: [] }),
    )
    await chat.getState().sendMessage('Rewrite shot 1 and make its video')
    await chat.getState().sendMessage('좋아?')
    expect(promptOf('s1')).toBeNull()
    expect(chat.getState().pendingProposal?.kind).toBe('directorTextEdit')
    expect(chat.getState().messages.filter((m) => m.role === 'model').at(-1)?.content).toBe('Shall I start? Please answer yes or no.')
  })

  // 왜: 검토 a 통합 보통 B — Lumi 는 "'응' 또는 '아니'로 답해 주세요"라고 묻는데 Take 카드는 "응 · 네"를 승인으로 받지 않았다. 다른 단계의 "응"은 지금처럼 거절한다.
  it('Take 가 걸린 카드는 낸 단계에서 "응" · "네"로도 승인되고, 다른 단계의 "응"은 승인하지 않는다', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/api/director/chat')
        ? Response.json({ reply: 'Ready.', updates: [{ type: 'updateShot', id: 's1', patch: { prompt: 'Lumi prompt' } }, { type: 'generateVideos', shotIds: ['s1'] }] })
        : Response.json({ reply: 'Okay.', updates: [] }),
    )
    for (const word of ['응', '네']) {
      director.setState({ nodes: [shot('s1')] })
      await chat.getState().sendMessage('Rewrite shot 1 and make its video')
      expect(chat.getState().pendingProposal?.payload.then).toMatchObject({ videos: ['s1'] })
      project.setState({ currentStage: 'writer' })
      await chat.getState().sendMessage('응')
      expect(promptOf('s1'), word).toBeNull()
      project.setState({ currentStage: 'director' })
      await chat.getState().sendMessage(word)
      expect(promptOf('s1'), word).toBe('Lumi prompt')
      expect(chat.getState().pendingProposal, word).toBeNull()
    }
  })

  // 왜: 리드 결정(검토 b Y2) — Take 카드는 낸 단계에서 "응 · 네"로 승인되는데 글만 고친 카드는 더 좁았다. 낸 단계에서는 같은 낱말로 받는다.
  it('글만 고친 카드(Take 없음)도 낸 단계에서는 "응" · "네"로 승인되고, 다른 단계의 "응"은 승인하지 않는다', async () => {
    for (const word of ['응', '네']) {
      director.setState({ nodes: [shot('s1')] })
      await chat.getState().sendMessage('Rewrite shot 1')
      expect(chat.getState().pendingProposal?.kind).toBe('directorTextEdit')
      project.setState({ currentStage: 'writer' })
      await chat.getState().sendMessage('응')
      expect(promptOf('s1'), word).toBeNull()
      project.setState({ currentStage: 'director' })
      await chat.getState().sendMessage(word)
      expect(promptOf('s1'), word).toBe('Lumi prompt')
      expect(chat.getState().pendingProposal, word).toBeNull()
    }
  })

  // 왜: 정상 경로 고정 — 카드를 낸 그 단계에서는 지금처럼 말로 승인된다.
  it('대기 카드를 낸 단계에서는 지금처럼 "yes"로 승인된다', async () => {
    await chat.getState().sendMessage('Rewrite shot 1')
    await chat.getState().sendMessage('yes')
    expect(promptOf('s1')).toBe('Lumi prompt')
    expect(chat.getState().pendingProposal).toBeNull()
  })
})
