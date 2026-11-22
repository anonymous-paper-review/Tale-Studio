// 영상을 만들 때 서버가 그 샷의 지금 대사 지문을 작업 기록에 남긴다 — 한 Take · 일괄 · 이어서 · 다시 만들기가 같은 자리 (오너 2026-11-22 E3)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  checkProjectVideoBudget: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject, getGenerationJobById: vi.fn() }))
vi.mock('@/lib/generation-quota', () => ({
  checkGenerationCapacity: mocks.checkGenerationCapacity,
  quotaExceededBody: () => ({ error: 'quota' }),
  checkProjectVideoBudget: mocks.checkProjectVideoBudget,
  syncFalKeyLimits: vi.fn(),
  videoBudgetExceededBody: () => ({ error: 'video budget' }),
}))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: vi.fn() }))
vi.mock('@/lib/director-video-takes', () => ({
  reserveDirectorVideoTake: vi.fn(),
  reserveDirectorVideoRegeneration: vi.fn(),
  updateDirectorVideoTakeMetadata: vi.fn(),
  attachProviderRequestToReservedVideoJob: vi.fn(),
  markDirectorVideoAttemptFailed: vi.fn(),
}))
vi.mock('@/lib/billing/take-hold', () => ({ holdTakesForVideoJob: vi.fn() }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://webhook.test' }))
vi.mock('@/lib/fal/observability', () => ({ buildBestEffortFalRequestCapturePatch: () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/fal/keys', () => ({ falKeyById: vi.fn(), FalUnknownKeyError: class FalUnknownKeyError extends Error {} }))

import { prepareDirectorVideoSubmission, type PreparedDirectorVideoSubmission } from '@/lib/director/video-submit'
import { dialogueFingerprint } from '@/lib/director/dialogue-fingerprint'
import { PROJECT, ROUGH, STORYBOARD, WORKSPACE, media, tablesFrom, videoRequest } from '../fixtures/_video-submit'

const DIALOGUE = [{ text: 'He never came back.', characterId: null, emotion: 'quiet' }]
const SHOT = {
  shot_id: 'shot-2', scene_id: 'scene-1', sort_order: 2, dynamic_spec: {}, design_ref: null, dialogue_lines: DIALOGUE,
  character_appearance_keys: {}, characters: [], static_spec: null, director_refs: null, prompt: null,
  storyboard_image: STORYBOARD, rough_storyboard: ROUGH,
}
const PREV_PATH = `${WORKSPACE}/${PROJECT}/videos/clip-prev/job-prev.mp4`
const CONTINUE_FROM = { videoClipId: 'clip-prev', generationJobId: 'job-prev', frameUrl: media(`${WORKSPACE}/${PROJECT}/videos/clip-prev/job-prev_chain-frame-2850.jpg`) }

function seed() {
  mocks.from.mockReset()
  mocks.from.mockImplementation(tablesFrom({
    projects: [{ workspace_id: WORKSPACE, style_anchor_key: null, settings: null }],
    shots: [SHOT, [{ shot_id: 'shot-1', scene_id: 'scene-1', sort_order: 1 }, { shot_id: 'shot-2', scene_id: 'scene-1', sort_order: 2 }]],
    video_clips: [[{
      id: 'clip-prev', shot_id: 'shot-1', url: media(PREV_PATH), storage_path: PREV_PATH, status: 'completed', is_final: true,
      take_number: 1, created_at: '2026-11-20T00:00:00.000Z', last_attempt_at: null, last_attempt_job_id: 'job-prev', deleted_at: null,
    }], { id: 'clip-2', shot_id: 'shot-2' }],
  }))
}

async function prepare(extra: Record<string, unknown>): Promise<PreparedDirectorVideoSubmission> {
  const prepared = await prepareDirectorVideoSubmission(videoRequest({ model: 'seedance', ...extra }), 'user-1')
  if (prepared instanceof Response) throw new Error(`prepare failed: ${prepared.status} ${await prepared.clone().text()}`)
  return prepared
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  seed()
})

describe('같이 정한 것', () => {
  // 왜: "이 Take 를 만든 뒤 대사가 바뀌었나"를 알려면 만들 때의 대사를 기록해 둬야 한다(E3 — 오너 2026-11-22 추천대로).
  //   지문은 작업 기록에만 남긴다 — 새 Take 기록(override)에 넣으면 같은 요청 재생 비교의 기록 모양이 바뀐다(리드 2026-11-22).
  it('영상을 만들 때 그 샷의 대사 지문을 작업 기록에 남긴다', async () => {
    const prepared = await prepare({})

    expect(prepared.inputSnapshot.dialogue_fingerprint).toBe(dialogueFingerprint(DIALOGUE))
    expect(prepared.override).not.toHaveProperty('dialogueFingerprint')
  })

  // 왜: 리드 2026-11-22 — 일괄 · 이어서 · 다시 만들기 모두 같은 자리(영상 준비 한 곳)에서 남아야 화면이 어느 Take 든 같은 규칙으로 견준다.
  //   같은 Take 를 다시 만들 때는 새 Take 기록이 생기지 않으니 작업 기록의 지문이 근거다.
  it('일괄 · 이어서 · 같은 Take 다시 만들기도 같은 자리에서 대사 지문을 남긴다', async () => {
    const continued = await prepare({ videoMode: 'continue', continueFrom: CONTINUE_FROM })
    expect(continued.inputSnapshot.dialogue_fingerprint).toBe(dialogueFingerprint(DIALOGUE))

    seed()
    mocks.from.mockImplementation(tablesFrom({
      projects: [{ workspace_id: WORKSPACE, style_anchor_key: null, settings: null }],
      shots: [SHOT],
      video_clips: [{ id: 'clip-2', shot_id: 'shot-2' }],
    }))
    const regenerated = await prepare({ videoClipId: 'clip-2' })
    expect(regenerated.inputSnapshot.dialogue_fingerprint).toBe(dialogueFingerprint(DIALOGUE))
  })
})

describe('혼자 정한 것', () => {
  // 왜: 지문은 서버가 만든 그때의 DB 대사여야 한다 — 화면이 보낸 값(옛 Take 에서 물려받은 지문 등)을 믿으면 바뀜을 놓친다.
  it('화면이 보낸 대사 지문은 기록하지 않고 서버가 DB 대사로 만든다', async () => {
    const prepared = await prepare({ override: { dialogueFingerprint: 'd1:00000000' } })

    expect(prepared.override).not.toHaveProperty('dialogueFingerprint')
    expect(prepared.inputSnapshot.dialogue_fingerprint).toBe(dialogueFingerprint(DIALOGUE))
  })
})
