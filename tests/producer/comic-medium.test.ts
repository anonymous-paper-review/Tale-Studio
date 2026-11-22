// 만화 그림체의 매체 고르기 규칙(허용 목록 · 하나만)은 남아 있지만, 매체 고르기 창구는 D6(2026-11-22)로 닫혀 그림을 모델에 보내지 않는다 (2026-10-09)
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

describe('매체 고르기 창구는 닫혔다', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ id: 'user-1' })
    mocks.userOwnsProject.mockResolvedValue(true)
    mocks.listStyleAnchorMediums.mockResolvedValue(ALLOWED)
    mocks.pickAnchorMedium.mockResolvedValue({ medium: '2d_anime' })
  })

  it('매체 고르기 창구는 그림을 모델에 보내지 않고 410 으로 거절한다', async () => {
    // 왜: 오너 "웹툰이나 이미지 입력받았을 때 스타일 추출하는 기능도 없애줘"(D6) — 매체 고르기는 그림에서 그림체를 정하던 길의 첫걸음이었다.
    const res = await POST(post(ok))
    expect(res.status).toBe(410)
    expect(await res.json()).toEqual({ error: 'style_extraction_retired' })
    expect(mocks.pickAnchorMedium).not.toHaveBeenCalled()
  })

  it('매체 고르기 창구는 허용 목록도 읽지 않는다', async () => {
    // 왜: 닫힌 창구는 아무 일도 하지 않는다 — DB · 모델 어느 쪽도 부르지 않는다(D6).
    await POST(post(ok))
    expect(mocks.listStyleAnchorMediums).not.toHaveBeenCalled()
  })

  it('로그인 · 동의 · 내 프로젝트 여부와 상관없이 매체 고르기 창구는 그림을 모델에 보내지 않는다', async () => {
    // 왜: 예전에는 동의 · 주인 확인을 지나면 그림을 모델에 보냈다 — 이제는 어떤 요청도 보내지 않는다(D6).
    expect((await POST(post({ ...ok, consent: undefined }))).status).toBe(410)
    expect((await POST(post({ ...ok, imageUrl: 'https://elsewhere.example/p1.webp' }))).status).toBe(410)
    mocks.userOwnsProject.mockResolvedValue(false)
    expect((await POST(post(ok))).status).toBe(410)
    mocks.getUser.mockResolvedValue(null)
    expect((await POST(post(ok))).status).toBe(410)
    expect(mocks.pickAnchorMedium).not.toHaveBeenCalled()
  })
})
