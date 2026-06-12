import { describe, expect, it } from 'vitest'
import { evaluateProducerGate, type CastMember } from '@/lib/producer-gate'
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
  voice: '낮고 단호한',
  arc: { start_state: '도주', end_state: '대면', arc_type: '용기' },
  motivation: { want: '추격자 따돌리기' },
  ...over,
})

describe('evaluateProducerGate — gate A (story foundation)', () => {
  it('blocks when a hard setting is missing', () => {
    const r = evaluateProducerGate({
      settings: { ...baseSettings, genre: '' },
      storyReady: true,
      cast: [fullPerson()],
    })
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.field)).toContain('genre')
  })

  it('blocks when story is not ready', () => {
    const r = evaluateProducerGate({ settings: baseSettings, storyReady: false, cast: [fullPerson()] })
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.field)).toContain('storyText')
  })

  it('reports empty tone/targetEmotion as SOFT only (not blocking)', () => {
    const r = evaluateProducerGate({
      settings: { ...baseSettings, tone: [], targetEmotion: [], subGenre: '' },
      storyReady: true,
      cast: [fullPerson()],
    })
    expect(r.canHandoff).toBe(true)
    const softFields = r.softMissing.map((i) => i.field)
    expect(softFields).toEqual(expect.arrayContaining(['tone', 'targetEmotion', 'subGenre']))
  })
})

describe('evaluateProducerGate — gate B (cast, depth-linked)', () => {
  it('D1 (10s) allows zero cast', () => {
    const r = evaluateProducerGate({
      settings: { ...baseSettings, playtime: 10 },
      storyReady: true,
      cast: [],
    })
    expect(r.canHandoff).toBe(true)
  })

  it('D3 (120s) requires at least one person', () => {
    const r = evaluateProducerGate({ settings: baseSettings, storyReady: true, cast: [] })
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.field)).toContain('cast:minPerson')
  })

  it('D3 person missing voice/arc/want is blocked', () => {
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      cast: [fullPerson({ voice: '', arc: undefined, motivation: undefined })],
    })
    expect(r.canHandoff).toBe(false)
    const fields = r.hardMissing.map((i) => i.field)
    expect(fields).toContain('cast:p1:voice')
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
    })
    expect(r.canHandoff).toBe(true)
  })

  it('D4 (600s) recommends a second person as SOFT', () => {
    const r = evaluateProducerGate({
      settings: { ...baseSettings, playtime: 600 },
      storyReady: true,
      cast: [fullPerson()],
    })
    expect(r.canHandoff).toBe(true)
    expect(r.softMissing.map((i) => i.field)).toContain('cast:recommendPersons')
  })
})
