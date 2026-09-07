// REAL 리페인트 프롬프트의 시네 라인 주입(#viz-gap 2026-08-07) 회귀.
//   계약: cineLines 미전달 = 현행 프롬프트 그대로(라이브 무변경) / 전달 = 컬럼별 시네 블록 추가.
//   포즈·구도는 건드리지 말라는 가드 문구가 함께 실려야 한다(리페인트 훼손 방지).
import { describe, it, expect } from 'vitest'
import { buildRealGridPrompt, buildRealStripPrompt } from '@/lib/director/storyboard-strip'

const OPTS = { characterRefCount: 2, hasStyleRef: true }

describe('buildRealGridPrompt cine 주입', () => {
  it('cineLines 미전달 시 현행 프롬프트와 완전히 동일하다(라이브 무변경)', () => {
    const withParam = buildRealGridPrompt(4, { ...OPTS })
    const withUndef = buildRealGridPrompt(4, { ...OPTS, cineLines: undefined })
    const withEmpty = buildRealGridPrompt(4, { ...OPTS, cineLines: [] })
    expect(withUndef).toBe(withParam)
    expect(withEmpty).toBe(withParam)
    expect(withParam).not.toContain('Per-column cinematography')
  })

  it('cineLines 전달 시 컬럼 번호로 라인을 붙이고 포즈·구도 보호 가드를 명시한다', () => {
    const p = buildRealGridPrompt(3, {
      ...OPTS,
      cineLines: ['85mm lens, shallow DoF, key from top left', 'soft light, teal grade', null],
    })
    expect(p).toContain('Per-column cinematography')
    expect(p).toContain('Column 1: 85mm lens, shallow DoF, key from top left')
    expect(p).toContain('Column 2: soft light, teal grade')
    // null/빈 라인은 스킵 — Column 3 없음
    expect(p).not.toContain('Column 3:')
    // 포즈·구도는 바꾸지 말라는 가드
    expect(p).toMatch(/do NOT change[^\n]*framing, composition or figure poses/i)
  })

  it('빈 라인만 있으면 블록을 넣지 않는다', () => {
    const p = buildRealGridPrompt(2, { ...OPTS, cineLines: ['', '  '] })
    expect(p).not.toContain('Per-column cinematography')
  })
})

describe('buildRealStripPrompt cine 주입', () => {
  it('cineLine 미전달 시 현행과 동일', () => {
    const base = buildRealStripPrompt('a shot', { ...OPTS })
    expect(buildRealStripPrompt('a shot', { ...OPTS, cineLine: undefined })).toBe(base)
    expect(base).not.toContain('Cinematography —')
  })

  it('cineLine 전달 시 시네 채널 + 포즈 보호 가드를 붙인다', () => {
    const p = buildRealStripPrompt('a shot', { ...OPTS, cineLine: '50mm, hard key from right, 3200K' })
    expect(p).toContain('50mm, hard key from right, 3200K')
    expect(p).toMatch(/WITHOUT changing framing, composition or poses/i)
  })
})
