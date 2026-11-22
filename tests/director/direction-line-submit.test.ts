// 영상을 만들 때 서버가 그 샷의 고친 연출 장을 읽은 줄을 찾아 영상 지시에 싣고, 내용 검사에 넣고, 작업 기록에 남긴다 (오너 2026-11-22 Q4)
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

import { prepareDirectorVideoSubmission, type PreparedDirectorVideoSubmission } from '@/lib/director/video-submit'
import { ROUGH, ROUGH_DIRECTION, STORYBOARD, WORKSPACE, tablesFrom, videoRequest } from '../fixtures/_video-submit'

const LINE = 'The mannequin turns, walks over and stands in the lower-right foreground, close to the camera.'
const STORED_PROMPT = 'Medium shot of Doyoon standing by a rusted locker in the rain'
// 지금 연출 장을 읽은 줄이고 그 줄로 그린 끝 장이 지금 끝 장이다(fb-end freshDirectionLine 조건 — 리드 Q-a).
const FRESH_READ = { en: LINE, ko: '마네킹이 몸을 돌려 걸어와 오른쪽 아래 전경에 선다.', source: 'ai', direction: ROUGH_DIRECTION, at: 1763900000000, endDrawn: ROUGH.frames.end }
const shotWith = (rough: unknown) => ({
  shot_id: 'shot-2', scene_id: 'scene-1', sort_order: 2, design_ref: null, dialogue_lines: null, character_appearance_keys: {}, characters: [],
  static_spec: null, director_refs: null, storyboard_image: STORYBOARD, rough_storyboard: rough, prompt: STORED_PROMPT,
  dynamic_spec: { shot_id: 'shot-2', camera_motion: { type: 'static', speed: 'slow', magnitude: 'minimal' }, character_motion: [], motion_prompt: 'He slowly raises his hand to the keypad.' },
})

function seed(rough: unknown) {
  mocks.from.mockReset()
  mocks.from.mockImplementation(tablesFrom({
    projects: [{ workspace_id: WORKSPACE, style_anchor_key: null, settings: null }],
    shots: [shotWith(rough)],
  }))
}

async function prepare(extra: Record<string, unknown> = {}): Promise<PreparedDirectorVideoSubmission> {
  const prepared = await prepareDirectorVideoSubmission(videoRequest({ model: 'seedance', prompt: STORED_PROMPT, ...extra }), 'user-1')
  if (prepared instanceof Response) throw new Error(`prepare failed: ${prepared.status} ${await prepared.clone().text()}`)
  return prepared
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.moderated.length = 0
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
})

describe('같이 정한 것', () => {
  // 왜: 오너 Q4 "영상 지시에도 사용해줘" — 화살표를 고쳐 저장하면 AI 가 읽은 줄이 러프 기록에 남는다. 그 샷의 영상을 만들 때 서버가 찾아 싣는다.
  it('고친 연출 장을 읽은 줄이 있으면 영상 지시 맨 앞에 싣고 작업 기록에 남긴다', async () => {
    seed({ ...ROUGH, directionRead: FRESH_READ })
    const prepared = await prepare({ videoMode: 'start_prompt' })

    expect(String(prepared.inputSnapshot.full_prompt).startsWith(`Movement (from the edited direction sketch): ${LINE}`)).toBe(true)
    expect(prepared.inputSnapshot.direction_read).toBe(LINE)
  })

  // 왜: 정상 경로 고정(리드) — 줄이 없거나, 줄을 읽은 뒤 연출 장이 다시 바뀌어 낡은 샷은 이 기능 전과 같은 지시 · 기록이어야 한다.
  it('읽은 줄이 없거나 낡았으면 영상 지시와 작업 기록은 지금과 같다', async () => {
    seed(ROUGH)
    const none = await prepare()
    seed({ ...ROUGH, directionRead: { ...FRESH_READ, direction: `${ROUGH_DIRECTION}?v=1` } })
    const stale = await prepare()

    for (const prepared of [none, stale]) {
      expect(prepared.inputSnapshot).not.toHaveProperty('direction_read')
      expect(String(prepared.inputSnapshot.full_prompt)).not.toContain('Movement (from the edited direction sketch)')
    }
    expect(stale.inputSnapshot.full_prompt).toBe(none.inputSnapshot.full_prompt)
  })
})

describe('혼자 정한 것', () => {
  // 왜: 작가가 샷 설계 때 쓴 움직임 글(motion_prompt)은 옛 화살표의 움직임이다 — 읽은 줄과 다른 움직임을 시키지 않게 붙이지 않는다.
  it('읽은 줄이 있으면 작가가 쓴 옛 움직임 글을 장면 글 앞에 붙이지 않는다', async () => {
    seed(ROUGH)
    const before = await prepare()
    expect(String(before.inputSnapshot.full_prompt)).toContain('He slowly raises his hand to the keypad.')

    seed({ ...ROUGH, directionRead: FRESH_READ })
    const after = await prepare()
    expect(String(after.inputSnapshot.full_prompt)).not.toContain('He slowly raises his hand to the keypad.')
    expect(String(after.inputSnapshot.full_prompt)).toContain(STORED_PROMPT)
  })

  // 왜: 리드 D2(2026-11-22) — 끝 그림이 영상에서 빠져 "줄과 끝 그림이 맞아야 한다"(리드 Q-a)의 까닭이 영상에는 없어졌다.
  //   화살표를 고치고 끝 장을 [그대로] 두어도 영상은 고친 연출을 따라야 D10 의 처음 문제("화살표를 고쳐도 안 바뀜")가 생기지 않는다.
  //   실사(R1)는 지금처럼 끝 장을 그린 줄만 쓴다(실사 시트에는 끝 칸이 있다) — 이 시험은 영상 쪽만 본다.
  it('영상은 지금 연출 장을 읽은 줄이면 끝 장을 그 줄로 그리지 않았어도 싣는다', async () => {
    for (const endDrawn of [null, `${ROUGH.frames.end}?v=old`]) {
      seed({ ...ROUGH, directionRead: { ...FRESH_READ, endDrawn } })
      const prepared = await prepare()
      expect({ endDrawn, line: prepared.inputSnapshot.direction_read }).toEqual({ endDrawn, line: LINE })
    }
  })

  // 왜: 읽은 줄에는 사람이 연출 장에 쓴 손글씨나 사람이 고친 글이 옮겨진다 — 다른 사용자 글처럼 생성처에 보내기 전에 검사한다.
  it('읽은 줄도 사용자 글처럼 내용 검사에 넣는다', async () => {
    seed({ ...ROUGH, directionRead: FRESH_READ })
    await prepare()

    expect(mocks.moderated.at(-1)).toContain(LINE)
  })
})
