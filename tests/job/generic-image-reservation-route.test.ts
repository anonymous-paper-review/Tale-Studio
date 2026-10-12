// FAL 이미지 요청은 프로젝트 소유권과 생성 자리 예약을 통과한 뒤에만 제출하고, 결과는 기존 blob으로 돌려준다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  demoWriteBlock: vi.fn(),
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  generateReservedImage: vi.fn(),
  recordWriterObservabilityEvent: vi.fn(),
}))

vi.mock('@/lib/demo/guard-server', () => ({
  demoWriteBlock: mocks.demoWriteBlock,
}))
vi.mock('@/lib/supabase/auth', () => ({
  getUser: mocks.getUser,
}))
vi.mock('@/lib/generation-jobs', () => ({
  userOwnsProject: mocks.userOwnsProject,
}))
vi.mock('@/lib/fal/generate-image', () => ({
  generateReservedImage: mocks.generateReservedImage,
}))
vi.mock('@/lib/writer/debug-events', () => ({
  recordWriterObservabilityEvent: mocks.recordWriterObservabilityEvent,
}))

import { POST } from '@/app/api/generate/image/route'

const PROJECT_ID = 'project-1'
const USER_ID = 'user-1'

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/generate/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.demoWriteBlock.mockReturnValue(null)
  mocks.getUser.mockResolvedValue({ id: USER_ID })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.recordWriterObservabilityEvent.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('/api/generate/image FAL 예약 경로', () => {
  it('projectId가 없으면 400으로 거절하고 예약·제출하지 않는다', async () => {
    const response = await POST(request({ prompt: 'a portrait' }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'Project ID is required' })
    expect(mocks.userOwnsProject).not.toHaveBeenCalled()
    expect(mocks.generateReservedImage).not.toHaveBeenCalled()
  })

  it('다른 사용자의 프로젝트면 403으로 거절하고 예약·제출하지 않는다', async () => {
    mocks.userOwnsProject.mockResolvedValue(false)

    const response = await POST(
      request({ projectId: PROJECT_ID, prompt: 'a portrait' }),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: 'Forbidden' })
    expect(mocks.userOwnsProject).toHaveBeenCalledWith(PROJECT_ID, USER_ID)
    expect(mocks.generateReservedImage).not.toHaveBeenCalled()
  })

  it('예약 자리가 없으면 축을 포함한 429를 반환하고 결과를 받지 않는다', async () => {
    mocks.generateReservedImage.mockRejectedValue({
      message: 'image_user_at_capacity',
      details: '6',
    })

    const response = await POST(
      request({ projectId: PROJECT_ID, prompt: 'a portrait' }),
    )

    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({
      code: 'quota_exceeded',
      category: 'image',
      axis: 'user_image',
      queued: 6,
      limit: 6,
    })
    expect(mocks.recordWriterObservabilityEvent).toHaveBeenCalledWith(
      PROJECT_ID,
      'generation_submit_rejected_quota',
      expect.objectContaining({
        kind: 'image_generation',
        axis: 'user_image',
      }),
    )
  })

  it('정상 생성은 예약 helper를 호출하고 이미지 blob 응답을 유지한다', async () => {
    mocks.generateReservedImage.mockResolvedValue({
      url: 'https://fal.example/image.png',
      width: 1024,
      height: 1024,
      raw: { images: [{ url: 'https://fal.example/image.png' }] },
    })
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      )

    const response = await POST(
      request({
        projectId: PROJECT_ID,
        prompt: 'a portrait',
        aspectRatio: '16:9',
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    )
    expect(mocks.generateReservedImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'a portrait',
        aspect_ratio: '16:9',
      }),
      { projectId: PROJECT_ID, userId: USER_ID },
    )
    expect(fetchMock).toHaveBeenCalledWith('https://fal.example/image.png')
  })
})

// 2026-09-30 오너 지시: 세로 프로젝트의 Director 수동 샷 실사 이미지가 16:9 로 나갔다. 화면이 표시를 보내면 서버가 Producer 포맷을 읽는다.
describe('/api/generate/image 프로젝트 비율', () => {
  // 왜: 실측(script_test) "New Shot" 이미지가 16:9 로 나갔다 — 화면이 16:9 를 박아 보냈다.
  it('프로젝트 비율로 만들라는 표시가 오면 Producer 포맷(세로면 9:16)으로 이미지를 만든다', async () => {
    const { supabaseAdmin } = await import('@/lib/supabase/admin')
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { settings: { format: 'vertical_9:16' } }, error: null }) }
    vi.spyOn(supabaseAdmin, 'from').mockReturnValue(chain as never)
    mocks.generateReservedImage.mockResolvedValue({ url: 'https://fal.test/i.png' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }))
    const res = await POST(request({ prompt: 'New Shot', projectId: PROJECT_ID, aspectFromProject: true }))
    expect(res.status).toBe(200)
    expect(mocks.generateReservedImage.mock.calls[0][0]).toMatchObject({ aspect_ratio: '9:16' })
  })
})

// 2026-10-12 오너 "고친다": fal 입력이 정한 비율을 Grok 에도 보내게 바뀐 뒤에도, 모델 고르기 창이 Grok 을 "입력 구도를 지킨다"로
//   안내하는 Director 에셋 노드는 고칠 그림의 구도를 그대로 따른다.
describe('/api/generate/image Grok 구도', () => {
  function stubResult() {
    mocks.generateReservedImage.mockResolvedValue({ url: 'https://fal.test/g.png' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }))
  }

  it('Grok 으로 참고 그림을 고쳐 그리면 화면 비율을 싣지 않아 그 그림의 구도를 지킨다 (Director 에셋 노드)', async () => {
    // 왜: 에셋 노드는 비율(인물 1:1 · 그 밖 16:9)을 늘 실어 보낸다 — Grok 을 고른 사용자는 원본 구도를 기대한다.
    stubResult()
    const res = await POST(request({ projectId: PROJECT_ID, prompt: 'retouch', aspectRatio: '1:1', referenceImageUrls: ['https://x/source.png'], imageModel: 'grok-imagine' }))
    expect(res.status).toBe(200)
    const opts = mocks.generateReservedImage.mock.calls[0][0]
    expect(opts.model).toBe('xai/grok-imagine-image/edit')
    expect('aspect_ratio' in opts).toBe(false)
  })

  it('Grok 으로 참고 그림 없이 새로 그리면 요청한 화면 비율을 싣는다', async () => {
    // 왜: 고칠 그림이 없으면 지킬 구도도 없다 — 비율을 안 실으면 Grok 기본값(정사각형)으로 나온다.
    stubResult()
    await POST(request({ projectId: PROJECT_ID, prompt: 'a street', aspectRatio: '16:9', imageModel: 'grok-imagine' }))
    expect(mocks.generateReservedImage.mock.calls[0][0]).toMatchObject({ model: 'xai/grok-imagine-image', aspect_ratio: '16:9' })
  })

  it('다른 모델은 참고 그림이 있어도 화면 비율을 그대로 싣는다', async () => {
    // 왜: 구도를 따르는 약속은 Grok 만의 것이다(정상 경로 고정).
    stubResult()
    await POST(request({ projectId: PROJECT_ID, prompt: 'retouch', aspectRatio: '1:1', referenceImageUrls: ['https://x/source.png'], imageModel: 'gpt-image-2' }))
    expect(mocks.generateReservedImage.mock.calls[0][0]).toMatchObject({ aspect_ratio: '1:1' })
  })
})
