// 영상 요청에 만드는 방식을 실으면 서버가 그 방식대로 그림을 골라 보내고 모델에 그림의 역할을 적는다 (오너 2026-11-22 D2~D5)
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

import { buildVideoPrompt } from '@/lib/director/video-prompt'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'
import { prepareDirectorVideoSubmission, type PreparedDirectorVideoSubmission } from '@/lib/director/video-submit'
import { takeCostForVideo } from '@/lib/billing/take-cost'
import { END, PROJECT, ROUGH, ROUGH_DIRECTION, START, STORYBOARD, WORKSPACE, media, tablesFrom, videoRequest } from '../fixtures/_video-submit'

const SHEET = media(`${WORKSPACE}/${PROJECT}/characters/mina_sheet.png`)
const SHEET_2 = media(`${WORKSPACE}/${PROJECT}/characters/joon_sheet.png`)
const WORLD = media(`${WORKSPACE}/${PROJECT}/locations/harbor_wide.png`)
const PREV_PATH = `${WORKSPACE}/${PROJECT}/videos/clip-prev/job-prev.mp4`
const CHAIN_FRAME = media(`${WORKSPACE}/${PROJECT}/videos/clip-prev/job-prev_chain-frame-2850.jpg`)
const CONTINUE_FROM = { videoClipId: 'clip-prev', generationJobId: 'job-prev', frameUrl: CHAIN_FRAME }

const SHOT = {
  shot_id: 'shot-2',
  scene_id: 'scene-1',
  sort_order: 2,
  dynamic_spec: {},
  design_ref: null,
  dialogue_lines: null,
  character_appearance_keys: { mina: 'current', joon: 'current' },
  prompt: null,
  storyboard_image: STORYBOARD,
  characters: ['joon', 'mina'],
  static_spec: null,
  director_refs: null,
  rough_storyboard: ROUGH,
}
const SCENE_SHOTS = [
  { shot_id: 'shot-1', scene_id: 'scene-1', sort_order: 1 },
  { shot_id: 'shot-2', scene_id: 'scene-1', sort_order: 2 },
]
const PREV_TAKE = {
  id: 'clip-prev', shot_id: 'shot-1', url: media(PREV_PATH), storage_path: PREV_PATH, status: 'completed', is_final: false,
  take_number: 1, created_at: '2026-11-20T00:00:00.000Z', last_attempt_at: '2026-11-20T00:00:00.000Z', last_attempt_job_id: 'job-prev', deleted_at: null,
}

function seed(overrides: Partial<Record<string, unknown[]>> = {}) {
  mocks.from.mockReset()
  mocks.from.mockImplementation(tablesFrom({
    projects: [{ workspace_id: WORKSPACE, style_anchor_key: null, settings: null }],
    shots: [SHOT, SCENE_SHOTS],
    video_clips: [[PREV_TAKE]],
    characters: [[{ character_id: 'joon', name: 'Joon' }, { character_id: 'mina', name: 'Mina' }]],
    character_appearances: [[
      { character_id: 'mina', appearance_key: 'current', is_default: true, sheet_url: SHEET },
      { character_id: 'joon', appearance_key: 'current', is_default: true, sheet_url: SHEET_2 },
    ]],
    scenes: [[{ scene_id: 'scene-1', location: 'loc-1', narrative_time: null }]],
    locations: [[{ location_id: 'loc-1', scene_id: null, wide_shot: WORLD }]],
    location_appearances: [[]],
    ...overrides,
  }))
}

async function prepare(extra: Record<string, unknown>): Promise<PreparedDirectorVideoSubmission> {
  const prepared = await prepareDirectorVideoSubmission(videoRequest(extra), 'user-1')
  if (prepared instanceof Response) throw new Error(`prepare failed: ${prepared.status} ${await prepared.clone().text()}`)
  return prepared
}

async function rejected(extra: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const prepared = await prepareDirectorVideoSubmission(videoRequest(extra), 'user-1')
  if (!(prepared instanceof Response)) throw new Error('expected a rejection')
  return { status: prepared.status, body: await prepared.json() }
}

const falInput = (prepared: PreparedDirectorVideoSubmission) =>
  (prepared.inputSnapshot.fal_request as { input: Record<string, unknown> }).input
const fullPrompt = (prepared: PreparedDirectorVideoSubmission) => String(prepared.inputSnapshot.full_prompt)

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  seed()
})

describe('같이 정한 것', () => {
  // 왜: 정상 경로 고정 — 방식을 고르지 않은 화면(노드 보기 · 옛 화면)과 기본 방식(시작+끝)은 지금처럼 만든다(D2~D5: 이전 방식을 고를 수 있게).
  it('방식을 고르지 않으면 지금처럼 실사 시작 · 끝 그림으로 만든다', async () => {
    for (const extra of [{}, { videoMode: 'start_end' }]) {
      seed()
      const prepared = await prepare({ model: 'seedance', ...extra })
      expect(falInput(prepared).image_urls).toEqual([START, END])
      expect(prepared.inputSnapshot.reference_image_roles).toEqual(['start', 'end'])
      expect(prepared.inputSnapshot).not.toHaveProperty('video_mode')
    }
  })

  // 왜: D2~D5 ① "앞에서 생성된 영상의 end frame 을 이번 shot 의 start frame 으로" — Camera 에서 [이어서]로 만들 때.
  it('이어서를 고르면 앞 샷 영상의 마지막 장면을 이번 샷의 시작 그림으로 쓴다', async () => {
    const prepared = await prepare({ model: 'seedance', videoMode: 'continue', continueFrom: CONTINUE_FROM })

    expect(falInput(prepared).image_urls).toEqual([CHAIN_FRAME, END])
    expect(prepared.inputSnapshot.reference_image_roles).toEqual(['start', 'end'])
    expect(prepared.inputSnapshot.video_mode).toBe('continue')
    expect(prepared.inputSnapshot.continue_from).toEqual({ video_clip_id: 'clip-prev', generation_job_id: 'job-prev', frame_url: CHAIN_FRAME })
    expect(fullPrompt(prepared)).toContain("last frame of the previous shot's video")
  })

  // 왜: D2~D5 ② "이미지를 레퍼런스로만 입력해서 영상을 생성한다" — 시작 · 끝 장면에 묶이지 않고 인물 · 배경을 참고로만.
  it('레퍼런스를 고르면 그림을 참고로만 보내고 시작 · 끝 장면으로 쓰지 않는다', async () => {
    const prepared = await prepare({ model: 'seedance', videoMode: 'reference' })

    expect(falInput(prepared).image_urls).toEqual([START, SHEET_2, SHEET, WORLD])
    expect(prepared.inputSnapshot.reference_image_roles).toEqual(['ref', 'ref', 'ref', 'ref'])
    expect(fullPrompt(prepared)).toContain('references only')
    expect(fullPrompt(prepared)).toContain('image 2 = character sheet: Joon')
    expect(fullPrompt(prepared)).not.toContain('= START')
  })

  // 왜: D2~D5 ③ "start, middle 이미지를 사용한다. middle 의 경우 연출, 의도라는 것을 영상 생성 모델에 설명한다."
  it('시작+미들을 고르면 실사 시작 그림과 미들을 보내고, 미들은 장면이 아니라 연출 · 의도라고 모델에 적는다', async () => {
    const prepared = await prepare({ model: 'seedance', videoMode: 'start_middle' })

    expect(falInput(prepared).image_urls).toEqual([START, `${ROUGH_DIRECTION}?v=${ROUGH.generatedAt}`])
    expect(prepared.inputSnapshot.reference_image_roles).toEqual(['start', 'direction'])
    expect(fullPrompt(prepared)).toContain('DIRECTION sketch, not a frame of the video')
    expect(fullPrompt(prepared)).toContain('Never draw arrows, lines, labels, text, pencil texture or wooden mannequins')
  })

  // 왜: D2~D5 ④ "start 이미지와 연출에 대한 프롬프트를 같이 입력한다" — 지금은 끝 그림이 있으면 저절로 붙어 고를 수 없었다(방안 D4).
  it('시작+프롬프트를 고르면 실사 시작 한 장과 연출 글로 만들고, 실사 끝 그림이 있어도 보내지 않는다', async () => {
    const prepared = await prepare({ model: 'seedance', videoMode: 'start_prompt' })

    expect(falInput(prepared).image_urls).toEqual([START])
    expect(prepared.inputSnapshot.reference_image_roles).toEqual(['start'])
    expect(fullPrompt(prepared)).toContain('There is no end frame')
  })

  // 왜: 지금 약속(billing/take-cost · 방안 D4 "Take 값은 그대로") — 방식을 바꿔도 화면에 보인 Take 와 서버가 잡는 Take 가 같아야 한다.
  it('어느 방식이든 Take 는 모델과 해상도로만 정해진다', async () => {
    for (const videoMode of ['start_end', 'continue', 'reference', 'start_middle', 'start_prompt']) {
      for (const [model, resolution] of [['seedance', '720p'], ['veo', '1080p'], ['kling-o3', '720p']] as const) {
        seed()
        const prepared = await prepare({ model, resolution, videoMode, continueFrom: CONTINUE_FROM })
        expect({ videoMode, model, take: prepared.takeAmount }).toEqual({ videoMode, model, take: takeCostForVideo(model, resolution) })
      }
    }
  })
})

describe('혼자 정한 것', () => {
  // 왜: 낡은 화면이 옛 그림을 보내던 고장(Director 배선 5)과 같은 방향 — 방식을 고른 요청의 그림은 서버가 DB 에서 정한다.
  it('방식을 보내면 그림은 서버가 DB 에서 고르고 화면이 보낸 그림 목록은 쓰지 않는다', async () => {
    const stale = media(`${WORKSPACE}/${PROJECT}/storyboard/old.png`)
    const prepared = await prepare({
      model: 'seedance', videoMode: 'start_prompt', frameSource: 'manual',
      referenceImageUrl: stale, referenceImageUrls: [stale], referenceImageRoles: ['start'],
    })

    expect(falInput(prepared).image_urls).toEqual([START])
  })

  // 왜: Take 카드에 방식이 적히고 [다시 만들기]가 같은 방식으로 만들려면 새 Take 기록에 방식이 남아야 한다.
  //   작업 기록에는 기본이 아닌 방식만 적는다 — 기본은 이 기능 전 작업과 같은 기록 모양(재생 비교 보호).
  it('새 Take 는 고른 방식을 기록에 남기고, 작업 기록에는 기본이 아닌 방식만 적는다', async () => {
    const reference = await prepare({ model: 'seedance', videoMode: 'reference', override: { videoMode: 'reference' } })
    expect(reference.override).toMatchObject({ videoMode: 'reference' })
    expect(reference.inputSnapshot.video_mode).toBe('reference')

    seed()
    const plain = await prepare({ model: 'seedance', videoMode: 'start_end', override: { videoMode: 'start_end' } })
    expect(plain.override).toMatchObject({ videoMode: 'start_end' })
    expect(plain.inputSnapshot).not.toHaveProperty('video_mode')
  })

  // 왜: Camera 이력 사이에 "무엇을 왜 바꿨나"를 보이려면(오너 D2~D5, fb-camera) 사람이 쓴 말과 만든 길이 Take 기록에 남아야 한다.
  it('이력 요약용 사람이 쓴 말과 만든 길(단추 · 채팅 · 일괄)을 새 Take 기록에 남기고 모르는 값은 버린다', async () => {
    const kept = await prepare({ model: 'seedance', override: { note: 'Faster dolly', via: 'chat' } })
    expect(kept.override).toMatchObject({ note: 'Faster dolly', via: 'chat' })

    seed()
    const dropped = await prepare({ model: 'seedance', override: { note: 'x'.repeat(2001), via: 'email', videoMode: 'sideways' } })
    expect(dropped.override).toEqual({})
  })

  // 왜: 모르는 방식 이름은 어떤 그림을 보낼지 정한 적이 없다 — Take 를 잡거나 영상을 맡기기 전에 거절한다.
  it('모르는 방식 이름을 보내면 Take 를 잡기 전에 거절한다', async () => {
    const { status } = await rejected({ videoMode: 'sideways' })
    expect(status).toBe(400)
    expect(mocks.reserveTake).not.toHaveBeenCalled()
  })

  // 왜: 씬의 첫 샷에는 같은 씬의 앞 샷이 없다 — 앞 씬에서 잇지 않는다(화면도 단추를 끈다).
  it('씬의 첫 샷에서 이어서를 보내면 만들지 않는다', async () => {
    seed({ shots: [{ ...SHOT, sort_order: 1 }, [{ shot_id: 'shot-2', scene_id: 'scene-1', sort_order: 1 }, { shot_id: 'shot-9', scene_id: 'scene-1', sort_order: 5 }]] })
    const { status, body } = await rejected({ videoMode: 'continue', continueFrom: CONTINUE_FROM })
    expect(status).toBe(409)
    expect(body.code).toBe('continue_first_shot')
  })

  // 왜: 앞 샷 영상이 아직 없거나 만드는 중이면 이어 붙일 장면이 없다 — 저절로 기다렸다 만들지 않는다.
  it('앞 샷에 완성된 영상이 없으면 이어서를 만들지 않는다', async () => {
    seed({ video_clips: [[{ ...PREV_TAKE, status: 'generating', url: null }]] })
    const { status, body } = await rejected({ videoMode: 'continue', continueFrom: CONTINUE_FROM })
    expect(status).toBe(409)
    expect(body.code).toBe('continue_previous_not_ready')
  })

  // 왜: 이어 붙이는 영상은 Editor 로 가는 앞 샷 영상이다(★, 없으면 가장 새 완성) — 앞 샷을 다시 만들어 그 영상이 바뀌었는데
  //   옛 장면에서 이으면 완성본의 이음매가 맞지 않는다. [다시 만들기]가 기록된 출처를 그대로 보낼 때 여기서 걸린다.
  it('앞 샷의 Editor 로 가는 영상이 아닌 영상에서 잡은 장면이면 만들지 않는다', async () => {
    const newer = { ...PREV_TAKE, id: 'clip-new', take_number: 2, created_at: '2026-11-21T00:00:00.000Z', storage_path: `${WORKSPACE}/${PROJECT}/videos/clip-new/job-new.mp4`, url: media('x/clip-new.mp4'), last_attempt_job_id: 'job-new' }
    seed({ video_clips: [[PREV_TAKE, newer]] })
    const { status, body } = await rejected({ videoMode: 'continue', continueFrom: CONTINUE_FROM })
    expect(status).toBe(409)
    expect(body.code).toBe('continue_source_changed')

    seed({ video_clips: [[{ ...PREV_TAKE, is_final: true }, newer]] })
    const starred = await prepare({ model: 'seedance', videoMode: 'continue', continueFrom: CONTINUE_FROM })
    expect(falInput(starred).image_urls).toEqual([CHAIN_FRAME, END])
  })

  // 왜: 생성처는 이 주소를 우리 대신 가져간다 — 우리 보관함의, 그 앞 영상 작업에서 잡은 장면 그림만 받는다(다른 그림 · 바깥 주소 차단).
  it('이음 장면 주소가 그 앞 영상 작업에서 잡은 우리 보관함 그림이 아니면 거절한다', async () => {
    for (const frameUrl of ['https://evil.test/frame.jpg', media(`${WORKSPACE}/${PROJECT}/videos/clip-prev/job-other_chain-frame.jpg`)]) {
      seed()
      const { status } = await rejected({ videoMode: 'continue', continueFrom: { ...CONTINUE_FROM, frameUrl } })
      expect(status).toBe(400)
    }
  })

  // 왜: 실사 이미지와 같은 규칙(#ref-gate) — 인물 시트가 없는 인물은 모델이 누구인지 모른다.
  it('샷에 나오는 인물의 시트가 없으면 레퍼런스로 만들지 않는다', async () => {
    seed({ character_appearances: [[{ character_id: 'mina', appearance_key: 'current', is_default: true, sheet_url: SHEET }]] })
    const { status, body } = await rejected({ videoMode: 'reference' })
    expect(status).toBe(409)
    expect(body.code).toBe('missing_character_sheets')
  })

  // 왜: Veo 는 참고 그림을 세 장까지만 받는다 — 샷 실사와 인물이 가장 중요하니 소품 → 배경 → 인물 순으로 덜어 낸다.
  it('레퍼런스가 모델 상한을 넘으면 소품 → 배경 → 인물 순으로 덜어 낸다', async () => {
    const prepared = await prepare({ model: 'veo', videoMode: 'reference' })

    expect(falInput(prepared).image_urls).toEqual([START, SHEET_2, SHEET])
    expect(prepared.inputSnapshot.dropped_reference_images).toBe(1)
    expect(fullPrompt(prepared)).not.toContain('= the location')
  })

  // 왜: 러프는 화면이 열려 있을 때만 그려진다 — 미들이 없으면 보낼 그림이 없다(화면도 단추를 끈다).
  it('러프 미들이 없으면 시작+미들을 만들지 않는다', async () => {
    seed({ shots: [{ ...SHOT, rough_storyboard: null }, SCENE_SHOTS] })
    const { status, body } = await rejected({ videoMode: 'start_middle' })
    expect(status).toBe(409)
    expect(body.code).toBe('missing_middle_frame')
  })

  // 왜: 화살표를 고쳐도(D10) 작가가 정한 움직임 계약 글은 옛 움직임 그대로다 — 둘이 다르면 고친 스케치가 이겨야 한다.
  it('미들 스케치와 글의 움직임이 다르면 스케치를 따르라고 적는다', async () => {
    const prepared = await prepare({ model: 'seedance', videoMode: 'start_middle' })
    expect(fullPrompt(prepared)).toContain('If this text and the sketch disagree about the movement, follow the sketch')
  })

  // 왜: 인물 시트는 흰 바탕 · 여러 자세 배치다 — "구도까지 그림과 똑같이"를 그대로 두면 시트 모양이 영상에 찍힌다.
  it('레퍼런스에서는 구도까지 똑같이 하라는 문장 대신 생김새 · 옷 · 장소만 따르고 시트 바탕은 그리지 말라고 적는다', async () => {
    const prepared = await prepare({ model: 'seedance', videoMode: 'reference' })
    expect(fullPrompt(prepared)).toContain("never reproduce a character sheet's white background")
    expect(fullPrompt(prepared)).not.toContain('framing exactly')
  })

  // 왜: Kling 은 첫 장면 칸이 따로 있다 — 시작은 그 칸, 미들 스케치는 참고 칸(@Image1)으로 가고 글도 그 이름으로 부른다.
  it('Kling 의 시작+미들은 시작을 첫 장면 칸으로, 미들을 참고 칸으로 보낸다', async () => {
    const prepared = await prepare({ model: 'kling-o3', videoMode: 'start_middle' })

    expect(falInput(prepared)).toMatchObject({ start_image_url: START, image_urls: [`${ROUGH_DIRECTION}?v=${ROUGH.generatedAt}`] })
    expect(falInput(prepared)).not.toHaveProperty('end_image_url')
    expect(fullPrompt(prepared)).toContain('@Image1 is a hand-drawn DIRECTION sketch')
  })

  // 왜: Kling · Happy Horse 는 글을 2500자까지만 받는다 — 방식 문장이 붙어 넘치면 뒤의 역할 지시가 잘려 사라진다.
  it('방식 문장 때문에 Kling · Happy Horse 글 상한을 넘으면 샷 글부터 자르고 방식 문장은 남긴다', () => {
    for (const modelKey of ['happy-horse', 'kling-o3'] as const) {
      const { fullPrompt: text } = buildVideoPrompt({
        prompt: 'A long scene description. '.repeat(200),
        // 움직임 계약 + 대사가 있으면 앞 글 상한이 가장 크다(1650자) — 방식 문장까지 붙으면 2500자를 넘는 가장 나쁜 경우.
        dynamicSpec: { shot_id: 'shot-2', camera_motion: { type: 'dolly_in', speed: 'slow', magnitude: 'moderate' }, character_motion: [], motion_prompt: '' } as ShotDynamicSpec,
        dialogueLines: [{ text: 'We have to leave now.', characterId: null }],
        generationMethod: 'I2V',
        modelKey,
        durationSeconds: 5,
        referenceImageRoles: ['start', 'direction'],
        videoMode: 'start_middle',
        middleSource: 'rough',
      })
      expect(text.length).toBeLessThanOrEqual(2500)
      expect(text).toContain('follow the sketch')
    }
  })
})
