// 다른 시기의 인물을 만들 때 같은 사람의 기본 얼굴과 직전 결과로 정체성을 지킨다
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildCharacterTurnaroundPrompt } from '@/lib/artist/turnaround'

const input = { name: '젊은 옥화', appearance: 'Early 20s Joseon-era woman' } as never
const route = readFileSync('src/app/api/artist/generate-sheet/route.ts', 'utf8')

describe('비기본 모습은 같은 캐릭터의 기본 얼굴을 참조한다', () => {
  it('기본 얼굴이 있으면 같은 사람의 정체성을 이어가도록 안내한다', () => {
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

  it('다른 모습으로 만들 때 같은 사람의 기본 모습을 찾아 사용한다', () => {
    expect(route).toContain('appearanceKey?: string')
    expect(route).toContain(".eq('appearance_key', appearanceKey)")
    expect(route).toContain(".eq('is_default', true)")
  })

  it('기본 얼굴이 없으면 다른 모습도 만들지 않는다', () => {
    expect(route).toContain('Default appearance portrait is required')
    expect(route).toContain('defaultAppearance.portrait_url')
  })

  it('다른 사람의 얼굴을 가져와 대신 쓰지 않는다', () => {
    expect(route).not.toContain('baseCharacterId')
    expect(route).not.toContain(".from('characters')\n        .select('portrait")
  })
})

describe('다시 만들 때 직전 결과를 같은 사람인지 확인하는 데 쓴다 (#reref)', () => {
  it('다시 만들 때 직전 결과와 같은 사람인지 확인하도록 안내한다', () => {
    const p = buildCharacterTurnaroundPrompt(input, { hasPriorRender: true })
    expect(p).toContain('PREVIOUS render of this exact character')
    expect(p).toMatch(/same face, identity, design/)
    expect(p).toContain('apply ONLY the adjustments described above')
  })

  it('처음 만들 때는 직전 결과 없이도 만든다 (첫 생성 동작 보존)', () => {
    const p = buildCharacterTurnaroundPrompt(input, { hasBaseFace: false })
    expect(p).not.toContain('PREVIOUS render')
  })

  it('다시 만들면 직전 결과를 같은 사람인지 확인하는 자료로 사용한다', () => {
    // refMain = appearance.sheet_url. 재생성이면 identityRefs 에 들어가고 hasPriorRender 로 프롬프트에 반영.
    expect(route).toContain('const refMain = appearance.sheet_url')
    expect(route).toContain('...(refMain ? [refMain] : [])')
    expect(route).toContain('reference_image_urls: [templateUrl, ...identityRefs]')
    expect(route).toContain('hasPriorRender: !!refMain')
  })

  it('처음 만들 때는 기본 양식만 사용한다', () => {
    expect(route).toContain('const identityRefs = [')
  })
})
