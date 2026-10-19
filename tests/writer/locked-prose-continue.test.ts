// 산문을 확정한 뒤 Artist [만들기]로 이어 갈 때는 확정한 산문의 바탕으로 이어 만든다 (리뉴얼 1차 검토 2026-10-19)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  user: vi.fn(), owns: vi.fn(), createRun: vi.fn(), activeRun: vi.fn(), trigger: vi.fn(), after: vi.fn(),
  writes: [] as Array<{ table: string; op: string; payload?: unknown }>,
}))

// 작은 가짜 DB — 읽기는 비어 있고, 쓰기는 기록하고 성공한다.
function chain(table: string) {
  const entry = { table, op: 'select', payload: undefined as unknown }
  const result = () => {
    if (entry.op !== 'select') mocks.writes.push(entry)
    if (table === 'writer_runs' && entry.op === 'update') return { data: [{ id: 'run-1' }], error: null }
    return { data: entry.op === 'select' ? null : [], error: null }
  }
  const builder: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'is', 'order', 'limit', 'in']) builder[name] = () => builder
  for (const op of ['update', 'insert', 'upsert']) builder[op] = (payload: unknown) => { entry.op = op; entry.payload = payload; return builder }
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

// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const STORY = '두 아이가 다투고 화해하는 이야기'
const runGenre = { genre: '코미디', tone: ['밝음'], targetEmotion: [], runtime_seconds: 300, depth_level: 'D4', format: 'horizontal_16:9' }
const producerGenre = { genre: '드라마', tone: [], targetEmotion: [], runtime_seconds: 60, depth_level: 'D2', format: 'horizontal_16:9' }
const post = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/writer/start', {
  method: 'POST', body: JSON.stringify({ projectId: 'project-1', story: STORY, runtimeSeconds: 300, genre: producerGenre, ...body }), headers: { 'Content-Type': 'application/json' },
}))
const confirmedRun = (patch: Record<string, unknown> = {}) => ({
  id: 'run-1', status: 'awaiting_confirmation', updated_at: '2026-10-19T00:00:00.000Z',
  state: {
    input: { story: STORY, runtimeSeconds: 300, treatmentDraft: true, sceneGate: true, writerEngine: 'v1', genre: runGenre },
    genre: runGenre, scenes: { scenes: [{ scene_id: 's1', scene_actions: ['지아가 돌을 던진다.'] }], total_estimated_seconds: 12 },
    characters: { characters: [{ id: 'jia', name: '지아', appearance_description: '' }], relationships: [], subtext_notes: [] },
    world: { locations: [{ id: 'yard', name: '운동장', description: '' }] },
    _proseLocked: true,
    ...patch,
  },
})
const runUpdate = () => mocks.writes.find((w) => w.table === 'writer_runs' && w.op === 'update')?.payload as { status: string; state: Record<string, any> } | undefined

beforeEach(() => {
  vi.clearAllMocks()
  mocks.writes.length = 0
  mocks.user.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
  mocks.activeRun.mockResolvedValue(confirmedRun())
})

describe('확정한 산문으로 이어 만들기', () => {
  it('산문을 확정한 뒤에는 Producer 의 이야기나 길이가 달라졌어도 막지 않고 이어 만든다', async () => {
    // 왜: 확정한 산문은 고칠 수 없고 다시 쓰기도 없다 — 확정 전에 채팅에 글 파일을 올려 이야기가 바뀌었거나 설정 맞추기가 늦으면,
    //   [만들기]가 "산문을 쓴 바탕이 바뀌었다"며 영영 막혔다(고칠 길이 없다).
    const response = await post({ continueDraft: true, story: '전혀 다른 이야기', runtimeSeconds: 60 })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'started', continued: true })
  })

  it('산문을 확정한 뒤 이어 만들 때는 확정한 산문의 이야기 · 길이 · 장르를 그대로 쓴다', async () => {
    // 왜: 나머지(인물 · 배경 디자인 · 장면 · 샷)는 확정한 산문에서 이어진다 — 산문과 다른 이야기 · 길이로 만들면 산문과 어긋난다.
    await post({ continueDraft: true, story: '전혀 다른 이야기', runtimeSeconds: 60 })

    const update = runUpdate()!
    expect(update.state.input).toMatchObject({ story: STORY, runtimeSeconds: 300 })
    expect(update.state.input.genre).toEqual(runGenre)
    expect(update.state.genre).toEqual(runGenre)
  })

  it('산문을 확정한 뒤에도 Artist 목록에서 고친 인물 설명은 싣는다', async () => {
    // 왜: 정상 경로 고정 — 확정 뒤 [만들기] 전까지는 인물 · 배경 설명과 스타일을 고칠 수 있다.
    await post({ continueDraft: true, cast: { characters: [{ character_id: 'jia', name: '지아', entity_type: 'person', appearance: '노란 우비' }] } })

    expect(runUpdate()!.state.characters.characters[0].appearance_description).toBe('노란 우비')
  })

  it('확정하지 않은 초안은 지금처럼 바탕이 바뀌었으면 넘기지 않는다', async () => {
    // 왜: 정상 경로 고정 — 확정 전에는 산문을 지금 값으로 다시 쓸 수 있으니 낡은 산문으로 넘기지 않는다.
    mocks.activeRun.mockResolvedValue(confirmedRun({ _proseLocked: undefined }))

    const response = await post({ continueDraft: true, runtimeSeconds: 60 })

    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('treatment_draft_stale')
  })
})
