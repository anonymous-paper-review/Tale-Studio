// 소품 모습 창구 · 그리기 · 저장 — 모습을 만들고 지우는 창구, 모습 그림은 그 모습 설명과 기본 그림을 참고해 소품 양식에 그리고, 다 그리면 그 모습 행과 지난 그림 기록에 남는다 (m1126 A3 · A4 기록, 리드 R3 2026-11-26)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  db: {} as Record<string, Array<Record<string, unknown>>>,
  writes: [] as Array<{ table: string; op: string; value?: unknown; filters: Array<[string, unknown]> }>,
  submitPropImageJob: vi.fn(),
  hasQueuedPropImageJob: vi.fn(),
  completed: [] as Array<[string, string]>,
}))

/** 표마다 넣은 행을 eq · is 로 걸러 돌려주고, 쓰기는 기록만 하는 흉내(필요한 만큼만). */
function fakeTable(table: string) {
  const filters: Array<[string, unknown]> = []
  let op = 'select'
  let value: unknown
  const rows = () => (mocks.db[table] ?? []).filter((row) => filters.every(([column, v]) => row[column] === v))
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.order = () => q
  q.limit = () => q
  q.match = (m: Record<string, unknown>) => { for (const [k, v] of Object.entries(m)) filters.push([k, v]); return q }
  q.eq = (column: string, v: unknown) => { filters.push([column, v]); return q }
  q.is = (column: string, v: unknown) => { filters.push([column, v]); return q }
  q.in = () => q
  for (const name of ['insert', 'update', 'delete', 'upsert']) {
    q[name] = (v?: unknown) => { op = name; value = v; return q }
  }
  const settle = () => {
    if (op !== 'select') {
      const hit = rows()
      mocks.writes.push({ table, op, value, filters: [...filters] })
      if (op === 'delete') mocks.db[table] = (mocks.db[table] ?? []).filter((row) => !hit.includes(row))
      if (op === 'insert') mocks.db[table] = [...(mocks.db[table] ?? []), ...(Array.isArray(value) ? value : [value]) as Array<Record<string, unknown>>]
      return { data: op === 'insert' ? value : hit, error: null }
    }
    return { data: rows(), error: null }
  }
  q.maybeSingle = async () => ({ data: (settle().data as unknown[])?.[0] ?? null, error: null })
  q.single = q.maybeSingle
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve)
  return q
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => fakeTable(table),
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: (path: string) => ({ data: { publicUrl: `https://media.test/${path}` } }) }) },
  },
}))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async (_req: Request, projectId: string) => ({ ok: true, projectId, userId: 'user-1', viaShare: false }) }))
vi.mock('@/lib/chat-trace-server', () => ({ chatTraceBelongsToProject: async () => true }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  appearanceI18nFields: async (_id: string, native: string) => ({ appearance: `EN(${native})`, appearance_native: native, i18n_provenance: { appearance: 'derived' } }),
}))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/generation-quota')>()), checkGenerationCapacity: async () => ({ ok: true }) }))
vi.mock('@/lib/moderation/creem', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/moderation/creem')>()), assertUserTextAllowed: async () => ({ id: 'moderation-1' }) }))
vi.mock('@/lib/style-anchor', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/style-anchor')>()), resolveStyleAnchor: async () => null }))
vi.mock('@/lib/style-facets/reference-image', () => ({ styleDrawsWithoutReference: async () => false }))
vi.mock('@/lib/style-facets/photo-look', () => ({ resolvePhotoLook: async () => null }))
vi.mock('@/lib/style-facets/analysis-wait', () => ({ styleAnalysisPending: () => false }))
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: async () => 'https://media.test/templates/prop-template.png' }))
vi.mock('@/lib/artist/prop-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/artist/prop-jobs')>()),
  hasQueuedPropImageJob: mocks.hasQueuedPropImageJob,
  listFailedPropImageJobs: async () => [],
  submitPropImageJob: mocks.submitPropImageJob,
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  countFailedJobsForTarget: async () => 0,
  completeGenerationJob: async (id: string, url: string) => { mocks.completed.push([id, url]) },
  claimGenerationJobFinalize: async () => true,
  releaseGenerationJobFinalizeClaim: async () => undefined,
  patchGenerationJobResponseSnapshotByRequestId: async () => undefined,
}))
vi.mock('@/lib/fal/observability', () => ({ buildFalResponseSnapshot: () => ({}) }))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: async () => {} }))

import { DELETE as deleteAppearance, POST as createAppearance } from '@/app/api/artist/prop-appearance/route'
import { POST as generateProp } from '@/app/api/artist/generate-prop/route'
import { finalizeGenerationJob } from '@/lib/fal/finalize'
import type { GenerationJob } from '@/lib/generation-jobs'

const P = 'project-1'
const json = (body: Record<string, unknown>, method = 'POST') => new Request('http://test/api', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.writes.length = 0
  mocks.completed.length = 0
  mocks.db = {
    projects: [{ id: P, workspace_id: 'ws-1', style_anchor_key: 'real', custom_style_anchor: null, settings: null }],
    props: [{ project_id: P, prop_id: 'sword', name: '칼', appearance: 'a straight steel sword', image_url: 'https://media.test/props/sword.png' }],
    characters: [],
    prop_appearances: [{ project_id: P, prop_id: 'sword', appearance_key: 'broken', label: '부러진 칼', narrative_time: 'future', appearance: 'the same sword snapped in half', appearance_native: '두 동강 난 같은 칼', image_url: null }],
    prop_image_candidates: [],
  }
  mocks.hasQueuedPropImageJob.mockResolvedValue(false)
  mocks.submitPropImageJob.mockResolvedValue({ id: 'job-1' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.alloc(20_000))))
})

describe('소품 모습 창구', () => {
  // 왜: 이름 · 설명 없는 모습은 카드에 빈 칸이 된다. 기본 모습 열쇠('default')는 props 행 몫이라 겹치면 안 되고, 같은 이름이면 뒤에 번호를 붙인다(배경 모습과 같다).
  it('소품 모습 만들기는 이름과 설명이 있어야 하고, 기본 모습 열쇠와 겹치지 않는 새 열쇠로 저장한다', async () => {
    expect((await createAppearance(json({ projectId: P, propId: 'sword', label: '', appearance: '녹슨 칼' }))).status).toBe(400)
    expect((await createAppearance(json({ projectId: P, propId: 'sword', label: '녹슨 칼', appearance: '' }))).status).toBe(400)
    const res = await createAppearance(json({ projectId: P, propId: 'sword', label: 'Broken', appearance: '두 동강 난 칼', narrativeTime: 'past' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, propId: 'sword', appearanceKey: 'broken_2', label: 'Broken', narrativeTime: 'past', appearance: 'EN(두 동강 난 칼)', appearanceNative: '두 동강 난 칼' })
    const insert = mocks.writes.find((w) => w.table === 'prop_appearances' && w.op === 'insert')
    expect(insert?.value).toMatchObject({ project_id: P, prop_id: 'sword', appearance_key: 'broken_2', label: 'Broken', narrative_time: 'past', appearance: 'EN(두 동강 난 칼)', appearance_native: '두 동강 난 칼' })
    const defaultRes = await createAppearance(json({ projectId: P, propId: 'sword', label: 'Default', appearance: '기본' }))
    expect((await defaultRes.json()).appearanceKey).not.toBe('default')
  })

  // 왜: 정상 경로 고정 — 없는 소품(지워졌거나 다른 프로젝트)에는 모습을 만들지 않는다.
  it('없는 소품에는 모습을 만들지 않는다', async () => {
    expect((await createAppearance(json({ projectId: P, propId: 'ghost', label: '녹슨', appearance: '녹슨 칼' }))).status).toBe(404)
    expect(mocks.writes.filter((w) => w.op === 'insert')).toEqual([])
  })

  // 왜: 모습을 지우면 그 모습의 지난 그림 기록도 남을 까닭이 없다(배경 모습과 같다). 기본 모습은 소품 자체라 지울 수 없다.
  it('소품 모습을 지우면 그 모습의 지난 그림 기록도 함께 지우고, 기본 모습은 지울 수 없다', async () => {
    mocks.db.prop_image_candidates = [
      { project_id: P, prop_id: 'sword', appearance_key: 'broken', url: 'https://media.test/a.png' },
      { project_id: P, prop_id: 'sword', appearance_key: 'default', url: 'https://media.test/b.png' },
    ]
    expect((await deleteAppearance(json({ projectId: P, propId: 'sword', appearanceKey: 'default' }, 'DELETE'))).status).toBe(409)
    expect((await deleteAppearance(json({ projectId: P, propId: 'sword', appearanceKey: 'broken' }, 'DELETE'))).status).toBe(200)
    expect(mocks.db.prop_appearances).toEqual([])
    expect(mocks.db.prop_image_candidates.map((row) => row.appearance_key)).toEqual(['default'])
  })
})

describe('소품 모습 그리기', () => {
  // 왜: 모습은 같은 물건의 다른 때 모습이다 — 그 모습 설명으로 그리되, 기본 그림을 참고 그림으로 넣어 같은 물건으로 그린다(배경 모습이 기본 배경을 참조하는 것과 같다).
  it('소품 모습 그리기는 그 모습 설명으로 소품 양식에 그리고, 기본 그림이 있으면 같은 물건으로 그리게 참고 그림으로 넣는다', async () => {
    const res = await generateProp(json({ projectId: P, propId: 'sword', appearanceKey: 'broken', actor: 'ui' }))
    expect(await res.json()).toMatchObject({ ok: true, jobId: 'job-1' })
    const input = mocks.submitPropImageJob.mock.calls[0][0]
    expect(input.appearanceKey).toBe('broken')
    expect(input.plan.submit.prompt).toContain('the same sword snapped in half')
    expect(input.plan.submit.prompt).not.toContain('a straight steel sword')
    expect(input.plan.submit.prompt).toMatch(/last reference image shows the default look of this same object/i)
    expect(input.plan.submit.reference_image_urls).toEqual(['https://media.test/templates/prop-template.png', 'https://media.test/props/sword.png'])
    expect(mocks.hasQueuedPropImageJob).toHaveBeenCalledWith(P, 'sword', 'broken')
  })

  // 왜: 정상 경로 고정 — 없는 모습(지워졌거나 잘못된 열쇠)은 그리지 않는다.
  it('없는 소품 모습은 그리지 않는다', async () => {
    expect((await generateProp(json({ projectId: P, propId: 'sword', appearanceKey: 'ghost', actor: 'ui' }))).status).toBe(404)
    expect(mocks.submitPropImageJob).not.toHaveBeenCalled()
  })

  // 왜: 같은 모습을 두 번 그리면 같은 그림 값을 두 번 낸다 — 그리는 중인 작업이 있으면 그 작업을 기다린다(기본 그림과 같은 규칙).
  it('같은 소품 모습을 그리는 중이면 또 그리지 않는다', async () => {
    mocks.hasQueuedPropImageJob.mockImplementation(async (_p: string, _id: string, key?: string | null) => key === 'broken')
    expect(await (await generateProp(json({ projectId: P, propId: 'sword', appearanceKey: 'broken', actor: 'ui' }))).json()).toMatchObject({ deduped: true })
    expect(mocks.submitPropImageJob).not.toHaveBeenCalled()
  })
})

describe('소품 그림 저장', () => {
  const job = (target: Record<string, unknown>) => ({ id: 'job-9', project_id: P, kind: 'prop_image', target: { workspaceId: 'ws-1', propId: 'sword', ...target }, input_snapshot: { source_hash: 'p1:abc:real' } }) as unknown as GenerationJob

  // 왜: 모습 그림은 그 모습 칸의 그림이다 — 기본 그림(props.image_url)을 덮으면 기본 모습이 사라진다.
  it('소품 모습 그림이 다 그려지면 그 모습 행에 저장되고 기본 그림은 그대로다', async () => {
    const url = await finalizeGenerationJob(job({ appearanceKey: 'broken' }), { media: 'image', url: 'https://fal.test/out.png', payload: {} })
    const update = mocks.writes.find((w) => w.table === 'prop_appearances' && w.op === 'update')
    expect(update?.value).toMatchObject({ image_url: url, source_hash: 'p1:abc:real' })
    expect(update?.filters).toEqual(expect.arrayContaining([['project_id', P], ['prop_id', 'sword'], ['appearance_key', 'broken']]))
    expect(mocks.writes.filter((w) => w.table === 'props' && w.op === 'update')).toEqual([])
    expect(mocks.completed).toEqual([['job-9', url]])
  })

  // 왜: A4(지난 그림 줄 · [채택])가 읽을 기록 — 인물 · 배경 후보 표와 같이 그릴 때마다 새 선택본으로 남기고, 안 고른 것은 칸마다 최근 5장만 남긴다.
  it('소품 그림이 다 그려지면 지난 그림 기록에 그 칸의 새 선택본으로 남고, 앞 선택본은 안 고른 것이 된다', async () => {
    mocks.db.prop_image_candidates = [{ project_id: P, prop_id: 'sword', appearance_key: 'default', url: 'https://media.test/old.png', is_selected: true, generated_at: '2026-11-25T00:00:00Z', id: 'c-old' }]
    const url = await finalizeGenerationJob(job({}), { media: 'image', url: 'https://fal.test/out.png', payload: {} })
    const clear = mocks.writes.find((w) => w.table === 'prop_image_candidates' && w.op === 'update')
    expect(clear?.value).toEqual({ is_selected: false })
    expect(clear?.filters).toEqual(expect.arrayContaining([['project_id', P], ['prop_id', 'sword'], ['appearance_key', 'default'], ['is_selected', true]]))
    const insert = mocks.writes.find((w) => w.table === 'prop_image_candidates' && w.op === 'insert')
    expect(insert?.value).toMatchObject({ project_id: P, prop_id: 'sword', appearance_key: 'default', url, source_hash: 'p1:abc:real', job_id: 'job-9', is_selected: true })
  })
})
