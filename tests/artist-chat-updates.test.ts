import { describe, it, expect } from 'vitest'
import {
  validateUpdates,
  extractAppearanceProposals,
  AUTO_APPLY_UPDATE_TYPES,
} from '@/lib/artist/chat-updates'

type U = Record<string, unknown>
const types = (out: unknown[]) => out.map((u) => (u as U).type)

describe('validateUpdates — F6 화이트리스트 (원천 외형 변경 자동경로 금지)', () => {
  it('자동 허용 type 화이트리스트 = createCharacter / regenerate* 만', () => {
    expect([...AUTO_APPLY_UPDATE_TYPES].sort()).toEqual([
      'createCharacter',
      'regenerateCharacter',
      'regenerateWorldAsset',
    ])
  })

  it('F6: 기존 캐릭터 외형(원천) 변경 update 는 거부(드롭)', () => {
    const out = validateUpdates([
      { type: 'changeAppearance', characterId: 'char_01', appearance: '붉은 머리' },
      { type: 'updateCharacter', characterId: 'char_01', appearance: '붉은 머리' },
      { type: 'setAppearance', characterId: 'char_01', appearance: '붉은 머리' },
      { type: 'proposeAppearanceChange', characterId: 'char_01', appearance: '붉은 머리' },
    ])
    expect(out).toEqual([])
  })

  it('알 수 없는/비객체 type 거부', () => {
    expect(validateUpdates([null, 42, 'x', {}, { type: 'nope' }])).toEqual([])
  })

  it('regenerateCharacter(파생 이미지) 통과 + 잘못된 view 필터', () => {
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

  it('AC13: regenerateCharacter 의 instruction(유저 델타) 통과', () => {
    const out = validateUpdates([
      { type: 'regenerateCharacter', characterId: 'char_01', instruction: '머리 붉게' },
    ])
    expect(out[0]).toMatchObject({ type: 'regenerateCharacter', characterId: 'char_01', instruction: '머리 붉게' })
  })

  it('regenerateCharacter — characterId 없으면 드롭', () => {
    expect(validateUpdates([{ type: 'regenerateCharacter' }])).toEqual([])
  })

  it('createCharacter(신규 생성) 통과 — appearance 는 신규에만 허용(원천 변경 아님)', () => {
    const out = validateUpdates([
      { type: 'createCharacter', name: '지아', role: 'protagonist', appearance: '검은 코트' },
      { type: 'createCharacter', name: '  ', appearance: 'x' }, // 빈 이름 드롭
      { type: 'createCharacter', name: '봇', role: 'bogus' }, // 잘못된 role strip
    ])
    expect(types(out)).toEqual(['createCharacter', 'createCharacter'])
    expect(out[0]).toMatchObject({ type: 'createCharacter', name: '지아', role: 'protagonist', appearance: '검은 코트' })
    expect((out[1] as U).role).toBeUndefined()
  })

  it('regenerateWorldAsset(파생) 통과 / locationId 없으면 드롭', () => {
    expect(validateUpdates([{ type: 'regenerateWorldAsset', locationId: 'loc_01' }])).toEqual([
      { type: 'regenerateWorldAsset', locationId: 'loc_01' },
    ])
    expect(validateUpdates([{ type: 'regenerateWorldAsset' }])).toEqual([])
  })

  it('혼합 입력 — 허용분만 통과, 외형변경은 섞여 있어도 드롭', () => {
    const out = validateUpdates([
      { type: 'regenerateCharacter', characterId: 'char_01' },
      { type: 'changeAppearance', characterId: 'char_01', appearance: '붉은 머리' },
      { type: 'regenerateWorldAsset', locationId: 'loc_01' },
    ])
    expect(types(out)).toEqual(['regenerateCharacter', 'regenerateWorldAsset'])
  })
})

describe('extractAppearanceProposals — C3 원천 외형 변경 제안 채널 (F6)', () => {
  it('changeAppearance → 제안으로 추출 (자동경로 아님)', () => {
    const out = extractAppearanceProposals([
      { type: 'changeAppearance', characterId: 'char_01', appearance: '붉은 머리, 검은 코트' },
    ])
    expect(out).toEqual([{ characterId: 'char_01', appearance: '붉은 머리, 검은 코트' }])
  })

  it('validateUpdates 는 여전히 changeAppearance 를 자동경로에서 거부(F6 불변)', () => {
    expect(
      validateUpdates([{ type: 'changeAppearance', characterId: 'char_01', appearance: '붉은 머리' }]),
    ).toEqual([])
  })

  it('characterId/appearance 누락 시 제안 드롭', () => {
    expect(extractAppearanceProposals([{ type: 'changeAppearance', characterId: 'char_01' }])).toEqual([])
    expect(extractAppearanceProposals([{ type: 'changeAppearance', appearance: 'x' }])).toEqual([])
    expect(extractAppearanceProposals([{ type: 'regenerateCharacter', characterId: 'c' }])).toEqual([])
  })
})
