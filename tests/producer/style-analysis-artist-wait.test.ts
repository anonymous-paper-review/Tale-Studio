// 그림체 등록 · 분석 창구가 닫혀(D6 2026-11-22) 분석 대기 표시를 새로 남기지 않고, 예전 대기 표시는 5분이 지나면 Artist 그림을 막지 않는다 (오너 2026-10-10)
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
// 분석기는 2026-10-10 오너 결정으로 고성능 판(309칸, hp-llm)으로 바뀌었다 — 이 파일은 라우트가 분석기 결과를 다루는 법만 본다.
vi.mock('@/lib/style-facets/hp-llm', () => ({ extractHpFacets: mocks.extractLiteFacets }))
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
import { styleAnalysisPending } from '@/lib/style-facets/analysis-wait'
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
  it('그림체 등록 창구가 닫혀 분석 대기 표시를 새로 남기지 않는다', async () => {
    // 왜: 오너 "웹툰이나 이미지 입력받았을 때 스타일 추출하는 기능도 없애줘"(D6) — 그림을 그림체로 고정하는 일이 없으니 기다릴 분석도 없다.
    mocks.project = { custom_style_anchor: null }
    const res = await saveStyle(post('http://test/api/produce/style-anchor', { projectId: 'proj-1', imageUrl: MEDIA, label: '내 그림체', medium: '2d_anime', lock: true }))
    expect(res.status).toBe(410)
    expect(mocks.updates).toHaveLength(0)
  })

  it('닫힌 그림체 분석 창구는 그림체 설명을 저장하지 않고 미뤄 둔 Artist 그림 그리기도 부르지 않는다', async () => {
    // 왜: 분석 창구가 닫혀 분석 결과가 없다(D6). 예전 대기 표시가 남은 작품은 표시가 5분을 넘기면 Artist 가 스스로 그린다(아래 시험).
    mocks.extractLiteFacets.mockResolvedValueOnce({ facets: FACETS, attempts: [] })
    const res = await analyzeStyle(post('http://test/api/produce/style-facets', { projectId: 'proj-1', consent: 'style-picker-v1' }))
    expect(res.status).toBe(410)
    expect(mocks.events).toEqual([])
    expect(mocks.extractLiteFacets).not.toHaveBeenCalled()
    expect(mocks.triggerAssetDrafts).not.toHaveBeenCalled()
  })

  it('예전 분석 대기 표시가 남은 작품도 그 표시가 5분을 넘으면 Artist 그림을 막지 않는다', () => {
    // 왜: 배포 때 분석을 기다리던 작품은 끝을 알려 줄 분석 창구가 없다 — 오래된 표시는 멈춘 분석으로 보고 막지 않는다(종전 규칙 그대로, 정상 경로 고정).
    const now = Date.parse('2026-11-22T12:00:00.000Z')
    expect(styleAnalysisPending({ url: MEDIA, analysis_pending_at: '2026-11-22T11:50:00.000Z' }, now)).toBe(false)
    expect(styleAnalysisPending({ url: MEDIA, analysis_pending_at: '2026-11-22T11:58:00.000Z' }, now)).toBe(true)
  })
})
