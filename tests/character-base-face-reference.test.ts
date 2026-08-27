import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildCharacterTurnaroundPrompt } from '@/lib/artist/turnaround'

const input = { name: '젊은 옥화', appearance: 'Early 20s Joseon-era woman' } as never
const route = readFileSync('src/app/api/artist/generate-sheet/route.ts', 'utf8')

describe('비기본 모습은 같은 캐릭터의 기본 얼굴을 참조한다', () => {
  it('기본 portrait가 있으면 정체성을 이어받으라고 지시한다', () => {
    const p = buildCharacterTurnaroundPrompt(input, { hasBaseFace: true })
    expect(p).toContain('SECOND reference image')
    expect(p).toContain('same person at a different point in their life')
    expect(p).toMatch(/face structure|eye shape|nose bridge/)
  })

  it('그대로 베끼지 말고 선택한 모습의 나이와 상태를 따른다', () => {
    const p = buildCharacterTurnaroundPrompt(input, { hasBaseFace: true })
    expect(p).toContain('do NOT copy that face verbatim')
    expect(p).toMatch(/age and condition described above/)
  })

  it('요청한 모습과 같은 캐릭터의 명시적 기본 모습을 정확히 조회한다', () => {
    expect(route).toContain('appearanceKey?: string')
    expect(route).toContain(".eq('appearance_key', appearanceKey)")
    expect(route).toContain(".eq('is_default', true)")
  })

  it('비기본 모습은 같은 캐릭터의 기본 portrait가 없으면 생성하지 않는다', () => {
    expect(route).toContain('default appearance portrait is required')
    expect(route).toContain('defaultAppearance.portrait_url')
  })

  it('다른 캐릭터를 참조하는 baseCharacterId 우회 경로는 없다', () => {
    expect(route).not.toContain('baseCharacterId')
    expect(route).not.toContain(".from('characters')\n        .select('portrait")
  })
})
