// 시리즈 다음 화가 앞 화에서 이어받은 인물 · 배경 그림을 이 화에 그대로 쓸지, 비워 두어 다시 그리게 할지 정한다 (2026-10-26)
import { describe, expect, it } from 'vitest'
import { planInheritedImageWrites } from '@/lib/series/inherited-images'
import { SERIES_VERSION, type SeriesSnapshot } from '@/lib/series/snapshot'
import { appearingIn } from '@/lib/series/view'

const SHEET = 'https://example.supabase.co/storage/v1/object/public/media/ws/ep2/series/jia-sheet.png'
const PORTRAIT = 'https://example.supabase.co/storage/v1/object/public/media/ws/ep2/series/jia-portrait.png'
const WIDE = 'https://example.supabase.co/storage/v1/object/public/media/ws/ep2/series/yard-wide.png'

const series = (patch: Partial<SeriesSnapshot> = {}): SeriesSnapshot => ({
  version: SERIES_VERSION,
  prevProjectId: 'prev-1',
  prevTitle: '첫 화 — 운동장의 돌',
  copiedAt: '2026-10-26T00:00:00.000Z',
  characters: [{
    characterId: 'jia', name: '지아', role: 'protagonist', appearance: '분홍 원피스',
    personality: ['씩씩하다'], sheetUrl: SHEET, portraitUrl: PORTRAIT, styleId: 'anime_soft',
  }],
  locations: [{ locationId: 'yard', name: '운동장', description: '흙바닥', wideShotUrl: WIDE, styleId: 'anime_soft' }],
  voices: [],
  styleId: 'anime_soft',
  format: 'horizontal_16:9',
  dialogueLanguage: 'ko',
  continuesLastScene: false,
  copyFailures: [],
  designTokens: null,
  ...patch,
})

/** 이번 화 산문 — 누가 어디에 나오나. 씬을 비우면 산문이 아직 없는 상태다. */
const prose = (scenes: Array<{ characters_in_scene?: string[]; location?: string }>) =>
  appearingIn(scenes.length ? { scenes: { scenes } } : null)

describe('이어받은 그림 적용 계획', () => {
  it('이어받은 그림은 그림체가 같으면 그대로 쓴다', () => {
    // 왜: 정상 경로 고정 — 앞 화 그림체를 그대로 두고 다음 화를 쓰면 같은 인물 · 같은 장소를 다시 그릴 이유가 없다(돈과 시간).
    const plan = planInheritedImageWrites({
      series: series(),
      currentStyleId: 'anime_soft',
      appearance: prose([{ characters_in_scene: ['jia'], location: 'yard' }]),
      existing: { characters: [], locations: [] },
    })

    expect(plan.characters).toEqual([{ character_id: 'jia', sheet_url: SHEET, portrait_url: PORTRAIT }])
    expect(plan.locations).toEqual([{ location_id: 'yard', wide_shot: WIDE }])
  })

  it('이번 화 산문에 안 나오는 이어받은 인물 · 배경은 그림체가 달라도 그림을 그대로 보관한다', () => {
    // 왜: 앞 화 조연 · 앞 화 배경은 이번 화에 안 나올 수 있다. 그림체가 바뀌었다고 안 나오는 인물까지 다시 그리면 쓸데없이 돈이 든다.
    const plan = planInheritedImageWrites({
      series: series(),
      currentStyleId: 'watercolor_soft',
      appearance: prose([{ characters_in_scene: ['minsu'], location: 'rooftop' }]),
      existing: { characters: [], locations: [] },
    })

    expect(plan.characters).toEqual([{ character_id: 'jia', sheet_url: SHEET, portrait_url: PORTRAIT }])
    expect(plan.locations).toEqual([{ location_id: 'yard', wide_shot: WIDE }])
  })

  it('그림체가 다르고 이번 화에 나오는 인물 · 배경은 그림을 비워 두어 이 화 그림체로 다시 그리게 한다', () => {
    // 왜: 그림체를 바꿔 다음 화를 시작했는데 앞 화 그림을 그대로 넣으면 이번 화 안에서 그림체가 섞인다.
    const plan = planInheritedImageWrites({
      series: series(),
      currentStyleId: 'watercolor_soft',
      appearance: prose([{ characters_in_scene: ['jia'], location: '운동장' }]),
      existing: { characters: [], locations: [] },
    })

    expect(plan.characters).toEqual([])
    expect(plan.locations).toEqual([])
  })

  it('이미 그림이 있는 인물 · 배경은 이어받은 그림으로 덮지 않는다', () => {
    // 왜: 다음 화에서 사람이 올린 그림 · Artist 가 이미 그린 시트가 앞 화 그림에 덮이면 사람이 한 일이 사라진다.
    const plan = planInheritedImageWrites({
      series: series(),
      currentStyleId: 'anime_soft',
      appearance: prose([{ characters_in_scene: ['jia'], location: 'yard' }]),
      existing: {
        characters: [{ character_id: 'jia', sheet_url: null, portrait_url: 'https://example.supabase.co/storage/v1/object/public/media/ws/ep2/uploads/jia.png' }],
        locations: [{ location_id: 'yard', wide_shot: 'https://example.supabase.co/storage/v1/object/public/media/ws/ep2/uploads/yard.png' }],
      },
    })

    expect(plan.characters).toEqual([])
    expect(plan.locations).toEqual([])
  })

  it('산문이 아직 없으면 이어받은 그림을 쓰지 않는다', () => {
    // 왜: 누가 나오는지 모르는 채로 앞 화 그림을 적으면, 뒤늦게 그림체를 바꿔 쓴 산문에 앞 화 그림체가 섞인 채 남는다.
    const plan = planInheritedImageWrites({
      series: series(),
      currentStyleId: 'anime_soft',
      appearance: prose([]),
      existing: { characters: [], locations: [] },
    })

    expect(plan).toEqual({ characters: [], locations: [] })
  })
})
