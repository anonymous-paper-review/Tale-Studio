// 이름 없는 인물·배경 카드도 기존 자리에 내용을 채우고, 같은 카드를 새로 만들지 않는다
import { beforeEach, describe, expect, it } from 'vitest'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import type { CastMember, BackgroundSource } from '@/lib/producer-gate'

const emptyPerson = (localId: string): CastMember => ({
  localId,
  name: '',
  entityType: 'person',
  appearance: '',
  origin: 'producer',
  userEdited: false,
})
const emptyBackground = (localId: string): BackgroundSource => ({
  localId,
  name: '',
  visualDescription: '',
  purpose: '',
  origin: 'producer',
  userEdited: false,
})

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ currentStage: 'producer', reachedStage: 'producer' })
})

describe('이름 없는 인물·배경 카드에 내용을 채우는 규칙', () => {
  it('이름 없는 인물 카드에 내용을 채우면 기존 카드 하나만 갱신한다', () => {
    useProducerStore.setState({ cast: [emptyPerson('u1')] })
    useProducerStore
      .getState()
      .applyExtractedSettings({ characters: [{ ref: 'u1', name: '카르타', appearance: '검은 후디' }] })
    const cast = useProducerStore.getState().cast
    expect(cast).toHaveLength(1)
    expect(cast[0].localId).toBe('u1')
    expect(cast[0].name).toBe('카르타')
    expect(cast[0].appearance).toBe('검은 후디')
  })

  it('이름 없는 배경 카드에 내용을 채우면 기존 카드 하나만 갱신한다', () => {
    useProducerStore.setState({ backgrounds: [emptyBackground('b1')] })
    useProducerStore
      .getState()
      .applyExtractedSettings({ backgrounds: [{ ref: 'b1', name: '네온 골목', visualDescription: '젖은 골목' }] })
    const bgs = useProducerStore.getState().backgrounds
    expect(bgs).toHaveLength(1)
    expect(bgs[0].localId).toBe('b1')
    expect(bgs[0].name).toBe('네온 골목')
  })

  it('같은 종류 카드가 여러 개여도 지정한 카드 하나만 채운다', () => {
    useProducerStore.setState({ cast: [emptyPerson('p1'), emptyPerson('p2')] })
    useProducerStore.getState().applyExtractedSettings({ characters: [{ ref: 'p2', name: '두번째' }] })
    const cast = useProducerStore.getState().cast
    expect(cast).toHaveLength(2)
    expect(cast.find((c) => c.localId === 'p1')?.name).toBe('')
    expect(cast.find((c) => c.localId === 'p2')?.name).toBe('두번째')
  })

  it('이름이 있는 카드의 내용을 바꿔도 해당 카드 하나만 갱신한다', () => {
    useProducerStore.setState({
      cast: [{ ...emptyPerson('k'), name: '카르타' }],
    })
    useProducerStore.getState().applyExtractedSettings({ characters: [{ name: '카르타', appearance: '검은 후디' }] })
    const cast = useProducerStore.getState().cast
    expect(cast).toHaveLength(1)
    expect(cast[0].appearance).toBe('검은 후디')
  })
})
