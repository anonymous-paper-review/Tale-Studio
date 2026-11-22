// 그림체 등록 창구는 이제 그림을 받지 않고(410), 그림체가 고정된 작품의 채팅 모델에는 그림체가 정해져 있다고 알린다 (2026-10-09 오너 · 등록은 D6 2026-11-22 로 없앰)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  current: null as unknown,
  updates: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/style-anchor', () => ({ listStyleAnchorMediums: async () => ['2d_anime', 'live_action'] }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { custom_style_anchor: mocks.current }, error: null }) }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          mocks.updates.push(patch)
          return { error: null }
        },
      }),
    }),
  },
}))

import { POST } from '@/app/api/produce/style-anchor/route'
import { fixedStyleDirective } from '@/app/api/produce/chat/preserve-context'
import { mediaPublicUrl } from '@/lib/storage/media-url'

const MEDIA = mediaPublicUrl('ws-1/proj-1/uploads/look/original.png')
const post = (body: unknown) => new Request('http://test/api/produce/style-anchor', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.current = null
  mocks.updates.length = 0
})

describe('그림체 등록 창구는 닫혔다', () => {
  it('그림체 등록 창구는 그림을 그림체로 저장하지 않고 410 으로 거절한다', async () => {
    // 왜: 오너 "웹툰이나 이미지 입력받았을 때 스타일 추출하는 기능도 없애줘"(D6) — 옛 탭 · 직접 요청도 그림체를 새로 정하지 못하게 창구에서 막는다.
    const res = await POST(post({ projectId: 'proj-1', imageUrl: MEDIA, label: '내 그림체', medium: '2d_anime', lock: true }))
    expect(res.status).toBe(410)
    expect(await res.json()).toEqual({ error: 'style_extraction_retired' })
    expect(mocks.updates).toHaveLength(0)
  })

  it('이미 그림체를 올린 작품도 그림체 등록 창구로 다른 그림을 보내면 410 으로 거절하고 그림체를 바꾸지 않는다', async () => {
    // 왜: 이미 올린 그림체는 그대로 쓰고(리드 2026-11-22 안 1 바탕), 다른 그림으로 바꾸는 길도 없다(D6).
    mocks.current = { url: MEDIA, label: '내 그림체', medium: '2d_anime', locked: true }
    const res = await POST(post({ projectId: 'proj-1', imageUrl: MEDIA, label: '다른 그림체', medium: 'live_action' }))
    expect(res.status).toBe(410)
    expect(mocks.updates).toHaveLength(0)
  })
})

describe('채팅 모델에게 알리기', () => {
  it('고정된 그림체에서는 모델에게 그림체가 정해져 있다고 알리고 스타일 목록을 주지 않는다', () => {
    // 왜: 모델이 스타일 목록을 보고 바꾸자고 제안하면 사용자는 바꿀 수 있다고 믿는다.
    const directive = fixedStyleDirective(true)!
    expect(directive).toMatch(/fixed/i)
    expect(directive).toMatch(/styleAnchorKey/)
    expect(fixedStyleDirective(false)).toBeNull()
    expect(fixedStyleDirective('true')).toBeNull()
    const route = readFileSync('src/app/api/produce/chat/route.ts', 'utf8')
    expect(route).toMatch(/fixedStyleDirective\(styleLocked\)/)
    expect(route).toMatch(/styleLocked !== true[\s\S]{0,200}listStyleAnchorCatalog/)
  })
})
