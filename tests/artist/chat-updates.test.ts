// 사용자가 보낸 외형 변경 요청은 승인 없이 자동 적용하지 않고, 파생 그림만 안전하게 만든다
import { describe, it, expect } from 'vitest'
import {
  validateUpdates,
  extractAppearanceProposals,
  AUTO_APPLY_UPDATE_TYPES,
} from '@/lib/artist/chat-updates'

type U = Record<string, unknown>
const types = (out: unknown[]) => out.map((u) => (u as U).type)

describe('validateUpdates — F6 허용된 작업만 자동 처리하고 원천 외형 변경은 막는다', () => {
  // createAppearance(#g4-chat 2026-08-31): 새 서사 시점 외형 "행"만 만든다 — 무과금이고
  //   기존 외형을 바꾸지 않으므로(F6의 보호 대상은 원천 교체) 자동 허용이 맞다.
  it('새 캐릭터와 파생 이미지만 자동으로 만들고 원천 외형은 C3 승인 뒤 바꾼다 (C3)', () => {
    expect([...AUTO_APPLY_UPDATE_TYPES].sort()).toEqual([
      'createCharacter',
      'regenerateCharacter',
      'regenerateWorldAsset',
    ])
  })

  it('기존 캐릭터의 원래 외형을 바꾸라는 요청은 거부한다 (F6)', () => {
    const out = validateUpdates([
      { type: 'changeAppearance', characterId: 'char_01', appearance: '붉은 머리' },
      { type: 'updateCharacter', characterId: 'char_01', appearance: '붉은 머리' },
      { type: 'setAppearance', characterId: 'char_01', appearance: '붉은 머리' },
      { type: 'proposeAppearanceChange', characterId: 'char_01', appearance: '붉은 머리' },
    ])
    expect(out).toEqual([])
  })

  it('알 수 없는 요청이나 잘못된 형식은 거부한다', () => {
    expect(validateUpdates([null, 42, 'x', {}, { type: 'nope' }])).toEqual([])
  })

  it('파생 캐릭터 그림은 허용된 장면만 남겨 통과시킨다', () => {
    const out = validateUpdates([
      { type: 'regenerateCharacter', characterId: 'char_01', views: ['main', 'bogus', 'sideLeft'] },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      type: 'regenerateCharacter',
      characterId: 'char_01',
      views: ['main', 'sideLeft'],
    })
  })

  it('사용자가 덧붙인 요청 문구도 그대로 전달한다 (AC13)', () => {
    const out = validateUpdates([
      { type: 'regenerateCharacter', characterId: 'char_01', instruction: '머리 붉게' },
    ])
    expect(out[0]).toMatchObject({ type: 'regenerateCharacter', characterId: 'char_01', instruction: '머리 붉게' })
  })

  it('캐릭터를 가리키는 정보가 없으면 파생 그림 요청을 버린다', () => {
    expect(validateUpdates([{ type: 'regenerateCharacter' }])).toEqual([])
  })

  it('새 캐릭터는 외형을 함께 만들고 이름이 없으면 빼며 잘못된 역할은 무시한다', () => {
    const out = validateUpdates([
      { type: 'createCharacter', name: '지아', role: 'protagonist', appearance: '검은 코트' },
      { type: 'createCharacter', name: '  ', appearance: 'x' }, // 빈 이름 드롭
      { type: 'createCharacter', name: '봇', role: 'bogus' }, // 잘못된 role strip
    ])
    expect(types(out)).toEqual(['createCharacter', 'createCharacter'])
    expect(out[0]).toMatchObject({ type: 'createCharacter', name: '지아', role: 'protagonist', appearance: '검은 코트' })
    expect((out[1] as U).role).toBeUndefined()
  })

  it('장소 그림을 다시 만들고 장소 정보가 없으면 요청을 버린다', () => {
    expect(validateUpdates([{ type: 'regenerateWorldAsset', locationId: 'loc_01' }])).toEqual([
      { type: 'regenerateWorldAsset', locationId: 'loc_01' },
    ])
    expect(validateUpdates([{ type: 'regenerateWorldAsset' }])).toEqual([])
  })

  it('여러 요청이 섞여도 허용된 그림만 남기고 원래 외형 변경은 버린다', () => {
    const out = validateUpdates([
      { type: 'regenerateCharacter', characterId: 'char_01' },
      { type: 'changeAppearance', characterId: 'char_01', appearance: '붉은 머리' },
      { type: 'regenerateWorldAsset', locationId: 'loc_01' },
    ])
    expect(types(out)).toEqual(['regenerateCharacter', 'regenerateWorldAsset'])
  })
})

describe('validateUpdates — 이미지 모델 이름도 허용된 범위에서만 받는다', () => {
  it('허용된 이미지 모델을 지정하면 그대로 사용한다', () => {
    const out = validateUpdates([{ type: 'regenerateCharacter', characterId: 'c1', model: 'nano-banana' }])
    expect(out[0]).toMatchObject({ type: 'regenerateCharacter', characterId: 'c1', model: 'nano-banana' })
  })

  it('알 수 없는 이미지 모델을 지정하면 해당 지정만 빼고 진행한다', () => {
    const out = validateUpdates([{ type: 'regenerateCharacter', characterId: 'c1', model: 'evil-model' }])
    expect(out).toHaveLength(1)
    expect((out[0] as U).model).toBeUndefined()
  })

  it('이미지 모델을 지정하지 않으면 기본 설정으로 진행한다', () => {
    const out = validateUpdates([{ type: 'regenerateCharacter', characterId: 'c1' }])
    expect('model' in (out[0] as U)).toBe(false)
  })
})

describe('extractAppearanceProposals — C3 원천 외형 변경 제안을 승인 대상으로 따로 모은다 (F6)', () => {
  it('외형 변경 요청은 자동 적용하지 않고 제안으로 모은다', () => {
    const out = extractAppearanceProposals([
      { type: 'changeAppearance', characterId: 'char_01', appearance: '붉은 머리, 검은 코트' },
    ])
    expect(out).toEqual([{ characterId: 'char_01', appearance: '붉은 머리, 검은 코트' }])
  })

  it('외형 변경 요청은 지금도 자동으로 반영하지 않는다 (F6)', () => {
    expect(
      validateUpdates([{ type: 'changeAppearance', characterId: 'char_01', appearance: '붉은 머리' }]),
    ).toEqual([])
  })

  it('캐릭터나 외형 정보가 빠진 변경 요청은 제안에서 뺀다', () => {
    expect(extractAppearanceProposals([{ type: 'changeAppearance', characterId: 'char_01' }])).toEqual([])
    expect(extractAppearanceProposals([{ type: 'changeAppearance', appearance: 'x' }])).toEqual([])
    expect(extractAppearanceProposals([{ type: 'regenerateCharacter', characterId: 'c' }])).toEqual([])
  })
})
