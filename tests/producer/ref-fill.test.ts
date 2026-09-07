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

describe('ref-targeted fill of empty (이름 미정) cards', () => {
  it('fills an unnamed cast card by ref — no duplicate', () => {
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

  it('fills an unnamed background card by ref — no duplicate', () => {
    useProducerStore.setState({ backgrounds: [emptyBackground('b1')] })
    useProducerStore
      .getState()
      .applyExtractedSettings({ backgrounds: [{ ref: 'b1', name: '네온 골목', visualDescription: '젖은 골목' }] })
    const bgs = useProducerStore.getState().backgrounds
    expect(bgs).toHaveLength(1)
    expect(bgs[0].localId).toBe('b1')
    expect(bgs[0].name).toBe('네온 골목')
  })

  it('disambiguates: ref targets the exact unnamed card among several', () => {
    useProducerStore.setState({ cast: [emptyPerson('p1'), emptyPerson('p2')] })
    useProducerStore.getState().applyExtractedSettings({ characters: [{ ref: 'p2', name: '두번째' }] })
    const cast = useProducerStore.getState().cast
    expect(cast).toHaveLength(2)
    expect(cast.find((c) => c.localId === 'p1')?.name).toBe('')
    expect(cast.find((c) => c.localId === 'p2')?.name).toBe('두번째')
  })

  it('named edits still match by name (no regression)', () => {
    useProducerStore.setState({
      cast: [{ ...emptyPerson('k'), name: '카르타' }],
    })
    useProducerStore.getState().applyExtractedSettings({ characters: [{ name: '카르타', appearance: '검은 후디' }] })
    const cast = useProducerStore.getState().cast
    expect(cast).toHaveLength(1)
    expect(cast[0].appearance).toBe('검은 후디')
  })
})
