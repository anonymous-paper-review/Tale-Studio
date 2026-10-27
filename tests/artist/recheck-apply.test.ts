// 산문 재점검을 목록에 반영하면 Writer 실행 기록과 브레이크다운 목록이 같은 표시로 바뀌고 산문 글은 그대로다 (2026-10-27 오너)
import { describe, expect, it } from 'vitest'
import { planBreakdownRecheck, proseScenesOfState } from '@/lib/writer/breakdown-recheck'
import { cardsForHandoff, syncTreatmentCast } from '@/lib/producer/treatment-cast-sync'
import { evaluateProducerGate } from '@/lib/producer-gate'
import type { RecheckOp } from '@/lib/artist/recheck'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'

// 이 시험을 위해 새로 지은 산문 — 실제 작품이 아니다.
const character = (id: string, name: string, appearance = '') => ({
  id, name, entity_type: 'person', role: 'supporting', personality: [],
  arc: { start_state: '', end_state: '', arc_type: '' }, appearance_description: appearance, motivation: { want: '', need: '' },
})
const scene = (id: string, location: string, characters: string[], actions: string[], extra: Record<string, unknown> = {}) => ({
  scene_id: id, act_ref: 'a1', location, time_of_day: 'day', narrative_time: 'present', characters_in_scene: characters,
  purpose: 'conflict', emotion_beat: { start: '', end: '' }, dialogue_summary: '', info_asymmetry: 'audience=character',
  estimated_seconds: 12, scene_actions: actions, ...extra,
})
function draftState(): WriterRunState {
  return {
    input: { story: '자판기 앞에서 벌어진 일', treatmentDraft: true, sceneGate: true },
    _proseLocked: true,
    characters: {
      characters: [character('char', '민호', '서른 살 회사원, 남색 정장'), character('char_2', '팀장', '쉰 살, 회색 양복'), character('char_3', '틴장')],
      relationships: [{ between: ['char', 'char_3'], type: '상사', visible_in_video: true }],
      subtext_notes: [],
    },
    world: { locations: [{ id: 'hallway', name: '회사 복도', description: '형광등이 깜빡이는 복도' }, { id: 'corridor', name: '복도', description: '' }] },
    dramaturgy: {
      core_engine: '', mechanism_notes: [],
      world_inventory: [{ id: 'rooftop', name: '옥상', description: '바람이 부는 회사 옥상', derived_from: '', scene_potential: [] }],
      dramatic_diagnosis: { stakes: '', weak_beats: [], cdq_candidates: [], ending_check: '' },
    },
    scenes: {
      scenes: [
        scene('s1', 'hallway', ['char', 'char_3'], ['민호가 자판기 앞에서 동전을 찾는다.', '틴장이 다가온다.'], {
          key_dialogue: [{ character_id: 'char_3', line: '동전 있어?', delivery: '' }],
          character_appearance_overrides: { char_3: 'tired' },
        }),
        scene('s2', 'corridor', ['char', 'char_2'], ['팀장이 민호에게 커피를 건넨다.', '경비원이 복도 끝에서 지켜본다.']),
        scene('s3', 'hallway', ['char'], ['옥상에서 민호가 혼잣말을 한다.', '"경비원은 어디 갔지?"']),
      ],
      total_estimated_seconds: 36,
    },
  } as unknown as WriterRunState
}
// 브레이크다운 목록 = 산문 초안이 만든 인물 · 장소를 맞춘 카드(Producer 화면과 같은 맞추기).
function draftList() {
  return syncTreatmentCast({ cast: [], backgrounds: [], syncedVersion: null }, {
    characters: [
      { id: 'char', name: '민호', role: 'protagonist', entityType: 'person', appearance: '서른 살 회사원, 남색 정장', want: '' },
      { id: 'char_2', name: '팀장', role: 'supporting', entityType: 'person', appearance: '쉰 살, 회색 양복', want: '' },
      { id: 'char_3', name: '틴장', role: 'supporting', entityType: 'person', appearance: '', want: '' },
    ],
    locations: [
      { id: 'hallway', name: '회사 복도', description: '형광등이 깜빡이는 복도' },
      { id: 'corridor', name: '복도', description: '' },
    ],
  }, 'v1')
}
function plan(ops: RecheckOp[], state = draftState(), list = draftList()) {
  const result = planBreakdownRecheck({ state, cast: list.cast, backgrounds: list.backgrounds, ops })
  if (!result.ok) throw new Error(`plan failed: ${result.code}`)
  return result
}
const scenesOf = (state: WriterRunState) => state.scenes!.scenes

describe('새로 넣은 인물 · 장소', () => {
  it('새로 넣은 인물은 산문에서 그 인물로 표시되는 말이 있는 씬마다 들어간다', () => {
    // 왜: 오너 결정 1(2026-10-27) — 씬에 들어가야 그 씬의 샷에 나온다. 대사에만 이름이 나오는 씬(s3)에도 들어가는 것은 오너가 받아들였다.
    const result = plan([{ op: 'add', kind: 'person', name: '경비원' }])

    const guard = result.state.characters!.characters.find((c) => c.name === '경비원')!
    expect(guard).toMatchObject({ entity_type: 'person', appearance_description: '' })
    expect(scenesOf(result.state).map((s) => s.characters_in_scene.includes(guard.id))).toEqual([false, true, true])
    const card = result.cast.find((c) => c.name === '경비원')!
    expect(card).toMatchObject({ characterId: guard.id, entityType: 'person', origin: 'treatment', appearance: '' })
    expect(result.newLocalIds).toEqual([card.localId])
  })

  it('새로 넣은 장소는 목록에만 들어가고 씬의 장소는 바꾸지 않는다', () => {
    // 왜: 오너 결정 2(2026-10-27) — 배경 카드는 생겨 그림이 그려지지만, 씬마다 어디서 벌어지는지는 산문이 정한 그대로다.
    const result = plan([{ op: 'add', kind: 'background', name: '자판기 앞' }])

    const spot = result.state.world!.locations.find((l) => l.name === '자판기 앞')!
    expect(spot).toMatchObject({ description: '' })
    expect(scenesOf(result.state).map((s) => s.location)).toEqual(['hallway', 'corridor', 'hallway'])
    const card = result.backgrounds.find((b) => b.name === '자판기 앞')!
    expect(card).toMatchObject({ locationId: spot.id, origin: 'treatment', visualDescription: '' })
    expect(result.newLocalIds).toEqual([card.localId])
  })

  it('새 장소 이름이 이야기 엔진이 적어 둔 장소 후보와 같으면 그 후보의 번호와 설명을 이어받는다', () => {
    // 왜: 이야기를 짤 때 이미 적어 둔 장소(옥상)면 그 설명이 배경 디자인의 재료가 된다 — 이름만으로 그리는 것보다 산문에 맞는다.
    const result = plan([{ op: 'add', kind: 'background', name: '옥상' }])

    expect(result.state.world!.locations.find((l) => l.name === '옥상')).toEqual({ id: 'rooftop', name: '옥상', description: '바람이 부는 회사 옥상' })
    expect(result.backgrounds.find((b) => b.name === '옥상')).toMatchObject({ locationId: 'rooftop' })
  })

  it('새 인물 · 장소의 번호는 실행 기록과 목록의 어떤 번호와도 겹치지 않는다', () => {
    // 왜: 한글 이름은 번호가 char · location 으로 바뀌어 겹치기 쉽다. 겹치면 두 인물(장소)이 그림 한 장을 나눠 쓴다.
    const state = draftState()
    state.world!.locations.push({ id: 'location', name: '주차장', description: '' })
    const result = plan([{ op: 'add', kind: 'person', name: '경비원' }, { op: 'add', kind: 'background', name: '자판기 앞' }], state)

    const taken = new Set(['char', 'char_2', 'char_3', 'hallway', 'corridor', 'location', 'rooftop'])
    const guardId = result.state.characters!.characters.find((c) => c.name === '경비원')!.id
    const spotId = result.state.world!.locations.find((l) => l.name === '자판기 앞')!.id
    expect(taken.has(guardId)).toBe(false)
    expect(taken.has(spotId)).toBe(false)
    expect(guardId).not.toBe(spotId)
  })

  it('새로 넣은 줄은 설명이 비어 있어도 [만들기]를 막지 않고 Writer 가 실행 기록의 인물 · 장소로 이어 간다', () => {
    // 왜: 프로토타입 "설명은 AI가 산문을 읽고 채워요" — 빈 설명은 AI가 디자인할 때 채운다. 막히면 재점검한 프로젝트만 [만들기]를 못 누른다.
    const result = plan([{ op: 'add', kind: 'person', name: '경비원' }, { op: 'add', kind: 'background', name: '자판기 앞' }, { op: 'rename', key: 'treatment:char_2', name: '김 팀장' }])
    const gate = evaluateProducerGate({
      settings: { playtime: 60, genre: '코미디', format: 'vertical_9:16', tone: ['밝은'], dialogueLanguage: 'ko' },
      storyReady: true,
      cast: result.cast,
      backgrounds: result.backgrounds,
      styleAnchorKey: 'anime',
      locale: 'ko',
    })
    expect(gate.canHandoff).toBe(true)

    // 손대지 않은 카드는 넘길 때 싣지 않는다 — 이름 · 씬이 이미 실행 기록에 들어가 있다.
    const handed = cardsForHandoff(result)
    expect(handed.cast.map((c) => c.name)).not.toContain('경비원')
    expect(handed.cast.map((c) => c.name)).not.toContain('김 팀장')
    expect(handed.backgrounds.map((b) => b.name)).not.toContain('자판기 앞')
    expect(result.state.characters!.characters.find((c) => c.id === 'char_2')!.name).toBe('김 팀장')
  })
})

describe('이름 고치기 · 합치기', () => {
  it('이름을 고치면 실행 기록과 목록의 이름이 함께 바뀌고 설명은 그대로다', () => {
    // 왜: [만들기]는 실행 기록을 이어 간다 — 목록만 바꾸면 그림 · 샷에는 예전 이름이 남는다.
    const result = plan([{ op: 'rename', key: 'treatment:char', name: '최민호' }])

    expect(result.state.characters!.characters.find((c) => c.id === 'char')).toMatchObject({ name: '최민호', appearance_description: '서른 살 회사원, 남색 정장' })
    expect(result.cast.find((c) => c.localId === 'treatment:char')).toMatchObject({ name: '최민호', appearance: '서른 살 회사원, 남색 정장', aliases: ['민호'] })
    expect(result.newLocalIds).toEqual([])
  })

  it('합치면 고친 쪽 인물이 나오던 씬 · 대사 · 씬별 모습 · 관계가 남는 인물로 옮겨지고 고친 쪽 인물은 실행 기록에서 빠진다', () => {
    // 왜: 목록에서만 지우면 [만들기]가 실행 기록의 틴장을 다시 디자인해 같은 사람 그림이 두 장 생긴다.
    const result = plan([{ op: 'merge', from: 'treatment:char_3', into: 'treatment:char_2' }])

    expect(result.state.characters!.characters.map((c) => c.id)).toEqual(['char', 'char_2'])
    const [s1] = scenesOf(result.state)
    expect(s1.characters_in_scene).toEqual(['char', 'char_2'])
    expect(s1.key_dialogue![0].character_id).toBe('char_2')
    expect(s1.character_appearance_overrides).toEqual({ char_2: 'tired' })
    expect(result.state.characters!.relationships[0].between).toEqual(['char', 'char_2'])
    expect(result.cast.some((c) => c.localId === 'treatment:char_3')).toBe(false)
    expect(result.cast.find((c) => c.localId === 'treatment:char_2')).toMatchObject({ name: '팀장', aliases: ['틴장'] })
  })

  it('합치면 고친 쪽 장소를 쓰던 씬이 남는 장소를 쓰고 고친 쪽 장소는 실행 기록에서 빠진다', () => {
    // 왜: 한 곳이 두 장소로 나뉘면 같은 곳의 배경 그림이 두 장 생긴다. 합친 뒤에는 그 씬도 남는 장소에서 벌어진다.
    const result = plan([{ op: 'merge', from: 'treatment:corridor', into: 'treatment:hallway' }])

    expect(scenesOf(result.state).map((s) => s.location)).toEqual(['hallway', 'hallway', 'hallway'])
    expect(result.state.world!.locations.map((l) => l.id)).toEqual(['hallway'])
    expect(result.backgrounds.find((b) => b.localId === 'treatment:hallway')).toMatchObject({ name: '회사 복도', aliases: ['복도'], visualDescription: '형광등이 깜빡이는 복도' })
    expect(result.backgrounds).toHaveLength(1)
  })

  it('합칠 때 남는 쪽의 설명은 그대로 두고 빠지는 쪽의 설명은 버린다', () => {
    // 왜: 프로토타입 — 합치면 남는 쪽(팀장)이 그 인물이다. 두 설명을 섞으면 AI가 서로 다른 외형을 한 사람에게 그린다.
    const list = draftList()
    list.cast = list.cast.map((c) => (c.localId === 'treatment:char_3' ? { ...c, appearance: '안경 쓴 대리', userEdited: true } : c))
    const result = plan([{ op: 'merge', from: 'treatment:char_3', into: 'treatment:char_2' }], draftState(), list)

    expect(result.cast.find((c) => c.localId === 'treatment:char_2')!.appearance).toBe('쉰 살, 회색 양복')
    expect(result.cast.map((c) => c.appearance)).not.toContain('안경 쓴 대리')
  })

  it('반영해도 산문 글은 한 글자도 바뀌지 않는다', () => {
    // 왜: 프로토타입 "산문은 잠긴 채로 표시만 고쳐요" — 확정한 산문은 Writer 화면에서도 고친 적 없는 그대로 보여야 한다.
    const before = draftState()
    const result = plan([
      { op: 'add', kind: 'person', name: '경비원' },
      { op: 'add', kind: 'background', name: '옥상' },
      { op: 'rename', key: 'treatment:char', name: '최민호' },
      { op: 'merge', from: 'treatment:char_3', into: 'treatment:char_2' },
      { op: 'merge', from: 'treatment:corridor', into: 'treatment:hallway' },
    ], draftState())

    expect(proseScenesOfState(result.state)).toEqual(proseScenesOfState(before))
    expect(scenesOf(result.state).map((s) => s.scene_actions)).toEqual(scenesOf(before).map((s) => s.scene_actions))
  })
})
