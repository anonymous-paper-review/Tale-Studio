// 이야기와 카드의 필수 내용을 갖추고 영상 스타일을 고르면 Writer로 넘긴다
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

describe('evaluateProducerGate (이야기 기본 조건)', () => {
  it('필수 설정이 비어 있으면 Writer로 넘기지 않는다', () => {
    const r = evaluateProducerGate({
      settings: { ...baseSettings, genre: '' },
      storyReady: true,
      styleAnchorKey: 'style_a',
      cast: [fullPerson()],
      backgrounds: [fullBackground()],
    })
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.field)).toContain('genre')
  })

  it('이야기 준비가 안 되면 Writer로 넘기지 않는다', () => {
    const r = evaluateProducerGate({ settings: baseSettings, storyReady: false,
      styleAnchorKey: 'style_a', cast: [fullPerson()], backgrounds: [fullBackground()] })
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.field)).toContain('storyText')
  })

  it('분위기와 세부 장르가 비어 있어도 필수 조건만 갖추면 Writer로 넘긴다', () => {
    const r = evaluateProducerGate({
      settings: { ...baseSettings, tone: [], subGenre: '' },
      storyReady: true,
      styleAnchorKey: 'style_a',
      cast: [fullPerson()],
      backgrounds: [fullBackground()],
    })
    expect(r.canHandoff).toBe(true)
    const softFields = r.softMissing.map((i) => i.field)
    expect(softFields).toEqual(expect.arrayContaining(['tone', 'subGenre']))
    expect(softFields).not.toContain('targetEmotion')
  })
})

describe('evaluateProducerGate (등장인물 조건)', () => {
  it('짧은 이야기(D1, 10초)는 등장인물이 없어도 Writer로 넘긴다', () => {
    const r = evaluateProducerGate({
      settings: { ...baseSettings, playtime: 10 },
      storyReady: true,
      styleAnchorKey: 'style_a',
      cast: [],
      backgrounds: [fullBackground()],
    })
    expect(r.canHandoff).toBe(true)
  })

  it('D3 이야기(120초)는 등장인물이 한 명 이상 있어야 Writer로 넘긴다', () => {
    const r = evaluateProducerGate({ settings: baseSettings, storyReady: true,
      styleAnchorKey: 'style_a', cast: [], backgrounds: [fullBackground()] })
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.field)).toContain('cast:minPerson')
  })

  it('D3 인물의 변화 과정이나 원하는 목표가 비어 있으면 Writer로 넘기지 않는다', () => {
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      styleAnchorKey: 'style_a',
      cast: [fullPerson({ arc: undefined, motivation: undefined })],
      backgrounds: [fullBackground()],
    })
    expect(r.canHandoff).toBe(false)
    const fields = r.hardMissing.map((i) => i.field)
    expect(fields).toContain('cast:p1:arc')
    expect(fields).toContain('cast:p1:want')
  })

  it('D3에서도 사물은 이름과 모습만 있으면 Writer로 넘긴다', () => {
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      styleAnchorKey: 'style_a',
      cast: [
        fullPerson(),
        { localId: 'o1', name: '반지', entityType: 'object', appearance: '은빛 고리' },
      ],
      backgrounds: [fullBackground()],
    })
    expect(r.canHandoff).toBe(true)
  })

  it('D4 이야기(600초)는 인물이 한 명뿐이면 한 명을 더 준비하라고 알린다', () => {
    const r = evaluateProducerGate({
      settings: { ...baseSettings, playtime: 600 },
      storyReady: true,
      styleAnchorKey: 'style_a',
      cast: [fullPerson()],
      backgrounds: [fullBackground()],
    })
    expect(r.canHandoff).toBe(true)
    expect(r.softMissing.map((i) => i.field)).toContain('cast:recommendPersons')
  })

  it('배경 카드가 있어도 모든 칸을 채운 카드가 하나는 있어야 Writer로 넘긴다', () => {
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      styleAnchorKey: 'style_a',
      cast: [fullPerson()],
      backgrounds: [{ ...fullBackground(), visualDescription: '' }],
    })
    expect(r.canHandoff).toBe(false)
    // 약속 L(2026-09-04): 배경이 있으면 카드별 빈 칸으로 짚는다 — "배경 1개 필요"는 배경이 아예 없을 때만.
    expect(r.hardMissing.map((i) => i.field)).toContain('background:b1:visualDescription')
    expect(r.hardMissing.map((i) => i.field)).not.toContain('background:minComplete')
  })
})

describe('evaluateProducerGate (Writer가 덧붙인 카드는 다음 단계 조건을 막지 않는다)', () => {
  it('Writer가 덜 채운 인물을 추가해도 다음 단계로 넘긴다', () => {
    // producer 카스트는 완성, writer 가 부분 실행 중 arc/motivation 없는 인물을 추가한 상황.
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      styleAnchorKey: 'style_a',
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

  it('Writer가 덜 채운 배경을 더해도 다음 단계로 넘길 수 있다', () => {
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      styleAnchorKey: 'style_a',
      cast: [fullPerson()],
      backgrounds: [
        fullBackground(), // producer-origin, complete
        { localId: 'wl', name: 'location_2', visualDescription: 'A gothic studio', purpose: '', origin: 'writer' },
      ],
    })
    expect(r.canHandoff).toBe(true)
  })

  it('Writer에서 만든 배경만 있으면 부족하고 Producer 배경이 하나는 있어야 한다', () => {
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      styleAnchorKey: 'style_a',
      cast: [fullPerson()],
      backgrounds: [
        { localId: 'wl', name: 'location', visualDescription: 'A gothic studio', purpose: '핵심 공간', origin: 'writer' },
      ],
    })
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.field)).toContain('background:minComplete')
  })
})

// #style-gate 2026-08-11 — 실측 사고의 회귀: 스타일이 비었는데 핸드오프 제안이 떠서 스타일
// 픽커의 Enter 와 수락 Enter 가 경합했다. 스타일은 하드 게이트다 — 골라야 핸드오프가 열린다.
describe('evaluateProducerGate (영상 스타일을 골라야 다음 단계로 넘긴다)', () => {
  it('영상 스타일을 고르지 않으면 다른 조건이 맞아도 다음 단계로 넘기지 않는다', () => {
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      cast: [fullPerson()],
      backgrounds: [fullBackground()],
      styleAnchorKey: null,
    })
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.field)).toContain('styleAnchor')
  })

  it('영상 스타일을 정하지 않으면 선택하지 않은 경우와 같이 다음 단계로 넘기지 않는다', () => {
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      cast: [fullPerson()],
      backgrounds: [fullBackground()],
    })
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.field)).toContain('styleAnchor')
  })

  it('영상 스타일을 고르면 다음 단계로 넘길 수 있다', () => {
    const r = evaluateProducerGate({
      settings: baseSettings,
      storyReady: true,
      cast: [fullPerson()],
      backgrounds: [fullBackground()],
      styleAnchorKey: 'style_a',
    })
    expect(r.hardMissing.map((i) => i.field)).not.toContain('styleAnchor')
  })
})
