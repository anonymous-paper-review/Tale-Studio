// 러프 그림 요청이 샷의 대사를 그림 지시에 싣지 않는지(대사만 고치면 러프를 다시 그리지 않는 근거)를 러프 라우트를 직접 불러 검사한다
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
      // 저장된 샷에 대사가 있다 — 라우트가 이 칸을 읽으면 그림 지시에 실린다.
      shots: SHOTS.map((id) => ({ shot_id: id, scene_id: id.startsWith('sh_01') ? 'scene-1' : 'scene-2', action_description: 'Look through the window', characters: [], rough_storyboard: null, dialogue_lines: [{ characterId: null, text: 'Only the dialogue says this', emotion: '', delivery: '', durationHint: 1 }] })),
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

describe('러프 그림 요청과 대사', () => {
  // 왜: "대사만 고치면 그림을 다시 그리지 않는다"(대사 탭 바로 고치기 · 2026-11-02)의 근거 — 러프 그림 지시는 스토리 · 인물 · 카메라로 만들고 대사는 싣지 않는다.
  it('러프 그림 요청은 샷의 대사 칸을 읽지 않는다', async () => {
    mocks.rpc.mockImplementation(reserveOk)
    const response = await POST(request(['sh_01_09']))
    expect(response.status).toBe(200)
    const sent = JSON.stringify(mocks.submit.mock.calls)
    expect(sent).toContain('Look through the window')
    expect(sent).not.toContain('Only the dialogue says this')
  })
})
