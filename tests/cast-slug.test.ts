import { describe, expect, it } from 'vitest'
import { slugifyName, assignCastSlugs } from '@/lib/cast-slug'

describe('slugifyName', () => {
  it('snake_cases ascii names', () => {
    expect(slugifyName('Viper King')).toBe('viper_king')
    expect(slugifyName('  The-Shadow  ')).toBe('the_shadow')
  })
  it('strips non-ascii (한글) and falls back to char', () => {
    expect(slugifyName('지아')).toBe('char')
    expect(slugifyName('지아 Kim')).toBe('kim')
  })
})

describe('assignCastSlugs', () => {
  it('keeps existing characterId and dedupes generated collisions', () => {
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
