// 등장인물 이름을 겹치지 않는 안전한 이름으로 정리해 같은 대상을 가리킨다
import { describe, expect, it } from 'vitest'
import { slugifyName, assignCastSlugs } from '@/lib/cast-slug'

describe('slugifyName', () => {
  it('영문 이름을 입력하면 소문자와 밑줄로 정리한다', () => {
    expect(slugifyName('Viper King')).toBe('viper_king')
    expect(slugifyName('  The-Shadow  ')).toBe('the_shadow')
  })
  it('한글 이름은 기본 이름으로, 영문이 섞이면 영문 부분으로 정리한다', () => {
    expect(slugifyName('지아')).toBe('char')
    expect(slugifyName('지아 Kim')).toBe('kim')
  })
})

describe('assignCastSlugs', () => {
  it('이미 정한 캐릭터 이름은 유지하고 같은 이름에는 번호를 붙인다', () => {
    const out = assignCastSlugs([
      { name: 'Viper' },
      { name: 'Viper' }, // collision → viper_2
      { name: '지아' }, // → char
      { name: '하늘' }, // → char_2
      { name: 'Fixed', characterId: 'preset_slug' },
    ])
    expect(out.map((m) => m.character_id)).toEqual([
      'viper',
      'viper_2',
      'char',
      'char_2',
      'preset_slug',
    ])
  })
})
