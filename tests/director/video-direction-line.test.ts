// 콘티에서 화살표를 고친 샷은 영상 지시문 맨 앞에 그 연출 장을 읽은 줄을 움직임으로 싣고(끝 장과 상관없이), 옛 움직임 약속 · 작가의 옛 움직임 글은 싣지 않는다 — 줄이 없는 샷은 한 글자도 안 바뀐다 (오너 2026-11-22 Q4 · 리드 D2 · 리드 2026-11-26 나눔 — main 영상 지시 구조 위)
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
import { buildVideoPrompt, type BuildVideoPromptInput } from '@/lib/director/video-prompt'
import { _clearReferenceImageCacheForTest } from '@/lib/style-facets/reference-image'
import { _clearPhotoLookCacheForTest } from '@/lib/style-facets/photo-look'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'
import { ROUGH, STORYBOARD, WORKSPACE, tablesFrom, videoRequest } from '../fixtures/_video-submit'

const LINE = 'The woman turns away from the window and walks toward the camera.'
const MOVEMENT = `Movement (from the edited direction sketch): ${LINE}`
const PROMPT = 'Medium shot of Mina standing by a rusted locker.'
const MOTION = 'Mina turns toward the door and steps forward.'
const dyn = (over: Partial<ShotDynamicSpec> = {}): ShotDynamicSpec =>
  ({ shot_id: 'sh', camera_motion: { type: 'dolly_in', speed: 'slow', direction: 'forward', magnitude: 'minimal' }, character_motion: [{ character_id: 'mina', verb: 'turns toward the door', magnitude: 'small' }], motion_prompt: MOTION, ...over }) as ShotDynamicSpec
const BASE: BuildVideoPromptInput = { prompt: PROMPT, generationMethod: 'I2V', modelKey: 'seedance', durationSeconds: 5, dynamicSpec: dyn() }

describe('영상 지시문의 읽은 줄 — 지시문 만드는 곳', () => {
  it('영상 지시에 고친 연출 장을 읽은 줄을 주면 맨 앞에 움직임으로 싣고 옛 움직임 약속은 싣지 않는다 — 장면 글 · 그림 역할은 그대로', () => {
    // 왜(오너 Q4): 사람이 화살표를 고쳤는데 영상이 옛 움직임 약속을 따르면 고친 연출이 영상에 안 나온다. 맨 앞 = 모델이 가장 무겁게 읽는 자리.
    const { fullPrompt, prompt_parts } = buildVideoPrompt({ ...BASE, directionLine: LINE, startEndReference: true })
    expect(fullPrompt.startsWith(MOVEMENT)).toBe(true)
    expect(fullPrompt).not.toContain('Motion contract:')
    expect(fullPrompt).toContain(PROMPT)
    expect(fullPrompt).toContain('The first reference image is the shot\'s START frame')
    expect(prompt_parts.directionRead).toBe(LINE)
    expect(prompt_parts.motionContract).toBeUndefined()
  })

  it('실사 그림체 영상도 읽은 줄을 맨 앞에 싣고 설계 없는 샷의 규칙(장면 글의 동작만)은 싣지 않으며, 글을 문장 중간에서 자르지 않는다', () => {
    // 왜: 실사 그림체(11/23)는 문장 경계에서 줄인다 — 읽은 줄 때문에 옛 자르기(글자 수)로 돌아가면 샷 글이 문장 중간에서 끊긴다.
    //   "장면 글의 동작만"(설계 없는 샷 규칙)은 읽은 줄의 움직임과 다툰다.
    const long = `${'Mina stands by the rusted locker under a flickering light. '.repeat(80)}`
    const { fullPrompt } = buildVideoPrompt({ ...BASE, aligned: true, prompt: long, dynamicSpec: null, fallbackContract: true, directionLine: LINE })
    expect(fullPrompt.startsWith(MOVEMENT)).toBe(true)
    expect(fullPrompt).not.toContain('Subjects: only the actions in the scene description')
    expect(fullPrompt.trimEnd().endsWith('.')).toBe(true)
  })

  it('읽은 줄과 바꿀 점이 같이 있으면 읽은 줄 다음에 바꿀 점을 싣는다', () => {
    // 왜: 읽은 줄이 움직임 약속 자리를 대신한다 — 바꿀 점은 지금처럼 움직임 약속(이제 읽은 줄) 바로 뒤(오너 O8 (e)(f)).
    const { fullPrompt } = buildVideoPrompt({ ...BASE, directionLine: LINE, change: 'Make her walk more slowly.' })
    expect(fullPrompt.indexOf(MOVEMENT)).toBe(0)
    expect(fullPrompt.indexOf('Change from the previous take: Make her walk more slowly.')).toBeGreaterThan(0)
    expect(fullPrompt.indexOf('Change from the previous take')).toBeLessThan(fullPrompt.indexOf(PROMPT))
  })

  it('읽은 줄이 없거나 비면 영상 지시는 한 글자도 바뀌지 않는다 — 다른 그림체 · 실사 그림체 · 설계 없는 샷 모두', () => {
    // 왜: 리드 조건 — 화살표를 고치지 않은 샷의 영상 지시문은 그대로다(other-styles-unchanged · 영상 지시 고정 시험도 그대로 통과).
    for (const input of [BASE, { ...BASE, aligned: true }, { ...BASE, dynamicSpec: null }, { ...BASE, aligned: true, dynamicSpec: null, fallbackContract: true }] as BuildVideoPromptInput[]) {
      expect(buildVideoPrompt({ ...input, directionLine: null })).toEqual(buildVideoPrompt(input))
      expect(buildVideoPrompt({ ...input, directionLine: '  ' })).toEqual(buildVideoPrompt(input))
    }
  })
})

const SHOT = {
  shot_id: 'shot-2', scene_id: 'scene-1', sort_order: 2, design_ref: null, dialogue_lines: null, character_appearance_keys: {}, characters: [],
  static_spec: null, director_refs: null, storyboard_image: STORYBOARD, prompt: PROMPT,
  dynamic_spec: { shot_id: 'shot-2', camera_motion: { type: 'static', speed: 'slow', magnitude: 'minimal' }, character_motion: [], motion_prompt: MOTION },
}
// 지금 연출 장을 읽은 줄 — [그대로]를 골라 끝 장은 그 줄로 다시 그리지 않았다(endDrawn null). 영상은 그래도 줄을 쓴다(리드 D2).
const roughWith = (read: Record<string, unknown> | null) => ({ ...ROUGH, ...(read ? { directionRead: read } : {}) })
const FRESH = { en: LINE, ko: '여자가 창에서 돌아서 카메라 쪽으로 걸어온다.', source: 'user', direction: ROUGH.frames.direction, at: 1, endDrawn: null }

function seed(rough: unknown) {
  mocks.from.mockReset()
  mocks.from.mockImplementation(tablesFrom({
    projects: [{ workspace_id: WORKSPACE, style_anchor_key: null, custom_style_anchor: null, settings: null }],
    shots: [{ ...SHOT, rough_storyboard: rough }],
  }))
}
async function prepared() {
  const result = await prepareDirectorVideoSubmission(videoRequest({ model: 'seedance', prompt: PROMPT }), 'user-1')
  if (result instanceof Response) throw new Error(`prepare failed: ${result.status} ${await result.clone().text()}`)
  return result
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

describe('영상 지시문의 읽은 줄 — 영상 요청', () => {
  it('영상을 만들 때 그 샷의 지금 연출 장을 읽은 줄이 있으면 끝 장을 그 줄로 그리지 않았어도 영상 지시 맨 앞에 싣고, 작가의 옛 움직임 글은 붙이지 않는다', async () => {
    // 왜(오너 Q4 · 리드 D2): [그대로]를 골라도 영상에는 고친 연출이 들어가야 한다. 작가의 옛 움직임 글은 고치기 전 움직임이라 함께 실으면 다툰다.
    seed(roughWith(FRESH))
    const text = String((await prepared()).inputSnapshot.full_prompt)
    expect(text.startsWith(MOVEMENT)).toBe(true)
    expect(text).not.toContain(MOTION)
    expect(text).toContain(PROMPT)
  })

  it('영상에 싣는 읽은 줄은 내용 검사를 거치고 작업 기록(direction_read)에 남는다', async () => {
    // 왜(10/11 약속): 읽은 줄에는 사람이 연출 장에 쓴 손글씨 · 고친 글이 옮겨진다 — 사용자 글처럼 검사하고, 무엇을 실었는지 기록으로 남긴다.
    seed(roughWith(FRESH))
    const result = await prepared()
    expect(mocks.moderated.flat()).toContain(LINE)
    expect(result.inputSnapshot.direction_read).toBe(LINE)
  })

  it('읽은 줄이 없거나 낡았으면(연출 장이 바뀜) 영상 지시 · 내용 검사 · 작업 기록이 지금과 같다', async () => {
    // 왜: 리드 조건 — 낡은 줄은 지금 연출 장과 다른 움직임이라 어디에도 쓰지 않는다. 화살표를 고치지 않은 샷은 한 글자도 안 바뀐다.
    seed(roughWith(null))
    const plain = await prepared()
    const plainModerated = [...mocks.moderated]
    mocks.moderated.length = 0
    seed(roughWith({ ...FRESH, direction: 'https://storage.test/old-direction.png' }))
    const stale = await prepared()
    expect(stale.inputSnapshot.full_prompt).toBe(plain.inputSnapshot.full_prompt)
    expect(String(plain.inputSnapshot.full_prompt)).toContain(`${MOTION} ${PROMPT}`)
    expect(mocks.moderated).toEqual(plainModerated)
    expect(stale.inputSnapshot).not.toHaveProperty('direction_read')
  })
})
