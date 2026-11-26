// Artist 새 흐름의 [이미지 만들기] 창구 — 그림체를 바꿨으면 작품 그림체와 그림 지시의 그림체 값을 저장한 뒤 인물 · 배경 · 소품 그림만 그리고, 그림을 그리기 시작한 뒤에는 그림체를 바꾸지 않는다 (m1126 O1 · O6)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  project: null as null | { id: string; workspace_id: string; current_stage: string | null; style_anchor_key: string | null; custom_style_anchor: unknown; design_tokens: unknown },
  started: false as boolean | null,
  locked: false,
  queued: 0,
  catalog: { real: 'live_action', watercolor: 'watercolor' } as Record<string, string>,
  quotaOk: true,
  setProjectStyle: vi.fn(async () => {}),
  drafts: vi.fn(async () => ({ characters: { submitted: 2, skipped: 0, failed: 0 }, worlds: { submitted: 1, skipped: 0, failed: 0 }, props: { submitted: 1, skipped: 0, failed: 0 } })),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: () => { throw new Error('이 시험은 DB 를 직접 읽지 않는다') } } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: async (_req: Request, projectId: string | undefined) =>
    projectId ? { ok: true, projectId, userId: 'u1', viaShare: false } : { ok: false, response: new Response(null, { status: 400 }) },
}))
vi.mock('@/lib/generation-quota', () => ({ checkGenerationCapacity: async () => (mocks.quotaOk ? { ok: true } : { ok: false, scope: 'user' }) }))
vi.mock('@/lib/api/quota', async () => {
  const { NextResponse } = await import('next/server')
  return { quotaRejectionResponse: () => NextResponse.json({ error: 'quota', code: 'quota_exceeded' }, { status: 429 }) }
})
vi.mock('@/lib/artist/draft-trigger', () => ({ triggerAssetDrafts: mocks.drafts }))
vi.mock('@/lib/artist/images-started', () => ({ artistImagesStarted: async () => mocks.started }))
vi.mock('@/lib/artist/make-images', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/artist/make-images')>()),
  freshQueuedDraftJobCount: async () => mocks.queued,
  activeCatalogStyle: async (key: string) => (mocks.catalog[key] ? { key, medium: mocks.catalog[key] } : null),
}))
vi.mock('@/lib/artist/style-versions-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/artist/style-versions-server')>()),
  readVersionProject: async () => mocks.project,
  artistStyleLocked: async () => mocks.locked,
  setProjectStyle: mocks.setProjectStyle,
}))

import { POST } from '@/app/api/artist/make-images/route'
import { styleLookTokens } from '@/lib/artist/style-versions'

const TOKENS = { l1: { medium: 'anime', line: 'clean cel lines', texture: 'flat cel' }, l2: { palette: 'warm' } }
const post = (body: unknown) => POST(new Request('http://test/api/artist/make-images', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  mocks.project = { id: 'p1', workspace_id: 'w1', current_stage: 'artist', style_anchor_key: 'anime', custom_style_anchor: null, design_tokens: TOKENS }
  mocks.started = false
  mocks.locked = false
  mocks.queued = 0
  mocks.quotaOk = true
  mocks.setProjectStyle.mockClear()
  mocks.drafts.mockClear()
})

describe('같이 정한 것', () => {
  // 왜: O6 — 산문 확정 때 고른 그림체를 Artist 에서 바꿀 수 있다. 그림 지시의 그림체 값(매체 · 선 · 질감)도 새 그림체 것으로 — 옛 값이 남으면 새 그림체로 그려도 옛 그림체로 나온다([재생성하기]와 같은 규칙).
  it('[이미지 만들기] 창에서 그림체를 바꾸면 작품 그림체와 그림 지시의 그림체 값을 새 그림체 것으로 저장한 뒤 그린다', async () => {
    const res = await post({ projectId: 'p1', styleAnchorKey: 'real' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, style: 'real' })
    expect(mocks.setProjectStyle).toHaveBeenCalledWith('p1', 'real', null, { ...TOKENS, l1: styleLookTokens('live_action', TOKENS.l1) })
    expect(mocks.drafts).toHaveBeenCalledWith('p1')
    expect(mocks.setProjectStyle.mock.invocationCallOrder[0]).toBeLessThan(mocks.drafts.mock.invocationCallOrder[0])
  })

  // 왜: O1 "Artist [만들기]는 그림만" — 서버 첫 그림(인물 · 배경 · 소품, 그림이 없는 칸만)만 건다. 그림체를 그대로 두면 저장하지 않는다.
  it('[이미지 만들기]는 인물 · 배경 · 소품 첫 그림만 그리고 그림체를 그대로 두면 그림체는 저장하지 않는다', async () => {
    const res = await post({ projectId: 'p1', styleAnchorKey: 'anime' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, style: null, props: { submitted: 1 } })
    expect(mocks.setProjectStyle).not.toHaveBeenCalled()
    expect(mocks.drafts).toHaveBeenCalledTimes(1)
  })
})

describe('혼자 정한 것', () => {
  // 왜: 그린 뒤의 그림체 바꾸기는 [재생성하기] — 지금 그림을 버전 기록에 남기는 길이다. 이 창구로 바꾸면 그린 그림이 기록 없이 다른 그림체와 섞인다.
  it('그림을 그리기 시작한 뒤에는 [이미지 만들기]로 그림체를 바꾸지 않는다', async () => {
    mocks.started = true
    const res = await post({ projectId: 'p1', styleAnchorKey: 'real' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'images_started' })
    expect(mocks.setProjectStyle).not.toHaveBeenCalled()
    expect(mocks.drafts).not.toHaveBeenCalled()
  })

  // 왜: 지금 규칙 — Storyboard 를 연 뒤에는 그림체를 바꿀 수 없다(artistStyleLocked, [재생성하기]와 같다).
  it('Storyboard 를 연 뒤에는 [이미지 만들기]로 그림체를 바꾸지 않는다', async () => {
    mocks.locked = true
    const res = await post({ projectId: 'p1', styleAnchorKey: 'real' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'completed' })
    expect(mocks.setProjectStyle).not.toHaveBeenCalled()
    expect(mocks.drafts).not.toHaveBeenCalled()
  })

  // 왜: 다른 창에서 먼저 눌러 그리는 중이면 같은 그림을 두 번 그리지 않는다(retry-drafts 와 같은 막이).
  it('이미 그리는 중이면 다시 그리지 않고 그리는 중이라고 답한다', async () => {
    mocks.queued = 2
    const res = await post({ projectId: 'p1', styleAnchorKey: 'anime' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'drafts_already_queued' })
    expect(mocks.drafts).not.toHaveBeenCalled()
  })

  // 왜: 내린(쓸 수 없는) 그림체나 없는 키로는 그리지 않는다 — 작품 그림체가 엉뚱한 값으로 바뀌지 않게.
  it('쓸 수 없는 그림체를 고르면 그림체를 바꾸지도 그리지도 않는다', async () => {
    const res = await post({ projectId: 'p1', styleAnchorKey: 'retired-style' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'unknown_style' })
    expect(mocks.setProjectStyle).not.toHaveBeenCalled()
    expect(mocks.drafts).not.toHaveBeenCalled()
  })

  // 왜: 한도에 막혔는데 그림체만 바뀌면, 그리지도 않았는데 작품 그림체가 바뀐다.
  it('그림 사용 한도를 넘으면 그림체를 바꾸지도 그리지도 않는다', async () => {
    mocks.quotaOk = false
    const res = await post({ projectId: 'p1', styleAnchorKey: 'real' })
    expect(res.status).toBe(429)
    expect(mocks.setProjectStyle).not.toHaveBeenCalled()
    expect(mocks.drafts).not.toHaveBeenCalled()
  })
})
