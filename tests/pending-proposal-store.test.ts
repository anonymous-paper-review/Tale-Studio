import { beforeEach, describe, expect, it } from 'vitest'
import type { ProjectSettings } from '@/types'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
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

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
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

    useProducerStore.getState().applyExtractedSettings({ genre: 'drama' })

    expect(useProducerStore.getState().projectSettings.genre).toBe('thriller')
    expect(useGlobalChatStore.getState().pendingProposal?.kind).toBe('producerSourcePatch')

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

    useProducerStore.getState().applyExtractedSettings({ genre: 'thriller', storyText: '새 스토리', storyReady: true })

    expect(useProducerStore.getState().projectSettings.genre).toBe('thriller')
    expect(useProducerStore.getState().storyText).toBe('새 스토리')
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
  })
})

describe('pending proposal store policy', () => {
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
