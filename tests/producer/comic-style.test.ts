// 만화 그림체를 분석기(경량 facet)로 조각 네 개로 만들어, 동의가 있을 때만 이 프로젝트 그림체에 싣는다 (2026-10-09 오너)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  extractLiteFacets: vi.fn(),
  project: { custom_style_anchor: null as unknown },
  reread: null as unknown,
  updates: [] as unknown[],
  reads: 0,
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/style-facets/lite-llm', () => ({ extractLiteFacets: mocks.extractLiteFacets }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          // 첫 읽기 = 분석 전 앵커, 두 번째 읽기 = 저장 직전 다시 읽은 앵커(바뀌었으면 mocks.reread).
          maybeSingle: async () => {
            mocks.reads++
            const row = mocks.reads >= 2 && mocks.reread !== null ? { custom_style_anchor: mocks.reread } : mocks.project
            return { data: row, error: null }
          },
        }),
      }),
      update: (patch: unknown) => ({
        eq: async () => {
          mocks.updates.push(patch)
          return { error: null }
        },
      }),
    }),
  },
}))

import {
  LITE_FACET_VERSION,
  checkLiteCompile,
  countFilledLeaves,
  liteFacetsFromCompile,
} from '@/lib/style-facets/lite'
import { LITE_GUIDE_COMPILE, LITE_GUIDE_FILL, LITE_TEMPLATE } from '@/lib/style-facets/lite-assets.generated'
import { LITE_SOURCES, buildLiteAssets } from '../../scripts/facet-lite-assets.mjs'
import { POST } from '@/app/api/produce/style-facets/route'
import { mediaPublicUrl } from '@/lib/storage/media-url'

const MEDIA = mediaPublicUrl('ws-1/proj-1/uploads/p1/original.webp')
const post = (body: unknown) => new Request('http://test/api/produce/style-facets', { method: 'POST', body: JSON.stringify(body) })

function compileText(over: Partial<Record<'PROBE_ANCHORS' | 'FIGURE' | 'PRIORITY' | 'NEGATIVE' | 'SCENE', string>> = {}) {
  const parts = {
    PROBE_ANCHORS: 'Black ink line art with even mid-weight outlines; flat white fills; screentone dots for shadow.',
    FIGURE: 'Figures have large round eyes with one highlight and simple noses.',
    PRIORITY: 'Priority order: ink outlines → flat white fills → screentone shadow.',
    NEGATIVE: 'Avoid color, painterly shading, photographic texture.',
    SCENE: 'Two people at a desk in a small room.',
    ...over,
  }
  return Object.entries(parts).map(([k, v]) => `## ${k}\n${v}`).join('\n\n')
}

describe('그림체 분석 자료', () => {
  it('제품에 실은 그림체 분석 서식과 규칙은 facet 프로그램의 정본과 같다', () => {
    // 왜: 서식(주석이 곧 작성법)과 규칙이 정본과 어긋나면 분석 결과가 인계 실측과 달라진다. 정본이 바뀌면 생성 스크립트를 다시 돌린다.
    const built = buildLiteAssets({
      template: readFileSync(LITE_SOURCES.template, 'utf8'),
      guide: readFileSync(LITE_SOURCES.guide, 'utf8'),
    })
    expect(LITE_TEMPLATE).toBe(built.template)
    expect(LITE_GUIDE_FILL).toBe(built.fill)
    expect(LITE_GUIDE_COMPILE).toBe(built.compile)
    expect(LITE_GUIDE_FILL).toMatch(/^## 1\./)
    expect(LITE_GUIDE_COMPILE).toMatch(/^## 2\./)
  })
})

describe('그림체 분석 결과 확인', () => {
  it('그림체 분석은 서식 96칸을 채운 뒤 조각 네 개(Style anchors · Figure rules · Priority · Avoid)로 옮긴다', () => {
    // 왜: 인계 lite 계약 — 이 네 조각이 생성 프롬프트에 실린다(조립은 10/8 이식 그대로).
    const leaves = Object.fromEntries(Array.from({ length: 96 }, (_, i) => [`k${i}`, '[실측] 값']))
    expect(countFilledLeaves({ a: leaves })).toEqual({ leaves: 96, tagged: 96 })
    const facets = liteFacetsFromCompile(compileText(), { model: 'm', extractedAt: '2026-10-09T00:00:00.000Z' })
    expect(facets).toMatchObject({
      version: LITE_FACET_VERSION,
      probe_anchors: expect.stringContaining('ink line art'),
      figure: expect.stringContaining('round eyes'),
      figure_extrapolated: false,
      priority: expect.stringMatching(/^Priority order:/),
      negative: expect.stringMatching(/^Avoid /),
    })
  })

  it('조각이 비거나 형식이 틀리면 받지 않는다', () => {
    // 왜: 빈 캡슐로 생성까지 간 사고(사이클 11) — 헤더 · 앞말 · 단어 상한을 기계로 본다.
    expect(checkLiteCompile(compileText()).ok).toBe(true)
    expect(checkLiteCompile(compileText({ PRIORITY: 'ink first' })).ok).toBe(false)
    expect(checkLiteCompile(compileText({ NEGATIVE: 'No color.' })).ok).toBe(false)
    expect(checkLiteCompile(compileText({ PROBE_ANCHORS: '' })).ok).toBe(false)
    expect(checkLiteCompile(compileText({ PROBE_ANCHORS: Array.from({ length: 130 }, () => 'word').join(' ') })).ok).toBe(false)
    expect(checkLiteCompile('## PROBE_ANCHORS\nx').ok).toBe(false)
  })

  it('Figure 조각은 단어 상한을 넘어도 자르지 않고 싣는다', () => {
    // 왜: 인물이 큰 그림은 Figure 가 길어진다(사이클 11 C: 174~205단어) — 자르면 문장이 깨진다.
    const long = Array.from({ length: 200 }, () => 'detail').join(' ')
    expect(checkLiteCompile(compileText({ FIGURE: long })).ok).toBe(true)
    expect(liteFacetsFromCompile(compileText({ FIGURE: long }), { model: 'm', extractedAt: 'now' })?.figure?.split(' ')).toHaveLength(200)
  })

  it('그림에 인물 표본이 없으면 Figure 조각을 싣지 않는다', () => {
    // 왜: 외삽한 인물 절은 근거가 약하다(인계 §6) — 빼는 쪽을 권했다.
    const facets = liteFacetsFromCompile(compileText({ FIGURE: '[EXTRAPOLATED] Apply the observed line grammar.' }), { model: 'm', extractedAt: 'now' })
    expect(facets?.figure).toBeNull()
    expect(facets?.figure_extrapolated).toBe(true)
  })
})

describe('그림체 분석 창구', () => {
  beforeEach(() => {
    mocks.getUser.mockReset().mockResolvedValue({ id: 'user-1' })
    mocks.userOwnsProject.mockReset().mockResolvedValue(true)
    mocks.extractLiteFacets.mockReset()
    mocks.project = { custom_style_anchor: { url: MEDIA, label: '만화 그림체', medium: null } }
    mocks.reread = null
    mocks.updates = []
    mocks.reads = 0
  })

  it('분석 결과는 이 프로젝트 그림체에 동의 기록과 함께 저장한다', async () => {
    const facets = liteFacetsFromCompile(compileText(), { model: 'm', extractedAt: 'now' })
    mocks.extractLiteFacets.mockResolvedValueOnce({ facets, attempts: [] })
    const res = await POST(post({ projectId: 'proj-1', consent: 'comic-choice-v1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, facets: true, figure: true })
    expect(mocks.extractLiteFacets).toHaveBeenCalledWith(MEDIA)
    expect(mocks.updates[0]).toMatchObject({
      custom_style_anchor: {
        url: MEDIA,
        facets: { version: LITE_FACET_VERSION, probe_anchors: facets!.probe_anchors },
        analysis_consent: { wording: 'comic-choice-v1', at: expect.any(String) },
      },
    })
  })

  it('분석 동의 표시가 없으면 그림을 분석 모델에 보내지 않는다', async () => {
    // 왜: 인계 같이 정한 것 — 유저가 올린 이미지는 분석 동의가 있을 때만 facet 추출 모델에 보낸다.
    expect((await POST(post({ projectId: 'proj-1' }))).status).toBe(400)
    expect(mocks.extractLiteFacets).not.toHaveBeenCalled()
  })

  it('분석이 실패하면 저장하지 않고 그림만 그림체로 남긴다', async () => {
    mocks.extractLiteFacets.mockResolvedValueOnce({ facets: null, attempts: [] })
    const res = await POST(post({ projectId: 'proj-1', consent: 'comic-choice-v1' }))
    expect(await res.json()).toMatchObject({ ok: false, facets: false })
    expect(mocks.updates).toHaveLength(0)
  })

  it('분석하는 동안 그림체를 다른 것으로 바꿨으면 결과를 저장하지 않는다', async () => {
    // 왜: 1~2분 사이에 유저가 프리셋을 고르면, 늦게 끝난 분석이 그 선택을 덮으면 안 된다.
    const facets = liteFacetsFromCompile(compileText(), { model: 'm', extractedAt: 'now' })
    mocks.extractLiteFacets.mockResolvedValueOnce({ facets, attempts: [] })
    mocks.reread = { url: mediaPublicUrl('ws-1/proj-1/uploads/other/original.png') }
    const res = await POST(post({ projectId: 'proj-1', consent: 'comic-choice-v1' }))
    expect(await res.json()).toMatchObject({ ok: false, reason: 'anchor_changed' })
    expect(mocks.updates).toHaveLength(0)
  })

  it('사용자 그림체가 없거나 로그인 · 내 프로젝트가 아니면 분석하지 않는다', async () => {
    mocks.project = { custom_style_anchor: null }
    expect((await POST(post({ projectId: 'proj-1', consent: 'comic-choice-v1' }))).status).toBe(409)
    mocks.getUser.mockResolvedValueOnce(null)
    expect((await POST(post({ projectId: 'proj-1', consent: 'comic-choice-v1' }))).status).toBe(401)
    mocks.userOwnsProject.mockResolvedValueOnce(false)
    expect((await POST(post({ projectId: 'proj-1', consent: 'comic-choice-v1' }))).status).toBe(403)
    expect(mocks.extractLiteFacets).not.toHaveBeenCalled()
  })
})
