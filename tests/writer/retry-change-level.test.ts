// 산문 초안을 다시 시도할 때 바꿈 정도가 빠져 있으면 Producer 시작 화면에서 고른 바꿈 정도로 쓴다 (리뉴얼 1차 검토 2026-10-19)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  user: vi.fn(), owns: vi.fn(), createRun: vi.fn(), activeRun: vi.fn(), trigger: vi.fn(), after: vi.fn(),
  project: null as Record<string, unknown> | null,
}))

// 작은 가짜 DB — 프로젝트 행만 돌려주고, 쓰기는 조용히 성공한다.
function chain(table: string) {
  const entry = { op: 'select' }
  const result = () => {
    if (table === 'writer_runs' && entry.op === 'update') return { data: [{ id: 'run-1' }], error: null }
    if (table === 'projects' && entry.op === 'select') return { data: mocks.project, error: null }
    return { data: entry.op === 'select' ? null : [], error: null }
  }
  const builder: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'is', 'order', 'limit', 'in']) builder[name] = () => builder
  for (const op of ['update', 'insert', 'upsert']) builder[op] = () => { entry.op = op; return builder }
  builder.maybeSingle = async () => result()
  builder.single = async () => result()
  builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(result()).then(resolve, reject)
  return builder
}

vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), after: mocks.after }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.user }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (table: string) => chain(table), rpc: async () => ({ error: null }) } }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/writer/run-store', () => ({ createRun: mocks.createRun, getActiveRun: mocks.activeRun }))
vi.mock('@/lib/writer/pipeline/steps', () => ({ WRITER_TOTAL_UNITS: 15, WRITER_V2_TOTAL_UNITS: 1, triggerWriterStep: mocks.trigger }))
vi.mock('@/lib/admin', () => ({ isAdminOwnedProject: vi.fn(async () => false) }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ appearanceI18nFields: async (_id: string, appearance: string) => ({ appearance, appearance_native: appearance }), applyProducerI18n: async () => undefined }))
vi.mock('@/lib/writer/i18n/entity-names', () => ({ ensureEntityNamesEn: async () => undefined }))

import { POST } from '@/app/api/writer/start/route'
import type { PipelineInput } from '@/lib/writer/types/pipeline'

const genre = { genre: '드라마', tone: [], targetEmotion: [], runtime_seconds: 300, depth_level: 'D4', format: 'horizontal_16:9' }
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const post = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/writer/start', {
  method: 'POST', body: JSON.stringify({ projectId: 'project-1', story: '두 아이가 다투고 화해하는 이야기', runtimeSeconds: 300, genre, ...body }), headers: { 'Content-Type': 'application/json' },
}))
const startedInput = () => mocks.createRun.mock.calls[0][1] as PipelineInput

beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
  mocks.activeRun.mockResolvedValue(null)
  mocks.createRun.mockResolvedValue({ id: 'run-1', state: {} })
  mocks.project = { locale: 'ko', settings: {}, entry_draft: { picks: { mood: 'drama', runtime: 'r300', level: 'grow', ratio: '16:9' }, startedAt: '2026-10-19T00:00:00.000Z' } }
})

describe('다시 시도할 때의 바꿈 정도', () => {
  it('산문 초안을 다시 시도할 때 바꿈 정도를 보내지 않으면 시작 화면에서 고른 바꿈 정도로 쓴다', async () => {
    // 왜: 초안이 실패해 Writer 화면에서 [다시 시도]를 누르면 바꿈 정도가 빠져, 고른 것("살 붙이기")과 다른 결의 산문이 나왔다.
    const response = await post({ treatmentDraft: true })

    expect(response.status).toBe(200)
    expect(startedInput().changeLevel).toBe('grow')
  })

  it('바꿈 정도를 보내면 보낸 값을 쓴다', async () => {
    // 왜: 정상 경로 고정 — 시작 화면의 [시작]은 고른 값을 직접 보낸다.
    await post({ treatmentDraft: true, changeLevel: 'polish' })

    expect(startedInput().changeLevel).toBe('polish')
  })

  it('시작 화면에서 고른 적이 없으면 바꿈 정도 없이 쓴다', async () => {
    // 왜: 리뉴얼 전 프로젝트는 시작 화면 초안이 없다 — 없는 값을 지어내지 않는다.
    mocks.project = { locale: 'ko', settings: {}, entry_draft: null }

    await post({ treatmentDraft: true })

    expect(startedInput().changeLevel).toBeUndefined()
  })
})
