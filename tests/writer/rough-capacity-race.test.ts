// 러프 요청이 사전 자리 검사를 함께 통과한 뒤 예약에서 자리 축(내 한도 · 모두의 자리)에 막히면 500 이 아니라 자리 없음(429)으로 답하는지 검사한다
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
const SHOTS = ['sh_01_09', 'sh_02_10', 'sh_02_11']

function request(shotIds?: string[]) {
  return new Request('http://localhost/api/writer/rough-storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT, ...(shotIds ? { shotIds } : {}) }),
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
    const rows: Record<string, unknown[]> = {
      projects: [{ workspace_id: 'workspace', settings: null }],
      shots: SHOTS.map((id) => ({ shot_id: id, scene_id: id.startsWith('sh_01') ? 'scene-1' : 'scene-2', action_description: 'Look through the window', characters: [], rough_storyboard: null })),
      scenes: [{ scene_id: 'scene-1' }, { scene_id: 'scene-2' }],
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
  mocks.from.mockImplementation(query)
  mocks.getJob.mockImplementation(async (id: string) => ({ id, project_id: PROJECT, request_id: `reserved:${id}`, status: 'queued', fal_key_id: 'key' }))
  mocks.submit.mockImplementation(async () => ({ request_id: `fal-${mocks.submit.mock.calls.length}`, model: 'image', fal_key_id: 'key' }))
})

describe('러프 예약의 자리 엇갈림', () => {
  // 왜: 2026-11-02 리뷰 R4 — 사전 검사를 함께 통과한 두 요청 중 하나가 예약에서 내 한도(이미지 6장)에 막히면 500 과 날 코드
  //   (image_user_at_capacity)가 돌아와, 더한 샷이 기다리지 않고 실패로 멈췄다. 다른 7개 생성 라우트처럼 자리 없음(429)으로 답한다.
  it('사전 검사를 함께 통과한 러프 요청이 예약에서 내 한도에 막히면 500 이 아니라 자리 없음(429 · 내 한도)으로 답한다', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'image_user_at_capacity', details: '6', hint: null, code: 'P0001' } })
    const response = await POST(request(['sh_01_09']))
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ code: 'quota_exceeded', scope: 'user', category: 'image', queued: 6, limit: 6 })
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  // 왜: 모두의 자리에 막힌 것도 같은 자리 없음이다 — 화면은 까닭(모두의 자리)을 보이고 멈춘다.
  it('예약에서 모두의 자리에 막혀도 자리 없음(429 · 모두의 자리)으로 답한다', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'global_at_capacity', details: '68/68', hint: null, code: 'P0001' } })
    const response = await POST(request(['sh_01_09']))
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ code: 'quota_exceeded', scope: 'global', queued: 68, limit: 68 })
  })

  // 왜: 이미 낸 묶음은 돈이 들어간 작업이다 — 버리지 않고 접수로 알리고, 막힌 묶음의 샷은 남은 몫으로 돌려준다(Director 일괄과 같은 규칙).
  it('앞 묶음을 낸 뒤 다음 묶음이 자리에 막히면 낸 묶음은 접수로 알리고 막힌 샷 수를 남은 몫으로 돌려준다', async () => {
    mocks.rpc
      .mockImplementationOnce(reserveOk)
      .mockResolvedValueOnce({ data: null, error: { message: 'image_user_at_capacity', details: '6', hint: null, code: 'P0001' } })
    const response = await POST(request())
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.submitted.map((item: { shotId: string }) => item.shotId)).toEqual(['sh_01_09'])
    expect(body.data.remaining).toBe(2)
  })

  // 왜: 정상 경로 고정 — 자리 축이 아닌 예약 거절(남의 프로젝트 · 스토리 없음)은 지금처럼 500 이다. 예전엔 까닭이 "[object Object]"로 보였다.
  it('자리 축이 아닌 예약 거절은 지금처럼 500 이고 까닭 글을 그대로 싣는다', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'rough reservation project access denied', details: null, hint: null, code: 'P0001' } })
    const response = await POST(request(['sh_01_09']))
    expect(response.status).toBe(500)
    expect((await response.json()).error.message).toBe('rough reservation project access denied')
  })
})
