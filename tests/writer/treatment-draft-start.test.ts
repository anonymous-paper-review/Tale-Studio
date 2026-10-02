// 새 프로젝트는 트리트먼트 초안으로 Writer 앞단만 시작하고, Writer로 넘길 때 그 실행을 이어 간다 (2026-10-02 오너 · 시안 v04)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  user: vi.fn(), owns: vi.fn(), createRun: vi.fn(), activeRun: vi.fn(), trigger: vi.fn(), after: vi.fn(),
  writes: [] as Array<{ table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> }>,
}))

// 작은 가짜 DB — 읽기는 비어 있고, 쓰기는 기록하고 성공한다.
function chain(table: string) {
  const entry = { table, op: 'select', payload: undefined as unknown, filters: [] as Array<[string, unknown]> }
  const result = () => {
    if (entry.op !== 'select') mocks.writes.push(entry)
    if (table === 'writer_runs' && entry.op === 'update') return { data: [{ id: 'run-1' }], error: null }
    return { data: entry.op === 'select' ? null : [], error: null }
  }
  const builder: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'is', 'order', 'limit', 'in']) builder[name] = (...args: unknown[]) => { if (name === 'eq') entry.filters.push([args[0] as string, args[1]]); return builder }
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

const genre = { genre: '드라마', tone: [], targetEmotion: [], runtime_seconds: 300, depth_level: 'D4', format: 'horizontal_16:9' }
const post = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/writer/start', {
  method: 'POST', body: JSON.stringify({ projectId: 'project-1', story: '두 아이가 다투고 화해하는 이야기', runtimeSeconds: 300, genre, ...body }), headers: { 'Content-Type': 'application/json' },
}))
const draftRun = (patch: Record<string, unknown> = {}) => ({
  id: 'run-1', status: 'awaiting_confirmation', updated_at: '2026-10-02T00:00:00.000Z',
  state: {
    input: { story: '두 아이가 다투고 화해하는 이야기', runtimeSeconds: 300, treatmentDraft: true, sceneGate: true, writerEngine: 'v1' },
    genre, scenes: { scenes: [{ scene_id: 's1', scene_actions: ['지아가 돌을 던진다.'] }], total_estimated_seconds: 12 },
    characters: { characters: [{ id: 'jia', name: '지아', appearance_description: '' }], relationships: [], subtext_notes: [] },
    world: { locations: [{ id: 'yard', name: '운동장', description: '' }] },
    ...patch,
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.writes.length = 0
  mocks.user.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
  mocks.activeRun.mockResolvedValue(null)
  mocks.createRun.mockResolvedValue({ id: 'run-1', state: {} })
})

describe('만들자마자 트리트먼트 쓰기', () => {
  it('트리트먼트 초안으로 시작하면 확정 단계에서 멈추는 실행을 만들고 넘김 표시는 남기지 않는다', async () => {
    const response = await post({ treatmentDraft: true, cast: { characters: [] }, backgrounds: { locations: [] }, writerEngine: 'v2' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'started', sceneGate: true, draft: true })
    const input = mocks.createRun.mock.calls[0][1]
    expect(input).toMatchObject({ treatmentDraft: true, sceneGate: true, writerEngine: 'v1', story: '두 아이가 다투고 화해하는 이야기' })
    expect(mocks.writes.some((w) => w.table === 'projects' && JSON.stringify(w.payload).includes('current_stage'))).toBe(false)
    expect(mocks.after).toHaveBeenCalledOnce()
  })

  it('남의 프로젝트는 트리트먼트 초안으로 시작하지 않는다', async () => {
    mocks.owns.mockResolvedValue(false)
    expect((await post({ treatmentDraft: true })).status).toBe(403)
    expect(mocks.createRun).not.toHaveBeenCalled()
  })
})

describe('Writer로 넘길 때 이어 가기', () => {
  it('트리트먼트 초안을 이어 가면 Producer 값을 실어 확정하고 나머지를 이어 간다', async () => {
    mocks.activeRun.mockResolvedValue(draftRun())
    const response = await post({
      continueDraft: true,
      cast: { characters: [{ character_id: 'jia', name: '지아', entity_type: 'person', appearance: '분홍 원피스' }] },
      backgrounds: { locations: [{ location_id: 'yard', name: '초등학교 운동장', visual_description: '흙바닥', purpose: '다툼' }] },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'started', sceneGate: false, continued: true })
    expect(mocks.createRun).not.toHaveBeenCalled()
    const update = mocks.writes.find((w) => w.table === 'writer_runs' && w.op === 'update')!
    const payload = update.payload as { status: string; state: Record<string, any> }
    expect(payload.status).toBe('running')
    expect(payload.state._gateConfirmed).toBe(true)
    expect(payload.state.input).toMatchObject({ story: '두 아이가 다투고 화해하는 이야기', sceneGate: true, runtimeSeconds: 300 })
    expect(payload.state.input.cast.characters[0]).toMatchObject({ character_id: 'jia', appearance: '분홍 원피스' })
    expect(payload.state.input.treatmentDraft).toBeUndefined()
    expect(payload.state.characters.characters[0].appearance_description).toBe('분홍 원피스')
    expect(payload.state.scenes).toEqual(draftRun().state.scenes)
    expect(update.filters).toContainEqual(['status', 'awaiting_confirmation'])
    expect(mocks.writes.some((w) => w.table === 'locations')).toBe(true)
    expect(mocks.after).toHaveBeenCalledOnce()
  })

  it('수정안이나 다시 쓰기 안이 남아 있으면 이어 가지 않는다', async () => {
    mocks.activeRun.mockResolvedValue(draftRun({ _sceneStoryProposal: { id: 'p1', status: 'ready' } }))
    const response = await post({ continueDraft: true })
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('scene_story_proposal_pending')
    expect(mocks.writes.some((w) => w.table === 'writer_runs')).toBe(false)
  })

  it('이미 넘겨서 확정을 기다리는 실행은 이어 가기로 열지 않는다', async () => {
    const handedOff = draftRun()
    delete (handedOff.state.input as { treatmentDraft?: boolean }).treatmentDraft
    mocks.activeRun.mockResolvedValue(handedOff)
    const response = await post({ continueDraft: true })
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('writer_gate_pending')
  })
})

describe('낡은 초안과 다시 쓰기 (검토 지적)', () => {
  it('트리트먼트를 쓴 뒤 이야기나 러닝타임이 바뀌었으면 넘기지 않고 다시 쓰기를 권한다', async () => {
    // 왜: 300초로 쓴 트리트먼트를 60초로 바꾼 뒤 넘기면 Writer 가 옛 길이 · 옛 아이디어의 트리트먼트로 나머지를 만든다.
    mocks.activeRun.mockResolvedValue(draftRun({ input: { story: '두 아이가 다투고 화해하는 이야기', runtimeSeconds: 300, treatmentDraft: true, sceneGate: true, writerEngine: 'v1' } }))
    const response = await post({ continueDraft: true, runtimeSeconds: 60 })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'treatment_draft_stale', changed: ['runtime'] })
    expect(mocks.writes.length).toBe(0)
  })

  it('지금 값으로 다시 쓰면 기다리던 초안을 내려놓고 새 초안을 쓴다', async () => {
    mocks.activeRun.mockResolvedValue(draftRun())
    const response = await post({ treatmentDraft: true, restartDraft: true, runtimeSeconds: 60 })
    expect(response.status).toBe(200)
    const retired = mocks.writes.find((w) => w.table === 'writer_runs' && w.op === 'update')!
    expect(retired.payload).toMatchObject({ status: 'failed', error: 'treatment_draft_replaced' })
    expect(retired.filters).toContainEqual(['status', 'awaiting_confirmation'])
    expect(mocks.createRun.mock.calls[0][1]).toMatchObject({ treatmentDraft: true, runtimeSeconds: 60 })
  })

  it('넘긴 실행은 다시 쓰기로 내려놓지 않는다', async () => {
    const handedOff = draftRun()
    delete (handedOff.state.input as { treatmentDraft?: boolean }).treatmentDraft
    mocks.activeRun.mockResolvedValue(handedOff)
    expect((await post({ treatmentDraft: true, restartDraft: true })).status).toBe(409)
    expect(mocks.createRun).not.toHaveBeenCalled()
  })

  it('트리트먼트 초안을 시작할 때는 Producer 카드를 데이터베이스에 미리 쓰지 않는다', async () => {
    // 왜: 초안 동안 Producer 는 열려 있다 — 미리 쓴 카드는 지우거나 이름을 바꿔도 다시 살아났다.
    const response = await post({
      treatmentDraft: true,
      cast: { characters: [{ character_id: 'minsu', name: '민수', entity_type: 'person', appearance: '안경' }] },
      backgrounds: { locations: [{ location_id: 'yard', name: '운동장', visual_description: '흙바닥', purpose: '다툼' }] },
    })
    expect(response.status).toBe(200)
    expect(mocks.writes.filter((w) => w.table === 'locations' || w.table === 'characters' || w.table === 'character_appearances')).toEqual([])
    expect(mocks.createRun.mock.calls[0][1].cast.characters[0].character_id).toBe('minsu')
  })
})
