// H3 Max · Turbo 에 보내는 그림은 한 변이라도 256 보다 작으면 비율 그대로 키워 우리 보관함 주소로 보내고, 다른 모델 요청은 한 글자도 안 바뀐다 — 키울 수 없으면 Take 를 잡기 전에 막는다 (m-qa 2026-11-27 · 리드)
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  checkProjectVideoBudget: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  uploads: [] as Array<{ path: string; width: number; height: number }>,
  failUpload: false,
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
vi.mock('@/lib/storage/media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/media')>()),
  mediaUpload: async (path: string, data: Buffer) => {
    if (mocks.failUpload) return { error: { message: 'upload failed' } }
    const meta = await sharp(data).metadata()
    mocks.uploads.push({ path, width: meta.width ?? 0, height: meta.height ?? 0 })
    return { error: null }
  },
}))

import { _clearDesignMemoForTest, prepareDirectorVideoSubmission } from '@/lib/director/video-submit'
import { ensureMinImageSide, VideoReferenceTooSmallError } from '@/lib/director/video-ref-min-size'
import { _clearReferenceImageCacheForTest } from '@/lib/style-facets/reference-image'
import { _clearPhotoLookCacheForTest } from '@/lib/style-facets/photo-look'
import { END, ROUGH, START, STORYBOARD, WORKSPACE, media, tablesFrom, videoRequest } from '../fixtures/_video-submit'

// 9:16 프로젝트의 Storyboard [시작] 일괄 실사 칸 크기(m-qa 실측) · 보통 크기 칸.
const SMALL = { width: 235, height: 421 }
const LARGE = { width: 490, height: 872 }
const pngOf = (size: { width: number; height: number }) =>
  sharp({ create: { ...size, channels: 3, background: { r: 90, g: 120, b: 150 } } }).png().toBuffer()
// 우리 보관함 주소(서버는 우리 보관함 그림만 읽는다).
const SMALL_URL = media('ws-1/p-1/shots/small.png')
const LARGE_URL = media('ws-1/p-1/shots/large.png')
const MISSING_URL = media('ws-1/p-1/shots/missing.png')
let sizeByUrl: Record<string, { width: number; height: number } | 'missing'>
let fetched: string[]

const SHOT = {
  shot_id: 'shot-2', scene_id: 'scene-1', sort_order: 2, design_ref: null, dialogue_lines: null, character_appearance_keys: {}, characters: [],
  static_spec: null, director_refs: null, storyboard_image: STORYBOARD, rough_storyboard: ROUGH, prompt: 'A woman waits by the window.',
  dynamic_spec: { shot_id: 'shot-2', camera_motion: { type: 'static', speed: 'slow', magnitude: 'minimal' }, character_motion: [], motion_prompt: '' },
}

async function prepare(model: string) {
  mocks.from.mockReset()
  mocks.from.mockImplementation(tablesFrom({
    projects: [{ workspace_id: WORKSPACE, style_anchor_key: null, custom_style_anchor: null, settings: { format: 'vertical_9:16' } }],
    shots: [SHOT],
  }))
  return prepareDirectorVideoSubmission(videoRequest({ model, prompt: 'A woman waits by the window.' }), 'user-1')
}
type Prepared = Exclude<Awaited<ReturnType<typeof prepareDirectorVideoSubmission>>, Response>
const falInput = (prepared: Prepared) => (prepared.inputSnapshot.fal_request as { input: Record<string, unknown> }).input

beforeEach(() => {
  vi.clearAllMocks()
  _clearReferenceImageCacheForTest()
  _clearPhotoLookCacheForTest()
  _clearDesignMemoForTest()
  mocks.uploads = []
  mocks.failUpload = false
  sizeByUrl = { [START]: SMALL, [END]: SMALL }
  fetched = []
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    fetched.push(url)
    const size = sizeByUrl[url]
    if (!size || size === 'missing') return new Response('not found', { status: 404 })
    return new Response(new Uint8Array(await pngOf(size)), { status: 200, headers: { 'content-type': 'image/png' } })
  }))
})

describe('H3 에 보내는 작은 그림 키우기', () => {
  it('한 변이라도 256 보다 작은 그림은 비율 그대로 짧은 변을 256 으로 키워 우리 보관함에 올린 주소로 바꾸고, 큰 그림은 그대로 둔다', async () => {
    // 왜(m-qa 2026-11-27): H3 는 256 × 256 보다 작은 그림을 422 로 거절한다 — 9:16 일괄 실사 칸(235 × 421)은 H3 를 골라도 늘 Happy Horse 로 넘어갔다.
    sizeByUrl = { [SMALL_URL]: SMALL, [LARGE_URL]: LARGE }
    const urls = await ensureMinImageSide([SMALL_URL, LARGE_URL], 256, { workspaceId: 'ws-1', projectId: 'p-1' })
    expect(urls[1]).toBe(LARGE_URL)
    expect(urls[0]).not.toBe(SMALL_URL)
    expect(mocks.uploads).toHaveLength(1)
    expect(mocks.uploads[0]!).toMatchObject({ width: 256, height: 459 })
    expect(mocks.uploads[0]!.path.startsWith('ws-1/p-1/video-refs/')).toBe(true)
    expect(urls[0]).toBe(media(mocks.uploads[0]!.path))
  })

  it('같은 그림이면 늘 같은 주소로 올린다 — 다시 보내기 · 대체 모델이 같은 요청이 되게', async () => {
    // 왜: 같은 Take 를 다시 낼 때(복구 · 재생 비교) 주소가 바뀌면 다른 요청으로 보인다.
    sizeByUrl = { [SMALL_URL]: SMALL }
    const first = await ensureMinImageSide([SMALL_URL], 256, { workspaceId: 'ws-1', projectId: 'p-1' })
    const second = await ensureMinImageSide([SMALL_URL], 256, { workspaceId: 'ws-1', projectId: 'p-1' })
    expect(second).toEqual(first)
  })

  it('작은 그림을 키워 올리지 못하면 그렇다고 알린다', async () => {
    // 왜: 키우지 못한 채 보내면 H3 가 거절하고 다른 모델로 넘어간다 — 까닭 없이 다른 모델 영상이 나온다.
    sizeByUrl = { [SMALL_URL]: SMALL }
    mocks.failUpload = true
    await expect(ensureMinImageSide([SMALL_URL], 256, { workspaceId: 'ws-1', projectId: 'p-1' })).rejects.toBeInstanceOf(VideoReferenceTooSmallError)
  })

  it('크기를 읽지 못한 그림은 작은지 모르니 그대로 보낸다(이 기능 전과 같다)', async () => {
    // 왜: 보관함이 잠깐 안 닿을 때 큰 그림까지 막으면 H3 를 아예 못 쓴다 — 막는 것은 작은 것을 알았는데 키우지 못했을 때뿐이다(리드).
    sizeByUrl = { [MISSING_URL]: 'missing' }
    expect(await ensureMinImageSide([MISSING_URL], 256, { workspaceId: 'ws-1', projectId: 'p-1' })).toEqual([MISSING_URL])
    expect(mocks.uploads).toEqual([])
  })

  it('우리 보관함 주소가 아닌 그림은 서버가 읽지 않고 그대로 보낸다', async () => {
    // 왜: 손으로 이은 그림 · 따로 만든 영상은 화면이 보낸 주소를 쓴다 — 아무 주소나 서버가 대신 가져오면 내부망까지 들여다보는 길이 된다(isOwnMediaUrl 경계).
    const outside = 'https://outside.test/small.png'
    sizeByUrl = { [outside]: SMALL }
    expect(await ensureMinImageSide([outside], 256, { workspaceId: 'ws-1', projectId: 'p-1' })).toEqual([outside])
    expect(fetched).toEqual([])
    expect(mocks.uploads).toEqual([])
  })
})

describe('H3 영상 요청', () => {
  it('H3 Max Turbo 로 9:16 일괄 실사 칸(235 × 421)을 보낼 때 키운 주소로 보내고, 작업 기록의 원래 그림 주소(Take 의 시작 · 끝 판정)는 그대로 둔다', async () => {
    // 왜: 작업 기록의 원래 주소는 Take 가 어느 그림 판으로 만들어졌는지(madeFrames) 가르는 데 쓴다 — 보낸 주소는 따로 적어 대체 모델도 그 주소를 쓴다.
    const prepared = await prepare('h3-max-turbo')
    if (prepared instanceof Response) throw new Error(`prepare failed: ${prepared.status} ${await prepared.clone().text()}`)
    const sent = falInput(prepared).reference_image_urls as string[]
    expect(sent).toHaveLength(2)
    expect(sent.every((url) => url.includes('/video-refs/'))).toBe(true)
    expect(prepared.inputSnapshot.reference_image_urls).toEqual([START, END])
    expect(prepared.inputSnapshot.fal_reference_image_urls).toEqual(sent)
    expect(mocks.uploads.map((upload) => [upload.width, upload.height])).toEqual([[256, 459], [256, 459]])
  })

  it('H3 Max 는 첫 · 마지막 장면 칸에도 키운 주소를 싣는다', async () => {
    // 왜(m-qa): 대체 미니맥스도 end_image_url 에서 같은 422 가 났다 — 장면 칸도 같은 그림이다.
    const prepared = await prepare('h3-max')
    if (prepared instanceof Response) throw new Error('prepare failed')
    const input = falInput(prepared)
    expect(String(input.image_url)).toContain('/video-refs/')
    expect(String(input.end_image_url)).toContain('/video-refs/')
  })

  it('다른 모델(Seedance 등)의 영상 요청은 한 글자도 안 바뀐다 — 그림을 읽지도 올리지도 않는다', async () => {
    // 왜: 정상 경로 고정 — 작은 그림을 거절하는 것은 H3 뿐이다.
    const prepared = await prepare('seedance')
    if (prepared instanceof Response) throw new Error('prepare failed')
    expect(fetched.filter((url) => url === START || url === END)).toEqual([])
    expect(mocks.uploads).toEqual([])
    expect(falInput(prepared).image_urls).toEqual([START, END])
    expect(prepared.inputSnapshot).not.toHaveProperty('fal_reference_image_urls')
  })

  it('H3 로 보낼 그림이 이미 256 이상이면 그대로 보내고 작업 기록도 지금과 같다', async () => {
    // 왜: 정상 경로 고정 — 큰 그림(한 샷 실사 칸)은 손대지 않는다.
    sizeByUrl = { [START]: LARGE, [END]: LARGE }
    const prepared = await prepare('h3-max-turbo')
    if (prepared instanceof Response) throw new Error('prepare failed')
    expect(falInput(prepared).reference_image_urls).toEqual([START, END])
    expect(mocks.uploads).toEqual([])
    expect(prepared.inputSnapshot).not.toHaveProperty('fal_reference_image_urls')
  })

  it('H3 로 보낼 작은 그림을 키울 수 없으면 Take 를 잡기 전에 막고 까닭을 알린다', async () => {
    // 왜(리드): 키우기가 안 될 때만 막는다 — 보내면 H3 가 거절하고 다른 모델로 넘어가 고른 적 없는 영상이 나온다.
    mocks.failUpload = true
    const prepared = await prepare('h3-max-turbo')
    expect(prepared instanceof Response).toBe(true)
    const response = prepared as Response
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: 'reference_image_too_small' })
  })
})
