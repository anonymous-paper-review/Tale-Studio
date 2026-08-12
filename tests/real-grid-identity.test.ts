import { describe, it, expect } from 'vitest'
import { buildRealGridPrompt } from '@/lib/director/storyboard-strip'

// #real-grid-identity (2026-08-12) — 실측 a5cb2cae sh_04_18: 일괄 리페인트 프롬프트의
// "corresponding character(s)"는 대응 관계가 어디에도 정의돼 있지 않아, 추적자 단독 칸이
// 소녀로 바꿔치기된 시트가 그대로 저장됐다. 계약: 레퍼런스 순서 규약("reference image N = 이름")과
// 칸별 배정("Column i: 이름")이 프롬프트에 명시된다.

const BASE = { characterRefCount: 2, hasStyleRef: true }

describe('buildRealGridPrompt — 칸별 인물 배정 (#real-grid-identity)', () => {
  it('characterRefs 가 오면 레퍼런스 순서 규약과 칸별 배정을 명시한다', () => {
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

  it('두 인물이 한 칸에 같이 나오면 and 로 병기한다', () => {
    const p = buildRealGridPrompt(2, {
      ...BASE,
      characterRefs: [{ name: 'A' }, { name: 'B' }],
      columnCharacters: [['A', 'B'], ['A']],
    })
    expect(p).toContain('* Column 1: A and B')
  })

  it('인물 없는 칸은 사람 없이 유지하라고 지시한다 (인서트 샷)', () => {
    const p = buildRealGridPrompt(2, {
      ...BASE,
      characterRefCount: 1,
      characterRefs: [{ name: '소녀' }],
      columnCharacters: [['소녀'], []],
    })
    expect(p).toContain('* Column 2: no character — keep this column free of people')
  })

  it('characterRefs 미전달(구 호출자)이면 현행 익명 문장 그대로 — 하위 호환', () => {
    const p = buildRealGridPrompt(4, BASE)
    expect(p).toContain('corresponding character(s)')
    expect(p).not.toContain('reference image 2 =')
  })

  it('인물 레퍼런스가 0이면 배정 블록 자체가 없다', () => {
    const p = buildRealGridPrompt(4, { characterRefCount: 0, hasStyleRef: false })
    expect(p).not.toContain('Column 1:')
    expect(p).not.toContain('corresponding')
  })

  it('스타일 앵커(LAST) 지시는 배정 블록과 공존한다', () => {
    const p = buildRealGridPrompt(4, {
      ...BASE,
      characterRefs: [{ name: '소녀' }],
      columnCharacters: [['소녀'], ['소녀'], ['소녀'], ['소녀']],
    })
    expect(p).toContain('LAST reference image (style reference)')
  })
})
