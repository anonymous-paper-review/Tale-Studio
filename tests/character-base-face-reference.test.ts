import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildCharacterTurnaroundPrompt } from '@/lib/artist/turnaround'

// #g4 (2026-08-27) — "젊은 옥화"가 옥화를 바탕으로 만들어져야 연속성이 보존된다(오너).
//
// 실측한 문제: 같은 프로젝트에 옥화(char_3)와 젊은 옥화(char_new_9l6xq)가 남남으로 있고
//   시트 두 장의 얼굴 골격이 서로 다르다. 원인은 시트 생성이 참조할 수 있는 게
//   "자기 자신의 view_main" 뿐이라 다른 캐릭터를 볼 경로가 아예 없었던 것.

const input = { name: '젊은 옥화', appearance: 'Early 20s Joseon-era woman' } as never
const route = readFileSync('src/app/api/artist/generate-sheet/route.ts', 'utf8')

describe('시점 변형이 기준 캐릭터의 얼굴을 참조한다', () => {
  it('기준 얼굴이 없으면 프롬프트가 예전과 같다', () => {
    const p = buildCharacterTurnaroundPrompt(input)
    expect(p).not.toContain('SECOND reference image')
  })

  it('기준 얼굴이 있으면 정체성을 이어받으라고 지시한다', () => {
    const p = buildCharacterTurnaroundPrompt(input, { hasBaseFace: true })
    expect(p).toContain('SECOND reference image')
    expect(p).toContain('same person at a different point in their life')
    // 무엇을 이어받을지 구체적으로 — 추상어면 모델이 안 따른다(G2 에서 배운 것)
    expect(p).toMatch(/face structure|eye shape|nose bridge/)
  })

  it('그대로 베끼지 말라고 못박는다 — 안 그러면 나이가 안 바뀐다', () => {
    const p = buildCharacterTurnaroundPrompt(input, { hasBaseFace: true })
    expect(p).toContain('do NOT copy that face verbatim')
    // 이 시트의 나이·상태를 따르라는 지시가 함께 있어야 한다
    expect(p).toMatch(/age and condition described above/)
  })
})

describe('라우트가 기준 캐릭터를 받아 얼굴을 찾는다', () => {
  it('baseCharacterId 를 요청에서 받는다', () => {
    expect(route).toContain('baseCharacterId')
  })

  it('시트 전체가 아니라 얼굴 크롭(portrait)을 우선 쓴다', () => {
    // 시트를 통째로 주면 레이아웃이 따라와 템플릿과 충돌한다
    expect(route).toMatch(/base\?\.portrait[\s\S]{0,40}base\?\.view_main/)
  })

  it('자기 자신을 기준으로 삼지 않는다 (무한 참조 방지)', () => {
    expect(route).toContain('baseCharacterId !== characterId')
  })

  it('템플릿이 첫 장, 기준 얼굴이 둘째 장 — 순서가 뒤바뀌면 레이아웃으로 오인된다', () => {
    expect(route).toContain('[templateUrl, baseFaceUrl]')
  })
})
