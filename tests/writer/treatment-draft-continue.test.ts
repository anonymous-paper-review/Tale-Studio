// 새 프로젝트의 트리트먼트 초안은 넘기기 전까지 확정 단계에서 기다리고, Writer로 넘기면 Producer 값을 실어 나머지를 이어 간다 (2026-10-02 오너 · 시안 v04)
import { describe, expect, it } from 'vitest'
import { continueDraftState, draftBasisChanges, mergeProducerCharacters, mergeProducerWorld } from '@/lib/writer/treatment-draft'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'

const character = (id: string, name: string, appearance = '') => ({
  id, name, role: 'supporting', personality: [], arc: { start_state: '', end_state: '', arc_type: '' }, appearance_description: appearance, motivation: { want: '', need: '' },
})

describe('넘길 때 Producer 값 합치기', () => {
  it('Producer에서 고친 인물은 트리트먼트의 같은 인물 위에 덮고 트리트먼트에만 있는 인물은 남긴다', () => {
    const merged = mergeProducerCharacters(
      { characters: [character('jia', '지아', '분홍 원피스'), character('suji', '수지')], relationships: [], subtext_notes: ['둘은 친구'] },
      { characters: [{ character_id: 'suji', name: '수지', entity_type: 'person', appearance: '단발 · 노란 카디건', role: 'supporting' }, { character_id: 'teacher', name: '담임', entity_type: 'person', appearance: '안경' }] },
    )
    expect(merged.characters.map((c) => [c.id, c.name, c.appearance_description])).toEqual([
      ['jia', '지아', '분홍 원피스'], ['suji', '수지', '단발 · 노란 카디건'], ['teacher', '담임', '안경'],
    ])
    expect(merged.subtext_notes).toEqual(['둘은 친구'])
  })

  it('Producer에서 고친 배경도 같은 장소 위에 덮고 트리트먼트에만 있는 장소는 남긴다', () => {
    const merged = mergeProducerWorld(
      { locations: [{ id: 'yard', name: '운동장', description: '' }, { id: 'window', name: '교실 창가', description: '3층' }] },
      { locations: [{ id: 'yard', name: '초등학교 운동장', description: '흙바닥 · 사방치기 칸' }] },
    )
    expect(merged?.locations).toEqual([
      { id: 'yard', name: '초등학교 운동장', description: '흙바닥 · 사방치기 칸' },
      { id: 'window', name: '교실 창가', description: '3층' },
    ])
  })

  it('이어 가면 확정 단계를 넘기고 트리트먼트 초안 표시와 되돌리기를 지운다', () => {
    const state = {
      input: { story: '씨앗', treatmentDraft: true, sceneGate: true, writerEngine: 'v1' },
      scenes: { scenes: [], total_estimated_seconds: 0 }, characters: { characters: [character('jia', '지아')], relationships: [], subtext_notes: [] },
      _sceneStoryUndo: { id: 'u1', label: 'v1', storyVersion: 'x', scenes: { scenes: [], total_estimated_seconds: 0 } },
    } as unknown as WriterRunState
    const next = continueDraftState(state, {
      story: '고친 씨앗', writerEngine: 'v1', sceneGate: true, runtimeSeconds: 300,
      genre: { genre: '드라마', tone: [], targetEmotion: [], runtime_seconds: 300, depth_level: 'D4', format: 'horizontal_16:9' },
      cast: { characters: [{ character_id: 'jia', name: '지아', entity_type: 'person', appearance: '양갈래 머리' }] },
      styleAnchor: { key: 'live_action' },
    } as never)
    expect(next.input).toMatchObject({ story: '고친 씨앗', sceneGate: true, styleAnchor: { key: 'live_action' } })
    expect(next.input.treatmentDraft).toBeUndefined()
    expect(next._gateConfirmed).toBe(true)
    expect(next._sceneStoryUndo).toBeUndefined()
    expect(next.genre).toMatchObject({ genre: '드라마' })
    expect(next.characters?.characters[0].appearance_description).toBe('양갈래 머리')
    expect(next.scenes).toEqual(state.scenes)
  })
})

describe('넘길 때 트리트먼트 값 지키기 (검토 지적)', () => {
  it('넘길 때 Producer 카드에 없는 인물의 속마음과 상처는 트리트먼트 값을 지킨다', () => {
    const merged = mergeProducerCharacters(
      { characters: [{ ...character('jia', '지아'), motivation: { want: '이기기', need: '친구', wound: '전학' }, arc: { start_state: '고집', end_state: '양보', arc_type: 'positive_change' } }], relationships: [], subtext_notes: [] },
      { characters: [{ character_id: 'jia', name: '지아', entity_type: 'person', appearance: '양갈래', motivation: { want: '끝까지 가기' }, arc: { start_state: '', end_state: '', arc_type: '' } }] },
    )
    expect(merged.characters[0].motivation).toEqual({ want: '끝까지 가기', need: '친구', wound: '전학' })
    expect(merged.characters[0].arc).toEqual({ start_state: '고집', end_state: '양보', arc_type: 'positive_change' })
  })

  it('트리트먼트를 쓴 뒤 이야기 · 러닝타임 · 대본 보존이 바뀌었는지 알려 준다', () => {
    const draft = { story: '씨앗', runtimeSeconds: 300 } as never
    expect(draftBasisChanges(draft, { story: '씨앗', runtimeSeconds: 300 } as never)).toEqual([])
    expect(draftBasisChanges(draft, { story: '바뀐 씨앗', runtimeSeconds: 60, preserveScript: true } as never)).toEqual(['story', 'runtime', 'preserveScript'])
  })
})
