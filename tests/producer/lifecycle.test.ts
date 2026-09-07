// 같은 이야기 자료는 순서가 달라도 같은 것으로 보고, 필요한 정보가 갖춰진 다음 단계만 열어 둔다
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
  backgrounds: [
    {
      localId: 'bg-alley',
      locationId: 'neon_alley',
      name: '네온 골목',
      visualDescription: '젖은 아스팔트와 붉은 네온',
      purpose: '추격 시작',
      origin: 'producer',
    },
  ],
}

describe('computeProducerSourceHash', () => {
  it('등장인물 순서만 바뀌면 같은 이야기 자료로 본다', () => {
    const reversed = { ...producerSource, cast: [...producerSource.cast].reverse() }
    expect(computeProducerSourceHash(reversed)).toBe(computeProducerSourceHash(producerSource))
  })

  it('등장인물의 겉모습이 바뀌면 다른 이야기 자료로 본다', () => {
    const changed = {
      ...producerSource,
      cast: producerSource.cast.map((c) =>
        c.characterId === 'char_a' ? { ...c, appearance: '흰 후디' } : c,
      ),
    }
    expect(computeProducerSourceHash(changed)).not.toBe(computeProducerSourceHash(producerSource))
  })

  it('배경의 쓰임새가 바뀌면 다른 이야기 자료로 본다', () => {
    const changed = {
      ...producerSource,
      backgrounds: producerSource.backgrounds.map((background) =>
        background.locationId === 'neon_alley'
          ? { ...background, purpose: '결말 대면' }
          : background,
      ),
    }
    expect(computeProducerSourceHash(changed)).not.toBe(computeProducerSourceHash(producerSource))
  })
})

describe('evaluateProducerSourceImpact', () => {
  it('이야기 자료가 바뀌면 Writer와 선택한 Artist 이미지를 다시 확인 대상으로 알린다', () => {
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
  it('인물 사진이 없으면 Artist 진행을 막고 물건과 장소 사진은 경고한다', () => {
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

  it('Writer에서 사용한 인물만 확인하고 나머지 인물은 진행을 막지 않는다', () => {
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
  it('Writer 준비 여부를 알 수 없으면 Director 진행을 막는다', () => {
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

describe('프로젝트 단계 진행 규칙', () => {
  it('현재 단계는 유지하면서 완료한 단계까지만 다음 단계 접근을 연다', () => {
    useProjectStore.setState({ currentStage: 'writer', reachedStage: 'writer' })

    useProjectStore.getState().unlockThrough('artist')

    expect(useProjectStore.getState().currentStage).toBe('writer')
    expect(useProjectStore.getState().reachedStage).toBe('artist')
    expect(useProjectStore.getState().canNavigateTo('artist')).toBe(true)
    expect(useProjectStore.getState().canNavigateTo('director')).toBe(false)
  })
})
