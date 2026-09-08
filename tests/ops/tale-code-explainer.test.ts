// 코드 학습 가이드는 실제 근거와 읽을 수 있는 SVG 시각화를 빠뜨리지 않는다
import { describe, expect, it } from 'vitest'
import { validateGuideHtml } from '../../.gjc/skills/tale-code-explainer/scripts/verify-guide.mjs'

const requiredSections = [
  'overview',
  'architecture',
  'flow',
  'code-journey',
  'tradeoffs',
  'check',
  'evidence',
]

function guideHtml(svgCount: number): string {
  const sections = requiredSections
    .map((section) => `<section data-guide-section="${section}"><h2>${section}</h2></section>`)
    .join('')
  const svgs = Array.from(
    { length: svgCount },
    (_, index) => `<svg viewBox="0 0 100 100"><title>지도 ${index + 1}</title><desc>코드 흐름</desc></svg>`,
  ).join('')

  return `<!doctype html><html lang="ko"><head><title>코드 가이드</title></head><body>${svgs}${sections}</body></html>`
}

describe('tale-code-explainer 결과 검증', () => {
  it('가이드에 SVG 시각화가 없으면 검증에 실패한다', () => {
    const result = validateGuideHtml(guideHtml(0), { mode: 'concept' })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('SVG 시각화가 최소 1개 필요하다')
  })

  it('온보딩과 기능 가이드에는 SVG 시각화가 두 개 이상 있어야 한다', () => {
    const result = validateGuideHtml(guideHtml(1), { mode: 'feature' })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('feature 가이드는 SVG 시각화가 최소 2개 필요하다')
  })

  it('가이드가 외부 리소스에 의존하면 검증에 실패한다', () => {
    const html = guideHtml(2).replace('</head>', '<script src="https://cdn.example.com/guide.js"></script></head>')
    const result = validateGuideHtml(html, { mode: 'feature' })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('외부 URL에 의존하면 안 된다: https://cdn.example.com/guide.js')
  })

  it('치환하지 않은 템플릿 값이 남으면 검증에 실패한다', () => {
    const html = guideHtml(2).replace('</body>', '{{GUIDE_TITLE}}</body>')
    const result = validateGuideHtml(html, { mode: 'feature' })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('치환하지 않은 템플릿 값이 남아 있다: {{GUIDE_TITLE}}')
  })

  it('SVG에서 같은 id를 두 번 사용하면 검증에 실패한다', () => {
    const html = guideHtml(2).replaceAll('<svg ', '<svg id="duplicate" ')
    const result = validateGuideHtml(html, { mode: 'feature' })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('SVG id가 중복된다: duplicate')
  })

  it('필수 학습 절과 설명이 있는 SVG를 모두 갖추면 검증을 통과한다', () => {
    const result = validateGuideHtml(guideHtml(2), { mode: 'feature' })

    expect(result).toEqual({ valid: true, errors: [], svgCount: 2 })
  })
})
