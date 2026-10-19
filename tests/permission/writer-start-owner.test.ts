// Writer 실행은 프로젝트 주인만 시작하거나 다시 실행한다 — 로그인만으로는 남의 프로젝트에 실행을 만들지 않는다 (리뉴얼 1차 검토 2026-10-19)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  user: vi.fn(), owns: vi.fn(), createRun: vi.fn(), activeRun: vi.fn(), trigger: vi.fn(), after: vi.fn(),
  writes: [] as Array<{ table: string; op: string }>,
}))

// 작은 가짜 DB — 읽기는 비어 있고, 쓰기는 기록하고 성공한다.
function chain(table: string) {
  const entry = { table, op: 'select' }
  const result = () => {
    if (entry.op !== 'select') mocks.writes.push(entry)
    if (table === 'writer_runs' && entry.op === 'update') return { data: [{ id: 'run-1' }], error: null }
    return { data: entry.op === 'select' ? null : [], error: null }
  }
  const builder: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'is', 'order', 'limit', 'in']) builder[name] = () => builder
  for (const op of ['update', 'insert', 'upsert', 'delete']) builder[op] = () => { entry.op = op; return builder }
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

const genre = { genre: '드라마', tone: [], targetEmotion: [], runtime_seconds: 300, depth_level: 'D4', format: 'horizontal_16:9' }
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const post = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/writer/start', {
  method: 'POST',
  body: JSON.stringify({
    projectId: 'project-1', story: '두 아이가 다투고 화해하는 이야기', runtimeSeconds: 300, genre,
    cast: { characters: [{ character_id: 'jia', name: '지아', entity_type: 'person', appearance: '분홍 원피스' }] },
    backgrounds: { locations: [{ location_id: 'yard', name: '운동장', visual_description: '흙바닥', purpose: '다툼' }] },
    ...body,
  }),
  headers: { 'Content-Type': 'application/json' },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.writes.length = 0
  mocks.user.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
  mocks.activeRun.mockResolvedValue(null)
  mocks.createRun.mockResolvedValue({ id: 'run-1', state: {} })
})

describe('Writer 실행은 프로젝트 주인만', () => {
  it('프로젝트 주인이 아니면 새 Writer 실행을 시작하지 않고 인물 · 배경도 바꾸지 않는다', async () => {
    // 왜: 로그인한 누구든 남의 프로젝트 번호만 알면(공유 링크 주소에 보인다) 그 프로젝트의 인물 · 배경을 덮어쓰고 실행을 만들 수 있었다.
    mocks.owns.mockResolvedValue(false)

    const response = await post({})

    expect(response.status).toBe(403)
    expect(mocks.createRun).not.toHaveBeenCalled()
    expect(mocks.writes).toEqual([])
  })

  it('프로젝트 주인이 아니면 지난 작업을 다시 실행하지 않는다', async () => {
    // 왜: 다시 실행은 지난 장면 · 샷을 지우고 새로 만든다 — 남이 부르면 주인의 작업이 사라진다.
    mocks.owns.mockResolvedValue(false)
    mocks.activeRun.mockResolvedValue({ id: 'run-0', status: 'completed', updated_at: '2026-10-01T00:00:00.000Z', state: {} })

    const response = await post({ rerun: true })

    expect(response.status).toBe(403)
    expect(mocks.createRun).not.toHaveBeenCalled()
    expect(mocks.writes).toEqual([])
  })

  it('로그인하지 않았으면 시작하지 않는다', async () => {
    // 왜: 정상 경로 고정 — 로그인 확인은 지금처럼 먼저 한다.
    mocks.user.mockResolvedValue(null)

    expect((await post({})).status).toBe(401)
    expect(mocks.createRun).not.toHaveBeenCalled()
  })

  it('프로젝트 주인은 지금처럼 Writer 를 시작한다', async () => {
    // 왜: 정상 경로 고정.
    const response = await post({})

    expect(response.status).toBe(200)
    expect(mocks.owns).toHaveBeenCalledWith('project-1', 'user-1')
    expect(mocks.createRun).toHaveBeenCalledOnce()
  })
})
