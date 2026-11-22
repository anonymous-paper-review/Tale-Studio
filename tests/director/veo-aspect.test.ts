// Veo 는 가로(16:9) · 세로(9:16) 프로젝트에서만 쓴다 — 다른 화면비면 Take 를 잡기 전에 거절하고 다른 모델로 넘기지 않는다 (오너 2026-11-22 V3)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  checkProjectVideoBudget: vi.fn(),
  syncFalKeyLimits: vi.fn(),
  reserveTake: vi.fn(),
  reserveRegeneration: vi.fn(),
  getJob: vi.fn(),
  attach: vi.fn(),
  fail: vi.fn(),
  updateMetadata: vi.fn(),
  holdTakesForVideoJob: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  submit: vi.fn(),
  falKeyById: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject, getGenerationJobById: mocks.getJob }))
vi.mock('@/lib/generation-quota', () => ({
  checkGenerationCapacity: mocks.checkGenerationCapacity,
  quotaExceededBody: () => ({ error: 'quota' }),
  checkProjectVideoBudget: mocks.checkProjectVideoBudget,
  syncFalKeyLimits: mocks.syncFalKeyLimits,
  videoBudgetExceededBody: () => ({ error: 'video budget' }),
}))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: vi.fn() }))
vi.mock('@/lib/director-video-takes', () => ({
  reserveDirectorVideoTake: mocks.reserveTake,
  reserveDirectorVideoRegeneration: mocks.reserveRegeneration,
  updateDirectorVideoTakeMetadata: mocks.updateMetadata,
  attachProviderRequestToReservedVideoJob: mocks.attach,
  markDirectorVideoAttemptFailed: mocks.fail,
}))
vi.mock('@/lib/billing/take-hold', () => ({ holdTakesForVideoJob: mocks.holdTakesForVideoJob }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://webhook.test' }))
vi.mock('@/lib/fal/observability', () => ({ buildBestEffortFalRequestCapturePatch: () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/fal/keys', () => ({ falKeyById: mocks.falKeyById, FalUnknownKeyError: class FalUnknownKeyError extends Error {} }))

import { VIDEO_MODELS, videoModelFitsAspectRatio, type VideoModelKey } from '@/lib/video-models'
import { prepareDirectorVideoSubmission, submitDirectorVideoRequest } from '@/lib/director/video-submit'
import { STORYBOARD, WORKSPACE, tablesFrom, videoRequest } from '../fixtures/_video-submit'

const SHOT = { shot_id: 'shot-2', scene_id: 'scene-1', sort_order: 2, dynamic_spec: {}, character_appearance_keys: {}, storyboard_image: STORYBOARD, rough_storyboard: null, prompt: null }

function seed(format: string) {
  mocks.from.mockReset()
  mocks.from.mockImplementation(tablesFrom({
    projects: [{ workspace_id: WORKSPACE, style_anchor_key: null, settings: { format } }],
    shots: [SHOT],
    video_clips: [{ id: 'clip-2', shot_id: 'shot-2' }],
  }))
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  mocks.syncFalKeyLimits.mockResolvedValue(undefined)
  mocks.falKeyById.mockReturnValue({ id: 'prod-2000', maxInflight: 40, client: { queue: { submit: mocks.submit } } })
})

describe('같이 정한 것', () => {
  // 왜: 오너 V3 "추천대로" — Veo 3.1 은 16:9 · 9:16 영상만 만든다. 정사각에서 고르면 fal 이 받았다가 실패하고(422), 자동 대체가
  //   다른 모델(MiniMax)로 가로 영상을 몰래 만들었다(Take 는 Veo 값). 고르기 화면(Camera · 노드 · 독립 영상)이 이 함수로 Veo 를 끈다.
  it('Veo 는 16:9 · 9:16 프로젝트에서만 고를 수 있다', () => {
    expect(videoModelFitsAspectRatio('veo', '16:9')).toBe(true)
    expect(videoModelFitsAspectRatio('veo', '9:16')).toBe(true)
    expect(videoModelFitsAspectRatio('veo', '1:1')).toBe(false)
    for (const model of Object.keys(VIDEO_MODELS) as VideoModelKey[]) {
      if (model !== 'veo') expect({ model, fits: videoModelFitsAspectRatio(model, '1:1') }).toEqual({ model, fits: true })
    }
  })

  // 왜: 오너 V3 — 화면이 막아도 저장된 Veo(이미 고른 Take · 샷) · 채팅 · 일괄 요청은 서버로 온다. Take 와 돈을 쓰기 전에 까닭을 말하고 멈춘다.
  //   새 Take · 다시 만들기 · 채팅은 같은 영상 요청 길을, 일괄은 같은 준비(prepareDirectorVideoSubmission)를 지난다.
  it('다른 화면비 프로젝트의 Veo 요청은 Take 를 잡기 전에 거절하고 다른 모델로 넘기지 않는다 — 일괄 · 채팅 · 다시 만들기도 같다', async () => {
    seed('square_1:1')
    const fresh = await submitDirectorVideoRequest(videoRequest({ model: 'veo' }))
    seed('square_1:1')
    const remake = await submitDirectorVideoRequest(videoRequest({ model: 'veo', videoClipId: 'clip-2' }))
    seed('square_1:1')
    const batch = await prepareDirectorVideoSubmission(videoRequest({ model: 'veo' }), 'user-1')

    for (const response of [fresh, remake, batch as Response]) {
      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.code).toBe('model_aspect_unsupported')
      expect(body.error).toBe('Veo 3.1 makes only 16:9 or 9:16 videos. Choose another model for this project.')
    }
    expect(mocks.reserveTake).not.toHaveBeenCalled()
    expect(mocks.reserveRegeneration).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()

    seed('vertical_9:16')
    const vertical = await prepareDirectorVideoSubmission(videoRequest({ model: 'veo' }), 'user-1')
    expect(vertical).not.toBeInstanceOf(Response)
  })
})
