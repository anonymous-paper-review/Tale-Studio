// 그림체를 고정하면 분석 대기 표시를 남기고, 분석이 끝나면(실패해도) 미뤄 둔 Artist 그림을 그리게 한다 (오너 2026-10-10)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  extractLiteFacets: vi.fn(),
  triggerAssetDrafts: vi.fn(),
  project: { custom_style_anchor: null as unknown },
  reread: null as unknown,
  reads: 0,
  updates: [] as Array<Record<string, unknown>>,
  events: [] as string[],
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/style-facets/lite-llm', () => ({ extractLiteFacets: mocks.extractLiteFacets }))
vi.mock('@/lib/artist/draft-trigger', () => ({ triggerAssetDrafts: mocks.triggerAssetDrafts }))
vi.mock('@/lib/style-anchor', () => ({ listStyleAnchorMediums: async () => ['2d_anime', 'live_action'] }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            mocks.reads++
            const row = mocks.reads >= 2 && mocks.reread !== null ? { custom_style_anchor: mocks.reread } : mocks.project
            return { data: row, error: null }
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          mocks.updates.push(patch)
          mocks.events.push('save')
          return { error: null }
        },
      }),
    }),
  },
}))

import { POST as analyzeStyle } from '@/app/api/produce/style-facets/route'
import { POST as saveStyle } from '@/app/api/produce/style-anchor/route'
import { liteFacetsFromCompile } from '@/lib/style-facets/lite'
import { mediaPublicUrl } from '@/lib/storage/media-url'

const MEDIA = mediaPublicUrl('ws-1/proj-1/uploads/look/original.webp')
const post = (url: string, body: unknown) => new Request(url, { method: 'POST', body: JSON.stringify(body) })
const COMPILE = ['## PROBE_ANCHORS\nClean digital line art with flat cel fills.', '## FIGURE\nFigures have large round eyes.', '## PRIORITY\nPriority order: line art → flat fills.', '## NEGATIVE\nAvoid painterly texture.', '## SCENE\nA classroom.'].join('\n\n')
const FACETS = liteFacetsFromCompile(COMPILE, { model: 'm', extractedAt: 'now' })

beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockReset().mockResolvedValue(true)
  mocks.extractLiteFacets.mockReset()
  mocks.triggerAssetDrafts.mockReset().mockImplementation(async () => {
    mocks.events.push('artist')
  })
  mocks.project = { custom_style_anchor: { url: MEDIA, label: '내 그림체', medium: '2d_anime', locked: true, analysis_pending_at: new Date().toISOString() } }
  mocks.reread = null
  mocks.reads = 0
  mocks.updates = []
  mocks.events = []
})

describe('그림체 분석과 Artist 그림', () => {
  it('그림을 그림체로 고정하면 분석 대기 표시를 함께 남긴다', async () => {
    // 왜: 고정한 그림체는 곧 분석기가 돈다 — Writer 가 그 사이에 Artist 그림을 시작하면 이 표시를 보고 미룬다.
    mocks.project = { custom_style_anchor: null }
    const res = await saveStyle(post('http://test/api/produce/style-anchor', { projectId: 'proj-1', imageUrl: MEDIA, label: '내 그림체', medium: '2d_anime', lock: true }))
    expect(res.status).toBe(200)
    expect(mocks.updates[0].custom_style_anchor).toMatchObject({ url: MEDIA, locked: true, analysis_pending_at: expect.any(String) })
  })

  it('그림체 분석이 끝나면 분석 대기 표시를 지우고 미뤄 둔 Artist 그림을 그림체 설명과 함께 그린다', async () => {
    // 왜: 10/10 오너 "분석이 진행 중에는 artist 생성이 안 되게 막아두고 끝나면 진행". 그리는 것은 분석 결과를 저장한 다음이다.
    mocks.extractLiteFacets.mockResolvedValueOnce({ facets: FACETS, attempts: [] })
    const res = await analyzeStyle(post('http://test/api/produce/style-facets', { projectId: 'proj-1', consent: 'style-picker-v1' }))
    expect(await res.json()).toMatchObject({ ok: true, facets: true })
    expect(mocks.events).toEqual(['save', 'artist'])
    expect(mocks.updates[0].custom_style_anchor).toMatchObject({ url: MEDIA, facets: { probe_anchors: FACETS!.probe_anchors } })
    expect(mocks.updates[0].custom_style_anchor).not.toHaveProperty('analysis_pending_at')
    expect(mocks.triggerAssetDrafts).toHaveBeenCalledWith('proj-1', { afterStyleAnalysis: true })
  })

  it('그림체 분석이 실패해도 미뤄 둔 Artist 그림은 그린다(그림만 참고)', async () => {
    // 왜: 분석이 실패하면 그림체는 그림만으로 이어진다(종전 규칙) — 그림을 끝없이 미루면 안 된다.
    mocks.extractLiteFacets.mockResolvedValueOnce({ facets: null, attempts: [] })
    await analyzeStyle(post('http://test/api/produce/style-facets', { projectId: 'proj-1', consent: 'style-picker-v1' }))
    expect(mocks.events).toEqual(['artist'])
    expect(mocks.triggerAssetDrafts).toHaveBeenCalledWith('proj-1', { afterStyleAnalysis: true })
  })

  it('분석하는 동안 그림체가 바뀌었으면 미뤄 둔 그림을 그리지 않는다', async () => {
    // 왜: 새 그림체에는 새 분석이 돈다 — 그 분석이 끝날 때 그린다.
    mocks.extractLiteFacets.mockResolvedValueOnce({ facets: FACETS, attempts: [] })
    mocks.reread = { url: mediaPublicUrl('ws-1/proj-1/uploads/other/original.png'), analysis_pending_at: new Date().toISOString() }
    await analyzeStyle(post('http://test/api/produce/style-facets', { projectId: 'proj-1', consent: 'style-picker-v1' }))
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })
})
