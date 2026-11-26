// 영상 지시에 싣는 읽은 줄을 고르는 곳 — 실사 가운데 장을 고쳐 읽은 줄이 지금 실사 가운데 장의 것이면 그 줄, 아니면 지금처럼 콘티 줄 — 을 검사한다 (오너 2026-11-27 N4b · 리드)
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
import { pickVideoDirectionRead, videoDirectionLine } from '@/lib/writer/direction-read'
import { _clearReferenceImageCacheForTest } from '@/lib/style-facets/reference-image'
import { _clearPhotoLookCacheForTest } from '@/lib/style-facets/photo-look'
import { REAL_DIRECTION, ROUGH, STORYBOARD, WORKSPACE, tablesFrom, videoRequest } from '../fixtures/_video-submit'

// 이 시험을 위해 지은 샷 — 콘티에서 고친 화살표를 읽은 줄(CONTI_LINE)과, 실사 가운데 장에서 다시 고친 화살표를 읽은 줄(REAL_LINE)이 있다.
const PROMPT = 'Medium shot of Mina standing by a rusted locker.'
const CONTI_LINE = 'Mina turns toward the door and steps forward.'
const REAL_LINE = 'Mina sits down on the bench and looks up at the window.'
const SHOT = {
  shot_id: 'shot-2', scene_id: 'scene-1', sort_order: 2, design_ref: null, dialogue_lines: null, character_appearance_keys: {}, characters: [],
  static_spec: null, director_refs: null, prompt: PROMPT,
  dynamic_spec: { shot_id: 'shot-2', camera_motion: { type: 'static', speed: 'slow', magnitude: 'minimal' }, character_motion: [], motion_prompt: null },
}
const contiRead = { en: CONTI_LINE, ko: null, source: 'ai', direction: ROUGH.frames.direction, at: 1, endDrawn: null }
const realRead = (direction: string) => ({ en: REAL_LINE, ko: null, source: 'ai', direction, at: 2, endDrawn: null })
const rough = { ...ROUGH, directionRead: contiRead }
const realWith = (read: unknown) => ({ ...STORYBOARD, ...(read ? { directionRead: read } : {}) })

function seed(storyboardImage: unknown) {
  mocks.from.mockReset()
  mocks.from.mockImplementation(tablesFrom({
    projects: [{ workspace_id: WORKSPACE, style_anchor_key: null, custom_style_anchor: null, settings: null }],
    shots: [{ ...SHOT, rough_storyboard: rough, storyboard_image: storyboardImage }],
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

describe('영상 지시의 읽은 줄 고르기', () => {
  // 왜(리드 N4b): 실사 가운데 장에서 화살표를 고치면 실사 시트(시작+미들 영상이 보내는 가운데 장)가 그 움직임이다 — 영상 지시가 옛 콘티 줄을 실으면 그림과 글이 다툰다.
  it('실사 가운데 장을 고쳐 읽은 줄이 지금 실사 가운데 장의 것이면 영상 지시는 콘티 줄 대신 그 줄을 싣는다', async () => {
    seed(realWith(realRead(REAL_DIRECTION)))
    const result = await prepared()
    const text = String(result.inputSnapshot.full_prompt)
    expect(text.startsWith(`Movement (from the edited direction sketch): ${REAL_LINE}`)).toBe(true)
    expect(text).not.toContain(CONTI_LINE)
    expect(mocks.moderated.flat()).toContain(REAL_LINE)
    expect(result.inputSnapshot.direction_read).toBe(REAL_LINE)
  })

  // 왜: 실사를 다시 그렸거나 다른 판을 [채택]하면 가운데 장 주소가 달라 실사 줄은 낡는다 — 그때 실사는 콘티대로 그린 그림이라 지금처럼 콘티 줄이 맞다.
  it('실사에서 읽은 줄이 지금 실사 가운데 장의 것이 아니면(다른 판 · 다시 그림) 지금처럼 콘티 줄을 싣는다', async () => {
    seed(realWith(realRead('https://storage.test/older-real-direction.png')))
    const stale = await prepared()
    expect(String(stale.inputSnapshot.full_prompt).startsWith(`Movement (from the edited direction sketch): ${CONTI_LINE}`)).toBe(true)
    expect(stale.inputSnapshot.direction_read).toBe(CONTI_LINE)
    mocks.moderated.length = 0
    seed(realWith(null))
    const none = await prepared()
    expect(none.inputSnapshot.full_prompt).toBe(stale.inputSnapshot.full_prompt)
  })

  // 왜(리드): 시작+미들 영상의 "러프 바뀜" 막기(n-video)는 줄이 실사에서 왔으면(미들과 같은 장에서 읽은 줄) 막지 않는다 — 고른 줄의 출처를 같이 돌려준다.
  it('영상 줄 고르기는 고른 줄과 그 출처(실사 · 콘티)를 같이 돌려주고, 둘 다 없거나 낡았으면 줄이 없다', () => {
    expect(pickVideoDirectionRead({ storyboard_image: realWith(realRead(REAL_DIRECTION)), rough_storyboard: rough })).toEqual({ en: REAL_LINE, source: 'real' })
    expect(pickVideoDirectionRead({ storyboard_image: realWith(null), rough_storyboard: rough })).toEqual({ en: CONTI_LINE, source: 'conti' })
    expect(pickVideoDirectionRead({ storyboard_image: realWith(null), rough_storyboard: ROUGH })).toBeNull()
    expect(pickVideoDirectionRead(null)).toBeNull()
    expect(videoDirectionLine({ storyboard_image: realWith(realRead(REAL_DIRECTION)), rough_storyboard: rough })).toBe(REAL_LINE)
    expect(videoDirectionLine({ rough_storyboard: { ...ROUGH, directionRead: { ...contiRead, direction: 'https://storage.test/old.png' } } })).toBeNull()
  })
})
