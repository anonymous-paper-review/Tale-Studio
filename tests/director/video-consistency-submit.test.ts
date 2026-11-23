// 실사 그림체의 영상을 제출할 때만 새 지시문을 쓰고, 자동으로 채운 카메라 값을 사람이 고친 값으로 보지 않으며, 새로 싣는 이름 · 겉모습도 내용 검사에 넣는다 (오너 2026-11-23)
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

import { _clearDesignMemoForTest, prepareDirectorVideoSubmission, type PreparedDirectorVideoSubmission } from '@/lib/director/video-submit'
import { _clearReferenceImageCacheForTest } from '@/lib/style-facets/reference-image'
import { _clearPhotoLookCacheForTest } from '@/lib/style-facets/photo-look'
import { ROUGH, STORYBOARD, WORKSPACE, tablesFrom, videoRequest } from '../fixtures/_video-submit'

const PROMPT = 'Medium shot of Mina standing by a rusted locker.'
const ZERO = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
const STATIC = { camera_motion: { type: 'static', speed: 'slow', magnitude: 'minimal' }, character_motion: [], motion_prompt: '' }
const DOLLY = { camera_motion: { type: 'dolly_in', speed: 'slow', direction: 'forward', magnitude: 'minimal' }, character_motion: [], motion_prompt: '' }
const design = (shotId: string, dynamic: object) => ({ intent: { shot_id: shotId, scene_id: 'sc_01' }, static_spec: { shot_id: shotId, camera_angle: 'eye_level' }, dynamic_spec: dynamic })
const SHOT = {
  shot_id: 'shot-2', scene_id: 'scene-1', sort_order: 2, design_ref: 'shot_9', dialogue_lines: null, character_appearance_keys: {}, characters: [],
  static_spec: { camera_angle: 'eye_level' }, director_refs: null, storyboard_image: STORYBOARD, rough_storyboard: ROUGH, prompt: PROMPT, dynamic_spec: { shot_id: 'shot-2', ...STATIC },
}

const STYLE = (key: string, useReference: boolean, medium = 'live_action') =>
  ({ key, image_url: 'https://style.test/a.png', is_active: true, medium, style_clause: null, use_preview_ref: false, preview_url: null, anchor_kind: 'media', use_reference_image: useReference })
const REAL = STYLE('real', false)

function seed(shot: Record<string, unknown> = {}, tables: Record<string, unknown[]> = {}, style: ReturnType<typeof STYLE> | null = REAL, project: Record<string, unknown> = {}) {
  mocks.from.mockReset()
  mocks.from.mockImplementation(tablesFrom({
    projects: [{ workspace_id: WORKSPACE, style_anchor_key: style?.key ?? null, custom_style_anchor: null, settings: null, ...project }],
    ...(style ? { style_anchors: [style] } : {}),
    shots: [{ ...SHOT, ...shot }],
    writer_runs: [[{ id: 'run-1', status: 'completed', created_at: '2026-11-20', shotDesign: [design('shot-2', DOLLY), design('shot_9', STATIC)] }]],
    ...tables,
  }))
}
async function prepare(extra: Record<string, unknown> = {}): Promise<PreparedDirectorVideoSubmission> {
  const prepared = await prepareDirectorVideoSubmission(videoRequest({ model: 'seedance', prompt: PROMPT, ...extra }), 'user-1')
  if (prepared instanceof Response) throw new Error(`prepare failed: ${prepared.status} ${await prepared.clone().text()}`)
  return prepared
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

const NAMED = {
  // 자리 글은 앉아 있는데 장부가 "앉는다"를 더한 샷 — 실사 그림체만 그 동작을 뺀다.
  static_spec: { camera_angle: 'eye_level', character_blocking: [{ character_id: 'mina', pose: 'sitting on a stool' }] },
  dynamic_spec: { shot_id: 'shot-2', ...STATIC, character_motion: [{ character_id: 'mina', verb: 'turns her head sharply', magnitude: 'small' }, { character_id: 'mina', verb: 'sits down', magnitude: 'medium', source: 'ledger' }], motion_prompt: 'The camera pushes in on Mina as she turns.' },
  character_appearance_keys: { mina: 'current' },
  dialogue_lines: [{ text: 'Hello.', delivery: 'standing up', characterId: 'mina' }],
}
const PEOPLE = {
  characters: [[{ character_id: 'mina', name: '미나', name_en: 'Mina', name_en_source: '미나' }]],
  character_appearances: [[{ character_id: 'mina', appearance_key: 'current', is_default: true, appearance: 'A woman in red.' }]],
}

describe('어느 그림체에 쓰는가', () => {
  it('실사 그림체의 영상은 인물을 이름으로 부르고 카메라를 움직임 약속 한 곳에서만 말한다', async () => {
    // 왜: 오너 11/23 "2 모두 적용을 실사 스타일로 지정해주고" — 영상 지시문도 그 안에 든다.
    seed(NAMED, PEOPLE)
    const text = String((await prepare({ camera: ZERO })).inputSnapshot.full_prompt)
    expect(text).toContain('Mina (a woman in red): "turns her head sharply" — a small but quick movement')
    expect(text).not.toMatch(/pushes in on Mina|sits down|미나/)
    expect(text).toContain(`Mina turns. ${PROMPT}`)
    expect(text).toContain('Mina says aloud: "Hello." — delivery: standing up')
    expect(text).toContain('Delivery notes describe the voice only.')
  })

  it('일본 멜로 · 다른 실사 그림체 · 애니 · 그림체 없음 · 사용자가 올린 그림체의 영상은 지금 지시문 그대로다', async () => {
    // 왜: 오너가 일본 멜로는 "1 이전"으로 정했고 나머지 그림체는 정하지 않았다 — 실사만 바뀐다.
    const cases: Array<[ReturnType<typeof STYLE> | null, Record<string, unknown>]> = [
      [STYLE('real_jp_melo', true), {}],
      [STYLE('real_psy_horror', true), {}],
      [STYLE('jp_anime', true, '2d_anime'), {}],
      [STYLE('no_reference_anime', false, '2d_anime'), {}],
      [null, {}],
      [REAL, { custom_style_anchor: { url: 'https://user.test/style.png' } }],
    ]
    const texts: string[] = []
    for (const [style, project] of cases) {
      seed(NAMED, PEOPLE, style, project)
      mocks.moderated.length = 0
      texts.push(String((await prepare({ camera: { ...ZERO, zoom: 3 } })).inputSnapshot.full_prompt))
      // 내용 검사에 보내는 글도 지금과 같다 — 샷 글과 대사뿐.
      expect(mocks.moderated).toEqual([[`The camera pushes in on Mina as she turns. ${PROMPT}`, 'Hello.']])
    }
    expect(new Set(texts).size).toBe(1)
    expect(texts[0]).toContain('subject 1: "turns her head sharply" — a small, restrained movement')
    expect(texts[0]).toContain(`The camera pushes in on Mina as she turns. ${PROMPT}`)
    expect(texts[0]).toContain('Camera zooms slowly in')
    expect(texts[0]).toContain('then the same subject: "sits down"')
    expect(texts[0]).toContain('미나 (A woman in red) says aloud: "Hello." — delivery: standing up')
    expect(texts[0]).not.toContain('Delivery notes')
  })
})

describe('자동으로 채운 카메라 값', () => {
  it('Director 가 같은 번호의 다른 샷 설계에서 잘못 채운 카메라 값이면, 사람이 고친 값으로 보지 않고 이 샷 설계의 카메라를 쓴다', async () => {
    // 왜: 샷을 나누거나 번호를 바꾼 프로젝트는 빈 카메라를 같은 번호의 옛 설계(다른 샷)로 채운다 — 127샷 가운데 85샷이 그랬다(11/23 검토).
    seed()
    const text = String((await prepare({ camera: { ...ZERO, zoom: 3 } })).inputSnapshot.full_prompt)
    expect(text).toContain('Camera: LOCKED tripod shot')
    expect(text).not.toMatch(/zooms slowly in/)
  })

  it('사람이 고친 카메라 값은 설계 대신 쓴다', async () => {
    // 왜: 정상 경로 고정 — 어느 설계와도 다른 값은 사람이 고른 것이다.
    seed()
    const text = String((await prepare({ camera: { ...ZERO, zoom: 8 } })).inputSnapshot.full_prompt)
    expect(text).toContain('Camera: zooms dramatically in.')
    expect(text).not.toContain('LOCKED')
  })

  it('여러 샷의 영상을 잇달아 준비해도 실행 기록은 프로젝트마다 한 번만 읽는다', async () => {
    // 왜: 영상 일괄은 한 번에 100샷까지 차례로 준비한다 — 샷마다 큰 실행 기록을 다시 읽으면 시간 제한에 걸릴 수 있다(11/23 검토).
    seed()
    for (let i = 0; i < 3; i++) await prepare({ camera: { ...ZERO, zoom: 3 } })
    expect(mocks.from.mock.calls.filter(([table]) => table === 'writer_runs')).toHaveLength(1)
  })

  it('실행 기록을 읽지 못했으면 다음 샷에서 다시 읽는다', async () => {
    // 왜: 잠깐의 조회 실패를 기억해 두면 그동안 준비한 샷들이 모두 "사람이 고친 카메라"로 잘못 읽힌다.
    seed({}, { writer_runs: [[], [{ id: 'run-1', status: 'completed', created_at: '2026-11-20', shotDesign: [design('shot-2', DOLLY), design('shot_9', STATIC)] }]] })
    expect(String((await prepare({ camera: { ...ZERO, zoom: 3 } })).inputSnapshot.full_prompt)).toContain('Camera: zooms slowly in.')
    expect(String((await prepare({ camera: { ...ZERO, zoom: 3 } })).inputSnapshot.full_prompt)).toContain('Camera: LOCKED tripod shot')
  })

  it('설계의 각도 값 모양이 이상해도 영상 요청이 실패하지 않는다', async () => {
    // 왜: 각도 칸에 글자가 아닌 값이 들어 있으면 요청이 500 으로 끊겼다(11/23 검토).
    for (const camera_angle of [['high'], { a: 1 }, 5]) {
      seed({ static_spec: { camera_angle } })
      expect(String((await prepare({ camera: ZERO })).inputSnapshot.full_prompt)).toContain('Motion contract:')
    }
  })
})

describe('새로 싣는 글의 내용 검사', () => {
  const LOOKS = { character_appearances: [[{ character_id: 'mina', appearance_key: 'current', is_default: true, appearance: 'A LOOK_FROM_USER person in red.' }]] }
  const NAME = { characters: [[{ character_id: 'mina', name: 'NAME_FROM_USER', name_en: null, name_en_source: null }]] }

  it('움직임 약속에 싣는 인물 이름 · 겉모습 글도 내용 검사에 넣는다', async () => {
    // 왜: 이름과 겉모습은 사람이 고쳐 쓸 수 있는 글이다 — 유료 생성에 보내기 전에 검사하지 않으면 지난 검사를 비켜 간다(11/23 검토).
    seed({ dynamic_spec: { shot_id: 'shot-2', ...STATIC, character_motion: [{ character_id: 'mina', verb: 'turns', magnitude: 'small' }] }, character_appearance_keys: { mina: 'current' } }, { ...NAME, ...LOOKS })
    const text = String((await prepare({ camera: ZERO })).inputSnapshot.full_prompt)
    expect(text).toContain('NAME_FROM_USER (a LOOK_FROM_USER person in red): "turns"')
    const checked = mocks.moderated.at(-1)!.join('\n')
    expect(checked).toContain('NAME_FROM_USER')
    expect(checked).toContain('LOOK_FROM_USER')
  })

  it('대사에 싣는 화자 이름 · 겉모습 글도 내용 검사에 넣는다', async () => {
    // 왜: 움직임이 없는 대사 샷은 화자 이름과 겉모습만 실린다 — 그 글도 검사해야 한다.
    seed({ character_appearance_keys: { mina: 'current' }, dialogue_lines: [{ text: 'Hello.', characterId: 'mina' }] }, { ...NAME, ...LOOKS })
    const text = String((await prepare({ camera: ZERO })).inputSnapshot.full_prompt)
    expect(text).toContain('NAME_FROM_USER (A LOOK_FROM_USER person in red) says aloud: "Hello."')
    const checked = mocks.moderated.at(-1)!.join('\n')
    expect(checked).toContain('NAME_FROM_USER')
    expect(checked).toContain('LOOK_FROM_USER')
  })
})
