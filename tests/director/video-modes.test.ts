// 영상 요청에 만드는 방식을 실으면 서버가 그 방식대로 그림을 골라 보내고 모델에 그림의 역할을 적으며, 끝 그림 · 러프 그림은 어느 길로도 보내지 않는다 (오너 2026-11-27 N4a · dev 때 시작+끝 폐기 · V1 · V2 · M1)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  checkProjectVideoBudget: vi.fn(),
  reserveTake: vi.fn(),
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
  reserveDirectorVideoTake: mocks.reserveTake,
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

import { buildVideoPrompt } from '@/lib/director/video-prompt'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'
import { _clearDesignMemoForTest, prepareDirectorVideoSubmission, type PreparedDirectorVideoSubmission } from '@/lib/director/video-submit'
import { _clearReferenceImageCacheForTest } from '@/lib/style-facets/reference-image'
import { _clearPhotoLookCacheForTest } from '@/lib/style-facets/photo-look'
import { takeCostForVideo } from '@/lib/billing/take-cost'
import { END, PROJECT, REAL_DIRECTION, ROUGH, START, STORYBOARD, WORKSPACE, media, tablesFrom, videoRequest } from '../fixtures/_video-submit'

const SHEET = media(`${WORKSPACE}/${PROJECT}/characters/mina_sheet.png`)
const SHEET_2 = media(`${WORKSPACE}/${PROJECT}/characters/joon_sheet.png`)
const WORLD = media(`${WORKSPACE}/${PROJECT}/locations/harbor_wide.png`)
const LANTERN = media(`${WORKSPACE}/${PROJECT}/props/lantern.png`)
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
  director_prompt: null,
  storyboard_image: STORYBOARD,
  characters: ['joon', 'mina'],
  static_spec: { prop_placement: [{ prop: 'lantern', position_in_frame: 'left_third' }] },
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
    projects: [{ workspace_id: WORKSPACE, style_anchor_key: null, custom_style_anchor: null, settings: null }],
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
    props: [[{ prop_id: 'lantern', name: 'lantern', image_url: LANTERN }]],
    prop_appearances: [[]],
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
/** 생성처에 실제로 가는 그림 전부 — 참고 그림 칸(모델마다 이름이 다르다) · 첫 · 가운데 · 마지막 장면 칸. */
const sentImages = (prepared: PreparedDirectorVideoSubmission) => {
  const input = falInput(prepared)
  return [
    ...((input.image_urls as string[] | undefined) ?? []),
    ...((input.reference_image_urls as string[] | undefined) ?? []),
    ...['image_url', 'middle_image_url', 'end_image_url'].map((key) => input[key]).filter((url): url is string => typeof url === 'string'),
  ]
}
const MY_START = media(`${WORKSPACE}/${PROJECT}/director-assets/start/mine.png`)
const MY_REF = media(`${WORKSPACE}/${PROJECT}/director-assets/ref/mine.png`)
const MY_END = media(`${WORKSPACE}/${PROJECT}/director-assets/end/mine.png`)

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllGlobals()
  // H3 의 작은 그림 키우기가 그림 크기를 읽으러 가지 않게 — 크기를 모르면 그대로 보낸다(video-ref-min-size).
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no network in tests') }))
  _clearReferenceImageCacheForTest()
  _clearPhotoLookCacheForTest()
  _clearDesignMemoForTest()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  seed()
})

describe('같이 정한 것', () => {
  // 왜: 방식을 고르지 않는 길(노드 [다시 만들기] · 일괄 · 채팅 "영상 만들어 줘")은 서버가 그림을 고르고('auto') 기본 방식
  //   (시작+프롬프트 — 오너 M1)으로 만든다. 실사 끝 그림이 있어도 보내지 않는다.
  it('방식을 고르지 않으면 시작+프롬프트로 — 실사 시작 그림 한 장으로 만든다', async () => {
    const prepared = await prepare({ model: 'seedance' })

    expect(falInput(prepared).image_urls).toEqual([START])
    expect(prepared.inputSnapshot.reference_image_roles).toEqual(['start'])
    expect(prepared.inputSnapshot.video_mode).toBe('start_prompt')
    expect(fullPrompt(prepared)).toContain('There is no end frame')
  })

  // 왜: 오너 N4a ① "앞에서 생성된 영상의 end frame 을 이번 shot 의 start frame 으로" — 샷 상세에서 [이어서]로 만들 때.
  //   이번 샷의 실사 끝 그림은 같이 보내지 않는다(시작+끝 폐기).
  it('이어서를 고르면 앞 샷 영상의 마지막 장면을 이번 샷의 시작 그림으로만 쓰고, 이번 샷의 끝 그림은 보내지 않는다', async () => {
    const prepared = await prepare({ model: 'seedance', videoMode: 'continue', continueFrom: CONTINUE_FROM })

    expect(falInput(prepared).image_urls).toEqual([CHAIN_FRAME])
    expect(prepared.inputSnapshot.reference_image_roles).toEqual(['start'])
    expect(prepared.inputSnapshot.video_mode).toBe('continue')
    expect(prepared.inputSnapshot.continue_from).toEqual({ video_clip_id: 'clip-prev', generation_job_id: 'job-prev', frame_url: CHAIN_FRAME })
    expect(fullPrompt(prepared)).toContain("last frame of the previous shot's video")
  })

  // 왜: 오너 N4a ① — 잇는 앞 영상은 Editor 로 가는 앞 샷 영상이다(★, 없으면 가장 새 완성). ★ 를 고른 옛 Take 가 있으면 그 Take 에서 잇는다.
  it('이어서는 같은 씬 바로 앞 샷의 ★ 영상(없으면 가장 새 완성)에서 잇는다', async () => {
    const newer = { ...PREV_TAKE, id: 'clip-new', take_number: 2, created_at: '2026-11-21T00:00:00.000Z', storage_path: `${WORKSPACE}/${PROJECT}/videos/clip-new/job-new.mp4`, url: media('x/clip-new.mp4'), last_attempt_job_id: 'job-new' }
    seed({ video_clips: [[{ ...PREV_TAKE, is_final: true }, newer]] })
    const starred = await prepare({ model: 'seedance', videoMode: 'continue', continueFrom: CONTINUE_FROM })
    expect(falInput(starred).image_urls).toEqual([CHAIN_FRAME])

    seed({ video_clips: [[PREV_TAKE, newer]] })
    const { body } = await rejected({ videoMode: 'continue', continueFrom: CONTINUE_FROM })
    expect(body.code).toBe('continue_source_changed')
  })

  // 왜: 오너 N4a ② "이미지를 레퍼런스로만 입력해서 영상을 생성한다" — 시작 · 끝 장면에 묶이지 않고 인물 · 배경 · 소품을 참고로만.
  it('레퍼런스를 고르면 그림을 참고로만 보내고 시작 · 끝 장면으로 쓰지 않는다', async () => {
    const prepared = await prepare({ model: 'seedance', videoMode: 'reference' })

    expect(falInput(prepared).image_urls).toEqual([START, SHEET_2, SHEET, WORLD, LANTERN])
    expect(prepared.inputSnapshot.reference_image_roles).toEqual(['ref', 'ref', 'ref', 'ref', 'ref'])
    expect(fullPrompt(prepared)).toContain('references only')
    expect(fullPrompt(prepared)).toContain('image 2 = character sheet: Joon')
    expect(fullPrompt(prepared)).not.toContain('= START')
  })

  // 왜: 오너 N4a ③ "start, middle 이미지를 사용한다. middle 의 경우 연출, 의도라는 것을 영상 생성 모델에 설명한다."
  //   미들은 실사 시트의 가운데 장이다(오너 V2).
  it('시작+미들을 고르면 실사 시작 그림과 미들을 보내고, 미들은 장면이 아니라 연출 · 의도라고 모델에 적는다', async () => {
    const prepared = await prepare({ model: 'seedance', videoMode: 'start_middle' })

    expect(falInput(prepared).image_urls).toEqual([START, REAL_DIRECTION])
    expect(prepared.inputSnapshot.reference_image_roles).toEqual(['start', 'direction'])
    expect(fullPrompt(prepared)).toContain('overlaid with drawn DIRECTION arrows and labels, not a frame of the video')
    expect(fullPrompt(prepared)).toContain('Never draw arrows, lines, labels, text, pencil texture or wooden mannequins')
  })

  // 왜: 오너 N4a ④ "start 이미지와 연출에 대한 프롬프트를 같이 입력한다" — 예전엔 실사 끝 그림이 있으면 저절로 붙어 이 방식이 없었다.
  it('시작+프롬프트를 고르면 실사 시작 한 장과 연출 글로 만들고, 실사 끝 그림이 있어도 보내지 않는다', async () => {
    const prepared = await prepare({ model: 'seedance', videoMode: 'start_prompt' })

    expect(falInput(prepared).image_urls).toEqual([START])
    expect(prepared.inputSnapshot.reference_image_roles).toEqual(['start'])
    expect(fullPrompt(prepared)).toContain('There is no end frame')
  })

  // 왜: Take 는 모델 · 해상도로만 정한다(take-cost) — 방식을 바꿔도 단추에 보인 Take 와 서버가 잡는 Take 가 같아야 한다.
  it('어느 방식이든 Take 는 모델과 해상도로만 정해진다', async () => {
    for (const videoMode of ['start_end', 'continue', 'reference', 'start_middle', 'start_prompt']) {
      for (const [model, resolution] of [['seedance', '720p'], ['veo', '1080p'], ['h3-max', '1080p'], ['kling-o3', '720p']] as const) {
        seed()
        const prepared = await prepare({ model, resolution, videoMode, continueFrom: CONTINUE_FROM })
        expect({ videoMode, model, take: prepared.takeAmount }).toEqual({ videoMode, model, take: takeCostForVideo(model, resolution) })
      }
    }
  })

  // 왜: 오너 dev 때 "기존에 있던 Start, End 프레임 생성 방식은 일단 폐기" — 끝 그림은 어느 길로도 영상에 가지 않는다.
  //   서버가 보는 길: 기본(방식 없음) · 네 방식 · 노드 손 배선 · 그림을 직접 보낸 옛 요청. 일괄은 같은 준비 함수를, 채팅 · 다시 만들기는 같은 영상 요청 길을 지난다.
  //   H3 Max 는 마지막 장면 칸(end_image_url)도 비어 있어야 한다.
  it('영상 요청에는 끝 그림을 보내지 않는다 — 방식 · 손 배선 · 앞 영상 잇기 · 일괄 · 채팅 · 다시 만들기 어느 길이든', async () => {
    const paths: Array<Record<string, unknown>> = [
      {},
      { videoMode: 'continue', continueFrom: CONTINUE_FROM },
      { videoMode: 'reference' },
      { videoMode: 'start_middle' },
      { videoMode: 'start_prompt' },
      { frameSource: 'manual', referenceImageUrl: MY_START, referenceImageUrls: [MY_START, MY_REF, MY_END], referenceImageRoles: ['start', 'ref', 'end'] },
      { frameSource: undefined, referenceImageUrl: MY_START, referenceImageUrls: [MY_START, MY_END], referenceImageRoles: ['start', 'end'] },
      { frameSource: undefined, referenceImageUrl: MY_START, referenceImageUrls: [MY_START, MY_REF, MY_END] },
    ]
    for (const model of ['seedance', 'h3-max'] as const) {
      for (const extra of paths) {
        seed()
        const prepared = await prepare({ model, ...extra })
        const images = sentImages(prepared)
        expect({ model, extra, end: images.filter((url) => url === END || url === MY_END) }).toEqual({ model, extra, end: [] })
        expect(prepared.inputSnapshot.reference_image_roles ?? []).not.toContain('end')
        expect(falInput(prepared)).not.toHaveProperty('end_image_url')
        expect(fullPrompt(prepared)).not.toContain('END image')
      }
    }
  })

  // 왜: 옛 Take 에는 방식이 없거나 'start_end' 가 적혀 있고 [다시 만들기]는 그 Take 설정을 물려 보낸다 — 거절하지 않고 기본 방식으로 만들며,
  //   물려받은 'start_end' 를 새 Take 기록에 남기지 않는다.
  it('옛 시작+끝 Take 는 다시 만들면 기본 방식으로 만든다', async () => {
    const remade = await prepare({ model: 'seedance', videoMode: 'start_end', override: { videoMode: 'start_end' } })
    expect(remade.inputSnapshot.video_mode).toBe('start_prompt')
    expect(falInput(remade).image_urls).toEqual([START])
    expect(remade.override).not.toHaveProperty('videoMode')
  })

  // 왜: 오너 V1 "영상 생성에는 무조건 실사 그림만" — 러프(목각 인형) 그림은 어느 방식에서도 보내지 않는다. 시작+미들의 미들도 실사 가운데 장이다(V2).
  it('영상 생성 요청에는 러프(목각 인형) 그림이 들어가지 않는다', async () => {
    const roughFrames = Object.values(ROUGH.frames)
    for (const extra of [{}, { videoMode: 'continue', continueFrom: CONTINUE_FROM }, { videoMode: 'reference' }, { videoMode: 'start_middle' }, { videoMode: 'start_prompt' }]) {
      seed()
      const prepared = await prepare({ model: 'seedance', ...extra })
      const rough = sentImages(prepared).filter((url) => roughFrames.some((frame) => url.split('?')[0] === frame))
      expect({ extra, rough }).toEqual({ extra, rough: [] })
    }
  })

  // 왜: 오너 Q4 — 콘티에서 화살표를 고친 샷은 어느 방식으로 만들어도 영상이 고친 움직임을 따른다(읽은 줄을 고르는 함수는 지금 함수 그대로).
  it('고친 연출 장을 읽은 줄은 네 방식 모두의 영상 지시에 싣는다', async () => {
    const LINE = 'The woman turns away from the window and walks toward the camera.'
    const read = { en: LINE, ko: '여자가 돌아서 걸어온다.', source: 'user', direction: ROUGH.frames.direction, at: 1, endDrawn: null }
    for (const extra of [{ videoMode: 'continue', continueFrom: CONTINUE_FROM }, { videoMode: 'reference' }, { videoMode: 'start_middle' }, { videoMode: 'start_prompt' }]) {
      seed({ shots: [{ ...SHOT, rough_storyboard: { ...ROUGH, directionRead: read } }, SCENE_SHOTS] })
      const prepared = await prepare({ model: 'seedance', ...extra })
      expect({ extra, lead: fullPrompt(prepared).startsWith(`Movement (from the edited direction sketch): ${LINE}`) }).toEqual({ extra, lead: true })
      expect(prepared.inputSnapshot.direction_read).toBe(LINE)
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

  // 왜: Take 줄 · [다시 만들기]가 같은 방식으로 만들려면 새 Take 기록에 방식이 남아야 한다. 기본이 시작+프롬프트로 바뀌어
  //   "안 적음 = 기본"으로는 옛 시작+끝 작업과 새 기본 작업을 가를 수 없다 — 기본 방식도 작업 기록에 적는다(재생 비교 칸이 아니다).
  it('새 Take 는 고른 방식을 기록에 남기고, 작업 기록에는 기본 방식도 적는다', async () => {
    const reference = await prepare({ model: 'seedance', videoMode: 'reference', override: { videoMode: 'reference' } })
    expect(reference.override).toMatchObject({ videoMode: 'reference' })
    expect(reference.inputSnapshot.video_mode).toBe('reference')

    seed()
    const plain = await prepare({ model: 'seedance', videoMode: 'start_prompt', override: { videoMode: 'start_prompt' } })
    expect(plain.override).toMatchObject({ videoMode: 'start_prompt' })
    expect(plain.inputSnapshot.video_mode).toBe('start_prompt')

    seed()
    const junk = await prepare({ model: 'seedance', override: { videoMode: 'sideways', continueFrom: { videoClipId: 'x' } } })
    expect(junk.override).toEqual({})
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

  // 왜: 이어 붙이는 영상은 Editor 로 가는 앞 샷 영상이다 — 앞 샷을 다시 만들어 그 영상이 바뀌었는데 옛 장면에서 이으면 완성본의 이음매가 맞지 않는다.
  //   [다시 만들기]가 기록된 출처를 그대로 보낼 때 여기서 걸린다.
  it('앞 샷의 Editor 로 가는 영상이 아닌 영상에서 잡은 장면이면 만들지 않는다', async () => {
    const newer = { ...PREV_TAKE, id: 'clip-new', take_number: 2, created_at: '2026-11-21T00:00:00.000Z', storage_path: `${WORKSPACE}/${PROJECT}/videos/clip-new/job-new.mp4`, url: media('x/clip-new.mp4'), last_attempt_job_id: 'job-new' }
    seed({ video_clips: [[PREV_TAKE, newer]] })
    const { status, body } = await rejected({ videoMode: 'continue', continueFrom: CONTINUE_FROM })
    expect(status).toBe(409)
    expect(body.code).toBe('continue_source_changed')
  })

  // 왜: 생성처는 이 주소를 우리 대신 가져간다 — 우리 보관함의, 그 앞 영상 작업에서 잡은 장면 그림만 받는다(다른 그림 · 바깥 주소 차단).
  it('이음 장면 주소가 그 앞 영상 작업에서 잡은 우리 보관함 그림이 아니면 거절한다', async () => {
    for (const frameUrl of ['https://evil.test/frame.jpg', media(`${WORKSPACE}/${PROJECT}/videos/clip-prev/job-other_chain-frame.jpg`)]) {
      seed()
      const { status } = await rejected({ videoMode: 'continue', continueFrom: { ...CONTINUE_FROM, frameUrl } })
      expect(status).toBe(400)
    }
    seed()
    const { status } = await rejected({ videoMode: 'continue' })
    expect(status).toBe(400)
  })

  // 왜: 실사 이미지와 같은 규칙(#ref-gate) — 인물 시트가 없는 인물은 모델이 누구인지 모른다.
  it('샷에 나오는 인물의 시트가 없으면 레퍼런스로 만들지 않는다', async () => {
    seed({ character_appearances: [[{ character_id: 'mina', appearance_key: 'current', is_default: true, sheet_url: SHEET }]] })
    const { status, body } = await rejected({ videoMode: 'reference' })
    expect(status).toBe(409)
    expect(body.code).toBe('missing_character_sheets')
  })

  // 왜: Veo 는 참고 그림을 세 장까지만 받는다 — 샷 실사와 인물이 가장 중요하니 소품 → 배경 → 인물 순으로 덜어 낸다. 덜어 낸 그림 이름은 글에서도 뺀다.
  it('레퍼런스가 모델 상한을 넘으면 소품 → 배경 → 인물 순으로 덜어 낸다', async () => {
    const prepared = await prepare({ model: 'veo', videoMode: 'reference' })

    expect(falInput(prepared).image_urls).toEqual([START, SHEET_2, SHEET])
    expect(prepared.inputSnapshot.dropped_reference_images).toBe(2)
    expect(fullPrompt(prepared)).not.toContain('= the location')
    expect(fullPrompt(prepared)).not.toContain('= prop: lantern')
  })

  // 왜: dev 는 소품 칸을 비워 뒀다(소품 그림 함수 전) — main 에는 실사 샷 그림이 쓰는 소품 그림 규칙(그 샷 소품 칸, 2장까지)이 있어 같은 것을 맨 뒤에 넣는다.
  it('레퍼런스의 소품은 실사 샷 그림과 같은 규칙으로 그 샷 소품 칸에 나오는 소품 그림을 맨 뒤에 넣는다', async () => {
    const prepared = await prepare({ model: 'seedance', videoMode: 'reference' })
    expect(falInput(prepared).image_urls).toEqual([START, SHEET_2, SHEET, WORLD, LANTERN])
    expect(fullPrompt(prepared)).toContain('image 5 = prop: lantern')

    seed({ shots: [{ ...SHOT, static_spec: null }, SCENE_SHOTS] })
    const none = await prepare({ model: 'seedance', videoMode: 'reference' })
    expect(falInput(none).image_urls).toEqual([START, SHEET_2, SHEET, WORLD])
  })

  // 왜: 지시문은 영어다 — 움직임 약속 · 대사가 인물을 저장된 영어 이름("Tired Woman")으로 부르는데 시트 이름만 한국어("지친 여자")면 모델이 둘을 잇지 못한다.
  //   저장된 영어 이름이 지금 이름에서 정한 것일 때만 쓰고(promptName — 실사 그림체 지시문과 같은 규칙), 없으면 이름 그대로.
  it('레퍼런스 그림 이름의 인물은 저장된 영어 이름으로 부르고, 없으면 이름 그대로 부른다', async () => {
    seed({ characters: [[{ character_id: 'joon', name: '준', name_en: 'Joon', name_en_source: '준' }, { character_id: 'mina', name: '미나', name_en: null, name_en_source: null }]] })
    const prepared = await prepare({ model: 'seedance', videoMode: 'reference' })
    expect(prepared.inputSnapshot.reference_labels).toEqual([expect.any(String), 'character sheet: Joon', 'character sheet: 미나', 'the location', 'prop: lantern'])
  })

  // 왜: 미들은 실사 시트의 가운데 장이다(오너 V2) — 가운데 장이 없는 옛 실사면 보낼 그림이 없다(화면도 단추를 끈다).
  it('실사 시트에 가운데 장이 없으면 시작+미들을 만들지 않는다', async () => {
    seed({ shots: [{ ...SHOT, storyboard_image: { ...STORYBOARD, frames: { start: START, end: END } } }, SCENE_SHOTS] })
    const { status, body } = await rejected({ videoMode: 'start_middle' })
    expect(status).toBe(409)
    expect(body.code).toBe('missing_middle_frame')
  })

  // 왜: 화살표를 고쳐도 작가가 정한 움직임 글은 옛 움직임 그대로다 — 둘이 다르면 고친 스케치가 이겨야 한다.
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

  // 왜: H3 Max 는 첫 · 가운데 · 마지막 장면 칸이 있다(m1126 D4) — 가운데 장면 칸에 화살표 그림을 넣으면 영상이 그 그림을 지나 화살표가 찍힌다.
  //   시작은 첫 장면 칸, 미들은 참고 그림 목록에만 싣고 마지막 장면 칸은 비운다.
  it('H3 Max 의 시작+미들은 시작을 첫 장면 칸으로, 미들은 참고 그림 목록에만 싣는다', async () => {
    const prepared = await prepare({ model: 'h3-max', videoMode: 'start_middle' })

    expect(falInput(prepared)).toMatchObject({ image_url: START, reference_image_urls: [START, REAL_DIRECTION] })
    expect(falInput(prepared)).not.toHaveProperty('middle_image_url')
    expect(falInput(prepared)).not.toHaveProperty('end_image_url')
  })

  // 왜: Kling · Happy Horse 는 글을 2,500자까지만 받는다 — 방식 문장이 붙어 넘치면 뒤의 역할 지시가 잘려 사라진다.
  it('방식 문장 때문에 Kling · Happy Horse 글 상한을 넘으면 샷 글부터 자르고 방식 문장은 남긴다', () => {
    for (const modelKey of ['happy-horse', 'kling-o3'] as const) {
      for (const aligned of [false, true]) {
        const { fullPrompt: text } = buildVideoPrompt({
          prompt: 'A long scene description. '.repeat(200),
          // 움직임 약속 + 대사가 있으면 앞 글 상한이 가장 크다 — 방식 문장까지 붙으면 2,500자를 넘는 가장 나쁜 경우.
          dynamicSpec: { shot_id: 'shot-2', camera_motion: { type: 'dolly_in', speed: 'slow', magnitude: 'moderate' }, character_motion: [], motion_prompt: '' } as unknown as ShotDynamicSpec,
          dialogueLines: [{ text: 'We have to leave now.', characterId: null }],
          generationMethod: 'I2V',
          modelKey,
          durationSeconds: 5,
          referenceImageRoles: ['start', 'direction'],
          videoMode: 'start_middle',
          ...(aligned ? { aligned: true } : {}),
        })
        expect({ modelKey, aligned, fits: text.length <= 2500 }).toEqual({ modelKey, aligned, fits: true })
        expect(text).toContain('follow the sketch')
      }
    }
  })

  // 왜: 노드의 끝 칸은 화면에서 사라진다 — 옛 캔버스에 남은 끝 배선을 사람이 지울 길이 없으니, 거절하면 그 Take 는 계속 못 만든다.
  //   끝만 빼고 사람이 이은 시작 · 참고 그림은 그대로 쓴다.
  it('손으로 이은 끝 그림이나 옛 화면이 보낸 끝 그림은 거절하지 않고, 끝만 빼고 만든다', async () => {
    const wired = await prepare({ model: 'seedance', frameSource: 'manual', referenceImageUrl: MY_START, referenceImageUrls: [MY_START, MY_REF, MY_END], referenceImageRoles: ['start', 'ref', 'end'] })
    expect(falInput(wired).image_urls).toEqual([MY_START, MY_REF])
    expect(wired.inputSnapshot.reference_image_roles).toEqual(['start', 'ref'])
    expect(wired.inputSnapshot).not.toHaveProperty('video_mode')

    seed()
    const endOnly = await prepare({ model: 'seedance', frameSource: 'manual', referenceImageUrl: MY_END, referenceImageUrls: [MY_END], referenceImageRoles: ['end'] })
    expect(falInput(endOnly).image_urls).toEqual([START])
  })

  // 왜: 역할 없이 그림만 보낸 옛 약속은 "첫 = 시작, 마지막 = 끝"이다 — 끝은 보내지 않으니 마지막 그림만 빼고 첫 그림을 시작, 사이 그림을 참고로 본다.
  it('역할 없이 그림만 보낸 옛 요청은 첫 그림을 시작, 사이 그림을 참고로 보고, 마지막 그림(옛 약속의 끝)은 보내지 않는다', async () => {
    const legacy = await prepare({ model: 'seedance', frameSource: undefined, referenceImageUrl: MY_START, referenceImageUrls: [MY_START, MY_REF, MY_END] })
    expect(falInput(legacy).image_urls).toEqual([MY_START, MY_REF])
    expect(legacy.inputSnapshot.reference_image_roles).toEqual(['start', 'ref'])
  })

  // 왜: 우리 화면 · 일괄은 늘 'auto' · 'manual' 을 보낸다 — 그림을 직접 보내는 옛 약속(frameSource 없음)은 직접 부르는 곳의 약속이라
  //   그대로 두고 끝만 뺀다. 기본 방식(시작+프롬프트)은 서버가 그림을 고를 때만 쓴다.
  it('기본 방식은 서버가 그림을 고르는 요청에만 쓰고, 그림을 직접 보낸 옛 요청은 보낸 그림에서 끝만 뺀다', async () => {
    const legacy = await prepare({ model: 'seedance', frameSource: undefined, referenceImageUrl: MY_START, referenceImageUrls: [MY_START, MY_END], referenceImageRoles: ['start', 'end'] })
    expect(falInput(legacy).image_urls).toEqual([MY_START])
    expect(legacy.inputSnapshot).not.toHaveProperty('video_mode')

    seed()
    const auto = await prepare({ model: 'seedance', frameSource: 'auto', referenceImageUrl: MY_START, referenceImageUrls: [MY_START], referenceImageRoles: ['start'] })
    expect(falInput(auto).image_urls).toEqual([START])
    expect(auto.inputSnapshot.video_mode).toBe('start_prompt')
  })

  // 왜: 옛 Take 에는 'start_end' 가 적혀 있을 수 있고 [다시 만들기]는 그 값을 물려 보낸다 · 옛 화면도 보낸다 — 거절하면 옛 Take 를 다시 만들 수 없다.
  it("'start_end' 로 온 요청(옛 Take 다시 만들기 · 옛 화면)은 거절하지 않고 기본 방식으로 만든다", async () => {
    for (const frameSource of ['auto', undefined]) {
      seed()
      const prepared = await prepare({ model: 'seedance', videoMode: 'start_end', frameSource })
      expect({ frameSource, mode: prepared.inputSnapshot.video_mode, images: falInput(prepared).image_urls }).toEqual({ frameSource, mode: 'start_prompt', images: [START] })
    }
  })

  // 왜: 지금 화면은 러프를 보내지 않는다 — 섞여 오면 고장이다. 몰래 빼고 만들면 사람이 고른 그림과 다른 영상이 나오니 Take 전에 멈춘다.
  //   러프는 그 샷 러프 기록의 그림 주소이거나, 우리 보관함의 러프 파일 이름(_rough_start · _rough_direction · _rough_end · _rough_storyboard)이다.
  it('러프 그림이 섞인 영상 요청은 Take 를 잡기 전에 거절한다', async () => {
    const otherRough = media(`${WORKSPACE}/${PROJECT}/shots/v1-abc_rough_start.png?v=3`)
    for (const rough of [ROUGH.frames.end, `${ROUGH.frames.direction}?v=9`, otherRough]) {
      seed()
      const { status, body } = await rejected({ model: 'seedance', frameSource: 'manual', referenceImageUrl: MY_START, referenceImageUrls: [MY_START, rough], referenceImageRoles: ['start', 'ref'] })
      expect({ rough, status, code: body.code }).toEqual({ rough, status: 400, code: 'rough_image_not_allowed' })
    }
    expect(mocks.reserveTake).not.toHaveBeenCalled()
  })

  // 왜: 콘티 화살표를 고친 뒤 실사를 다시 그리지 않으면 실사 가운데 장(고치기 전 움직임)과 읽은 줄(고친 뒤 움직임)이 다르다 —
  //   화면이 시작+미들을 끄고, 서버도 같은 판단("러프 바뀜")으로 Take 전에 멈춘다(dev 리드 D1).
  it('러프를 고친 뒤 실사를 다시 그리지 않았으면 시작+미들 요청은 Take 를 잡기 전에 거절한다', async () => {
    seed({ shots: [{ ...SHOT, storyboard_image: { ...STORYBOARD, roughGeneratedAt: ROUGH.generatedAt - 1 } }, SCENE_SHOTS] })
    const { status, body } = await rejected({ model: 'seedance', videoMode: 'start_middle' })
    expect(status).toBe(409)
    expect(body.code).toBe('middle_outdated')

    seed({ shots: [{ ...SHOT, storyboard_image: { ...STORYBOARD, roughGeneratedAt: ROUGH.generatedAt } }, SCENE_SHOTS] })
    const fresh = await prepare({ model: 'seedance', videoMode: 'start_middle' })
    expect(falInput(fresh).image_urls).toEqual([START, REAL_DIRECTION])
  })
})
