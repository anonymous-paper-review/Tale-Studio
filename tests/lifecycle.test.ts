import { describe, expect, it } from 'vitest'
import type { ProjectSettings } from '@/types'
import {
  computeProducerSourceHash,
  evaluateArtistGate,
  evaluateDirectorGate,
  evaluateProducerSourceImpact,
  UNKNOWN_WRITER_GATE_STATUS,
} from '@/lib/lifecycle'
import { useProjectStore } from '@/stores/project-store'

const settings: ProjectSettings = {
  playtime: 120,
  genre: 'thriller',
  subGenre: 'psychological',
  format: 'horizontal_16:9',
  tone: ['dark', 'tense'],
  targetEmotion: ['fear'],
  dialogueLanguage: 'ko',
}

const producerSource = {
  storyText: '한밤중 추격전',
  settings,
  cast: [
    {
      localId: 'local-a',
      characterId: 'char_a',
      name: '아라',
      entityType: 'person',
      role: 'protagonist',
      appearance: '검은 후디',
      voice: '낮고 빠름',
      arc: { start_state: '도주', end_state: '대면', arc_type: '용기' },
      motivation: { want: '살아남기' },
    },
    {
      localId: 'local-ring',
      characterId: 'obj_ring',
      name: '반지',
      entityType: 'object',
      appearance: '은빛 고리',
    },
  ],
}

describe('computeProducerSourceHash', () => {
  it('cast order does not change the source hash', () => {
    const reversed = { ...producerSource, cast: [...producerSource.cast].reverse() }
    expect(computeProducerSourceHash(reversed)).toBe(computeProducerSourceHash(producerSource))
  })

  it('contracted source field changes alter the hash', () => {
    const changed = {
      ...producerSource,
      cast: producerSource.cast.map((c) =>
        c.characterId === 'char_a' ? { ...c, appearance: '흰 후디' } : c,
      ),
    }
    expect(computeProducerSourceHash(changed)).not.toBe(computeProducerSourceHash(producerSource))
  })
})

describe('evaluateProducerSourceImpact', () => {
  it('reports writer stale and selected artist image stale without regenerating anything', () => {
    const changed = {
      ...producerSource,
      cast: producerSource.cast.map((c) =>
        c.characterId === 'char_a' ? { ...c, appearance: '흰 후디' } : c,
      ),
    }

    const impacts = evaluateProducerSourceImpact({
      before: producerSource,
      after: changed,
      hasWriterOutput: true,
      selectedArtistImageCharacterIds: ['char_a'],
    })

    expect(impacts.map((i) => i.kind)).toEqual(
      expect.arrayContaining(['writerOutputStale', 'artistImageStale']),
    )
  })
})

describe('evaluateArtistGate', () => {
  it('requires fallback non-object producer cast main images and warns on objects/worlds', () => {
    const gate = evaluateArtistGate({
      characters: [
        { characterId: 'char_a', name: '아라', entityType: 'person', appearance: '검은 후디' },
        { characterId: 'obj_ring', name: '반지', entityType: 'object', appearance: '은빛 고리' },
      ],
      worlds: [{ locationId: 'loc_alley', name: '골목' }],
    })

    expect(gate.ready).toBe(false)
    expect(gate.requiredCharacterIds).toEqual(['char_a'])
    expect(gate.blockers.map((b) => b.field)).toContain('artist:char_a:mainImage')
    expect(gate.warnings.map((w) => w.field)).toEqual(
      expect.arrayContaining(['artist:obj_ring:objectImage', 'artist:loc_alley:wideShot']),
    )
  })

  it('uses writer references when provided and ignores non-referenced fallback characters', () => {
    const gate = evaluateArtistGate({
      characters: [
        { characterId: 'char_a', name: '아라', entityType: 'person', appearance: '검은 후디', mainImageUrl: 'https://img/a.png' },
        { characterId: 'char_b', name: '보라', entityType: 'person', appearance: '붉은 코트' },
      ],
      referencedCharacterIds: ['char_a'],
    })

    expect(gate.ready).toBe(true)
    expect(gate.requiredCharacterIds).toEqual(['char_a'])
    expect(gate.blockers).toEqual([])
  })
})

describe('evaluateDirectorGate', () => {
  it('treats unknown writer status as blocking, never ready', () => {
    const artist = evaluateArtistGate({
      characters: [
        { characterId: 'char_a', name: '아라', entityType: 'person', appearance: '검은 후디', mainImageUrl: 'https://img/a.png' },
      ],
    })

    const gate = evaluateDirectorGate({ writer: UNKNOWN_WRITER_GATE_STATUS, artist })

    expect(gate.ready).toBe(false)
    expect(gate.blockers.map((b) => b.field)).toContain('writer:status')
  })
})

describe('project-store lifecycle plumbing', () => {
  it('unlockThrough advances reachedStage without changing currentStage', () => {
    useProjectStore.setState({ currentStage: 'writer', reachedStage: 'writer' })

    useProjectStore.getState().unlockThrough('artist')

    expect(useProjectStore.getState().currentStage).toBe('writer')
    expect(useProjectStore.getState().reachedStage).toBe('artist')
    expect(useProjectStore.getState().canNavigateTo('artist')).toBe(true)
    expect(useProjectStore.getState().canNavigateTo('director')).toBe(false)
  })
})
