// 러프 자율 그리기의 반복 실패 멈춤(give-up)이 그 샷 행이 생긴 뒤의 실패만 세는지(지운 샷 번호를 다시 받은 새 샷은 옛 실패로 멈추지 않는다)를 러프 라우트를 직접 불러 검사한다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/writer/rough-storyboard/route'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  submit: vi.fn(),
  getJob: vi.fn(),
  events: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true, userId: 'owner' }) }))
vi.mock('@/lib/generation-quota', async (original) => ({
  ...await original<typeof import('@/lib/generation-quota')>(),
  checkGenerationCapacity: async () => ({ ok: true }),
  syncFalKeyLimits: async () => undefined,
}))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: mocks.events }))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.submit, DEFAULT_EDIT_IMAGE_MODEL: 'edit', DEFAULT_IMAGE_MODEL: 'image' }))
vi.mock('@/lib/generation-jobs', async (original) => ({
  ...await original<typeof import('@/lib/generation-jobs')>(),
  getGenerationJobById: mocks.getJob,
}))
vi.mock('@/lib/writer/shot-design-state', () => ({ loadShotDesignByMainId: async () => new Map(), resolveShotDesign: () => null }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: async (items: Array<{ id: string; native: string }>) => new Map(items.map((item) => [item.id, item.native])) }))
vi.mock('@/lib/writer/i18n/entity-names', () => ({ ensureEntityNamesEn: async () => ({ characters: new Map() }), ensureStageLandmarkLabelsEn: async () => new Map(), sceneLocationLabelsEn: async () => new Map() }))
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: async () => null }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://example.test/webhook' }))

const PROJECT = '11111111-2222-4333-8444-555555555555'

/** 그 샷 행이 생긴 때와, 그 번호를 노린 실패한 러프 작업들(만든 때). */
const history = { shotCreatedAt: '2026-11-02T10:00:00.000Z' as string | null, failures: [] as Array<string | null> }

function request(shotIds: string[]) {
  return new Request('http://localhost/api/writer/rough-storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT, shotIds }),
  })
}

function query(table: string) {
  const filters: Record<string, unknown> = {}
  let single = false
  let patch: Record<string, unknown> | undefined
  const q: Record<string, unknown> = {}
  q.select = q.order = q.gte = q.in = q.like = () => q
  q.eq = (key: string, value: unknown) => { filters[key] = value; return q }
  q.update = (value: Record<string, unknown>) => { patch = value; return q }
  q.single = q.maybeSingle = () => { single = true; return q }
  q.then = (resolve: (result: unknown) => unknown) => {
    if (patch) return Promise.resolve({ data: [{ id: filters.id }], error: null }).then(resolve)
    const failed = history.failures.map((createdAt) => ({ target: { writerShotIds: ['sh_01_09'] }, ...(createdAt ? { created_at: createdAt } : {}) }))
    const rows: Record<string, unknown[]> = {
      projects: [{ workspace_id: 'workspace', settings: null }],
      shots: [{ shot_id: 'sh_01_09', scene_id: 'scene-1', action_description: 'Look through the window', characters: [], rough_storyboard: null, ...(history.shotCreatedAt ? { created_at: history.shotCreatedAt } : {}) }],
      scenes: [{ scene_id: 'scene-1' }],
      generation_jobs: filters.status === 'failed' ? failed : [],
    }
    const data = rows[table] ?? []
    return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve)
  }
  return q
}

let reserved = 0
const reserveOk = async (_name: string, args: { p_shot_ids: string[] }) => {
  reserved += 1
  return { data: [{ job_id: `job-${reserved}`, shot_ids: args.p_shot_ids, state: 'reserved' }], error: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  reserved = 0
  history.shotCreatedAt = '2026-11-02T10:00:00.000Z'
  history.failures = []
  mocks.from.mockImplementation(query)
  mocks.rpc.mockImplementation(reserveOk)
  mocks.getJob.mockImplementation(async (id: string) => ({ id, project_id: PROJECT, request_id: `reserved:${id}`, status: 'queued', fal_key_id: 'key' }))
  mocks.submit.mockImplementation(async () => ({ request_id: `fal-${mocks.submit.mock.calls.length}`, model: 'image', fal_key_id: 'key' }))
})

describe('반복 실패 멈춤이 세는 실패', () => {
  // 왜: 2026-11-02 최종 리뷰 L3 — 새로고침 뒤에는 지운 샷 번호가 새 샷에 다시 갈 수 있는데, 반복 실패 멈춤이 그 번호의 옛 실패를 모두 세어
  //   새 샷이 한 번도 그려 보지 못하고 "여러 번 실패해 멈췄어요"가 됐다. 그 샷 행이 생긴 뒤의 실패만 센다.
  it('지운 샷의 번호를 다시 받은 새 샷은 옛 샷의 실패를 세지 않아, 반복 실패로 멈추지 않고 그린다', async () => {
    history.failures = ['2026-11-01T09:00:00.000Z', '2026-11-01T09:05:00.000Z']
    const response = await POST(request(['sh_01_09']))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.skipped).toEqual([])
    expect(body.data.submitted.map((item: { shotId: string }) => item.shotId)).toEqual(['sh_01_09'])
  })

  // 왜: 정상 경로 고정 — 같은 샷이 실제로 거듭 실패하면(모더레이션 등 결정론적 실패) 지금처럼 자율 그리기를 멈춰 돈이 새지 않게 한다.
  //   만든 때가 없는 옛 기록은 지금처럼 센다.
  it('같은 샷이 그 샷 행이 생긴 뒤 거듭 실패하면 지금처럼 저절로 그리기를 멈춘다', async () => {
    history.failures = ['2026-11-02T10:01:00.000Z', '2026-11-02T10:02:00.000Z']
    const fresh = await (await POST(request(['sh_01_09']))).json()
    expect(fresh.data.skipped).toEqual([{ shotId: 'sh_01_09', reason: 'gave_up' }])
    history.failures = [null, null]
    const legacy = await (await POST(request(['sh_01_09']))).json()
    expect(legacy.data.skipped).toEqual([{ shotId: 'sh_01_09', reason: 'gave_up' }])
    history.shotCreatedAt = null
    history.failures = ['2026-11-01T09:00:00.000Z', '2026-11-01T09:05:00.000Z']
    const noRowTime = await (await POST(request(['sh_01_09']))).json()
    expect(noRowTime.data.skipped).toEqual([{ shotId: 'sh_01_09', reason: 'gave_up' }])
    expect(mocks.submit).not.toHaveBeenCalled()
  })
})
