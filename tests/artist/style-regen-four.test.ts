// Artist [다시 만들기] 서버는 다른 스타일로는 네 가지만 받고, 지금 스타일은 없어진 것이어도 같은 스타일로 다시 만들기를 받는다 (D6 오너 2026-11-22, 기존 작품은 리드 2026-11-22 안 1 바탕)
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '../fixtures/_memory-supabase'

const state = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('../fixtures/_memory-supabase').memorySupabase>,
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: new Proxy({}, { get: (_target, key) => (state.db.client as unknown as Record<string | symbol, unknown>)[key] }),
}))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: vi.fn(async (_req: Request, projectId: string) => ({ ok: true, projectId, userId: 'owner-1', viaShare: false })),
}))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: vi.fn(async () => null) }))

import { POST as regenerate } from '@/app/api/artist/versions/regenerate/route'

const P = 'p1'

/** 3D 애니메이션(이제 고를 수 없는 스타일)으로 만든 작품 — 인물 · 배경이 없어 스타일 확인을 지나면 "다시 그릴 것 없음"으로 끝난다. */
function seed() {
  return memorySupabase({
    projects: [{ id: P, workspace_id: 'ws1', current_stage: 'artist', style_anchor_key: 'real_3d', custom_style_anchor: null, design_tokens: { l1: { art_style: '3d' } } }],
    style_anchors: [
      { key: 'real_3d', label: '3D 애니메이션', is_active: true, medium: '3d' },
      { key: 'us_cartoon', label: '미국 카툰', is_active: true, medium: '2d_cartoon' },
      { key: 'watercolor', label: '수채', is_active: true, medium: 'watercolor' },
    ],
    characters: [],
    character_appearances: [],
    character_image_candidates: [],
    locations: [],
    location_appearances: [],
    location_image_candidates: [],
    generation_jobs: [],
    shots: [],
    artist_versions: [],
  }, {
    artist_versions: [{ columns: ['project_id', 'n'] }, { columns: ['project_id'], where: (row) => row.is_current === true }],
  })
}

const post = (body: unknown) => new NextRequest('http://localhost/api/artist/versions/regenerate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => {
  state.db = seed()
})

describe('다시 만들기 서버와 네 가지 스타일', () => {
  it('다시 만들기를 네 가지 밖의 다른 스타일로 부르면 서버가 거절한다', async () => {
    // 왜: 오너 "4종만 놔두고 다른 선택지를 아예 없애줘"(D6) — 창에서 숨겨도 옛 탭 · 직접 요청이 없어진 스타일로 바꾸지 못하게 서버도 막는다.
    const res = await regenerate(post({ projectId: P, styleAnchorKey: 'us_cartoon' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'unknown_style' })
    expect(state.db.rows('projects')[0].style_anchor_key).toBe('real_3d')
  })

  it('지금 스타일이 없어진 것이어도 같은 스타일로 다시 만들기는 서버가 받는다', async () => {
    // 왜(리드 2026-11-22 안 1 바탕): 이미 그 스타일로 그린 작품은 그 스타일로 계속 그린다 — 스타일 확인을 지나 다음 확인(다시 그릴 것)으로 간다.
    const res = await regenerate(post({ projectId: P, styleAnchorKey: 'real_3d' }))
    expect(await res.json()).toMatchObject({ code: 'nothing_to_draw' })
  })

  it('네 가지 안의 다른 스타일로는 지금처럼 다시 만들 수 있다', async () => {
    // 왜: 정상 경로 고정 — 없어진 스타일로 만든 작품도 네 가지 중 하나로 옮겨 갈 수 있어야 한다.
    const res = await regenerate(post({ projectId: P, styleAnchorKey: 'watercolor' }))
    expect(await res.json()).toMatchObject({ code: 'nothing_to_draw' })
  })
})
