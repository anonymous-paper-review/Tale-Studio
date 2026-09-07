import { beforeEach, describe, expect, it } from 'vitest'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import type { CastMember, BackgroundSource } from '@/lib/producer-gate'

function castMember(over: Partial<CastMember>): CastMember {
  return {
    localId: over.name ?? 'c1',
    name: over.name ?? '인물',
    entityType: 'person',
    appearance: '미정',
    origin: 'producer',
    userEdited: false,
    ...over,
  }
}

function bg(over: Partial<BackgroundSource>): BackgroundSource {
  return {
    localId: over.name ?? 'b1',
    name: over.name ?? '배경',
    visualDescription: '미정',
    purpose: '',
    origin: 'producer',
    userEdited: false,
    ...over,
  }
}

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ currentStage: 'producer', reachedStage: 'producer' })
})

describe('producer chat ↔ board two-way sync', () => {
  it('overwrites a pipeline placeholder ("미정") appearance directly when not user-edited', () => {
    useProducerStore.setState({
      cast: [castMember({ name: '소녀', appearance: '미정', userEdited: false })],
    })

    useProducerStore.getState().applyExtractedSettings({
      characters: [{ name: '소녀', appearance: '20대 여성, 흰 원피스' }],
    })

    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(useProducerStore.getState().cast[0].appearance).toBe('20대 여성, 흰 원피스')
  })

  it('removes a stale card directly when not user-edited', () => {
    useProducerStore.setState({
      backgrounds: [bg({ name: '회화세계', visualDescription: '미정', userEdited: false })],
    })

    useProducerStore.getState().applyExtractedSettings({
      backgrounds: [{ name: '회화세계', remove: true }],
    })

    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(useProducerStore.getState().backgrounds).toHaveLength(0)
  })

  it('merges two cards (remove loser + update survivor) in one patch', () => {
    useProducerStore.setState({
      cast: [
        castMember({ name: '기사', appearance: '미정', userEdited: false }),
        castMember({ name: '늙은 기사', appearance: '미정', userEdited: false }),
      ],
    })

    useProducerStore.getState().applyExtractedSettings({
      characters: [
        { name: '기사', remove: true },
        { name: '늙은 기사', appearance: '백발, 얼굴 없는 갑옷' },
      ],
    })

    const cast = useProducerStore.getState().cast
    expect(cast).toHaveLength(1)
    expect(cast[0].name).toBe('늙은 기사')
    expect(cast[0].appearance).toBe('백발, 얼굴 없는 갑옷')
  })

  it('gates overwrite of a user-edited card value behind the approval proposal', async () => {
    useProducerStore.setState({
      cast: [castMember({ name: '소녀', appearance: '내가 직접 적은 외모', userEdited: true })],
    })

    useProducerStore.getState().applyExtractedSettings({
      characters: [{ name: '소녀', appearance: '챗봇이 바꾼 외모' }],
    })

    // 보호: 즉시 반영되지 않고 제안으로만 표면화.
    expect(useProducerStore.getState().cast[0].appearance).toBe('내가 직접 적은 외모')
    expect(useGlobalChatStore.getState().pendingProposal?.kind).toBe('producerSourcePatch')

    const approved = await useGlobalChatStore.getState().approvePendingProposal()
    expect(approved).toBe(true)
    expect(useProducerStore.getState().cast[0].appearance).toBe('챗봇이 바꾼 외모')
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
  })

  it('gates deletion of a user-edited card behind the approval proposal', () => {
    useProducerStore.setState({
      backgrounds: [bg({ name: '내 배경', visualDescription: '내가 적은 설명', userEdited: true })],
    })

    useProducerStore.getState().applyExtractedSettings({
      backgrounds: [{ name: '내 배경', remove: true }],
    })

    expect(useProducerStore.getState().backgrounds).toHaveLength(1)
    expect(useGlobalChatStore.getState().pendingProposal?.kind).toBe('producerSourcePatch')
  })

  it('still fills an empty field on a user-edited card without gating (no clobber)', () => {
    useProducerStore.setState({
      cast: [castMember({ name: '소녀', appearance: '', role: undefined, userEdited: true })],
    })

    useProducerStore.getState().applyExtractedSettings({
      characters: [{ name: '소녀', appearance: '검은 후디' }],
    })

    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(useProducerStore.getState().cast[0].appearance).toBe('검은 후디')
  })
})
