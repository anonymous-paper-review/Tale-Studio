import { describe, expect, it } from 'vitest'
import { evaluateProducerGate, type BackgroundSource, type CastMember } from '@/lib/producer-gate'
import type { ProjectSettings } from '@/types'

const baseSettings: ProjectSettings = {
  playtime: 120, // D3
  genre: 'thriller',
  format: 'horizontal_16:9',
  tone: ['dark'],
  targetEmotion: ['suspense'],
  dialogueLanguage: 'ko',
}

const fullPerson = (over: Partial<CastMember> = {}): CastMember => ({
  localId: 'p1',
  name: '지아',
  entityType: 'person',
  appearance: '20대 여성, 검은 후디',
  arc: { start_state: '도주', end_state: '대면', arc_type: '용기' },
  motivation: { want: '추격자 따돌리기' },
  ...over,
})

const fullBackground = (over: Partial<BackgroundSource> = {}): BackgroundSource => ({
  localId: 'b1',
  name: '네온 골목',
  visualDescription: '젖은 아스팔트와 붉은 네온 간판이 있는 좁은 골목',
  purpose: '추격이 시작되는 압박감 있는 공간',
  origin: 'producer',
  ...over,
})

describe('evaluateProducerGate — gate A (story foundation)', () => {
  it('blocks when a hard setting is missing', () => {
    const r = evaluateProducerGate({
      settings: { ...baseSettings, genre: '' },
      storyReady: true,
      cast: [fullPerson()],
      backgrounds: [fullBackground()],
    })
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.field)).toContain('genre')
  })

  it('blocks when story is not ready', () => {
    const r = evaluateProducerGate({ settings: baseSettings, storyReady: false, cast: [fullPerson()], backgrounds: [fullBackground()] })
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.field)).toContain('storyText')
  })

  it('reports empty tone/subGenre as SOFT only (not blocking)', () => {
    const r = evaluateProducerGate({
      settings: { ...baseSettings, tone: [], subGenre: '' },
      storyReady: true,
      cast: [fullPerson()],
      backgrounds: [fullBackground()],
    })
    expect(r.canHandoff).toBe(true)
    const softFields = r.softMissing.map((i) => i.field)
    expect(softFields).toEqual(expect.arrayContaining(['tone', 'subGenre']))
    expect(softFields).not.toContain('targetEmotion')
  })
})

describe('evaluateProducerGate — gate B (cast, depth-linked)', () => {
  it('D1 (10s) allows zero cast', () => {
    const r = evaluateProducerGate({
      settings: { ...baseSettings, playtime: 10 },
      storyReady: true,
      cast: [],
      backgrounds: [fullBackground()],
    })
    expect(r.canHandoff).toBe(true)
  })

  it('D3 (120s) requires at least one person', () => {
    const r = evaluateProducerGate({ settings: baseSettings, storyReady: true, cast: [], backgrounds: [fullBackground()] })
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.field)).toContain('cast:minPerson')
  })

  it('D3 person missing arc/want is blocked', () => {
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      cast: [fullPerson({ arc: undefined, motivation: undefined })],
      backgrounds: [fullBackground()],
    })
    expect(r.canHandoff).toBe(false)
    const fields = r.hardMissing.map((i) => i.field)
    expect(fields).toContain('cast:p1:arc')
    expect(fields).toContain('cast:p1:want')
  })

  it('object only needs name + appearance even at D3', () => {
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      cast: [
        fullPerson(),
        { localId: 'o1', name: '반지', entityType: 'object', appearance: '은빛 고리' },
      ],
      backgrounds: [fullBackground()],
    })
    expect(r.canHandoff).toBe(true)
  })

  it('D4 (600s) recommends a second person as SOFT', () => {
    const r = evaluateProducerGate({
      settings: { ...baseSettings, playtime: 600 },
      storyReady: true,
      cast: [fullPerson()],
      backgrounds: [fullBackground()],
    })
    expect(r.canHandoff).toBe(true)
    expect(r.softMissing.map((i) => i.field)).toContain('cast:recommendPersons')
  })

  it('requires at least one complete background source card', () => {
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      cast: [fullPerson()],
      backgrounds: [{ ...fullBackground(), visualDescription: '' }],
    })
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.field)).toContain('background:minComplete')
  })
})

describe('evaluateProducerGate — writer-origin cards do not block handoff', () => {
  it('ignores an incomplete writer-origin person (partial writer run addition)', () => {
    // producer 카스트는 완성, writer 가 부분 실행 중 arc/motivation 없는 인물을 추가한 상황.
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      cast: [
        fullPerson(),
        {
          localId: 'w1',
          name: 'Anonymous Villager',
          entityType: 'person',
          appearance: '평범한 마을 주민',
          origin: 'writer',
        },
      ],
      backgrounds: [fullBackground()],
    })
    expect(r.canHandoff).toBe(true)
    expect(r.hardMissing).toHaveLength(0)
  })

  it('ignores writer-origin backgrounds for the min-complete requirement', () => {
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      cast: [fullPerson()],
      backgrounds: [
        fullBackground(), // producer-origin, complete
        { localId: 'wl', name: 'location_2', visualDescription: 'A gothic studio', purpose: '', origin: 'writer' },
      ],
    })
    expect(r.canHandoff).toBe(true)
  })

  it('still requires a producer-origin background (writer-only backgrounds do not satisfy)', () => {
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      cast: [fullPerson()],
      backgrounds: [
        { localId: 'wl', name: 'location', visualDescription: 'A gothic studio', purpose: '핵심 공간', origin: 'writer' },
      ],
    })
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.field)).toContain('background:minComplete')
  })
})
