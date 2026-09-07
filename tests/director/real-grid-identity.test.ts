// 인물별 그림은 지정된 사람만 담고, 한 장면의 시간대와 빛을 모든 칸에 맞춘다 (#real-grid-identity 2026-08-12, #F-006 2026-08-13)
import { describe, it, expect } from 'vitest'
import { buildRealGridPrompt, buildRealStripPrompt } from '@/lib/director/storyboard-strip'

// #real-grid-identity (2026-08-12) — 실측 a5cb2cae sh_04_18: 일괄 리페인트 프롬프트의
// "corresponding character(s)"는 대응 관계가 어디에도 정의돼 있지 않아, 추적자 단독 칸이
// 소녀로 바꿔치기된 시트가 그대로 저장됐다. 계약: 레퍼런스 순서 규약("reference image N = 이름")과
// 칸별 배정("Column i: 이름")이 프롬프트에 명시된다.

const BASE = { characterRefCount: 2, hasStyleRef: true }

describe('실사 그림의 칸마다 지정한 인물을 배정한다 (#real-grid-identity)', () => {
  it('인물 목록이 있으면 참조 순서와 칸별 인물을 안내한다', () => {
    const p = buildRealGridPrompt(4, {
      ...BASE,
      characterRefs: [{ name: '소녀' }, { name: '왕국의 추적자' }],
      columnCharacters: [['소녀'], ['왕국의 추적자'], ['소녀'], ['소녀']],
    })
    // 순서 규약 — 1번은 러프 시트이므로 인물은 2번부터.
    expect(p).toContain('reference image 2 = 소녀')
    expect(p).toContain('reference image 3 = 왕국의 추적자')
    // 칸별 배정 — sh_04_18 사고의 직접 처방: 칸 2는 추적자 전속.
    expect(p).toContain('* Column 2: 왕국의 추적자')
    expect(p).toContain('* Column 1: 소녀')
    // 다른 칸의 인물을 끌어오지 말라는 금지문.
    expect(p).toContain('never carry a character into a column they are not assigned to')
    // 익명 "corresponding" 문장은 대체된다 — 남아 있으면 모델에게 모순 지시.
    expect(p).not.toContain('corresponding character(s)')
  })

  it('한 칸에 두 사람이 나오면 두 사람 이름을 함께 적는다', () => {
    const p = buildRealGridPrompt(2, {
      ...BASE,
      characterRefs: [{ name: 'A' }, { name: 'B' }],
      columnCharacters: [['A', 'B'], ['A']],
    })
    expect(p).toContain('* Column 1: A and B')
  })

  it('사람 없는 칸에는 사람을 넣지 않는다 (삽입 장면)', () => {
    const p = buildRealGridPrompt(2, {
      ...BASE,
      characterRefCount: 1,
      characterRefs: [{ name: '소녀' }],
      columnCharacters: [['소녀'], []],
    })
    expect(p).toContain('* Column 2: no character — keep this column free of people')
  })

  it('인물 목록이 없으면 이름 없는 안내를 그대로 유지한다', () => {
    const p = buildRealGridPrompt(4, BASE)
    expect(p).toContain('corresponding character(s)')
    expect(p).not.toContain('reference image 2 =')
  })

  it('인물이 없으면 칸별 인물 안내를 넣지 않는다', () => {
    const p = buildRealGridPrompt(4, { characterRefCount: 0, hasStyleRef: false })
    expect(p).not.toContain('Column 1:')
    expect(p).not.toContain('corresponding')
  })

  it('스타일 기준 그림과 칸별 인물 안내를 함께 제공한다', () => {
    const p = buildRealGridPrompt(4, {
      ...BASE,
      characterRefs: [{ name: '소녀' }],
      columnCharacters: [['소녀'], ['소녀'], ['소녀'], ['소녀']],
    })
    expect(p).toContain('LAST reference image (style reference)')
  })
})

// #F-006 (2026-08-13) — 실측 1e166e55 sc_04(Night): 시트 프롬프트에 씬 정보가 전무해
// 시트(=생성 콜)마다 시간대를 지어냈고, 21~24/25~27 시트가 서로 다른 시간대로 갈라졌다.
// 계약: scenes.time_of_day 가 오면 시트 전역 조명 한 줄이 실리고, 앵커 절은 조명·그레이드
// 권위를 이 줄에 넘긴다(§6D 실측: 텍스트 그레이드 권위 > 앵커 이미지 — 문구가 남으면 경합).
describe('한 장면의 시간대와 빛을 모든 칸에 적용한다 (#F-006)', () => {
  it('시간대를 지정하면 전체 그림에 같은 빛을 적용하고 기준 그림과 겹치는 안내는 뺀다', () => {
    const p = buildRealGridPrompt(4, { ...BASE, sceneLighting: 'Night' })
    expect(p).toContain('Scene lighting — the whole sheet is ONE scene, time of day: Night')
    expect(p).toContain('identical across all columns')
    // 권위 이관 — 앵커 절이 조명·그레이드를 계속 주장하면 모델에게 모순 지시.
    expect(p).not.toContain('lighting mood and color grade')
    expect(p).toContain('do NOT copy its time of day or lighting')
  })

  it('시간대가 없거나 비어 있으면 기존 안내를 그대로 유지한다', () => {
    for (const p of [
      buildRealGridPrompt(4, BASE),
      buildRealGridPrompt(4, { ...BASE, sceneLighting: '  ' }),
    ]) {
      expect(p).not.toContain('Scene lighting')
      expect(p).toContain('linework, lighting mood and color grade')
    }
  })

  it('기준 그림이 없어도 지정한 시간대의 빛 안내는 적용한다', () => {
    const p = buildRealGridPrompt(4, {
      characterRefCount: 0,
      hasStyleRef: false,
      sceneLighting: 'Golden hour',
    })
    expect(p).toContain('time of day: Golden hour')
    expect(p).not.toContain('LAST reference image')
  })

  it('시간대를 지정하면 세 장면 그림에 같은 빛을 적용하고 없으면 기존 안내를 유지한다', () => {
    const withScene = buildRealStripPrompt('shot desc', {
      characterRefCount: 1,
      hasStyleRef: true,
      sceneLighting: 'Night',
    })
    expect(withScene).toContain('Scene lighting — time of day: Night')
    expect(withScene).toContain('consistently in all three panels')
    expect(withScene).not.toContain('lighting mood and color grade')

    const without = buildRealStripPrompt('shot desc', { characterRefCount: 1, hasStyleRef: true })
    expect(without).not.toContain('Scene lighting')
    expect(without).toContain('linework, lighting mood and color grade')
  })
})
