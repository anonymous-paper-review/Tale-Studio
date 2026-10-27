// 산문 재점검이 창에 안 보이던 "보관" 줄과 실행 기록에만 남은 인물을 새 인물로 두 번 만들지 않는다 (2026-10-27 검토 지적)
import { describe, expect, it } from 'vitest'
import { planBreakdownRecheck } from '@/lib/writer/breakdown-recheck'
import type { BackgroundSource, CastMember } from '@/lib/producer-gate'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'

// 이 시험을 위해 새로 지은 산문 — 실제 작품이 아니다.
const character = (id: string, name: string, appearance = '') => ({
  id, name, entity_type: 'person', role: 'supporting', personality: [],
  arc: { start_state: '', end_state: '', arc_type: '' }, appearance_description: appearance, motivation: { want: '', need: '' },
})
const scene = (id: string, characters: string[], actions: string[]) => ({
  scene_id: id, act_ref: 'a1', location: 'market', time_of_day: 'day', narrative_time: 'present', characters_in_scene: characters,
  purpose: 'conflict', emotion_beat: { start: '', end: '' }, dialogue_summary: '', info_asymmetry: 'audience=character',
  estimated_seconds: 12, scene_actions: actions,
})
function draftState(extraCharacters: ReturnType<typeof character>[] = []): WriterRunState {
  return {
    input: { story: '장터에서 벌어진 일', treatmentDraft: true, sceneGate: true },
    _proseLocked: true,
    characters: { characters: [character('char', '수아', '열일곱 살 학생'), ...extraCharacters], relationships: [], subtext_notes: [] },
    world: { locations: [{ id: 'market', name: '장터', description: '' }, { id: 'ferry', name: '나루터', description: '' }] },
    scenes: {
      scenes: [
        scene('s1', ['char'], ['수아가 장터에서 엿을 산다.', '멀리 나루터가 보인다.']),
        scene('s2', ['char'], ['할머니가 수아를 부른다.', '경비원이 고개를 든다.']),
      ],
      total_estimated_seconds: 24,
    },
  } as unknown as WriterRunState
}
const suah: CastMember = { localId: 'treatment:char', characterId: 'char', name: '수아', entityType: 'person', appearance: '열일곱 살 학생', origin: 'treatment' }
// 앞 화에서 이어받은 인물 — 이번 화 씬에 안 들어가 "보관"에 있다.
const grandma: CastMember = { localId: 'series:char_9', characterId: 'char_9', name: '할머니', entityType: 'person', appearance: '흰 쪽머리의 일흔 살 여자', origin: 'producer', sourceImageUrl: 'https://example.supabase.co/storage/v1/object/public/media/ws/p/sheets/grandma.png' }
const market: BackgroundSource = { localId: 'treatment:market', locationId: 'market', name: '장터', visualDescription: '', purpose: '', origin: 'treatment' }
const ferry: BackgroundSource = { localId: 'series:ferry', locationId: 'ferry', name: '나루터', visualDescription: '안개 낀 강가', purpose: '', origin: 'producer' }

describe('재점검과 보관 줄', () => {
  it('시리즈 다음 화에서 보관에 있는 인물 이름을 넣으면 새 인물을 만들지 않고 그 인물을 이름이 나오는 씬에 넣는다', () => {
    // 왜: 앞 화 인물이 이번 화 산문에 나오는데 AI 가 씬에 넣지 않으면 "보관"으로 내려가 재점검 창에 안 보인다. 그 이름을 넣으면
    //   서버가 "이미 목록에 있다"며 고친 것을 통째로 받지 않았다 — 같은 인물(앞 화 그림)로 이번 화에 나와야 한다(2026-10-27 검토 지적).
    const result = planBreakdownRecheck({
      state: draftState([character('char_9', '할머니', '흰 쪽머리의 일흔 살 여자')]),
      cast: [suah, grandma], backgrounds: [market, ferry],
      ops: [{ op: 'add', kind: 'person', name: '할머니' }],
      kept: ['series:char_9', 'series:ferry'],
    })
    if (!result.ok) throw new Error(result.code)

    expect(result.cast).toEqual([suah, grandma])
    expect(result.newLocalIds).toEqual([])
    expect(result.state.characters!.characters.filter((c) => c.name === '할머니').map((c) => c.id)).toEqual(['char_9'])
    expect(result.state.scenes!.scenes.find((s) => s.scene_id === 's2')!.characters_in_scene).toEqual(['char', 'char_9'])
    expect(result.state.scenes!.scenes.find((s) => s.scene_id === 's1')!.characters_in_scene).toEqual(['char'])
  })

  it('보관 인물이 실행 기록에 없으면 그 카드의 번호와 설명으로 실행 기록에 넣는다', () => {
    // 왜: 앞 화에서 이어받은 카드만 있고 이번 화 실행 기록에는 없는 인물도 있다 — 번호가 같아야 앞 화 그림을 이어 쓴다.
    const result = planBreakdownRecheck({
      state: draftState(), cast: [suah, grandma], backgrounds: [market, ferry],
      ops: [{ op: 'add', kind: 'person', name: '할머니' }],
      kept: ['series:char_9', 'series:ferry'],
    })
    if (!result.ok) throw new Error(result.code)
    expect(result.state.characters!.characters.find((c) => c.id === 'char_9')).toMatchObject({ name: '할머니', appearance_description: '흰 쪽머리의 일흔 살 여자' })
    expect(result.state.scenes!.scenes.find((s) => s.scene_id === 's2')!.characters_in_scene).toEqual(['char', 'char_9'])
  })

  it('보관에 있는 장소 이름을 넣으면 목록에 이미 있으니 아무것도 바꾸지 않는다', () => {
    // 왜: 새 장소는 목록에만 넣는다(오너 결정 2) — 보관 묶음에 이미 있는 장소를 한 줄 더 만들면 같은 배경을 두 번 그린다.
    const result = planBreakdownRecheck({
      state: draftState(), cast: [suah, grandma], backgrounds: [market, ferry],
      ops: [{ op: 'add', kind: 'background', name: '나루터' }],
      kept: ['series:char_9', 'series:ferry'],
    })
    if (!result.ok) throw new Error(result.code)
    expect(result.backgrounds).toEqual([market, ferry])
    expect(result.newLocalIds).toEqual([])
  })

  it('창에 보이지 않던 보관 줄은 고친 것과 상관없이 목록에 그대로 남는다', () => {
    // 왜: 보관 줄은 이번 화 창에 없어 고칠 수 없다 — 다른 줄을 고쳐도 그 줄의 그림 · 설명이 바뀌거나 빠지면 안 된다.
    const result = planBreakdownRecheck({
      state: draftState(), cast: [suah, grandma], backgrounds: [market, ferry],
      ops: [{ op: 'rename', key: 'treatment:char', name: '수아 언니' }],
      kept: ['series:char_9', 'series:ferry'],
    })
    if (!result.ok) throw new Error(result.code)
    expect(result.cast.find((card) => card.localId === 'series:char_9')).toEqual(grandma)
    expect(result.backgrounds.find((card) => card.localId === 'series:ferry')).toEqual(ferry)
  })

  it('실행 기록에만 남은 인물과 같은 이름을 넣으면 새 번호를 만들지 않고 그 인물을 다시 쓴다', () => {
    // 왜: 반영 뒤 답을 못 받았거나 목록 저장이 실패해 되돌리지 못하면 실행 기록에만 인물이 남는다 — 그대로 다시 넣으면
    //   같은 사람이 번호 둘로 생겨 [만들기]가 두 번 그린다(2026-10-27 검토 지적).
    const result = planBreakdownRecheck({
      state: draftState([character('char_2', '경비원')]), cast: [suah], backgrounds: [market],
      ops: [{ op: 'add', kind: 'person', name: '경비원' }],
    })
    if (!result.ok) throw new Error(result.code)
    expect(result.cast.find((card) => card.name === '경비원')).toMatchObject({ characterId: 'char_2' })
    expect(result.state.characters!.characters.filter((c) => c.name === '경비원').map((c) => c.id)).toEqual(['char_2'])
    expect(result.state.scenes!.scenes.find((s) => s.scene_id === 's2')!.characters_in_scene).toEqual(['char', 'char_2'])
  })

  it('이번 화 인물의 이름을 보관 인물 이름으로 고치면 두 인물을 하나로 합쳐 보관 인물로 이번 화에 올린다', () => {
    // 왜: 재점검 창에는 보관 인물이 없어 "합칠까요?"를 묻지 못한다 — 그대로 고치면 같은 이름 인물이 둘 생겨 [만들기]가 앞 화 인물을
    //   새로 그렸다(2026-10-27 검토 지적). 합치면 그 인물이 나오던 씬은 보관 인물(앞 화 그림)로 이어지고, 예전 이름은 다른 이름으로 남는다.
    const state = draftState([character('char_3', '노파'), character('char_9', '할머니', '흰 쪽머리의 일흔 살 여자')])
    state.scenes!.scenes[1].characters_in_scene = ['char', 'char_3']
    state.scenes!.scenes[1].scene_actions = ['노파가 수아를 부른다.']
    const oldWoman: CastMember = { localId: 'treatment:char_3', characterId: 'char_3', name: '노파', entityType: 'person', appearance: '', origin: 'treatment' }

    const result = planBreakdownRecheck({
      state, cast: [suah, oldWoman, grandma], backgrounds: [market, ferry],
      ops: [{ op: 'rename', key: 'treatment:char_3', name: '할머니' }],
      kept: ['series:char_9', 'series:ferry'],
    })
    if (!result.ok) throw new Error(result.code)

    expect(result.cast.map((card) => card.localId)).toEqual(['treatment:char', 'series:char_9'])
    expect(result.cast.find((card) => card.localId === 'series:char_9')).toMatchObject({ name: '할머니', characterId: 'char_9', aliases: ['노파'] })
    expect(result.state.characters!.characters.map((c) => c.id)).toEqual(['char', 'char_9'])
    expect(result.state.scenes!.scenes[1].characters_in_scene).toEqual(['char', 'char_9'])
  })

  it('이번 화 장소의 이름을 보관 장소 이름으로 고치면 그 장소의 씬을 보관 장소로 옮겨 한 줄로 합친다', () => {
    // 왜: 인물과 같은 까닭 — 같은 배경이 두 줄이 되면 두 번 그린다(2026-10-27 검토 지적).
    const state = draftState()
    state.world = { locations: [{ id: 'market', name: '장터', description: '' }, { id: 'river', name: '강가', description: '' }] }
    state.scenes!.scenes[1].location = 'river'
    state.scenes!.scenes[1].scene_actions = ['강가에서 할머니가 수아를 부른다.']
    const river: BackgroundSource = { localId: 'treatment:river', locationId: 'river', name: '강가', visualDescription: '', purpose: '', origin: 'treatment' }

    const result = planBreakdownRecheck({
      state, cast: [suah, grandma], backgrounds: [market, river, ferry],
      ops: [{ op: 'rename', key: 'treatment:river', name: '나루터' }],
      kept: ['series:char_9', 'series:ferry'],
    })
    if (!result.ok) throw new Error(result.code)

    expect(result.backgrounds.map((card) => card.localId)).toEqual(['treatment:market', 'series:ferry'])
    expect(result.backgrounds.find((card) => card.localId === 'series:ferry')).toMatchObject({ name: '나루터', aliases: ['강가'] })
    expect(result.state.scenes!.scenes[1].location).toBe('ferry')
    expect((result.state.world?.locations ?? []).map((l) => l.id).sort()).toEqual(['ferry', 'market'])
  })

  it('보관 인물을 다시 넣을 때 실행 기록에만 남은 같은 이름의 인물이 있으면 그 인물을 보관 인물로 합친다', () => {
    // 왜: 남은 인물 번호를 씬에 넣으면 보관 인물은 그대로 보관에 남고, 카드 없는 인물을 처음부터 그렸다(2026-10-27 검토 지적).
    const result = planBreakdownRecheck({
      state: draftState([character('char_5', '할머니')]), cast: [suah, grandma], backgrounds: [market, ferry],
      ops: [{ op: 'add', kind: 'person', name: '할머니' }],
      kept: ['series:char_9', 'series:ferry'],
    })
    if (!result.ok) throw new Error(result.code)
    expect(result.state.characters!.characters.map((c) => c.id)).toEqual(['char', 'char_9'])
    expect(result.state.scenes!.scenes[1].characters_in_scene).toEqual(['char', 'char_9'])
    expect(result.cast).toEqual([suah, grandma])
  })

  it('보관 인물을 실행 기록에 적힌 다른 이름으로 넣어도 새 카드를 만들지 않고 그 보관 인물로 이번 화에 올린다', () => {
    // 왜: 카드 이름("할머니")과 실행 기록 이름("순자 할머니")이 다르면 이름으로 못 찾아 같은 번호의 카드가 하나 더 생길 수 있었다 —
    //   한 인물에 카드 둘이면 [만들기]가 어느 쪽 그림을 쓸지 어긋난다(2026-10-27 검토 뒤 확인).
    const state = draftState([character('char_9', '순자 할머니', '흰 쪽머리의 일흔 살 여자')])
    state.scenes!.scenes[1].scene_actions = ['순자 할머니가 수아를 부른다.']
    const result = planBreakdownRecheck({
      state, cast: [suah, grandma], backgrounds: [market, ferry],
      ops: [{ op: 'add', kind: 'person', name: '순자 할머니' }],
      kept: ['series:char_9', 'series:ferry'],
    })
    if (!result.ok) throw new Error(result.code)
    expect(result.cast.map((card) => card.localId)).toEqual(['treatment:char', 'series:char_9'])
    expect(result.cast.find((card) => card.localId === 'series:char_9')).toMatchObject({ aliases: ['순자 할머니'] })
    expect(result.newLocalIds).toEqual([])
    expect(result.state.scenes!.scenes[1].characters_in_scene).toEqual(['char', 'char_9'])
  })
})
