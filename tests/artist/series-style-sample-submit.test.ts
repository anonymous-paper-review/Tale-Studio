// 배경 접수는 그림체 견본을 참고 그림 마지막 장에 붙이되, 같은 장소를 지키라는 절은 정체성 참고 그림이 있을 때만 붙인다 (2026-10-27 오너 "제품에서 고칠 것")
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  reserveGenerationJob: vi.fn(),
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
  falImageSubmit: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('@/lib/generation-jobs', () => ({
  reserveGenerationJob: mocks.reserveGenerationJob,
  confirmGenerationJobReceipt: mocks.confirmGenerationJobReceipt,
  rejectGenerationJobReservation: mocks.rejectGenerationJobReservation,
}))
vi.mock('@/lib/writer/llm/fal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/writer/llm/fal')>()),
  falImageSubmit: mocks.falImageSubmit,
}))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => undefined }))
vi.mock('@/lib/api/moderation', () => ({ recordModerationPass: () => undefined }))

import { STYLE_ANCHOR_MULTIREF_CLAUSE, type ResolvedStyleAnchor } from '@/lib/style-anchor'
import { submitWorldShotJob, type SubmitWorldShotJobInput } from '@/lib/artist/world-submit'
import { MODERATION_FIXTURE } from '../fixtures/_moderation.ts'

const ANCHOR: ResolvedStyleAnchor = { key: 'watercolor', imageUrl: 'https://anchor/watercolor.png' }
const SAMPLE = 'https://media.test/ws/ep2/series/camp_wide.png'
const BASE_SHOT = 'https://media.test/ws/ep2/locations/dock-default.png'

const world = (extra: Partial<SubmitWorldShotJobInput> = {}): SubmitWorldShotJobInput => ({
  projectId: 'ep2',
  locationId: 'river_ferry_dock',
  column: 'wide_shot',
  prompt: 'Misty river dock at dawn, no people',
  aspectRatio: '16:9',
  actor: 'writer',
  anchor: ANCHOR,
  moderation: MODERATION_FIXTURE,
  ...extra,
})
const submitted = () => mocks.falImageSubmit.mock.calls[0][0] as { prompt: string; reference_image_urls?: string[] }

beforeEach(() => {
  mocks.reserveGenerationJob.mockReset()
  mocks.reserveGenerationJob.mockResolvedValue({ id: 'job-1', fal_key_id: 'key-1' })
  mocks.confirmGenerationJobReceipt.mockReset()
  mocks.confirmGenerationJobReceipt.mockResolvedValue(undefined)
  mocks.rejectGenerationJobReservation.mockReset()
  mocks.falImageSubmit.mockReset()
  mocks.falImageSubmit.mockResolvedValue({ request_id: 'req-1', model: 'openai/gpt-image-2/edit', fal_key_id: 'key-1' })
})

describe('배경 그림체 견본', () => {
  // 왜: 같이 정한 것 — 견본은 다른 장소다. "남은 참고 그림의 장소를 지켜라" 절이 붙으면 앞 화 야영지가 나루터 자리에 그려진다.
  it('그림체 견본만 붙이면 기준 그림 다음 마지막 장에 견본을 싣고 장소를 지키라는 절은 붙이지 않는다', async () => {
    await submitWorldShotJob(world({ styleSampleUrl: SAMPLE }))
    expect(submitted().reference_image_urls).toEqual([ANCHOR.imageUrl, SAMPLE])
    expect(submitted().prompt).not.toContain(STYLE_ANCHOR_MULTIREF_CLAUSE)
  })

  // 왜: 혼자 정한 것 — 기본 모습 와이드샷처럼 같은 장소 참고 그림이 있으면 지금처럼 장소를 지키고, 견본은 그 뒤 마지막 장이다.
  it('같은 장소 참고 그림과 그림체 견본이 함께 있으면 장소 참고 그림 뒤에 견본을 싣고 장소를 지키라는 절은 그대로 둔다', async () => {
    await submitWorldShotJob(world({ referenceImageUrls: [BASE_SHOT], styleSampleUrl: SAMPLE }))
    expect(submitted().reference_image_urls).toEqual([ANCHOR.imageUrl, BASE_SHOT, SAMPLE])
    expect(submitted().prompt).toContain(STYLE_ANCHOR_MULTIREF_CLAUSE)
  })

  // 왜: 혼자 정한 것 — 기준 그림 없이 그리는 그림체(실사)에는 그림을 붙이지 않는다(10-13 오너). 견본도 같다.
  it('그림체 기준 그림이 없으면 견본을 싣지 않는다', async () => {
    await submitWorldShotJob(world({ anchor: null, styleSampleUrl: SAMPLE }))
    expect(submitted().reference_image_urls).toBeUndefined()
  })
})
