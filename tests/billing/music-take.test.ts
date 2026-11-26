// 음악 한 곡은 1 Take 를 쓴다 — Take 를 쓰는 생성 종류 · 제출 전 묶기 · 모자람 402 · 확정 거절 · fal 실패 때 돌려주기 · 계정 화면 내역 이름을 검사한다 (m1126 E1 · 리드 O3, 2026-11-26)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  requireProjectAccess: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  reserveGenerationJob: vi.fn(),
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
  failGenerationJob: vi.fn(),
  getGenerationJobByRequestId: vi.fn(),
  holdTakesForJob: vi.fn(),
  releaseTakesForJob: vi.fn(),
  falKeyById: vi.fn(),
  falMusicSubmit: vi.fn(),
  falMusicFetch: vi.fn(),
  assertUserTextAllowed: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  updated: [] as Array<{ table: string; patch: Record<string, unknown>; filters: Array<[string, unknown]> }>,
  rows: {} as Record<string, unknown[]>,
}))

vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.requireProjectAccess }))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: mocks.checkGenerationCapacity,
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  reserveGenerationJob: mocks.reserveGenerationJob,
  confirmGenerationJobReceipt: mocks.confirmGenerationJobReceipt,
  rejectGenerationJobReservation: mocks.rejectGenerationJobReservation,
  failGenerationJob: mocks.failGenerationJob,
  getGenerationJobByRequestId: mocks.getGenerationJobByRequestId,
}))
vi.mock('@/lib/billing/take-hold', () => ({
  holdTakesForJob: mocks.holdTakesForJob,
  holdTakesForVideoJob: mocks.holdTakesForJob,
  releaseTakesForJob: mocks.releaseTakesForJob,
  takeBillingMode: () => 'enforce',
}))
vi.mock('@/lib/fal/keys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fal/keys')>()),
  falKeyById: mocks.falKeyById,
}))
vi.mock('@/lib/fal/music', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fal/music')>()),
  falMusicSubmit: mocks.falMusicSubmit,
  falMusicFetch: mocks.falMusicFetch,
}))
vi.mock('@/lib/moderation/creem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/moderation/creem')>()),
  assertUserTextAllowed: mocks.assertUserTextAllowed,
}))
vi.mock('@/lib/api/moderation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/moderation')>()),
  recordModerationPass: vi.fn(),
}))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: vi.fn() }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: (jobId?: string) => `https://example.test/api/fal/webhook?jobId=${jobId}` }))
vi.mock('@/lib/fal/verify-webhook', () => ({ readFalWebhookHeaders: () => ({}), verifyFalWebhook: async () => true }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))

import { POST } from '@/app/api/editor/music/route'
import { POST as webhookPOST } from '@/app/api/fal/webhook/route'
import { GET as accountGET } from '@/app/api/billing/account/route'
import { reconcileJobFromFal } from '@/lib/fal/reconcile'
import { TAKE_COST_BY_MODEL, isTakeBilledJobKind, takeCostForMusic } from '@/lib/billing/take-cost'
import { activityLabelKey, markMusicActivity, type ActivityItem } from '@/lib/billing/account-summary'
import { translate } from '@/lib/i18n/translate'
import type { GenerationJob } from '@/lib/generation-jobs'

const PROJECT = '11111111-2222-4333-8444-555555555555'
const RECEIPT = { decision: 'skipped' as const, id: null, checked_at: '2026-11-26T00:00:00.000Z', chars: 10, text_sha256: null, reason: 'disabled' as const }

function table(name: string) {
  const filters: Array<[string, unknown]> = []
  let patch: Record<string, unknown> | null = null
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'limit', 'is', 'in', 'neq', 'gte']) q[m] = vi.fn(() => q)
  q.eq = vi.fn((col: string, value: unknown) => {
    filters.push([col, value])
    return q
  })
  q.insert = vi.fn(() => q)
  q.update = vi.fn((p: Record<string, unknown>) => {
    patch = p
    return q
  })
  const rows = () => ((mocks.rows[name] ?? []) as Array<Record<string, unknown>>).filter((row) => filters.every(([col, value]) => row[col] === undefined || row[col] === value))
  q.maybeSingle = vi.fn(async () => ({ data: rows()[0] ?? null, error: null }))
  q.single = q.maybeSingle
  ;(q as { then: unknown }).then = (resolve: (v: unknown) => unknown) => {
    if (patch) mocks.updated.push({ table: name, patch, filters: [...filters] })
    return Promise.resolve({ data: rows(), error: null }).then(resolve)
  }
  return q
}

const post = () =>
  POST(new Request('http://localhost/api/editor/music', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: PROJECT, model: 'elevenlabs-music', prompt: '잔잔한 피아노와 새벽 바다', instrumental: true, durationSec: 30 }) }))
const musicJob = (patch: Partial<GenerationJob> = {}): GenerationJob =>
  ({ id: 'job-1', project_id: PROJECT, request_id: 'fal-req-1', model: 'fal-ai/elevenlabs/music', kind: 'editor_music', status: 'queued', provider: 'fal', target: { workspaceId: 'ws-1', musicId: 'music-1' }, video_clip_id: null, idempotency_key: null, result_url: null, error: null, fal_key_id: 'key-1', input_snapshot: {}, ...patch }) as GenerationJob
const musicRowFailed = () => mocks.updated.find((x) => x.table === 'editor_music' && x.patch.status === 'failed')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order = []
  mocks.updated = []
  mocks.rows = { projects: [{ id: PROJECT, workspace_id: 'ws-1' }] }
  mocks.requireProjectAccess.mockResolvedValue({ ok: true, projectId: PROJECT, userId: 'user-1', viaShare: false })
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true })
  mocks.assertUserTextAllowed.mockResolvedValue(RECEIPT)
  mocks.reserveGenerationJob.mockImplementation(async (input: { target: unknown }) => {
    mocks.order.push('reserve')
    return { id: 'job-1', fal_key_id: 'key-1', request_id: 'reserved:job-1', target: input.target }
  })
  mocks.holdTakesForJob.mockImplementation(async () => {
    mocks.order.push('hold')
    return { ok: true, insufficient: false, held: 1, balance: 9, skipped: null }
  })
  mocks.falKeyById.mockReturnValue({ id: 'key-1' })
  mocks.falMusicSubmit.mockImplementation(async () => {
    mocks.order.push('submit')
    return { request_id: 'fal-req-1', model: 'fal-ai/elevenlabs/music', fal_key_id: 'key-1' }
  })
  mocks.from.mockImplementation((name: string) => table(name))
})

describe('같이 정한 것', () => {
  it('음악 한 곡은 모델과 상관없이 1 Take 를 쓰고, Take 를 쓰는 생성은 영상 · 미리보기 영상 · 음악뿐이며 이미지는 쓰지 않는다', () => {
    // 왜: 리드 답 O3(2026-11-26) "한 곡 1 Take" — Take 가 "영상 전용"이던 약속이 음악까지 넓어진다. 그림은 여전히 무과금이다.
    expect(takeCostForMusic()).toBe(1)
    expect(isTakeBilledJobKind('editor_music')).toBe(true)
    expect(isTakeBilledJobKind('shot_video')).toBe(true)
    expect(isTakeBilledJobKind('shot_previz_video')).toBe(true)
    for (const kind of ['image_generation', 'character_view', 'world_shot', 'shot_storyboard', 'storyboard_real_grid', 'shot_rough_storyboard']) {
      expect(isTakeBilledJobKind(kind)).toBe(false)
    }
    // 영상 값은 그대로다.
    expect(TAKE_COST_BY_MODEL.seedance).toBe(5)
  })

  it('음악을 만들면 fal 로 보내기 전에 그 작업에 Take 1 을 묶는다', async () => {
    // 왜: 영상과 같은 take_hold 길(리드 O3) — 묶기가 제출보다 앞이라 모자라면 fal 비용이 생기기 전에 멈춘다.
    expect((await post()).status).toBe(200)
    expect(mocks.order).toEqual(['reserve', 'hold', 'submit'])
    expect(mocks.holdTakesForJob).toHaveBeenCalledWith({ workspaceId: 'ws-1', userId: 'user-1', jobId: 'job-1', amount: 1, projectId: PROJECT })
  })

  it('Take 가 모자라면 fal 로 보내지 않고, 예약과 곡을 실패로 닫은 뒤 402 로 필요한 수와 잔액을 알린다', async () => {
    // 왜: 결제 약속 — 잔액이 모자라면 생성 자체를 막고(enforce) 채우러 가는 안내를 띄운다(화면은 영상과 같은 402 안내를 쓴다).
    mocks.holdTakesForJob.mockResolvedValueOnce({ ok: false, insufficient: true, held: 0, balance: 0, skipped: null })
    const res = await post()
    expect(res.status).toBe(402)
    expect(await res.json()).toEqual({ error: 'insufficient_takes', required: 1, balance: 0 })
    expect(mocks.falMusicSubmit).not.toHaveBeenCalled()
    expect(mocks.rejectGenerationJobReservation).toHaveBeenCalledWith('job-1', PROJECT, 'insufficient_takes')
    expect(musicRowFailed()?.patch).toMatchObject({ status: 'failed', error: 'insufficient_takes' })
  })

  it('fal 이 제출을 확실히 거절하면 묶은 Take 를 돌려주고 곡을 실패로 닫으며, 접수 여부를 모르는 실패는 Take 를 묶은 채 기다린다', async () => {
    // 왜: 4xx 거절은 fal 비용이 없으니 돌려준다. 통신 오류 · 5xx 는 이미 접수됐을 수 있어 돌려주면 공짜 생성이 된다(#fal-submit-no-retry).
    mocks.falMusicSubmit.mockRejectedValueOnce(Object.assign(new Error('Unprocessable'), { status: 422 }))
    expect((await post()).status).toBe(502)
    expect(mocks.rejectGenerationJobReservation).toHaveBeenCalledWith('job-1', PROJECT, expect.stringContaining('Unprocessable'))
    expect(mocks.releaseTakesForJob).toHaveBeenCalledWith('job-1')
    expect(musicRowFailed()?.patch).toMatchObject({ status: 'failed' })

    vi.clearAllMocks()
    mocks.updated = []
    mocks.falMusicSubmit.mockRejectedValueOnce(Object.assign(new Error('Bad gateway'), { status: 502 }))
    const unknown = await post()
    expect(unknown.status).toBe(200)
    expect(mocks.releaseTakesForJob).not.toHaveBeenCalled()
    expect(mocks.rejectGenerationJobReservation).not.toHaveBeenCalled()
    expect(musicRowFailed()).toBeUndefined()
  })

  it('fal 이 실패를 알리면(웹훅) 음악 작업을 실패로 닫고 묶은 Take 를 돌려준다', async () => {
    // 왜: 리드 O3 "실패하면 돌려준다". 웹훅의 Take 돌려주기가 영상 두 종류만 보던 것을 Take 를 쓰는 종류 모두로 넓힌다.
    mocks.getGenerationJobByRequestId.mockResolvedValueOnce(musicJob())
    const res = await webhookPOST(new Request('http://localhost/api/fal/webhook', { method: 'POST', body: JSON.stringify({ request_id: 'fal-req-1', status: 'ERROR', payload_error: 'content moderation: flagged' }) }))
    expect(res.status).toBe(200)
    expect(mocks.failGenerationJob).toHaveBeenCalledWith('job-1', expect.stringContaining('[moderation]'))
    expect(mocks.releaseTakesForJob).toHaveBeenCalledWith('job-1')
  })

  it('폴링이 fal 에 물어 음악 작업이 실패했으면 실패로 닫고 묶은 Take 를 돌려준다', async () => {
    // 왜: 로컬처럼 웹훅이 없는 곳 · 웹훅을 놓친 작업도 같은 약속(실패하면 돌려준다)을 지킨다.
    mocks.falMusicFetch.mockResolvedValueOnce({ status: 'FAILED', error: 'fal queue FAILED' })
    const job = await reconcileJobFromFal(musicJob())
    expect(job.status).toBe('failed')
    expect(mocks.failGenerationJob).toHaveBeenCalledWith('job-1', expect.any(String))
    expect(mocks.releaseTakesForJob).toHaveBeenCalledWith('job-1')
  })

  it('계정 화면 최근 내역에서 음악에 쓴 Take 는 "음악 만들기"로 보이고, 영상에 쓴 Take 는 그대로 "영상 생성"이다', () => {
    // 왜: 내역은 Take 장부의 묶음 행만 보면 무엇에 썼는지 모른다 — 음악 작업에 묶인 Take 가 "영상 생성"으로 보이면 고객이 쓴 곳을 잘못 읽는다.
    const at = '2026-11-26T10:00:00.000Z'
    const items: ActivityItem[] = [
      { kind: 'hold', delta: -1, refKind: 'generation_job', refId: 'job-music', at },
      { kind: 'hold_release', delta: 1, refKind: 'generation_job', refId: 'job-music', at },
      { kind: 'hold', delta: -5, refKind: 'generation_job', refId: 'job-video', at },
    ]
    const marked = markMusicActivity(items, new Set(['job-music']))
    expect(marked.map((item) => activityLabelKey(item))).toEqual(['Music generation', 'Returned (generation failed)', 'Video generation'])
    expect(translate('ko', 'Music generation')).toBe('음악 만들기')
  })

  it('계정 화면 요약은 Take 장부의 작업 번호로 음악 작업을 찾아 그 내역에 음악 표시를 붙인다', async () => {
    // 왜: 장부 행에는 작업 종류가 없다 — 요약을 만드는 서버가 작업 장부에서 음악 작업만 골라 표시해야 화면이 이름을 고른다.
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'someone@example.com' } } })
    const at = '2026-11-26T10:00:00.000Z'
    const ledger = (id: string, kind: string, delta: number, refId: string | null) => ({ id, kind, delta, grant_id: null, expires_at: null, ref_kind: refId ? 'generation_job' : null, ref_id: refId, reason: null, created_at: at })
    mocks.rows = {
      workspaces: [{ id: 'ws-1', owner_id: 'u-1', plan: 'free' }],
      take_ledger: [ledger('g1', 'grant_free', 10, null), ledger('h1', 'hold', -1, 'job-music'), ledger('h2', 'hold', -5, 'job-video')],
      generation_jobs: [{ id: 'job-music', kind: 'editor_music' }],
    }
    const body = (await (await accountGET()).json()) as { recent: Array<{ refId: string | null; media?: string }> }
    expect(body.recent.find((item) => item.refId === 'job-music')?.media).toBe('music')
    expect(body.recent.find((item) => item.refId === 'job-video')?.media).toBeUndefined()
  })
})
