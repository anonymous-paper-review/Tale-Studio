// 고정된 그림체는 그림체 등록 창구에서도 다른 그림으로 바꿀 수 없고, 채팅 모델에는 그림체가 정해져 있다고 알린다 (2026-10-09 오너)
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

describe('그림체 등록 창구의 고정', () => {
  it('그림을 그림체로 고를 때 고정 표시를 함께 저장한다', async () => {
    // 정상 경로 고정 — 고정은 프로젝트 그림체 기록에 남아 새로고침 · 다른 기기에서도 그대로다.
    const res = await POST(post({ projectId: 'proj-1', imageUrl: MEDIA, label: '내 그림체', medium: '2d_anime', lock: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ imageUrl: MEDIA, locked: true })
    expect(mocks.updates[0].custom_style_anchor).toMatchObject({ url: MEDIA, medium: '2d_anime', locked: true })
  })

  it('고정된 그림체는 다른 그림으로 바꾸려 해도 거절한다', async () => {
    // 왜: 화면 단추를 막아도 채팅 첨부 · 만화 흐름은 이 창구로 그림체를 바꾼다 — 창구에서도 막는다.
    mocks.current = { url: MEDIA, label: '내 그림체', medium: '2d_anime', locked: true }
    const res = await POST(post({ projectId: 'proj-1', imageUrl: MEDIA, label: '다른 그림체', medium: 'live_action' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'style_locked' })
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
