// 캔버스 샷(Writer 와 이어지지 않은 샷)의 그림은 고른 모델이 Nano Banana(1 · 2) · Grok 이어도 프로젝트 화면비로 그린다 — 참고 그림(16:9 인물 시트) 비율을 따르지 않는다 (검토 rev-director 5번 · 리드 2026-11-26)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  generateReservedImage: vi.fn(),
  format: 'vertical_9:16' as string | null,
}))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: mocks.generateReservedImage }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, unknown> = {}
      for (const name of ['select', 'eq']) q[name] = () => q
      q.maybeSingle = q.single = async () => ({ data: { settings: { format: mocks.format } }, error: null })
      return q
    },
  },
}))

import { POST } from '@/app/api/generate/image/route'
import { buildFalImageInput } from '@/lib/writer/llm/fal'

const request = (body: Record<string, unknown>) => new Request('http://localhost/api/generate/image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectId: 'project-1', prompt: 'A lighthouse at dusk.', ...body }),
})
const submitted = () => mocks.generateReservedImage.mock.calls[0]?.[0] as Record<string, unknown>
const SHEET = ['https://media.test/character-sheet-16x9.png']

beforeEach(() => {
  vi.clearAllMocks()
  mocks.format = 'vertical_9:16'
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.generateReservedImage.mockResolvedValue({ url: 'https://fal.test/out.png' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } })))
})

describe('캔버스 샷 그림의 화면비', () => {
  it('프로젝트 화면비로 그리라는 요청(캔버스 샷)은 참고 그림이 있어도 Nano Banana 편집에 그 비율을 싣는다', async () => {
    // 왜(검토 rev-director 5번): Nano Banana 편집은 비율을 안 주면 첫 참고 그림(16:9 인물 시트) 비율로 그려 세로 프로젝트에 가로 그림이 나왔다.
    await POST(request({ aspectFromProject: true, referenceImageUrls: SHEET, imageModel: 'nano-banana-2' }))
    expect(submitted()).toMatchObject({ aspect_ratio: '9:16', keep_aspect_ratio: true })
    expect(buildFalImageInput({ prompt: 'x', aspect_ratio: '9:16', keep_aspect_ratio: true, reference_image_urls: SHEET }, 'fal-ai/nano-banana-2/edit')).toMatchObject({ aspect_ratio: '9:16' })
    expect(buildFalImageInput({ prompt: 'x', aspect_ratio: '9:16', keep_aspect_ratio: true, reference_image_urls: SHEET }, 'fal-ai/nano-banana/edit')).toMatchObject({ aspect_ratio: '9:16' })
  })

  it('프로젝트 화면비로 그리라는 요청은 Grok 에 참고 그림이 있어도 비율을 빼지 않는다', async () => {
    // 왜: Grok 은 참고 그림이 있으면 "입력 구도 지키기"로 비율을 뺐다(에셋 노드 고치기용) — 캔버스 샷은 새로 그리는 샷이라 프로젝트 비율이어야 한다.
    await POST(request({ aspectFromProject: true, referenceImageUrls: SHEET, imageModel: 'grok-imagine' }))
    expect(submitted()).toMatchObject({ aspect_ratio: '9:16' })
  })

  it('비율을 정하지 않은 편집(에셋 노드 · Artist)은 지금처럼 Nano Banana 편집에 비율을 싣지 않고, Grok 은 참고 그림의 구도를 따른다', async () => {
    // 왜: 정상 경로 고정 — 고칠 그림의 구도를 지키는 편집은 첫 그림 비율을 따른다(fal.ts · 에셋 노드 종전 규칙).
    await POST(request({ aspectRatio: '16:9', referenceImageUrls: SHEET, imageModel: 'grok-imagine' }))
    expect(submitted()).not.toHaveProperty('aspect_ratio')
    expect(submitted()).not.toHaveProperty('keep_aspect_ratio')
    expect(buildFalImageInput({ prompt: 'x', aspect_ratio: '16:9', reference_image_urls: SHEET }, 'fal-ai/nano-banana-2/edit')).not.toHaveProperty('aspect_ratio')
  })
})
