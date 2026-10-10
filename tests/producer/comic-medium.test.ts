// 만화 그림체의 매체(애니 · 카툰 · 실사 등)는 첫 쪽 그림을 보고 모델이 허용 목록에서 하나 고르고, 목록 밖이면 쓰지 않는다 (2026-10-09)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  listStyleAnchorMediums: vi.fn(),
  pickAnchorMedium: vi.fn(),
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/style-anchor', () => ({ listStyleAnchorMediums: mocks.listStyleAnchorMediums }))
vi.mock('@/lib/style-facets/medium-llm', () => ({ pickAnchorMedium: mocks.pickAnchorMedium }))

import { buildMediumPickPrompt, parseMediumPick } from '@/lib/style-facets/medium'
import { POST } from '@/app/api/produce/anchor-medium/route'
import { mediaPublicUrl } from '@/lib/storage/media-url'

const ALLOWED = ['2d_anime', '2d_cartoon', '3d', 'live_action', 'stop_motion', 'watercolor']
const MEDIA = mediaPublicUrl('ws-1/proj-1/uploads/p1/original.webp')
const post = (body: unknown) => new Request('http://test/api/produce/anchor-medium', { method: 'POST', body: JSON.stringify(body) })
const ok = { projectId: 'proj-1', imageUrl: MEDIA, consent: 'comic-choice-v1' }

describe('만화 그림체의 매체 고르기', () => {
  it('모델에게는 허용 목록 전부를 보여 주고 하나만 답하게 한다', () => {
    // 왜: 매체가 비면 Writer 는 실사로 보고 Director 는 촬영 장비 표현을 켠다 — 만화가 실사 연출로 흘러간다(10/9 로컬 시험).
    const prompt = buildMediumPickPrompt(ALLOWED)
    for (const medium of ALLOWED) expect(prompt).toContain(medium)
  })

  it('모델 답에서 허용 목록 가운데 하나만 받는다', () => {
    // 정상 경로 고정 — 모델이 따옴표 · 마침표 · 대문자를 섞어 답해도 같은 값으로 읽는다.
    expect(parseMediumPick('2d_anime', ALLOWED)).toBe('2d_anime')
    expect(parseMediumPick('`2D_CARTOON`.', ALLOWED)).toBe('2d_cartoon')
    expect(parseMediumPick('The closest medium is watercolor.', ALLOWED)).toBe('watercolor')
  })

  it('모델 답이 허용 목록 밖이거나 둘 이상을 말하면 받지 않는다', () => {
    // 왜: 목록 밖 값은 Writer 가 모르는 매체라 그림체와 연출이 어긋난다. 둘을 말하면 어느 쪽인지 정할 근거가 없다.
    expect(parseMediumPick('manga', ALLOWED)).toBeNull()
    expect(parseMediumPick('2d_anime or 2d_cartoon', ALLOWED)).toBeNull()
    expect(parseMediumPick('', ALLOWED)).toBeNull()
  })
})

describe('매체 고르기 창구', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ id: 'user-1' })
    mocks.userOwnsProject.mockResolvedValue(true)
    mocks.listStyleAnchorMediums.mockResolvedValue(ALLOWED)
    mocks.pickAnchorMedium.mockResolvedValue({ medium: '2d_anime' })
  })

  it('첫 쪽 그림과 허용 목록으로 매체를 골라 돌려준다', async () => {
    // 정상 경로 고정 — 만화 원고로 그대로 영상화를 고르면 그림체를 정하기 전에 이 창구가 매체를 정한다.
    const res = await POST(post(ok))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ medium: '2d_anime' })
    expect(mocks.pickAnchorMedium).toHaveBeenCalledWith(MEDIA, ALLOWED)
  })

  it('매체를 고르지 못하면 실패로 돌려주고 실사로 채우지 않는다', async () => {
    // 왜: 모델이 답을 못 하거나 목록 밖을 말할 때 조용히 실사로 두면 만화가 실사 연출로 넘어간다.
    mocks.pickAnchorMedium.mockResolvedValue({ medium: null })
    const res = await POST(post(ok))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'medium_pick_failed' })
  })

  it('허용 목록을 읽지 못하면 고르지 않는다', async () => {
    // 왜: 목록 없이 고르면 모델이 매체를 지어낸다 — 그림체 등록 창구도 목록 밖 값은 받지 않는다.
    mocks.listStyleAnchorMediums.mockResolvedValue([])
    const res = await POST(post(ok))
    expect(res.status).toBe(503)
    expect(mocks.pickAnchorMedium).not.toHaveBeenCalled()
  })

  it('분석 동의 표시가 없거나, 로그인 · 내 프로젝트 · 내가 올린 그림이 아니면 그림을 모델에 보내지 않는다', async () => {
    // 왜: 매체 고르기도 그림을 분석 모델에 보내는 일이다 — 만화 원고 질문에서 받은 동의 안에서만 한다.
    expect((await POST(post({ ...ok, consent: undefined }))).status).toBe(400)
    expect((await POST(post({ ...ok, imageUrl: 'https://elsewhere.example/p1.webp' }))).status).toBe(400)
    mocks.userOwnsProject.mockResolvedValue(false)
    expect((await POST(post(ok))).status).toBe(403)
    mocks.getUser.mockResolvedValue(null)
    expect((await POST(post(ok))).status).toBe(401)
    expect(mocks.pickAnchorMedium).not.toHaveBeenCalled()
  })
})
