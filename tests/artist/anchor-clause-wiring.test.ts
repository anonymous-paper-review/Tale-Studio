// 장면을 만들 때 정한 화풍과 조명, 그림의 우선순위를 일관되게 지킨다
import { describe, it, expect } from 'vitest'
import {
  applyStyleAnchor,
  STYLE_ANCHOR_CLAUSE,
  STYLE_ANCHOR_2REF_CLAUSE,
  STYLE_ANCHOR_2REF_MULTIREF_CLAUSE,
} from '@/lib/style-anchor'
import { buildRealGridPrompt, buildRealStripPrompt } from '@/lib/director/storyboard-strip'

// #anchor-wiring (2026-08-14, 오너 확정) — 12종 배터리의 배선 계약:
//   전 앵커 = 검증 절(style_clause) 주입 / watercolor = preview 2번 스타일 레퍼런스(A안) /
//   서브룩 = 씬 조명 존재 시에도 그레이드·팔레트 권위를 앵커에 유지(Rule 6).
//   역사극·공포는 절 NULL(=T 유지 — B 실측 해악)이므로 "절 없음 = 종전 프롬프트" 하위 호환이 계약이다.

const BASE_ANCHOR = { key: 'k', imageUrl: 'https://a/board.png', medium: '3d' }

describe('applyStyleAnchor — 정한 화풍 안내를 결과에 반영한다', () => {
  it('화풍 설명을 넣으면 설명은 보존하고 장면 문구의 매체 표현은 정리한다', () => {
    const out = applyStyleAnchor(
      { ...BASE_ANCHOR, styleClause: 'A real photograph, not an illustration.' },
      { prompt: 'photorealistic scene of a cafe', aspect_ratio: '1:1' },
      'single',
    )
    // 절의 매체어는 보존, 본문 산문의 매체어는 스크럽 — 방향이 반대인 두 처리의 공존이 계약.
    expect(out.prompt).toContain('A real photograph, not an illustration.')
    expect(out.prompt).not.toContain('photorealistic scene')
  })

  it('화풍 설명이 없으면 기존 장면 문구를 그대로 유지한다', () => {
    const out = applyStyleAnchor(BASE_ANCHOR, { prompt: 'scene', aspect_ratio: '1:1' }, 'single')
    expect(out.prompt).toBe(`${STYLE_ANCHOR_CLAUSE}\nscene`)
  })
})

describe('applyStyleAnchor — 수채화 A안과 미리보기 그림을 함께 반영한다', () => {
  const wc = {
    ...BASE_ANCHOR,
    usePreviewRef: true,
    previewUrl: 'https://a/preview.jpg',
    styleClause: 'Carry HOW the style references render scenes.',
  }

  it('미리보기 그림을 쓰면 기준 그림과 미리보기를 먼저 두고 인물 그림은 그다음에 따른다', () => {
    const out = applyStyleAnchor(wc, { prompt: 'p', reference_image_urls: ['c1'], aspect_ratio: '1:1' }, 'multiref')
    expect(out.reference_image_urls).toEqual(['https://a/board.png', 'https://a/preview.jpg', 'c1'])
    expect(out.prompt).toContain(STYLE_ANCHOR_2REF_CLAUSE)
    // 캐릭터 절이 "after the first two" — preview 를 캐릭터로 오인하는 사고(2ref-test §5.2) 방지.
    expect(out.prompt).toContain(STYLE_ANCHOR_2REF_MULTIREF_CLAUSE)
  })

  it('인물 방향표를 만들 때는 미리보기 그림을 추가하지 않는다', () => {
    const out = applyStyleAnchor(wc, { prompt: 'p' }, 'turnaround', { pinAspectRatio: '3:2' })
    expect(out.reference_image_urls).toEqual(['https://a/board.png'])
    expect(out.prompt).toContain(STYLE_ANCHOR_CLAUSE)
  })
})

describe('장면 격자와 묶음 — 화풍·조명·인물 그림의 우선순위를 지킨다', () => {
  const G = { characterRefCount: 0, hasStyleRef: true }

  it('장면 격자에 화풍 설명을 넣으면 기준 화풍 다음에 표시한다', () => {
    const p = buildRealGridPrompt(4, { ...G, styleClause: 'LOOK - big city blockbuster.' })
    expect(p).toContain('- LOOK - big city blockbuster.')
  })

  it('장면 조명을 정해도 기준 그림의 색감과 색상은 유지한다 (Rule 6)', () => {
    const p = buildRealGridPrompt(4, { ...G, sceneLighting: 'Night', anchorKeepsGrade: true })
    expect(p).toContain("KEEP the style reference's color grade and palette")
    expect(p).not.toContain('do NOT copy its time of day')
    // 씬 조명 줄에서도 그레이드 소유권 문구가 빠진다 — 시간대만 씬 소관.
    expect(p).toContain("Render that time of day's light in every panel")
  })

  it('장면 조명을 정하면 기준 그림의 시간대와 조명을 따라 하지 않는다 (F-006)', () => {
    const p = buildRealGridPrompt(4, { ...G, sceneLighting: 'Night' })
    expect(p).toContain('do NOT copy its time of day or lighting')
  })

  it('화풍 그림 두 장을 쓰면 두 장은 뒤에 두고 인물은 앞 그림과 화풍 그림 사이 기준을 따른다', () => {
    const p = buildRealStripPrompt('shot', { characterRefCount: 1, hasStyleRef: true, styleRefCount: 2 })
    expect(p).toContain('the LAST TWO reference images (style references)')
    expect(p).toContain('between the first and the last two')
    expect(p).toContain('their subjects')
  })

  it('장면 조명을 정해도 기준 그림의 색감과 색상을 유지한다', () => {
    const p = buildRealStripPrompt('shot', {
      characterRefCount: 0,
      hasStyleRef: true,
      sceneLighting: 'Day',
      anchorKeepsGrade: true,
      styleClause: 'Grade the whole image in this look.',
    })
    expect(p).toContain("KEEP the style reference's color grade and palette")
    expect(p).toContain('- Grade the whole image in this look.')
  })
})
