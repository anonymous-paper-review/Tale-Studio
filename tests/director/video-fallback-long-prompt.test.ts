// 영상 생성이 실패해 해피홀스로 넘어갈 때, 그 모델이 받는 2,500자 안으로 지시문을 줄여 보내는지 검사한다 (실사 그림체의 긴 지시문, 오너 2026-11-23)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ falKeyById: vi.fn(), submit: vi.fn(), markFailed: vi.fn(), attach: vi.fn() }))
vi.mock('@/lib/fal/keys', () => ({ falKeyById: mocks.falKeyById, FalUnknownKeyError: class FalUnknownKeyError extends Error {} }))
vi.mock('@/lib/director-video-takes', () => ({ markDirectorVideoAttemptFailed: mocks.markFailed, attachProviderRequestToReservedVideoJob: mocks.attach }))
vi.mock('@/lib/generation-jobs', () => ({ getGenerationJobById: vi.fn() }))
vi.mock('@/lib/billing/take-hold', () => ({ releaseTakesForJob: vi.fn(), holdTakesForVideoJob: vi.fn() }))
vi.mock('@/lib/director/job-cancellations', () => ({ isJobCancelled: async () => false }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://app.test/api/fal/webhook' }))
vi.mock('@/lib/supabase/admin', () => {
  const chain: Record<string, unknown> = {}
  for (const name of ['update', 'eq']) chain[name] = () => chain
  chain.select = async () => ({ data: [{ id: 'job-1' }], error: null })
  return { supabaseAdmin: { from: () => chain } }
})

import { failDirectorVideoAttemptOrFallback } from '@/lib/director/video-fallback'
import { buildVideoPrompt } from '@/lib/director/video-prompt'
import { MODERATION_FIXTURE } from '../fixtures/_moderation.ts'

const LONG = Array.from({ length: 60 }, (_, i) => `Detail sentence number ${i + 1} describes the tavern, the lamp and the people in it.`).join(' ')
const built = buildVideoPrompt({
  aligned: true, prompt: LONG, generationMethod: 'I2V', modelKey: 'seedance', durationSeconds: 5, referenceImageRoles: ['start', 'end'],
  dynamicSpec: { shot_id: 'sh', camera_motion: { type: 'static', speed: 'slow', direction: 'none', magnitude: 'minimal' }, character_motion: [], motion_prompt: '' } as never,
})
const job = (snapshot: Record<string, unknown>) => ({
  id: 'job-1', project_id: 'project-1', request_id: 'minimax-request', model: 'minimax/h3-max/reference-to-video', provider: 'fal', kind: 'shot_video', status: 'queued',
  video_clip_id: 'clip-1', target: {}, fal_key_id: 'k', idempotency_key: 'idem', result_url: null, error: null,
  input_snapshot: {
    resolved_model_key: 'seedance', duration_seconds: 5, aspect_ratio: '16:9', reference_image_urls: ['https://m/s.png', 'https://m/e.png'], reference_image_roles: ['start', 'end'],
    moderation: MODERATION_FIXTURE, video_fallback: { steps: [{ model: 'minimax', endpoint: 'e', reason: 'r', started_at: 't' }] }, ...snapshot,
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.submit.mockResolvedValue({ request_id: 'happy-request' })
  mocks.falKeyById.mockReturnValue({ id: 'k', client: { queue: { submit: mocks.submit } } })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('해피홀스로 넘어갈 때', () => {
  it('2,500자를 넘는 지시문은 문장 경계에서 줄이고 그림 순서 문장은 남겨 보낸다', async () => {
    // 왜: 해피홀스는 2,500자를 넘으면 요청을 거절한다 — 대체까지 실패해 영상을 못 받는다.
    expect(built.fullPrompt.length).toBeGreaterThan(2500)
    await failDirectorVideoAttemptOrFallback(job({ full_prompt: built.fullPrompt, prompt_parts: built.prompt_parts }) as never, 'minimax failed')
    const sent = mocks.submit.mock.calls[0][1].input.prompt as string
    expect(sent.length).toBeLessThanOrEqual(2500)
    expect(sent).toContain('Reference image order: image 1 = START, image 2 = END.')
    expect(sent.endsWith('follow the references.')).toBe(true)
  })

  it('2,500자 안의 지시문은 글자까지 그대로 보낸다', async () => {
    // 왜: 다른 그림체의 지시문은 모두 이 안이다 — 대체 길도 지금과 같아야 한다(정상 경로 고정).
    await failDirectorVideoAttemptOrFallback(job({ full_prompt: 'Motion contract: Camera: LOCKED tripod shot.' }) as never, 'minimax failed')
    expect(mocks.submit.mock.calls[0][1].input.prompt).toBe('Motion contract: Camera: LOCKED tripod shot.')
  })
})
