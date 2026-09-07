import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSettings } from '@/types'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { createPendingProposal } from '@/lib/pending-proposal'

const settings: ProjectSettings = {
  playtime: 120,
  genre: 'thriller',
  subGenre: 'psychological',
  format: 'horizontal_16:9',
  tone: ['dark'],
  targetEmotion: ['fear'],
  dialogueLanguage: 'ko',
}

const directorApplyUpdates = useDirectorCanvasStore.getState().applyUpdates

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
})

afterEach(() => {
  useDirectorCanvasStore.setState({ applyUpdates: directorApplyUpdates })
})

describe('producer chat extraction pending proposal guard', () => {
  it('post-handoff overwrites become a pending proposal instead of mutating source immediately', async () => {
    useProjectStore.setState({ currentStage: 'producer', reachedStage: 'artist' })
    useProducerStore.setState({
      storyText: '기존 스토리',
      storyReady: true,
      projectSettings: settings,
      cast: [],
    })

    const outcome = useProducerStore
      .getState()
      .applyExtractedSettings({ genre: 'drama' }, 'trace-producer')

    expect(outcome).toBe('pending')
    expect(useProducerStore.getState().projectSettings.genre).toBe('thriller')
    expect(useGlobalChatStore.getState().pendingProposal?.kind).toBe('producerSourcePatch')
    // 승인/거절이 같은 채팅 영수증(trace)으로 이어지려면 제안이 traceId를 들고 있어야 한다.
    expect(useGlobalChatStore.getState().pendingProposal?.traceId).toBe('trace-producer')

    const approved = await useGlobalChatStore.getState().approvePendingProposal()

    expect(approved).toBe(true)
    expect(useProducerStore.getState().projectSettings.genre).toBe('drama')
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
  })

  it('pre-handoff empty/fill updates still apply directly', () => {
    useProjectStore.setState({ currentStage: 'producer', reachedStage: 'producer' })
    useProducerStore.setState({
      storyText: '',
      storyReady: false,
      projectSettings: { ...settings, genre: '' },
      cast: [],
    })

    const outcome = useProducerStore
      .getState()
      .applyExtractedSettings({ genre: 'thriller', storyText: '새 스토리', storyReady: true })

    expect(outcome).toBe('applied')
    expect(useProducerStore.getState().projectSettings.genre).toBe('thriller')
    expect(useProducerStore.getState().storyText).toBe('새 스토리')
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
  })

  it('reports rejected when the proposal slot is already occupied', () => {
    useProjectStore.setState({ currentStage: 'producer', reachedStage: 'artist' })
    useProducerStore.setState({
      storyText: '기존 스토리',
      storyReady: true,
      projectSettings: settings,
      cast: [],
    })

    expect(
      useProducerStore.getState().applyExtractedSettings({ genre: 'drama' }, 'trace-1'),
    ).toBe('pending')
    // 카드 자리가 점유된 상태의 두 번째 추출은 보류된다 — 영수증엔 skipped로 적힐 재료.
    expect(
      useProducerStore.getState().applyExtractedSettings({ genre: 'romance' }, 'trace-2'),
    ).toBe('rejected')
    expect(useGlobalChatStore.getState().pendingProposal?.traceId).toBe('trace-1')
  })
})

describe('pending proposal store policy', () => {
  it('accepts a Director storyboard image proposal and only calls the generation path after approval', async () => {
    const applyUpdates = vi.fn(() => ({ applied: 2, skipped: [] }))
    useDirectorCanvasStore.setState({ applyUpdates })
    const proposal = createPendingProposal({
      id: 'director-image',
      traceId: 'trace-director',
      stage: 'director',
      kind: 'directorGenerateStoryboardImage',
      target: 'Storyboard image',
      action: 'Generate image',
      impact: ['Costs money to generate the image.', 'Nothing runs until you approve.'],
      payload: {
        updates: [{ type: 'generateImage', id: 'shot_1' }, { type: 'generateImage' }],
      },
    })

    expect(useGlobalChatStore.getState().offerPendingProposal(proposal)).toBe(true)
    expect(applyUpdates).not.toHaveBeenCalled()

    await expect(useGlobalChatStore.getState().approvePendingProposal()).resolves.toBe(true)
    expect(applyUpdates).toHaveBeenCalledWith(
      [{ type: 'generateImage', id: 'shot_1' }, { type: 'generateImage' }],
      expect.objectContaining({
        traceId: 'trace-director',
        onJob: expect.any(Function),
      }),
    )
  })

  it('rejects a Director image proposal with no executable updates', async () => {
    const applyUpdates = vi.fn(() => ({ applied: 0, skipped: [] }))
    useDirectorCanvasStore.setState({ applyUpdates })
    useGlobalChatStore.getState().offerPendingProposal(
      createPendingProposal({
        stage: 'director',
        kind: 'directorGenerateStoryboardImage',
        target: 'Storyboard image',
        action: 'Generate image',
        impact: [],
        payload: { updates: [] },
      }),
    )

    await expect(useGlobalChatStore.getState().approvePendingProposal()).resolves.toBe(false)
    expect(applyUpdates).not.toHaveBeenCalled()
  })

  it('keeps one pending proposal at a time', () => {
    const first = createPendingProposal({
      id: 'first',
      stage: 'artist',
      kind: 'artistRegenerateCharacterView',
      target: 'char_a',
      action: 'main regenerate',
      impact: ['cost'],
      payload: { characterId: 'char_a', view: 'main' },
    })
    const second = createPendingProposal({
      id: 'second',
      stage: 'artist',
      kind: 'artistRegenerateCharacterView',
      target: 'char_b',
      action: 'main regenerate',
      impact: ['cost'],
      payload: { characterId: 'char_b', view: 'main' },
    })

    expect(useGlobalChatStore.getState().offerPendingProposal(first)).toBe(true)
    expect(useGlobalChatStore.getState().offerPendingProposal(second)).toBe(false)
    expect(useGlobalChatStore.getState().pendingProposal?.id).toBe('first')
  })
})
