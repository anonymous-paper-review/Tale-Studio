// 연출 편집의 이미지 생성이 공통 예약 경로를 쓰고, 캐시·용량 거절·일반 오류 계약을 지킨다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { separateArrowLayer, regenerateRoughFrame } from '@/lib/writer/directing-edit'
import { POST } from '@/app/api/writer/rough-directing-edit/route'

const PROJECT = '11111111-2222-4333-8444-555555555555'
const SHOT = 'shot-01'
const DIRECTION = 'https://media.test/rough/direction.png'
const ROUGH = {
  status: 'completed',
  generatedAt: 100,
  frames: {
    start: 'https://media.test/rough/start.png',
    direction: DIRECTION,
    end: 'https://media.test/rough/end.png',
  },
}

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  generateReservedImage: vi.fn(),
  legacyGenerate: vi.fn(),
  upload: vi.fn(),
  getUser: vi.fn(),
  ownsProject: vi.fn(),
  capacityReservationRejection: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: mocks.generateReservedImage }))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageGenerate: mocks.legacyGenerate }))
vi.mock('@/lib/storage/media', () => ({
  mediaPathFromUrl: (url: string) => url.replace('https://media.test/', ''),
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
  mediaUpload: mocks.upload,
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.ownsProject }))
vi.mock('@/lib/api/quota', () => ({ capacityReservationRejection: mocks.capacityReservationRejection }))

let rough: Record<string, unknown>
let actionDescription: string | null
let updates: Array<Record<string, unknown>>

function query(table: string) {
  let selected = ''
  let patch: Record<string, unknown> | null = null
  const q: Record<string, any> = {}
  q.select = (columns: string) => {
    selected = columns
    return q
  }
  q.eq = () => q
  q.update = (value: Record<string, unknown>) => {
    patch = value
    updates.push(value)
    return q
  }
  q.maybeSingle = async () => ({
    data:
      table === 'shots'
        ? selected === 'action_description'
          ? { action_description: actionDescription }
          : { rough_storyboard: rough }
        : null,
    error: null,
  })
  q.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve({ data: patch ? [{ id: 'shot-row' }] : [], error: null }).then(resolve, reject)
  return q
}

function request(action: 'separate' | 'regenerate-end' = 'separate') {
  return new Request('http://localhost/api/writer/rough-directing-edit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, projectId: PROJECT, shotId: SHOT }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  rough = structuredClone(ROUGH)
  actionDescription = 'A person walks toward the door'
  updates = []
  mocks.from.mockImplementation((table: string) => query(table))
  mocks.generateReservedImage.mockResolvedValue({ url: 'https://fal.test/result.png' })
  mocks.upload.mockResolvedValue({ data: { path: 'saved' }, error: null })
  mocks.getUser.mockResolvedValue({ id: 'owner' })
  mocks.ownsProject.mockResolvedValue(true)
  mocks.capacityReservationRejection.mockReturnValue(null)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(Buffer.alloc(10_001), { status: 200, headers: { 'content-type': 'image/png' } })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('연출 편집 이미지 생성 예약', () => {
  it('두 재생성 경로가 레거시 호출 대신 공통 helper에 프로젝트 context를 정확히 전달한다', async () => {
    await separateArrowLayer(PROJECT, SHOT)
    await regenerateRoughFrame(PROJECT, SHOT, 'end')

    expect(mocks.legacyGenerate).not.toHaveBeenCalled()
    expect(mocks.generateReservedImage).toHaveBeenCalledTimes(2)
    for (const [, context] of mocks.generateReservedImage.mock.calls) {
      expect(context).toEqual({ projectId: PROJECT })
    }
    expect(mocks.generateReservedImage.mock.calls[0][0]).toMatchObject({
      model: 'xai/grok-imagine-image/edit',
      reference_image_urls: [DIRECTION],
    })
  })

  it('같은 generatedAt의 클린 플레이트 캐시를 쓰면 helper와 이미지 다운로드를 호출하지 않는다', async () => {
    rough = {
      ...structuredClone(ROUGH),
      cleanDirection: { url: 'https://media.test/rough/direction_clean.png', for: 100 },
    }

    const result = await separateArrowLayer(PROJECT, SHOT)

    expect(result).toEqual({ cleanUrl: 'https://media.test/rough/direction_clean.png', cached: true })
    expect(mocks.generateReservedImage).not.toHaveBeenCalled()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
  })

  it('공통 예약이 용량 거절을 던지면 route가 429와 원래 축 정보를 그대로 전달한다', async () => {
    const rejection = Object.assign(new Error('key_at_capacity'), { details: '8/8' })
    mocks.generateReservedImage.mockRejectedValue(rejection)
    mocks.capacityReservationRejection.mockImplementation((error: unknown, context: unknown) => {
      expect(error).toBe(rejection)
      expect(context).toEqual({ projectId: PROJECT, kind: 'image_generation', userId: 'owner' })
      return new Response(JSON.stringify({ code: 'quota_exceeded', axis: 'key', queued: 8, limit: 8 }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    })

    const response = await POST(request())

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ code: 'quota_exceeded', axis: 'key', queued: 8, limit: 8 })
  })

  it('용량 거절이 아닌 예외는 기존 500 오류 응답으로 보존한다', async () => {
    mocks.generateReservedImage.mockRejectedValue(new Error('provider exploded'))

    const response = await POST(request())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'provider exploded' })
    expect(mocks.capacityReservationRejection).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'provider exploded' }),
      { projectId: PROJECT, kind: 'image_generation', userId: 'owner' },
    )
  })
})
