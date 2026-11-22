// 노드에서 참고 그림을 여러 장 이어도 시작 그림을 지키고, 모델이 받는 장 수 안에서 참고 그림만 덜어 보낸다 — 끝 그림은 보내지 않는다 (방안 고장 1 · 오너 시작+끝 폐기, 2026-11-22)
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

import { prepareDirectorVideoSubmission, submitDirectorVideoRequest, type PreparedDirectorVideoSubmission } from '@/lib/director/video-submit'
import { END, STORYBOARD, START, WORKSPACE, media, tablesFrom, videoRequest } from '../fixtures/_video-submit'

const MY_START = media(`${WORKSPACE}/project-1/director-assets/start/mine.png`)
const REF = [1, 2, 3].map((n) => media(`${WORKSPACE}/project-1/director-assets/ref/ref-${n}.png`))
const MY_END = media(`${WORKSPACE}/project-1/director-assets/end/mine.png`)

/** 노드에서 시작 · 참고 세 장 · 끝을 이은 요청(화면이 보내는 그대로). */
function wiredFive(extra: Record<string, unknown> = {}) {
  return videoRequest({
    frameSource: 'manual',
    referenceImageUrl: MY_START,
    referenceImageUrls: [MY_START, ...REF, MY_END],
    referenceImageRoles: ['start', 'ref', 'ref', 'ref', 'end'],
    ...extra,
  })
}

function seedRows() {
  mocks.from.mockReset()
  mocks.from.mockImplementation(tablesFrom({
    projects: [{ workspace_id: WORKSPACE, style_anchor_key: null, settings: null }],
    shots: [{ shot_id: 'shot-2', dynamic_spec: {}, character_appearance_keys: {}, storyboard_image: STORYBOARD, prompt: null }],
  }))
}

async function prepare(req: Request): Promise<PreparedDirectorVideoSubmission> {
  const prepared = await prepareDirectorVideoSubmission(req, 'user-1')
  if (prepared instanceof Response) throw new Error(`prepare failed: ${prepared.status} ${await prepared.clone().text()}`)
  return prepared
}

const falInput = (prepared: PreparedDirectorVideoSubmission) =>
  (prepared.inputSnapshot.fal_request as { input: Record<string, unknown> }).input

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.checkProjectVideoBudget.mockResolvedValue({ ok: true, used: 0, limit: 100 })
  mocks.syncFalKeyLimits.mockResolvedValue(undefined)
  mocks.holdTakesForVideoJob.mockResolvedValue({ ok: true, insufficient: false, balance: 100 })
  mocks.falKeyById.mockImplementation((id: string) => id === 'prod-2000'
    ? { id: 'prod-2000', maxInflight: 40, client: { queue: { submit: mocks.submit } } }
    : null)
  seedRows()
})

describe('같이 정한 것', () => {
  // 왜: 노드에서 시작 · 참고 그림 세 장을 이어 [영상 만들기]를 누를 때 — 예전에는 서버가 앞 네 장만 남기고 역할을 버려
  //   역할을 잃은 시작 그림 앞에 DB 시작 그림이 한 장 더 붙었다(방안 고장 1). 끝 칸 그림은 오너 시작+끝 폐기(2026-11-22)로 보내지 않는다.
  it('사람이 참고 그림을 세 장 넘게 이어도 시작 그림이 두 번 들어가지 않는다', async () => {
    const prepared = await prepare(wiredFive({ model: 'seedance' }))

    expect(falInput(prepared).image_urls).toEqual([MY_START, ...REF])
    expect(prepared.inputSnapshot.reference_image_roles).toEqual(['start', 'ref', 'ref', 'ref'])
    expect(falInput(prepared).image_urls).not.toContain(START)
    expect(String(prepared.inputSnapshot.full_prompt)).not.toContain('END')
  })
})

describe('혼자 정한 것', () => {
  // 왜: Veo 는 참고 그림을 세 장까지만 받는다(fal 표에 상한이 없어 구글 문서 기준) — 넘기면 제출이 거절되거나 모델이 그림을 버린다.
  //   덜 때 시작을 잃으면 영상의 첫 장면이 바뀌므로 참고 그림만 뒤에서부터 덜어 낸다(끝 칸 그림은 처음부터 보내지 않는다).
  it('손 배선이 모델이 받는 장 수를 넘으면 참고 그림만 뒤에서부터 덜고 시작 그림은 남긴다', async () => {
    const prepared = await prepare(wiredFive({ model: 'veo' }))

    expect(falInput(prepared).image_urls).toEqual([MY_START, REF[0], REF[1]])
    expect(prepared.inputSnapshot.reference_image_roles).toEqual(['start', 'ref', 'ref'])
    expect(String(prepared.inputSnapshot.full_prompt)).toContain('image 1 = START')
  })

  // 왜: 화면이 "참고 그림 N장은 이 모델이 받지 않아 뺐어요"를 보이려면 서버가 덜어 낸 수를 알려야 한다.
  //   덜지 않은 요청은 이 기능 전 작업과 같은 기록 모양으로 둔다 — 같은 요청을 다시 낼 때 서버의 기록 비교가 어긋나지 않게.
  it('참고 그림을 덜어 냈으면 덜어 낸 수를 작업 기록과 응답에 남기고, 덜지 않았으면 적지 않는다', async () => {
    const kept = await prepare(wiredFive({ model: 'seedance' }))
    expect(kept.inputSnapshot).not.toHaveProperty('dropped_reference_images')

    seedRows()
    mocks.reserveTake.mockImplementation(async (args: { inputSnapshot: unknown }) => {
      mocks.getJob.mockResolvedValueOnce({
        id: 'job-1', request_id: 'reserved:job-1', provider: 'fal', fal_key_id: 'prod-2000',
        model: 'stored-model', status: 'queued', input_snapshot: args.inputSnapshot,
      })
      return { video_clip_id: 'clip-1', job_id: 'job-1', take_number: 1, replayed: false }
    })
    mocks.submit.mockResolvedValue({ request_id: 'fal-1' })
    const response = await submitDirectorVideoRequest(wiredFive({ model: 'veo' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.droppedImages).toBe(1)
    expect(mocks.reserveTake.mock.calls[0][0].inputSnapshot.dropped_reference_images).toBe(1)
  })

  // 왜: 프레임 출처 · 역할을 보내지 않는 옛 화면 · 직접 호출 — 옛 규약은 "첫 그림 = 시작, 마지막 그림 = 끝"이다.
  //   끝은 오너 시작+끝 폐기(2026-11-22)로 보내지 않으니, 첫 그림은 시작 · 사이 그림은 참고로 읽고 마지막 그림만 뺀다.
  it('역할 없이 그림만 보낸 옛 요청은 첫 그림을 시작, 사이 그림을 참고로 보고, 마지막 그림(옛 약속의 끝)은 보내지 않는다', async () => {
    const prepared = await prepare(videoRequest({
      frameSource: undefined,
      model: 'seedance',
      referenceImageUrl: MY_START,
      referenceImageUrls: [MY_START, ...REF, MY_END],
    }))

    expect(falInput(prepared).image_urls).toEqual([MY_START, ...REF])
    expect(prepared.inputSnapshot.reference_image_roles).toEqual(['start', 'ref', 'ref', 'ref'])
  })
})
