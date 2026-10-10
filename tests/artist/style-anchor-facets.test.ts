// 스타일 앵커 그림과 함께 그 스타일의 facet 조각을 실어, 우리가 제공하는 스타일을 일관되게 그린다 (2026-10-08 오너 · facet 인계)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  FACET_ADULT_PROPORTIONS,
  FACET_EXPRESSION_PRIORITY,
  FACET_NO_TEXT,
  FACET_SURFACE_GUARD,
  STYLE_ANCHOR_2REF_CLAUSE,
  STYLE_ANCHOR_CLAUSE,
  STYLE_ANCHOR_TEMPLATE_CLAUSE,
  applyStyleAnchor,
  parseCustomStyleAnchor,
  parseStyleAnchorFacets,
  type ResolvedStyleAnchor,
} from '@/lib/style-anchor'
import { FACETS_SOURCE, buildFacetsSeed } from '../../scripts/style-anchor-facets-seed.mjs'

const facets = {
  version: 'hp-test',
  probe_anchors: 'No outlines; photographic soft light.',
  figure: 'Realistic figures throughout, about 7.9 heads tall.',
  priority: 'Priority order: photographic shading → soft light.',
  negative: 'Avoid anime, cel shading, logos.',
}
const anchor = (over: Partial<ResolvedStyleAnchor> = {}): ResolvedStyleAnchor => ({
  key: 'real',
  imageUrl: 'https://anchor/real.png',
  styleClause: 'Carry the style reference scene language.',
  facets: parseStyleAnchorFacets(facets),
  ...over,
})
const lines = (prompt: string) => prompt.split('\n')

describe('facet 조각 조립 순서', () => {
  it('프리셋 앵커에 facet 조각이 있으면 역할 문장 → 현행 스타일 절 → Style anchors 조각 순으로 싣는다', () => {
    const out = applyStyleAnchor(anchor(), { prompt: 'A courier stands.', aspect_ratio: '1:1' }, 'single', { people: true })
    expect(lines(out.prompt).slice(0, 4)).toEqual([
      STYLE_ANCHOR_CLAUSE,
      'Carry the style reference scene language.',
      'Style anchors: No outlines; photographic soft light.',
      'A courier stands.',
    ])
    expect(out.reference_image_urls).toEqual(['https://anchor/real.png'])
  })

  it('인물이 있는 생성에는 Figure rules 조각과 Priority order 줄을 Avoid 문장 앞에 싣는다', () => {
    const out = applyStyleAnchor(anchor(), { prompt: 'A courier stands.', aspect_ratio: '1:1' }, 'single', { people: true })
    expect(lines(out.prompt).slice(4)).toEqual([
      FACET_SURFACE_GUARD,
      `Figure rules: Realistic figures throughout, about 7.9 heads tall. ${FACET_ADULT_PROPORTIONS} ${FACET_EXPRESSION_PRIORITY}`,
      'Priority order: photographic shading → soft light.',
      'Avoid anime, cel shading, logos.',
      FACET_NO_TEXT,
    ])
  })

  it('배경·사물만 있는 생성에는 Figure rules 조각과 Priority order 줄을 싣지 않는다', () => {
    const out = applyStyleAnchor(anchor(), { prompt: 'An empty alley.', aspect_ratio: '16:9' }, 'single')
    expect(out.prompt).not.toContain('Figure rules:')
    expect(out.prompt).not.toContain('Priority order:')
    expect(lines(out.prompt).slice(3)).toEqual(['An empty alley.', FACET_SURFACE_GUARD, 'Avoid anime, cel shading, logos.', FACET_NO_TEXT])
  })

  it('facet 조각이 없는 앵커는 지금과 같은 프롬프트로 생성한다', () => {
    const without = anchor({ facets: null })
    const out = applyStyleAnchor(without, { prompt: 'A courier stands.', aspect_ratio: '1:1' }, 'single', { people: true })
    expect(out.prompt).toBe(`${STYLE_ANCHOR_CLAUSE}\nCarry the style reference scene language.\nA courier stands.`)
  })

  it('조각 안의 매체어는 걷어내지 않고 본문의 매체어는 지금처럼 걷어낸다', () => {
    const out = applyStyleAnchor(anchor(), { prompt: 'A photorealistic courier stands.', aspect_ratio: '1:1' }, 'single', { people: true })
    expect(out.prompt).toContain('Style anchors: No outlines; photographic soft light.')
    expect(out.prompt).toContain('\nA courier stands.\n')
    expect(out.prompt).not.toContain('photorealistic courier')
  })

  it('Figure rules 조각 뒤에 그 비례가 이 스타일의 평균적인 성인 기준이라는 첨언을 붙여 아이 인물이 어른 비례로 그려지지 않게 한다', () => {
    // 왜: 실사 인물 조각의 "약 7.9등신" 같은 어른 비례가 아이 인물에게도 실렸다(2026-10-08 오너 결정 4 — 첨언).
    const out = applyStyleAnchor(anchor(), { prompt: 'A five-year-old girl stands.', aspect_ratio: '1:1' }, 'single', { people: true })
    const figureLine = lines(out.prompt).find((line) => line.startsWith('Figure rules: '))
    expect(figureLine).toBe(`Figure rules: Realistic figures throughout, about 7.9 heads tall. ${FACET_ADULT_PROPORTIONS} ${FACET_EXPRESSION_PRIORITY}`)
    expect(FACET_ADULT_PROPORTIONS).toMatch(/average adult/)
    expect(FACET_ADULT_PROPORTIONS).toMatch(/children/)
  })

  it('Figure rules 조각에 표정 우선 문장이 이미 있으면 다시 붙이지 않는다', () => {
    const withPriority = anchor({
      facets: parseStyleAnchorFacets({ ...facets, figure: 'Realistic figures. When the scene calls for an expression, the expression takes priority over these eye defaults.' }),
    })
    const out = applyStyleAnchor(withPriority, { prompt: 'A courier frowns.', aspect_ratio: '1:1' }, 'single', { people: true })
    expect(out.prompt).not.toContain(FACET_EXPRESSION_PRIORITY)
    expect(out.prompt).toContain('Figure rules: Realistic figures. When the scene calls for an expression, the expression takes priority over these eye defaults.')
  })
})

describe('facet 조각과 다른 참조의 공존', () => {
  it('인물 시트(양식 참조)에는 글자 금지 줄을 붙이지 않아 양식의 칸 이름을 지운다고 오해하지 않게 한다', () => {
    const out = applyStyleAnchor(
      anchor(),
      { prompt: 'Fill in this character reference-sheet template.', reference_image_urls: ['https://t/template.png'] },
      'turnaround',
      { pinAspectRatio: '16:9', people: true },
    )
    expect(lines(out.prompt).slice(0, 3)).toEqual([STYLE_ANCHOR_CLAUSE, STYLE_ANCHOR_TEMPLATE_CLAUSE, 'Carry the style reference scene language.'])
    expect(out.prompt).toContain('Figure rules: ')
    expect(out.prompt).not.toContain(FACET_NO_TEXT)
    expect(out.reference_image_urls).toEqual(['https://anchor/real.png', 'https://t/template.png'])
  })

  it('2장 참조 앵커는 미리보기를 두 번째 참조로 두고 facet 조각도 함께 싣는다', () => {
    const twoRef = anchor({ usePreviewRef: true, previewUrl: 'https://anchor/preview.jpg' })
    const out = applyStyleAnchor(twoRef, { prompt: 'A courier stands.', aspect_ratio: '1:1' }, 'single', { people: true })
    expect(lines(out.prompt)[0]).toBe(STYLE_ANCHOR_2REF_CLAUSE)
    expect(out.prompt).toContain('Style anchors: No outlines; photographic soft light.')
    expect(out.reference_image_urls).toEqual(['https://anchor/real.png', 'https://anchor/preview.jpg'])
  })
})

describe('facet 조각 읽기', () => {
  it('facets 값이 조각 모양이 아니면 facet 없이 지금처럼 만든다', () => {
    expect(parseStyleAnchorFacets(null)).toBeNull()
    expect(parseStyleAnchorFacets({ probe_anchors: 42 })).toBeNull()
    expect(parseStyleAnchorFacets({ probe_anchors: '   ' })).toBeNull()
    expect(parseStyleAnchorFacets({ probe_anchors: 'Anchors.', figure: 7, priority: '', negative: null })).toEqual({
      version: null,
      probeAnchors: 'Anchors.',
      figure: null,
      priority: null,
      negative: null,
    })
  })

  it('유저가 올린 앵커에 facet 조각이 들어 있으면 그 조각을 싣는다', () => {
    const custom = parseCustomStyleAnchor({ url: 'https://u/mine.png', label: '내 그림', medium: null, facets })
    expect(custom?.facets?.probeAnchors).toBe('No outlines; photographic soft light.')
    expect(parseCustomStyleAnchor({ url: 'https://u/mine.png' })).not.toHaveProperty('facets')
  })
})

describe('프리셋 12종 facet 시드', () => {
  const index = JSON.parse(readFileSync(FACETS_SOURCE, 'utf8'))
  const seed = buildFacetsSeed(index) as Record<string, Record<string, unknown>>

  it('프리셋 12종 모두 인계 파일의 v5 조각(방향어 상한 + 신장 % 비례 문장, 2026-10-09 오너 결정) 그대로 시드에 들어간다', () => {
    expect(Object.keys(seed).sort()).toEqual([
      'jp_anime', 'real', 'real_3d', 'real_desert_fantasy', 'real_euro_period', 'real_hitech_sf',
      'real_jp_melo', 'real_psy_horror', 'real_urban_hero', 'stop_motion', 'us_cartoon', 'watercolor',
    ])
    for (const [key, entry] of Object.entries(index) as Array<[string, { facets: Record<string, string> }]>) {
      expect(entry.facets.version).toBe('hp-v1.2.3+figure-board+compile-v3+priority-cap+height-pct')
      expect(entry.facets.figure, `${key}.figure`).toMatch(/Keep every proportion close to the stated values; do not exaggerate beyond them\.$/)
      // 신장 % 문장은 등신 문장 바로 뒤에 한 번 — 소수점 안에 끼어 숫자를 가르면 안 된다(사이클 12 시험본 결함)
      expect(entry.facets.figure.match(/Measured on the standing height from the ground up:/g), `${key}.figure`).toHaveLength(1)
      expect(entry.facets.figure, `${key}.figure`).toMatch(/\. Measured on the standing height from the ground up: .*?and the head at this size\. [A-Z]/)
      for (const field of ['probe_anchors', 'figure', 'priority', 'negative']) {
        expect(seed[key][field], `${key}.${field}`).toBe(entry.facets[field])
      }
      expect(parseStyleAnchorFacets(seed[key])?.probeAnchors, key).toBe(entry.facets.probe_anchors)
    }
  })

  it('시드에는 제품이 싣는 조각과 출처 기록만 넣고 기록용 캡슐·장면 문단은 넣지 않는다', () => {
    for (const value of Object.values(seed) as Array<Record<string, unknown>>) {
      expect(value).not.toHaveProperty('capsule')
      expect(value).not.toHaveProperty('scene')
      expect(value).not.toHaveProperty('filled')
      expect(value).toHaveProperty('version')
    }
  })
})
