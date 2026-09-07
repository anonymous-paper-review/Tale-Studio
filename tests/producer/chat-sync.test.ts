// 채팅에서 정한 인물과 배경은 보드에 반영하고 직접 고친 내용은 보호한다
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

describe('Producer 채팅과 보드가 서로 같은 내용을 보여준다', () => {
  it('직접 고치지 않은 미정 외모는 새 설정을 넣으면 바로 바뀐다', () => {
    useProducerStore.setState({
      cast: [castMember({ name: '소녀', appearance: '미정', userEdited: false })],
    })

    useProducerStore.getState().applyExtractedSettings({
      characters: [{ name: '소녀', appearance: '20대 여성, 흰 원피스' }],
    })

    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(useProducerStore.getState().cast[0].appearance).toBe('20대 여성, 흰 원피스')
  })

  it('직접 고치지 않은 오래된 배경은 새 설정에서 빼면 바로 사라진다', () => {
    useProducerStore.setState({
      backgrounds: [bg({ name: '회화세계', visualDescription: '미정', userEdited: false })],
    })

    useProducerStore.getState().applyExtractedSettings({
      backgrounds: [{ name: '회화세계', remove: true }],
    })

    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
    expect(useProducerStore.getState().backgrounds).toHaveLength(0)
  })

  it('같은 대상을 가리키는 카드가 둘이면 하나로 합쳐 최신 내용을 남긴다', () => {
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

  it('직접 고친 카드의 내용을 바꿀 때는 먼저 사용자 확인을 받는다', async () => {
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

  it('직접 고친 카드를 지울 때는 먼저 사용자 확인을 받는다', () => {
    useProducerStore.setState({
      backgrounds: [bg({ name: '내 배경', visualDescription: '내가 적은 설명', userEdited: true })],
    })

    useProducerStore.getState().applyExtractedSettings({
      backgrounds: [{ name: '내 배경', remove: true }],
    })

    expect(useProducerStore.getState().backgrounds).toHaveLength(1)
    expect(useGlobalChatStore.getState().pendingProposal?.kind).toBe('producerSourcePatch')
  })

  it('직접 고친 카드라도 비어 있는 칸은 확인 없이 채우되 기존 내용은 덮어쓰지 않는다', () => {
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
