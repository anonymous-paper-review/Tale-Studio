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
    expect(route).toContain('Default appearance portrait is required')
    expect(route).toContain('defaultAppearance.portrait_url')
  })

  it('다른 캐릭터를 참조하는 baseCharacterId 우회 경로는 없다', () => {
    expect(route).not.toContain('baseCharacterId')
    expect(route).not.toContain(".from('characters')\n        .select('portrait")
  })
})

describe('재생성은 직전 시트를 정체성 참조로 넣는다 (#reref)', () => {
  it('hasPriorRender: 직전 렌더를 정체성 앵커로 유지하라고 지시한다', () => {
    const p = buildCharacterTurnaroundPrompt(input, { hasPriorRender: true })
    expect(p).toContain('PREVIOUS render of this exact character')
    expect(p).toMatch(/same face, identity, design/)
    expect(p).toContain('apply ONLY the adjustments described above')
  })

  it('hasPriorRender 미지정이면 그 지시가 없다 (첫 생성 동작 보존)', () => {
    const p = buildCharacterTurnaroundPrompt(input, { hasBaseFace: false })
    expect(p).not.toContain('PREVIOUS render')
  })

  it('route: 턴어라운드가 직전 시트(refMain)를 정체성 참조에 포함한다', () => {
    // refMain = appearance.sheet_url. 재생성이면 identityRefs 에 들어가고 hasPriorRender 로 프롬프트에 반영.
    expect(route).toContain('const refMain = appearance.sheet_url')
    expect(route).toContain('...(refMain ? [refMain] : [])')
    expect(route).toContain('reference_image_urls: [templateUrl, ...identityRefs]')
    expect(route).toContain('hasPriorRender: !!refMain')
  })

  it('route: 첫 생성(refMain 없음)은 템플릿만 — identityRefs 가 refMain 유무로 결정된다', () => {
    expect(route).toContain('const identityRefs = [')
  })
})
