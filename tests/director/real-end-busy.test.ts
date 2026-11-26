// Director 실사 다시 만들기(한 샷)가 그 샷의 실사 끝 장 작업(N4b)을 자기 작업처럼 이어받지 않고 바쁘다고 거절하는지 검사한다(검토 rev-realarrow 2)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), checkGenerationCapacity: vi.fn(), reserveGenerationJob: vi.fn(), falImageSubmit: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true as const, projectId: PROJECT_ID, userId: 'user-1', viaShare: false }) }))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/generation-quota')>()), checkGenerationCapacity: mocks.checkGenerationCapacity }))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  reserveGenerationJob: mocks.reserveGenerationJob,
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.falImageSubmit }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: vi.fn() }))
vi.mock('@/lib/style-anchor', () => ({ resolveStyleAnchor: async () => null, applyStyleAnchor: (_anchor: unknown, opts: unknown) => opts }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://hook.test/webhook', resolveWebhookBaseUrl: () => 'https://base.test' }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: async (items: Array<{ id: string; native: string }>) => new Map(items.map((i) => [i.id, i.native])) }))
vi.mock('@/lib/storage/media', () => ({ mediaUpload: async () => ({ error: null }), mediaPublicUrl: (path: string) => `https://media.test/${path}` }))

import { POST } from '@/app/api/director/generate-storyboard/route'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const EXISTING = '22222222-2222-4222-8222-222222222222'
let db: Record<string, Array<Record<string, unknown>>>
function queryFor(table: string) {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'order', 'gte', 'limit', 'not', 'is']) q[name] = () => q
  q.maybeSingle = q.single = async () => ({ data: db[table]?.[0] ?? null, error: null })
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: db[table] ?? [], error: null }).then(resolve)
  return q
}
const request = () => new Request('http://localhost/api/director/generate-storyboard', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ projectId: PROJECT_ID, writerShotId: 'sh_01_01', prompt: 'SHOT PROMPT', referenceImageUrls: ['https://ref/a.png'], aspectRatio: '16:9' }),
})

beforeEach(() => {
  vi.clearAllMocks()
  db = { projects: [{ workspace_id: 'workspace-1', style_anchor_key: null, custom_style_anchor: null, settings: null }], shots: [], generation_jobs: [] }
  mocks.from.mockImplementation(queryFor)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true, queued: 0, limit: 6, scope: 'user', category: 'image', axis: 'user_image' })
  mocks.reserveGenerationJob.mockRejectedValue({ code: 'P0001', message: 'storyboard_already_generating', details: EXISTING })
})

describe('실사 다시 만들기와 실사 끝 장 작업', () => {
  // 왜(검토 rev-realarrow 2): 끝 장 작업 번호를 "그 샷 실사 작업"으로 돌려주면 화면은 시작 · 끝을 다시 만든 줄 알고 끝 장 하나만 바뀐 그림을 받는다.
  it('그 샷의 실사 끝 장 작업이 돌고 있으면 실사 다시 만들기는 그 작업을 이어받지 않고 바쁘다고 거절한다', async () => {
    db.generation_jobs = [{ id: EXISTING, kind: 'shot_storyboard', target: { writerShotId: 'sh_01_01', realEnd: { versionId: 'arrows-1', direction: 'd', line: 'l' } } }]
    const res = await POST(request())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('busy')
    expect(body.replayed).toBeUndefined()
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
  })

  // 왜: 정상 경로 고정 — 다른 실사 작업이 돌고 있으면 지금처럼 그 작업을 돌려준다(같은 샷 두 번 내지 않기).
  it('다른 실사 작업이 돌고 있으면 지금처럼 그 작업을 돌려준다', async () => {
    db.generation_jobs = [{ id: EXISTING, kind: 'shot_storyboard', target: { writerShotId: 'sh_01_01', gridVariant: 'strip1' } }]
    const res = await POST(request())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ jobId: EXISTING, replayed: true })
  })
})
