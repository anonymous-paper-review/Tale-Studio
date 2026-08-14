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

describe('applyStyleAnchor — 검증 절 주입', () => {
  it('styleClause 가 있으면 앵커 절 다음 줄에 실린다 (스크럽 대상 아님 — 매체어 포함 가능)', () => {
    const out = applyStyleAnchor(
      { ...BASE_ANCHOR, styleClause: 'A real photograph, not an illustration.' },
      { prompt: 'photorealistic scene of a cafe', aspect_ratio: '1:1' },
      'single',
    )
    // 절의 매체어는 보존, 본문 산문의 매체어는 스크럽 — 방향이 반대인 두 처리의 공존이 계약.
    expect(out.prompt).toContain('A real photograph, not an illustration.')
    expect(out.prompt).not.toContain('photorealistic scene')
  })

  it('styleClause 미설정(역사극·공포 NULL)이면 종전 프롬프트 그대로 — 하위 호환', () => {
    const out = applyStyleAnchor(BASE_ANCHOR, { prompt: 'scene', aspect_ratio: '1:1' }, 'single')
    expect(out.prompt).toBe(`${STYLE_ANCHOR_CLAUSE}\nscene`)
  })
})

describe('applyStyleAnchor — watercolor A안 (preview 2번 스타일 레퍼런스)', () => {
  const wc = {
    ...BASE_ANCHOR,
    usePreviewRef: true,
    previewUrl: 'https://a/preview.jpg',
    styleClause: 'Carry HOW the style references render scenes.',
  }

  it('refs 가 [앵커, preview, ...기존] 이 되고 절이 FIRST TWO 로 바뀐다', () => {
    const out = applyStyleAnchor(wc, { prompt: 'p', reference_image_urls: ['c1'], aspect_ratio: '1:1' }, 'multiref')
    expect(out.reference_image_urls).toEqual(['https://a/board.png', 'https://a/preview.jpg', 'c1'])
    expect(out.prompt).toContain(STYLE_ANCHOR_2REF_CLAUSE)
    // 캐릭터 절이 "after the first two" — preview 를 캐릭터로 오인하는 사고(2ref-test §5.2) 방지.
    expect(out.prompt).toContain(STYLE_ANCHOR_2REF_MULTIREF_CLAUSE)
  })

  it('turnaround 는 2번 슬롯이 레이아웃 템플릿 계약이라 preview 를 넣지 않는다', () => {
    const out = applyStyleAnchor(wc, { prompt: 'p' }, 'turnaround', { pinAspectRatio: '3:2' })
    expect(out.reference_image_urls).toEqual(['https://a/board.png'])
    expect(out.prompt).toContain(STYLE_ANCHOR_CLAUSE)
  })
})

describe('그리드/스트립 — 절 주입·서브룩 그레이드 권위·2-ref 위치 문구', () => {
  const G = { characterRefCount: 0, hasStyleRef: true }

  it('그리드: styleClause 가 앵커 절 다음 항목으로 실린다', () => {
    const p = buildRealGridPrompt(4, { ...G, styleClause: 'LOOK - big city blockbuster.' })
    expect(p).toContain('- LOOK - big city blockbuster.')
  })

  it('그리드: 서브룩(anchorKeepsGrade)은 씬 조명이 있어도 그레이드·팔레트를 앵커에 남긴다 (Rule 6)', () => {
    const p = buildRealGridPrompt(4, { ...G, sceneLighting: 'Night', anchorKeepsGrade: true })
    expect(p).toContain("KEEP the style reference's color grade and palette")
    expect(p).not.toContain('do NOT copy its time of day')
    // 씬 조명 줄에서도 그레이드 소유권 문구가 빠진다 — 시간대만 씬 소관.
    expect(p).toContain("Render that time of day's light in every panel")
  })

  it('그리드: 매체 앵커는 종전 권위 이관 유지 (F-006 그대로)', () => {
    const p = buildRealGridPrompt(4, { ...G, sceneLighting: 'Night' })
    expect(p).toContain('do NOT copy its time of day or lighting')
  })

  it('스트립: styleRefCount=2 면 LAST TWO + 캐릭터 구간 "between the first and the last two"', () => {
    const p = buildRealStripPrompt('shot', { characterRefCount: 1, hasStyleRef: true, styleRefCount: 2 })
    expect(p).toContain('the LAST TWO reference images (style references)')
    expect(p).toContain('between the first and the last two')
    expect(p).toContain('their subjects')
  })

  it('스트립: 서브룩 + 씬 조명 — 그레이드 유지 분기', () => {
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
