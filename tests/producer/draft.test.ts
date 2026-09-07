// 저장한 초안을 다시 열어도 이야기와 설정을 잃지 않고 최신 카드 내용을 보여준다
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
  it('초안이 아니거나 필수 내용이 빠져 형식이 깨지면 받아들이지 않는다', () => {
    expect(parseProducerDraft(null)).toBeNull()
    expect(parseProducerDraft('x')).toBeNull()
    expect(parseProducerDraft({ cast: [] })).toBeNull() // missing backgrounds/settings
    expect(parseProducerDraft({ cast: [], backgrounds: [] })).toBeNull() // missing settings
  })

  it('형식에 맞는 초안이면 필요한 내용을 읽어 정상 초안으로 만든다', () => {
    const d = parseProducerDraft(draft())
    expect(d).not.toBeNull()
    expect(d!.storyReady).toBe(true)
    expect(d!.cast[0].name).toBe('소녀')
    expect(d!.settings.genre).toBe('thriller')
  })
})

describe('mergeDraftWithDb', () => {
  it('저장된 초안이 없으면 현재 보드를 그대로 둔다', () => {
    const db: ProducerBoardState = { ...emptyDb, cast: [cast('writer인물', { origin: 'writer' })] }
    expect(mergeDraftWithDb(null, db)).toBe(db)
  })

  it('다시 들어왔을 때 보드가 비어 있으면 저장한 초안을 복원한다', () => {
    const restored = mergeDraftWithDb(draft(), emptyDb)
    expect(restored.storyText).toBe('드래프트 스토리')
    expect(restored.cast.map((c) => c.name)).toEqual(['소녀'])
    expect(restored.cast[0].appearance).toBe('흰 원피스')
    expect(restored.backgrounds.map((b) => b.name)).toEqual(['회화세계'])
  })

  it('초안에 없는 Writer 카드도 기존 보드에 함께 남긴다', () => {
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
