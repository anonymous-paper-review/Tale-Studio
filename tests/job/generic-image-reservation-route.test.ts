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
