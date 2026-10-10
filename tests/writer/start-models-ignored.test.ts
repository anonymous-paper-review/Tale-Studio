// 글 시작 요청은 본문으로 글 모델 제공자·주소를 고를 수 없고 서버가 정한 기본 모델로만 돈다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  user: vi.fn(), owns: vi.fn(), createRun: vi.fn(), activeRun: vi.fn(), trigger: vi.fn(), after: vi.fn(),
}))

// 작은 가짜 DB — 읽기는 비어 있고, 쓰기는 조용히 성공한다.
function chain(table: string) {
  const entry = { op: 'select' }
  const result = () => {
    if (table === 'writer_runs' && entry.op === 'update') return { data: [{ id: 'run-1' }], error: null }
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
import { DEFAULT_MODELS } from '@/lib/writer/llm/dispatch'
import { resolveModels } from '@/lib/writer/pipeline'
import type { PipelineInput } from '@/lib/writer/types/pipeline'

const genre = { genre: '드라마', tone: [], targetEmotion: [], runtime_seconds: 300, depth_level: 'D4', format: 'horizontal_16:9' }
const post = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/writer/start', {
  method: 'POST', body: JSON.stringify({ projectId: 'project-1', story: '두 아이가 다투고 화해하는 이야기', runtimeSeconds: 300, genre, ...body }), headers: { 'Content-Type': 'application/json' },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
  mocks.activeRun.mockResolvedValue(null)
  mocks.createRun.mockResolvedValue({ id: 'run-1', state: {} })
})

describe('글 모델은 서버가 정한다', () => {
  it('요청 본문에 models 를 넣어도 서버 기본 모델로 돈다', async () => {
    // 왜: 공개 라우트가 모델 제공자와 주소를 받으면 서버가 사용자가 준 주소로 글을 보낸다 — 개인정보처리방침에 적지 않은 곳으로 원고가 나간다.
    const response = await post({
      models: {
        S: { provider: 'local', baseUrl: 'http://attacker.example/v1' },
        V: { provider: 'openai', model: 'gpt-5-mini' },
        C: { provider: 'local', baseUrl: 'http://169.254.169.254/latest' },
      },
    })
    expect(response.status).toBe(200)
    const input = mocks.createRun.mock.calls[0][1] as PipelineInput
    expect(input.models).toBeUndefined()
    expect(JSON.stringify(input)).not.toContain('attacker.example')
    expect(JSON.stringify(input)).not.toContain('169.254.169.254')
    expect(resolveModels(input)).toEqual(DEFAULT_MODELS)
  })
})
