// 트리트먼트가 만든 인물·장소는 Producer 캐스팅·배경 카드로 들어오고, 빈 칸이 있어도 Writer로 넘기기를 막지 않는다 (2026-10-02 오너 · 시안 v04)
import { describe, expect, it } from 'vitest'
import { cardsForHandoff, syncTreatmentCast, type TreatmentCast } from '@/lib/producer/treatment-cast-sync'
import { evaluateProducerGate, type BackgroundSource, type CastMember } from '@/lib/producer-gate'
import type { ProjectSettings } from '@/types'

const treatment: TreatmentCast = {
  characters: [
    { id: 'jia', name: '지아', role: 'protagonist', entityType: 'person', appearance: '분홍 원피스', arc: { start_state: '고집', end_state: '양보', arc_type: 'positive_change' }, want: '이기기' },
    { id: 'suji', name: '수지', role: 'supporting', entityType: 'person', appearance: '', want: '' },
  ],
  locations: [{ id: 'yard', name: '운동장', description: '흙바닥 · 사방치기 칸' }],
}
const empty = { cast: [] as CastMember[], backgrounds: [] as BackgroundSource[], syncedVersion: null as string | null }

describe('트리트먼트 인물·장소를 카드로', () => {
  it('트리트먼트가 만든 인물과 장소는 Producer 캐스팅과 배경 카드로 들어온다', () => {
    const next = syncTreatmentCast(empty, treatment, 'story-1')
    expect(next.cast.map((c) => [c.characterId, c.name, c.appearance, c.origin])).toEqual([
      ['jia', '지아', '분홍 원피스', 'treatment'], ['suji', '수지', '', 'treatment'],
    ])
    expect(next.cast[0]).toMatchObject({ role: 'protagonist', arc: { start_state: '고집', end_state: '양보', arc_type: 'positive_change' }, motivation: { want: '이기기' } })
    expect(next.backgrounds.map((b) => [b.locationId, b.name, b.visualDescription, b.origin])).toEqual([['yard', '운동장', '흙바닥 · 사방치기 칸', 'treatment']])
    expect(next.syncedVersion).toBe('story-1')
  })

  it('이미 같은 이름의 카드가 있으면 새로 만들지 않는다', () => {
    const mine: CastMember = { localId: 'mine', name: '지아', entityType: 'person', appearance: '양갈래 머리' }
    const next = syncTreatmentCast({ ...empty, cast: [mine] }, treatment, 'story-1')
    expect(next.cast.map((c) => c.name)).toEqual(['지아', '수지'])
    expect(next.cast[0]).toEqual({ ...mine, characterId: 'jia' })
  })

  it('지운 카드는 트리트먼트가 바뀌기 전까지 다시 들어오지 않는다', () => {
    const first = syncTreatmentCast(empty, treatment, 'story-1')
    const deleted = { ...first, cast: first.cast.filter((c) => c.name !== '수지') }
    expect(syncTreatmentCast(deleted, treatment, 'story-1').cast.map((c) => c.name)).toEqual(['지아'])
    expect(syncTreatmentCast(deleted, treatment, 'story-2').cast.map((c) => c.name)).toEqual(['지아', '수지'])
  })

  it('트리트먼트에서 빠진 인물 카드는 손대지 않았으면 함께 빠지고 손댄 카드는 남는다', () => {
    const first = syncTreatmentCast(empty, treatment, 'story-1')
    const edited = { ...first, cast: first.cast.map((c) => (c.name === '수지' ? { ...c, appearance: '단발', userEdited: true } : c)) }
    const rethought: TreatmentCast = { characters: [{ id: 'minho', name: '민호', role: 'protagonist', entityType: 'person', appearance: '', want: '' }], locations: [] }
    const next = syncTreatmentCast(edited, rethought, 'story-2')
    expect(next.cast.map((c) => c.name)).toEqual(['수지', '민호'])
    expect(next.backgrounds).toEqual([])
  })

  it('손대지 않은 카드는 트리트먼트가 바뀌면 새 내용으로 맞춘다', () => {
    const first = syncTreatmentCast(empty, treatment, 'story-1')
    const changed: TreatmentCast = { ...treatment, characters: [{ ...treatment.characters[0], appearance: '노란 우비' }, treatment.characters[1]] }
    expect(syncTreatmentCast(first, changed, 'story-2').cast[0].appearance).toBe('노란 우비')
  })
})

describe('트리트먼트 카드 지키기 (검토 지적)', () => {
  it('채팅으로 고친 트리트먼트 카드는 트리트먼트가 바뀌어도 덮어쓰거나 빼지 않는다', () => {
    // 왜: 채팅 수정은 카드 편집 표시(userEdited)를 올리지 않는다 — 다음 맞춤이 채팅으로 고친 외모를 지우거나, 아이디어부터 다시가 카드를 뺐다.
    const first = syncTreatmentCast(empty, treatment, 'story-1')
    const chatEdited = { ...first, cast: first.cast.map((c) => (c.name === '수지' ? { ...c, appearance: '단발 · 노란 카디건' } : c)) }
    const rethought: TreatmentCast = { characters: [{ id: 'minho', name: '민호', role: 'protagonist', entityType: 'person', appearance: '', want: '' }], locations: [] }
    const next = syncTreatmentCast(chatEdited, rethought, 'story-2')
    expect(next.cast.find((c) => c.name === '수지')?.appearance).toBe('단발 · 노란 카디건')
  })

  it('같은 이름의 카드가 먼저 있으면 그 카드에 트리트먼트 인물의 표시를 이어 붙여 넘길 때 한 사람이 된다', () => {
    // 왜: 그림을 올려 먼저 만든 "지아" 카드와 트리트먼트의 jia 가 넘길 때 따로 실려 그림이 아무 씬에도 안 나오는 쪽에 붙었다.
    const photo: CastMember = { localId: 'img-1', name: '지아', entityType: 'person', appearance: '', sourceImageUrl: 'https://img.test/jia.png' }
    const place: BackgroundSource = { localId: 'bg-1', name: '운동장', visualDescription: '', purpose: '' }
    const next = syncTreatmentCast({ ...empty, cast: [photo], backgrounds: [place] }, treatment, 'story-1')
    expect(next.cast.find((c) => c.localId === 'img-1')?.characterId).toBe('jia')
    expect(next.backgrounds.find((b) => b.localId === 'bg-1')?.locationId).toBe('yard')
    expect(next.cast.filter((c) => c.name === '지아')).toHaveLength(1)
  })

  it('손대지 않은 트리트먼트 카드는 넘길 때 Producer 카드로 싣지 않고 Writer가 채우게 둔다', () => {
    // 왜: 빈 설명 · 목적의 트리트먼트 배경이 Producer 배경으로 저장되면 Writer 가 그 칸을 다시 채우지 않는다.
    const first = syncTreatmentCast(empty, treatment, 'story-1')
    const edited = first.cast.map((c) => (c.name === '수지' ? { ...c, appearance: '단발' } : c))
    const handoff = cardsForHandoff({ cast: edited, backgrounds: first.backgrounds })
    expect(handoff.cast.map((c) => c.name)).toEqual(['수지'])
    expect(handoff.backgrounds).toEqual([])
  })
})

describe('트리트먼트 카드와 넘기기 조건', () => {
  const settings: ProjectSettings = { playtime: 300, genre: '드라마', format: 'horizontal_16:9', tone: [], dialogueLanguage: 'ko' }
  const synced = syncTreatmentCast(empty, treatment, 'story-1')
  const gate = (cast: CastMember[], backgrounds: BackgroundSource[]) =>
    evaluateProducerGate({ settings, storyReady: true, cast, backgrounds, styleAnchorKey: 'live_action', locale: 'ko' })

  it('트리트먼트에서 들어온 인물은 빈 칸이 있어도 넘기기를 막지 않고 채우면 좋은 것으로 보인다', () => {
    const result = gate(synced.cast, synced.backgrounds)
    expect(result.canHandoff).toBe(true)
    expect(result.softMissing.some((i) => i.label.includes('수지'))).toBe(true)
  })

  it('트리트먼트에서 들어온 인물도 주인공 한 명 이상으로 친다', () => {
    expect(gate(synced.cast, synced.backgrounds).hardMissing.map((i) => i.field)).not.toContain('cast:minPerson')
  })

  it('트리트먼트에서 들어온 배경만 있어도 배경이 있는 것으로 친다', () => {
    expect(gate(synced.cast, synced.backgrounds).hardMissing.map((i) => i.field)).not.toContain('background:minComplete')
  })
})
