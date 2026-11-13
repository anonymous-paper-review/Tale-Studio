// Editor 채팅의 "yes · 응 · 좋아"는 어떤 대기 카드도 승인하지 않고 조언 질문으로 가며, 카드를 낸 단계에서는 지금처럼 말로 승인되는지 검사한다 (오너 2026-11-14 10번 · 검토 b 보통 3)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorNode } from '@/types/director'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

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

  // 왜: 정상 경로 고정 — 카드를 낸 그 단계에서는 지금처럼 말로 승인된다.
  it('대기 카드를 낸 단계에서는 지금처럼 "yes"로 승인된다', async () => {
    await chat.getState().sendMessage('Rewrite shot 1')
    await chat.getState().sendMessage('yes')
    expect(promptOf('s1')).toBe('Lumi prompt')
    expect(chat.getState().pendingProposal).toBeNull()
  })
})
