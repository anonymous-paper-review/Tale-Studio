// 산문 재점검으로 두 줄을 합쳐도 사라지는 줄에 올린 레퍼런스 그림을 잃지 않는다 (2026-10-27 오너 — 레퍼런스 · 재점검)
import { describe, expect, it } from 'vitest'
import { planBreakdownRecheck } from '@/lib/writer/breakdown-recheck'
import { cardsForHandoff, syncTreatmentCast } from '@/lib/producer/treatment-cast-sync'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'

// 이 시험을 위해 새로 지은 산문 — 실제 작품이 아니다.
const character = (id: string, name: string, appearance = '') => ({
  id, name, entity_type: 'person', role: 'supporting', personality: [],
  arc: { start_state: '', end_state: '', arc_type: '' }, appearance_description: appearance, motivation: { want: '', need: '' },
})
const scene = (id: string, location: string, characters: string[], actions: string[]) => ({
  scene_id: id, act_ref: 'a1', location, time_of_day: 'day', narrative_time: 'present', characters_in_scene: characters,
  purpose: 'conflict', emotion_beat: { start: '', end: '' }, dialogue_summary: '', info_asymmetry: 'audience=character',
  estimated_seconds: 12, scene_actions: actions,
})
function draftState(): WriterRunState {
  return {
    input: { story: '자판기 앞에서 벌어진 일', treatmentDraft: true, sceneGate: true },
    _proseLocked: true,
    characters: { characters: [character('char', '민호', '서른 살 회사원'), character('char_2', '팀장', '쉰 살, 회색 양복'), character('char_3', '틴장')], relationships: [], subtext_notes: [] },
    world: { locations: [{ id: 'hallway', name: '회사 복도', description: '형광등이 깜빡이는 복도' }, { id: 'corridor', name: '복도', description: '' }] },
    scenes: {
      scenes: [
        scene('s1', 'hallway', ['char', 'char_3'], ['민호가 자판기 앞에서 동전을 찾는다.', '틴장이 다가온다.']),
        scene('s2', 'corridor', ['char', 'char_2'], ['팀장이 민호에게 커피를 건넨다.']),
      ],
      total_estimated_seconds: 24,
    },
  } as unknown as WriterRunState
}
function draftList() {
  return syncTreatmentCast({ cast: [], backgrounds: [], syncedVersion: null }, {
    characters: [
      { id: 'char', name: '민호', role: 'protagonist', entityType: 'person', appearance: '서른 살 회사원', want: '' },
      { id: 'char_2', name: '팀장', role: 'supporting', entityType: 'person', appearance: '쉰 살, 회색 양복', want: '' },
      { id: 'char_3', name: '틴장', role: 'supporting', entityType: 'person', appearance: '', want: '' },
    ],
    locations: [
      { id: 'hallway', name: '회사 복도', description: '형광등이 깜빡이는 복도' },
      { id: 'corridor', name: '복도', description: '' },
    ],
  }, 'v1')
}
const PIC = 'https://example.supabase.co/storage/v1/object/public/media/ws/p/breakdown/a.png'
const OWN = 'https://example.supabase.co/storage/v1/object/public/media/ws/p/breakdown/b.png'

describe('재점검 합치기와 레퍼런스 그림', () => {
  it('합쳐서 사라지는 인물 줄에 올린 레퍼런스 그림은 남는 줄에 그림이 없으면 옮겨 간다', () => {
    // 왜: "틴장"(오타)에 그림을 올린 뒤 "팀장"으로 합치면 그 그림이 사라져, [만들기]가 올린 그림 대신 AI 그림을 그렸다(2026-10-27 합치기 확인).
    const list = draftList()
    list.cast = list.cast.map((card) => (card.characterId === 'char_3' ? { ...card, sourceImageUrl: PIC, sourceImageAsIs: true } : card))
    const result = planBreakdownRecheck({ state: draftState(), cast: list.cast, backgrounds: list.backgrounds, ops: [{ op: 'merge', from: 'treatment:char_3', into: 'treatment:char_2' }] })
    if (!result.ok) throw new Error(result.code)

    const leader = result.cast.find((card) => card.name === '팀장')!
    expect(leader).toMatchObject({ sourceImageUrl: PIC, sourceImageAsIs: true })
    expect(result.cast.some((card) => card.name === '틴장')).toBe(false)
    // 그림이 붙은 줄은 넘길 때 실린다 — 서버가 그 그림을 그대로 이 인물의 그림으로 쓴다.
    expect(cardsForHandoff({ cast: result.cast, backgrounds: result.backgrounds }).cast.map((card) => card.name)).toContain('팀장')
  })

  it('합칠 때 남는 줄에 이미 그림이 있으면 남는 줄의 그림을 그대로 둔다', () => {
    // 왜: 줄마다 그림은 한 장이다 — 남는 사람이 고른 그림이 이긴다.
    const list = draftList()
    list.cast = list.cast.map((card) =>
      card.characterId === 'char_3' ? { ...card, sourceImageUrl: PIC, sourceImageAsIs: true }
        : card.characterId === 'char_2' ? { ...card, sourceImageUrl: OWN, sourceImageAsIs: true } : card,
    )
    const result = planBreakdownRecheck({ state: draftState(), cast: list.cast, backgrounds: list.backgrounds, ops: [{ op: 'merge', from: 'treatment:char_3', into: 'treatment:char_2' }] })
    if (!result.ok) throw new Error(result.code)
    expect(result.cast.find((card) => card.name === '팀장')).toMatchObject({ sourceImageUrl: OWN, sourceImageAsIs: true })
  })

  it('배경 줄을 합칠 때도 사라지는 줄의 그림이 남는 줄로 옮겨 간다', () => {
    // 왜: 배경도 인물과 같은 규칙 — 그림 한 장이 합치기로 사라지지 않게.
    const list = draftList()
    list.backgrounds = list.backgrounds.map((card) => (card.locationId === 'corridor' ? { ...card, sourceImageUrl: PIC, sourceImageAsIs: true } : card))
    const result = planBreakdownRecheck({ state: draftState(), cast: list.cast, backgrounds: list.backgrounds, ops: [{ op: 'merge', from: 'treatment:corridor', into: 'treatment:hallway' }] })
    if (!result.ok) throw new Error(result.code)
    expect(result.backgrounds.find((card) => card.name === '회사 복도')).toMatchObject({ sourceImageUrl: PIC, sourceImageAsIs: true })
    expect(result.backgrounds).toHaveLength(1)
  })
})
