// 영상을 바꿀 점과 함께 다시 만들면 바꿀 점을 샷 글에 붙이지 않고 따로 보내 작가의 움직임 글을 지키고, 바꿀 점은 지시문 앞쪽(움직임 약속 바로 뒤)에 실어 길이 상한에 잘리지 않게 한다 (오너 2026-11-26 O5 · 채팅 고치기 재료 (e)(f))
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  checkProjectVideoBudget: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  moderated: [] as unknown[][],
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
vi.mock('@/lib/moderation/creem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/moderation/creem')>()
  return {
    ...actual,
    assertUserTextAllowed: vi.fn((parts: unknown[], context: Parameters<typeof actual.assertUserTextAllowed>[1]) => {
      mocks.moderated.push(parts)
      return actual.assertUserTextAllowed(parts as Parameters<typeof actual.assertUserTextAllowed>[0], context)
    }),
  }
})

import { _clearDesignMemoForTest, prepareDirectorVideoSubmission } from '@/lib/director/video-submit'
import { buildVideoPrompt } from '@/lib/director/video-prompt'
import { _clearReferenceImageCacheForTest } from '@/lib/style-facets/reference-image'
import { _clearPhotoLookCacheForTest } from '@/lib/style-facets/photo-look'
import { ROUGH, STORYBOARD, WORKSPACE, tablesFrom, videoRequest } from '../fixtures/_video-submit'

const PROMPT = 'Medium shot of Mina standing by a rusted locker.'
const MOTION = 'Mina turns toward the door and steps forward.'
const SHOT = {
  shot_id: 'shot-2', scene_id: 'scene-1', sort_order: 2, design_ref: null, dialogue_lines: null, character_appearance_keys: {}, characters: [],
  static_spec: null, director_refs: null, storyboard_image: STORYBOARD, rough_storyboard: ROUGH, prompt: PROMPT,
  dynamic_spec: { shot_id: 'shot-2', camera_motion: { type: 'static', speed: 'slow', magnitude: 'minimal' }, character_motion: [], motion_prompt: MOTION },
}

function seed(shot: Record<string, unknown> = {}) {
  mocks.from.mockReset()
  mocks.from.mockImplementation(tablesFrom({
    projects: [{ workspace_id: WORKSPACE, style_anchor_key: null, custom_style_anchor: null, settings: null }],
    shots: [{ ...SHOT, ...shot }],
  }))
}
async function prepare(extra: Record<string, unknown> = {}) {
  return prepareDirectorVideoSubmission(videoRequest({ model: 'seedance', prompt: PROMPT, ...extra }), 'user-1')
}
async function fullPrompt(extra: Record<string, unknown> = {}): Promise<string> {
  const prepared = await prepare(extra)
  if (prepared instanceof Response) throw new Error(`prepare failed: ${prepared.status} ${await prepared.clone().text()}`)
  return String(prepared.inputSnapshot.full_prompt)
}

beforeEach(() => {
  vi.clearAllMocks()
  _clearReferenceImageCacheForTest()
  _clearPhotoLookCacheForTest()
  _clearDesignMemoForTest()
  mocks.moderated.length = 0
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
})

describe('영상 고치기 = 움직임 글 지키기', () => {
  it('바꿀 점과 함께 다시 만들면 작가의 움직임 글을 그대로 싣고, 바꿀 점은 샷 글보다 앞에 "Change from the previous take" 로 싣는다', async () => {
    // 왜: 오너 2026-11-26 (e) — 예전에는 바꿀 점을 샷 글 끝에 붙여 저장된 샷 글과 달라졌고, 그래서 작가의 움직임 글이 빠져 영상이 멈춰 있기 쉬웠다.
    seed()
    const text = await fullPrompt({ changeNote: 'Make her turn more slowly.' })
    expect(text).toContain(`${MOTION} ${PROMPT}`)
    expect(text).toContain('Change from the previous take: Make her turn more slowly.')
    expect(text.indexOf('Change from the previous take')).toBeLessThan(text.indexOf(PROMPT))
  })

  it('샷 글이 길어 지시문이 길이 상한을 넘어도 바꿀 점은 잘리지 않는다', () => {
    // 왜: 오너 2026-11-26 (f) — 예전에는 바꿀 점이 지시문 맨 뒤라 상한(500 · 1400 · 1650자)에서 먼저 잘려 나갔다.
    const long = `${'A long and detailed description of the harbor at dawn with many boats. '.repeat(12)}`
    const { fullPrompt: text } = buildVideoPrompt({ prompt: long, generationMethod: 'I2V', modelKey: 'seedance', durationSeconds: 5, change: 'Keep the camera still.' })
    expect(text.length).toBeLessThanOrEqual(500)
    expect(text.startsWith('Change from the previous take: Keep the camera still.')).toBe(true)
  })

  it('바꿀 점도 내용 검사에 넣는다', async () => {
    // 왜: 바꿀 점은 사람이 쓴 글이다 — 샷 글 · 대사처럼 돈이 드는 요청 전에 검사한다.
    seed()
    await fullPrompt({ changeNote: 'Make her turn more slowly.' })
    expect(mocks.moderated.flat()).toContain('Make her turn more slowly.')
  })

  it('바꿀 점이 없거나 비어 있으면 영상 지시문은 글자까지 지금 그대로다', async () => {
    // 왜: 정상 경로 고정 — 고치기가 아닌 영상(처음 만들기 · 같은 설정 다시 만들기)은 바뀌지 않는다.
    seed()
    const plain = await fullPrompt()
    seed()
    expect(await fullPrompt({ changeNote: '   ' })).toBe(plain)
    expect(plain).not.toContain('Change from the previous take')
    expect(buildVideoPrompt({ prompt: PROMPT, generationMethod: 'I2V', modelKey: 'seedance', durationSeconds: 5 }))
      .toEqual(buildVideoPrompt({ prompt: PROMPT, generationMethod: 'I2V', modelKey: 'seedance', durationSeconds: 5, change: '' }))
  })

  it('바꿀 점이 1000자를 넘으면 영상을 만들기 전에 거절한다', async () => {
    // 왜: 바꿀 점은 한두 문장이다 — 긴 글이 지시문을 밀어내지 않게, Take 를 잡기 전에 막는다.
    seed()
    const prepared = await prepare({ changeNote: 'x'.repeat(1001) })
    expect(prepared instanceof Response && prepared.status).toBe(400)
  })
})
