// 사용자 그림체 분석의 그림체 핵심 · 우선순위에서 카메라 각도는 그림 프롬프트에 싣지 않는다 (오너 2026-10-10)
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ presetFacets: null as unknown }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { key: 'iso', image_url: 'https://anchor/iso.png', is_active: true, medium: '2d_animation', style_clause: null, use_preview_ref: false, preview_url: null, anchor_kind: 'media', facets: mocks.presetFacets },
            error: null,
          }),
        }),
      }),
    }),
  },
}))

import { resolveStyleAnchor } from '@/lib/style-anchor'

// 10/10 운영 806e2cc2 분석 결과의 앞부분 그대로.
const PROBE = "High bird's-eye linear perspective. Digital color line art with flat cel fills, soft blending only on hair ends, distant windows and part of the floor. Medium-weight #3d3238 outlines, two line tiers, medium inner lines."
const PRIORITY = 'Priority order: high-angle perspective → dark colored outlines → high-key cel shading → restrained palette → round chubby forms.'
const FIGURE = 'Anime-dialect faces with big round eyes.'
const NEGATIVE = 'Avoid 3D chibi render, western cartoon.'
const project = (facets: Record<string, unknown>) => ({
  style_anchor_key: 'custom_1',
  custom_style_anchor: { url: 'https://example.supabase.co/storage/v1/object/public/media/ws/p/uploads/look/original.webp', label: '내 그림체', medium: '2d_anime', locked: true, facets },
})

describe('사용자 그림체 분석의 카메라 각도', () => {
  it('사용자 그림체 분석의 그림체 핵심과 우선순위에서 카메라 각도는 그림 프롬프트에 싣지 않는다', async () => {
    // 왜: 10/10 운영 806e2cc2 — 기준 그림의 높은 부감이 그림체 핵심 첫 문장 · 우선순위 1번으로 들어가 정면 인물 시트와 배경에도 실렸다.
    const anchor = await resolveStyleAnchor(project({ probe_anchors: PROBE, priority: PRIORITY, figure: FIGURE, negative: NEGATIVE }))
    expect(anchor?.facets?.probeAnchors).toBe('Digital color line art with flat cel fills, soft blending only on hair ends, distant windows and part of the floor. Medium-weight #3d3238 outlines, two line tiers, medium inner lines.')
    expect(anchor?.facets?.priority).toBe('Priority order: dark colored outlines → high-key cel shading → restrained palette → round chubby forms.')
  })

  it('카메라 각도가 아닌 문장과 인물 규칙 · 피할 것은 그대로 싣고, 저장된 분석 결과는 바꾸지 않는다', async () => {
    // 정상 경로 고정 — 빼는 것은 그림에 실을 때뿐이다. 분석 원문은 기록으로 남는다.
    const facets = { probe_anchors: PROBE, priority: PRIORITY, figure: FIGURE, negative: NEGATIVE }
    const anchor = await resolveStyleAnchor(project(facets))
    expect(anchor?.facets?.figure).toBe(FIGURE)
    expect(anchor?.facets?.negative).toBe(NEGATIVE)
    expect(facets.probe_anchors).toBe(PROBE)
    expect(facets.priority).toBe(PRIORITY)
  })

  it('아이소메트릭처럼 투영 방식 자체가 그림체인 문장은 남긴다', async () => {
    // 왜: 아이소메트릭 일러스트는 투영이 곧 그림체다 — 카메라 각도만 따로 고른 것이 아니다.
    const probe = 'Isometric parallel projection from a high 3/4 view. Thin blue-gray outlines.'
    const anchor = await resolveStyleAnchor(project({ probe_anchors: probe, priority: 'Priority order: isometric projection → thin outlines.' }))
    expect(anchor?.facets?.probeAnchors).toBe(probe)
    expect(anchor?.facets?.priority).toBe('Priority order: isometric projection → thin outlines.')
  })

  it('프리셋 그림체의 분석 조각은 손대지 않는다', async () => {
    // 왜: 프리셋 조각은 오너가 사이클마다 골라 다듬은 것이다 — 이번 규칙은 사용자 그림 분석에만 쓴다.
    mocks.presetFacets = { probe_anchors: PROBE, priority: PRIORITY }
    const anchor = await resolveStyleAnchor({ style_anchor_key: 'iso', custom_style_anchor: null })
    expect(anchor?.facets?.probeAnchors).toBe(PROBE)
    expect(anchor?.facets?.priority).toBe(PRIORITY)
  })
})
