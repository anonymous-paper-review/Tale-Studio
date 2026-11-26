// 저장 단계가 아직 콘티인데 Artist 화면에서 [이미지 만들기]를 누르면 저장 단계를 Artist 로 올린 뒤 그리는지 검사한다 (검토 rev-flow 2026-11-26 2번)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  project: null as null | { id: string; workspace_id: string; current_stage: string | null; style_anchor_key: string | null; custom_style_anchor: unknown; design_tokens: unknown },
  /** 저장된 단계 쓰기 — [바꿀 값, 거른 조건]. */
  stageWrites: [] as Array<{ patch: Record<string, unknown>; filters: Record<string, unknown> }>,
  /** 일어난 순서 — 단계 쓰기(stage) · 첫 그림 걸기(draw). */
  order: [] as string[],
  drafts: vi.fn(async () => ({ characters: { submitted: 1, skipped: 0, failed: 0 }, worlds: { submitted: 1, skipped: 0, failed: 0 } })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== 'projects') throw new Error(`이 시험은 projects 단계만 쓴다: ${table}`)
      return {
        update: (patch: Record<string, unknown>) => {
          const filters: Record<string, unknown> = {}
          const query = {
            eq: (key: string, value: unknown) => { filters[key] = value; return query },
            then: (resolve: (value: { error: null }) => unknown) => {
              mocks.stageWrites.push({ patch, filters })
              mocks.order.push('stage')
              return Promise.resolve({ error: null }).then(resolve)
            },
          }
          return query
        },
      }
    },
  },
}))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: async (_req: Request, projectId: string | undefined) =>
    projectId ? { ok: true, projectId, userId: 'u1', viaShare: false } : { ok: false, response: new Response(null, { status: 400 }) },
}))
vi.mock('@/lib/generation-quota', () => ({ checkGenerationCapacity: async () => ({ ok: true }) }))
vi.mock('@/lib/artist/draft-trigger', () => ({ triggerAssetDrafts: mocks.drafts }))
vi.mock('@/lib/artist/images-started', () => ({ artistImagesStarted: async () => false }))
vi.mock('@/lib/artist/make-images', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/artist/make-images')>()),
  freshQueuedDraftJobCount: async () => 0,
}))
vi.mock('@/lib/artist/style-versions-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/artist/style-versions-server')>()),
  readVersionProject: async () => mocks.project,
  artistStyleLocked: async () => false,
  setProjectStyle: vi.fn(async () => {}),
}))

import { POST } from '@/app/api/artist/make-images/route'

const post = (body: unknown) => POST(new Request('http://test/api/artist/make-images', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  mocks.project = { id: 'p1', workspace_id: 'w1', current_stage: 'conti', style_anchor_key: 'anime', custom_style_anchor: null, design_tokens: { l1: { medium: 'anime' } } }
  mocks.stageWrites = []
  mocks.order = []
  mocks.drafts.mockClear()
  mocks.drafts.mockImplementation(async () => {
    mocks.order.push('draw')
    return { characters: { submitted: 1, skipped: 0, failed: 0 }, worlds: { submitted: 1, skipped: 0, failed: 0 } }
  })
})

describe('콘티 저장 단계의 [이미지 만들기]', () => {
  // 왜: 화면만 앞서 Artist 가 열린 콘티 프로젝트에서 [이미지 만들기]를 누르면 첫 그림 걸기가 저장 단계(콘티)를 보고 미뤄,
  //   아무것도 그리지 않은 채 됐다고 했다(검토 rev-flow 2번). Artist 에서 그림을 만드는 일이 곧 Artist 단계다.
  it('저장 단계가 아직 콘티인데 Artist 에서 [이미지 만들기]를 누르면 저장 단계를 Artist 로 올린 뒤 그린다', async () => {
    const res = await post({ projectId: 'p1', styleAnchorKey: 'anime' })
    expect(res.status).toBe(200)
    expect(mocks.stageWrites).toEqual([{ patch: { current_stage: 'artist' }, filters: { id: 'p1', current_stage: 'conti' } }])
    expect(mocks.drafts).toHaveBeenCalledWith('p1')
    expect(mocks.order).toEqual(['stage', 'draw'])
  })

  // 왜: 정상 경로 고정 — [Artist로 가기]로 저장 단계가 이미 Artist 면 단계는 건드리지 않고 그리기만 한다.
  it('저장 단계가 이미 Artist 면 [이미지 만들기]는 단계를 건드리지 않고 그리기만 한다', async () => {
    mocks.project = { ...mocks.project!, current_stage: 'artist' }
    const res = await post({ projectId: 'p1', styleAnchorKey: 'anime' })
    expect(res.status).toBe(200)
    expect(mocks.stageWrites).toEqual([])
    expect(mocks.drafts).toHaveBeenCalledWith('p1')
  })
})
