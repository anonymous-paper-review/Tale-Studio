import { describe, expect, it } from 'vitest'
import {
  parseProducerDraft,
  mergeDraftWithDb,
  type ProducerDraft,
  type ProducerBoardState,
} from '@/stores/producer-store'
import type { CastMember, BackgroundSource } from '@/lib/producer-gate'
import type { ProjectSettings } from '@/types'

const settings: ProjectSettings = {
  playtime: 120,
  genre: 'thriller',
  subGenre: 'psychological',
  format: 'horizontal_16:9',
  tone: ['dark'],
  targetEmotion: [],
  dialogueLanguage: 'ko',
}

function cast(name: string, over: Partial<CastMember> = {}): CastMember {
  return { localId: name, name, entityType: 'person', appearance: '미정', origin: 'producer', userEdited: false, ...over }
}
function bg(name: string, over: Partial<BackgroundSource> = {}): BackgroundSource {
  return { localId: name, name, visualDescription: '미정', purpose: '', origin: 'producer', userEdited: false, ...over }
}

function draft(over: Partial<ProducerDraft> = {}): ProducerDraft {
  return {
    version: 1,
    savedAt: Date.now(),
    storyText: '드래프트 스토리',
    storyReady: true,
    settings,
    cast: [cast('소녀', { appearance: '흰 원피스', userEdited: true })],
    backgrounds: [bg('회화세계', { visualDescription: '초현실 공간', userEdited: true })],
    ...over,
  }
}

const emptyDb: ProducerBoardState = {
  storyText: '',
  storyReady: false,
  settings: { ...settings, genre: '' },
  cast: [],
  backgrounds: [],
}

describe('parseProducerDraft', () => {
  it('returns null for non-object / malformed payloads', () => {
    expect(parseProducerDraft(null)).toBeNull()
    expect(parseProducerDraft('x')).toBeNull()
    expect(parseProducerDraft({ cast: [] })).toBeNull() // missing backgrounds/settings
    expect(parseProducerDraft({ cast: [], backgrounds: [] })).toBeNull() // missing settings
  })

  it('parses a well-formed draft and coerces fields', () => {
    const d = parseProducerDraft(draft())
    expect(d).not.toBeNull()
    expect(d!.storyReady).toBe(true)
    expect(d!.cast[0].name).toBe('소녀')
    expect(d!.settings.genre).toBe('thriller')
  })
})

describe('mergeDraftWithDb', () => {
  it('returns db board unchanged when no draft exists', () => {
    const db: ProducerBoardState = { ...emptyDb, cast: [cast('writer인물', { origin: 'writer' })] }
    expect(mergeDraftWithDb(null, db)).toBe(db)
  })

  it('restores the draft when DB is empty (the re-entry bug fix)', () => {
    const restored = mergeDraftWithDb(draft(), emptyDb)
    expect(restored.storyText).toBe('드래프트 스토리')
    expect(restored.cast.map((c) => c.name)).toEqual(['소녀'])
    expect(restored.cast[0].appearance).toBe('흰 원피스')
    expect(restored.backgrounds.map((b) => b.name)).toEqual(['회화세계'])
  })

  it('merges writer-origin DB cards that are absent from the draft', () => {
    const db: ProducerBoardState = {
      ...emptyDb,
      cast: [
        cast('소녀', { appearance: '미정', origin: 'writer' }), // same name as draft → draft wins
        cast('내레이터', { origin: 'writer' }), // draft에 없음 → 합쳐짐
      ],
      backgrounds: [bg('회화세계', { origin: 'writer' }), bg('작업실', { origin: 'writer' })],
    }
    const restored = mergeDraftWithDb(draft(), db)
    // 소녀는 draft 값(흰 원피스)이 유지되고 중복되지 않음
    expect(restored.cast.filter((c) => c.name === '소녀')).toHaveLength(1)
    expect(restored.cast.find((c) => c.name === '소녀')!.appearance).toBe('흰 원피스')
    // writer-origin 신규 카드는 합쳐짐
    expect(restored.cast.map((c) => c.name)).toEqual(['소녀', '내레이터'])
    expect(restored.backgrounds.map((b) => b.name)).toEqual(['회화세계', '작업실'])
  })
})
