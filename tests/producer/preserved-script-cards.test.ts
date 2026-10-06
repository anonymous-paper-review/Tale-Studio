// 대본을 그대로 보존한 트리트먼트 초안도 인물·장소를 캐스팅·배경 카드로 채워 Writer로 넘길 수 있다 (2026-10-06 오너 · 운영 제보)
import { describe, expect, it } from 'vitest'
import { sceneStoryNeedsPreview } from '@/lib/producer/scene-story'
import { syncTreatmentCast, type TreatmentCast } from '@/lib/producer/treatment-cast-sync'
import { evaluateProducerGate, type BackgroundSource, type CastMember } from '@/lib/producer-gate'
import type { ProjectSettings } from '@/types'

describe('보존 대본 초안의 트리트먼트 불러오기', () => {
  it('대본을 그대로 보존한 넘기기 전 초안도 인물과 장소를 카드로 옮기려고 트리트먼트를 불러온다', () => {
    // 왜: 운영 제보(2026-10-06) — 외부 대본을 넣은 새 프로젝트에서 카드가 하나도 차지 않아 넘기기가 막혔다.
    expect(sceneStoryNeedsPreview({ hasTreatment: true, showOriginal: true, draftLive: true })).toBe(true)
  })

  it('넘긴 뒤 보존 대본은 원본만 보여 주므로 트리트먼트를 불러오지 않는다', () => {
    expect(sceneStoryNeedsPreview({ hasTreatment: true, showOriginal: true, draftLive: false })).toBe(false)
    expect(sceneStoryNeedsPreview({ hasTreatment: true, showOriginal: false, draftLive: false })).toBe(true)
    expect(sceneStoryNeedsPreview({ hasTreatment: false, showOriginal: false, draftLive: false })).toBe(false)
  })
})

describe('보존 대본 초안의 카드와 넘기기 조건', () => {
  // 운영 프로젝트와 같은 모양: 인물은 외모·동기가 비어 있고 모두 조연, 장소는 씬에 적힌 이름뿐이다.
  const treatment: TreatmentCast = {
    characters: [
      { id: 'char_1', name: '미나코', role: 'supporting', entityType: 'person', appearance: '', want: '' },
      { id: 'char_2', name: '애시', role: 'supporting', entityType: 'person', appearance: '', want: '' },
    ],
    locations: [{ id: '붐비는 카페', name: '붐비는 카페', description: '' }, { id: '꽃집', name: '꽃집', description: '' }],
  }
  const settings: ProjectSettings = { playtime: 60, genre: '드라마', format: 'horizontal_16:9', tone: [], dialogueLanguage: 'ko' }

  it('보존 대본 초안의 인물과 장소가 카드로 들어오면 외모와 설명이 비어 있어도 넘길 수 있다', () => {
    const board = syncTreatmentCast({ cast: [] as CastMember[], backgrounds: [] as BackgroundSource[], syncedVersion: null }, treatment, 'v1')
    expect(board.cast.map((c) => c.name)).toEqual(['미나코', '애시'])
    expect(board.backgrounds.map((b) => b.name)).toEqual(['붐비는 카페', '꽃집'])
    const gate = evaluateProducerGate({ settings, storyReady: true, cast: board.cast, backgrounds: board.backgrounds, styleAnchorKey: 'live_action', locale: 'ko' })
    expect(gate.canHandoff).toBe(true)
  })
})
