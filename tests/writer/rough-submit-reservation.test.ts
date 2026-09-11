// 같은 러프 샷을 동시에 접수하지 않으며 접수 여부를 모를 때 새 작업을 만들지 않는다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/writer/rough-storyboard/route'

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), submit: vi.fn(), createJob: vi.fn(), events: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true, userId: 'owner' }) }))
vi.mock('@/lib/generation-quota', () => ({ checkGenerationCapacity: async () => ({ ok: true }) }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: mocks.events }))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.submit, DEFAULT_EDIT_IMAGE_MODEL: 'edit', DEFAULT_IMAGE_MODEL: 'image' }))
vi.mock('@/lib/generation-jobs', async (original) => ({ ...await original<typeof import('@/lib/generation-jobs')>(), createGenerationJob: mocks.createJob }))
vi.mock('@/lib/writer/shot-design-state', () => ({ loadShotDesignByMainId: async () => new Map(), resolveShotDesign: () => null }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: async (items: Array<{ id: string; native: string }>) => new Map(items.map((item) => [item.id, item.native])) }))
vi.mock('@/lib/writer/i18n/entity-names', () => ({ ensureEntityNamesEn: async () => ({ characters: new Map() }), ensureStageLandmarkLabelsEn: async () => new Map(), sceneLocationLabelsEn: async () => new Map() }))
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: async () => null }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://example.test/webhook' }))

const PROJECT = '11111111-2222-4333-8444-555555555555'
let reservations: Map<string, { id: string; shots: string[]; status: string; request_id: string }>
let queryError: boolean
let bindError: boolean
let exposeQueued: boolean
let updates: Array<Record<string, unknown>>

function request() {
  return new Request('http://localhost/api/writer/rough-storyboard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: PROJECT }) })
}

function query(table: string) {
  const filters: Record<string, unknown> = {}
  let single = false
  let patch: Record<string, unknown> | undefined
  const q: Record<string, unknown> = {}
  q.select = q.order = q.gte = q.in = () => q
  q.eq = (key: string, value: unknown) => { filters[key] = value; return q }
  q.like = () => q
  q.update = (value: Record<string, unknown>) => { patch = value; updates.push(value); return q }
  q.single = q.maybeSingle = () => { single = true; return q }
  q.then = (resolve: (result: unknown) => unknown) => {
    if (patch) {
      const job = reservations.get(String(filters.id))
      if (bindError && patch.request_id) return Promise.resolve({ data: null, error: new Error('ack database unavailable') }).then(resolve)
      if (job) Object.assign(job, patch)
      return Promise.resolve({ data: job ? [job] : [], error: null }).then(resolve)
    }
    if (table === 'generation_jobs' && filters.status === 'queued' && queryError) return Promise.resolve({ data: null, error: new Error('queued query failed') }).then(resolve)
    if (table === 'generation_jobs' && filters.status === 'queued' && exposeQueued) return Promise.resolve({ data: [...reservations.values()].filter((job) => job.status === 'queued').map((job) => ({ ...job, target: { writerShotIds: job.shots } })), error: null }).then(resolve)
    const rows: Record<string, unknown[]> = {
      projects: [{ workspace_id: 'workspace', settings: null }],
      shots: ['sh_01_09', 'sh_02_10', 'sh_02_11', 'sh_02_12', 'sh_02_13'].map((id) => ({ shot_id: id, scene_id: id.startsWith('sh_01') ? 'scene-1' : 'scene-2', action_description: 'Look through the window', characters: [], rough_storyboard: null })),
      scenes: [{ scene_id: 'scene-1' }, { scene_id: 'scene-2' }],
    }
    const data = rows[table] ?? []
    return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve)
  }
  return q
}

beforeEach(() => {
  vi.clearAllMocks()
  reservations = new Map()
  queryError = false
  bindError = false
  exposeQueued = false
  updates = []
  mocks.from.mockImplementation(query)
  mocks.rpc.mockImplementation(async (_name: string, args: { p_shot_ids: string[] }) => {
    const existing = [...reservations.values()].filter((job) => job.status === 'queued' && job.shots.some((id) => args.p_shot_ids.includes(id)))
    if (existing.length) return { data: existing.map((job) => ({ job_id: job.id, shot_ids: job.shots.filter((id) => args.p_shot_ids.includes(id)), state: 'existing', confirmation_pending: job.request_id.startsWith('reserved:') })), error: null }
    const id = `reserved-${reservations.size + 1}`
    reservations.set(id, { id, shots: args.p_shot_ids, status: 'queued', request_id: `reserved:${id}` })
    return { data: [{ job_id: id, shot_ids: args.p_shot_ids, state: 'reserved' }], error: null }
  })
  mocks.submit.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    return { request_id: `fal-${mocks.submit.mock.calls.length}`, model: 'image', fal_key_id: 'test-key' }
  })
  mocks.createJob.mockImplementation(async () => ({ id: `old-${mocks.createJob.mock.calls.length}` }))
})
afterEach(() => vi.unstubAllGlobals())

describe('러프 외부 접수 앞의 예약', () => {
  it('같은 러프 샷을 동시에 요청해도 서비스에는 한 번만 접수한다', async () => {
    const [first, repeated] = await Promise.all([POST(request()), POST(request())])
    expect(first.status).toBe(200)
    expect(repeated.status).toBe(200)
    expect(mocks.submit).toHaveBeenCalledTimes(2)
    const receipts = [(await first.json()).data.submitted, (await repeated.json()).data.submitted]
    expect(receipts[0].map((item: { jobId: string }) => item.jobId)).toEqual(receipts[1].map((item: { jobId: string }) => item.jobId))
    expect(reservations.size).toBe(2)
  })

  it('러프 접수 응답을 잃으면 같은 샷을 다시 보내지 않고 접수 확인 대기로 남긴다', async () => {
    mocks.submit.mockRejectedValue(new TypeError('fetch failed'))
    const first = await POST(request())
    expect(first.status).toBe(200)
    const body = await first.json()
    expect(body.data.submitted[0].jobId).toBe('reserved-1')
    expect(body.data.submitted[0].confirmationPending).toBe(true)
    expect(reservations.get('reserved-1')?.status).toBe('queued')
    const repeated = await POST(request())
    expect((await repeated.json()).data.submitted.every((item: { confirmationPending?: boolean }) => item.confirmationPending)).toBe(true)
    expect(mocks.submit).toHaveBeenCalledTimes(2)
  })

  it('서비스가 러프 접수를 거절했다고 확인되면 예약을 해제하고 실패를 알린다', async () => {
    mocks.submit.mockRejectedValue(Object.assign(new Error('invalid input'), { status: 422 }))
    const first = await POST(request())
    expect(first.status).toBe(500)
    expect([...reservations.values()].every((job) => job.status === 'failed')).toBe(true)
    expect(updates.some((patch) => patch.status === 'failed')).toBe(true)
  })

  it('화면에 다시 들어와도 진행 목록의 러프 접수 확인 대기 상태를 유지한다', async () => {
    mocks.submit.mockRejectedValue(new TypeError('fetch failed'))
    await POST(request())
    exposeQueued = true
    const repeated = await POST(request())
    const body = await repeated.json()
    expect(body.data.confirmationPending).toBe(true)
    expect(mocks.submit).toHaveBeenCalledTimes(2)
  })

  it('접수된 러프의 기록 저장이 실패해도 작업 번호를 바꾸어 다시 접수하지 않는다', async () => {
    bindError = true
    const first = await POST(request())
    expect(first.status).toBe(200)
    expect((await first.json()).data.submitted.every((item: { confirmationPending?: boolean }) => item.confirmationPending)).toBe(true)
    await POST(request())
    expect(mocks.submit).toHaveBeenCalledTimes(2)
    expect([...reservations.values()].every((job) => job.status === 'queued')).toBe(true)
  })

  it('러프 진행 작업 조회가 실패하면 빈 목록으로 간주해 새로 접수하지 않는다', async () => {
    queryError = true
    const response = await POST(request())
    expect(response.status).toBe(500)
    expect(mocks.submit).not.toHaveBeenCalled()
  })
})
