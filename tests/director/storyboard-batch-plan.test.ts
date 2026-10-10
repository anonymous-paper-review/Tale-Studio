// 스토리보드 일괄 요청은 그리는 중인 샷 · 같은 판이 이미 낸 샷 · 시트를 기다리는 샷을 건너뛰고 다음 샷을 낸다 (오너 제보 2026-10-10 "중간에 끊김")
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  checkGenerationCapacity: vi.fn(),
  reserveGenerationJob: vi.fn(),
  confirmGenerationJobReceipt: vi.fn(),
  rejectGenerationJobReservation: vi.fn(),
  falImageSubmit: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: async () => ({ ok: true as const, projectId: PROJECT_ID, userId: 'user-1', viaShare: false }),
}))
vi.mock('@/lib/generation-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-quota')>()),
  checkGenerationCapacity: mocks.checkGenerationCapacity,
}))
vi.mock('@/lib/generation-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/generation-jobs')>()),
  reserveGenerationJob: mocks.reserveGenerationJob,
  confirmGenerationJobReceipt: mocks.confirmGenerationJobReceipt,
  rejectGenerationJobReservation: mocks.rejectGenerationJobReservation,
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.falImageSubmit }))
vi.mock('@/lib/style-anchor', () => ({ resolveStyleAnchor: async () => null }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://hook.test/webhook', resolveWebhookBaseUrl: () => 'https://base.test' }))
// 시트 합성은 sharp 를 쓰는 무거운 순수 함수 — 이 파일의 검사 대상이 아니다.
vi.mock('@/lib/director/storyboard-strip', () => ({
  composeRoughReferenceGrid: async () => Buffer.from('grid'),
  buildRealGridPrompt: () => 'GRID PROMPT',
  realSheetCanvas: () => '2048x1536',
}))
vi.mock('@/lib/storage/media', () => ({
  mediaUpload: async () => ({ error: null }),
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
}))

import { POST, maxDuration } from '@/app/api/director/generate-storyboard-batch/route'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_JOB = '22222222-2222-4222-8222-222222222222'
const RUN = '33333333-3333-4333-8333-333333333333'
const EARLIER_RUN = '44444444-4444-4444-8444-444444444444'
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `sh_01_${String(from + i).padStart(2, '0')}`)

let db: Record<string, Array<Record<string, unknown>>>

/** 'target->>batchRunId' 같은 JSON 경로도 읽는다. */
function valueAt(row: Record<string, unknown>, column: string): unknown {
  const [base, key] = column.split('->>')
  const value = row[base]
  if (key === undefined) return value
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
}

/** supabase-js 체인 최소 스텁 — 생성 작업 표만 실제로 거른다(새 조회가 고르는 행을 검사). 나머지 표는 넣은 행이 곧 결과. */
function queryFor(table: string) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = []
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'order', 'gte', 'limit', 'not', 'is']) q[name] = () => q
  q.eq = (column: string, value: unknown) => {
    filters.push((row) => valueAt(row, column) === value)
    return q
  }
  q.in = (column: string, values: unknown[]) => {
    filters.push((row) => values.includes(valueAt(row, column)))
    return q
  }
  const rows = () => (db[table] ?? []).filter((row) => table !== 'generation_jobs' || filters.every((f) => f(row)))
  q.maybeSingle = q.single = async () => ({ data: rows()[0] ?? null, error: null })
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve)
  return q
}

/** 한 씬에 러프 3장이 갖춰진 샷 count 개 — 4개씩 시트 한 장이 된다. */
function shots(count: number, opts: { withImage?: boolean; characterUntil?: number } = {}) {
  return ids(1, count).map((shot_id, i) => {
    const withCharacter = i < (opts.characterUntil ?? 0)
    return {
      shot_id,
      scene_id: 'scene-1',
      characters: withCharacter ? ['char'] : [],
      character_appearance_keys: withCharacter ? { char: 'current' } : {},
      rough_storyboard: { frames: { start: 'https://r/s.png', direction: 'https://r/d.png', end: 'https://r/e.png' }, generatedAt: 1000 },
      storyboard_image: opts.withImage ? { url: 'https://img/old.png', status: 'completed' } : null,
      static_spec: null,
      director_refs: null,
    }
  })
}

/** 이 프로젝트의 실사 시트 작업 한 줄 */
function job(id: string, status: string, target: Record<string, unknown>, minutesAgo = 0) {
  return { id, project_id: PROJECT_ID, kind: 'storyboard_real_grid', status, target, created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString() }
}

function request(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/director/generate-storyboard-batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT_ID, ...body }),
  }) as never
}

/** 이번에 낸 시트들의 샷 묶음 */
const reservedGroups = () => mocks.reserveGenerationJob.mock.calls.map(([input]) => (input as { target: { writerShotIds: string[] } }).target.writerShotIds)

beforeEach(() => {
  vi.clearAllMocks()
  db = {
    projects: [{ workspace_id: 'workspace-1', style_anchor_key: null, custom_style_anchor: null, settings: null }],
    shots: [],
    scenes: [],
    locations: [],
    location_appearances: [],
    characters: [],
    character_appearances: [],
    generation_jobs: [],
  }
  mocks.from.mockImplementation(queryFor)
  mocks.checkGenerationCapacity.mockResolvedValue({ ok: true, queued: 0, limit: 6, scope: 'user', category: 'image', axis: 'user_image' })
  let n = 0
  mocks.reserveGenerationJob.mockImplementation(async () => {
    n += 1
    return { id: `job-${n}`, project_id: PROJECT_ID, fal_key_id: 'key-1', request_id: `reserved:job-${n}`, status: 'queued' }
  })
  mocks.confirmGenerationJobReceipt.mockResolvedValue(undefined)
  mocks.falImageSubmit.mockResolvedValue({ request_id: 'fal-1', model: 'openai/gpt-image-2/edit', fal_key_id: 'key-1', fal_request: {} })
})

describe('스토리보드 일괄 요청이 고르는 샷', () => {
  it('스토리보드 생성 요청 하나는 60초에 끊지 않고 5분까지 기다린다', () => {
    // 왜: 10/9 · 10/10 운영에서 이 요청 6번 중 4번이 60초 제한에 걸려 끊겼고(시트 2장 = 러프 24장 합성 · 업로드), 끊기면 판 전체가 멈췄다.
    expect(maxDuration).toBeGreaterThanOrEqual(300)
  })

  it('이미 그리는 중인 샷은 건너뛰고 그다음 샷들을 내며, 그리는 중인 작업을 기다리라고 알려 준다', async () => {
    // 왜: 앞쪽 샷이 아직 그려지는 중이면 예약이 막혀 그 자리에서 판 전체가 끝났다 — 시간 초과 뒤 다시 누를 때 · 다른 탭 · 오래 걸리는 그림.
    db.shots = shots(12)
    db.generation_jobs = [job(OTHER_JOB, 'queued', { writerShotIds: ids(1, 4) })]
    const res = await POST(request())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(reservedGroups()).toEqual([ids(5, 8), ids(9, 12)])
    expect(body.data.inProgress).toEqual([{ jobId: OTHER_JOB, shotIds: ids(1, 4) }])
    expect(body.data.remaining).toBe(0)
  })

  it('10분이 넘도록 끝나지 않은 작업에 묶인 샷은 건너뛰기만 하고 기다리라고 하지 않는다', async () => {
    // 왜: 접수 확인이 끝내 안 된 작업은 그 샷을 계속 막지만 끝나기를 기다릴 수 없다 — 기다리면 판이 그만큼 멈춘다.
    db.shots = shots(8)
    db.generation_jobs = [job(OTHER_JOB, 'queued', { writerShotIds: ids(1, 4) }, 11)]
    const body = await (await POST(request())).json()
    expect(reservedGroups()).toEqual([ids(5, 8)])
    expect(body.data.inProgress).toEqual([])
  })

  it('다른 탭이 같은 샷을 막 먼저 접수했으면 새로 내지 않고, 그 작업이 맡은 샷만 기다리라고 알려 준다', async () => {
    // 왜: 확인과 예약 사이에 다른 탭이 끼어들면 예약이 막힌다. 그 작업이 맡지 않은 샷까지 기다리는 샷으로 알리면 이 판에서 빠진다.
    db.shots = shots(4)
    mocks.reserveGenerationJob.mockImplementation(async () => {
      db.generation_jobs.push(job(OTHER_JOB, 'queued', { writerShotId: 'sh_01_02' }))
      throw { code: 'P0001', message: 'storyboard_already_generating', details: OTHER_JOB }
    })
    const body = await (await POST(request())).json()
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
    expect(body.data).toMatchObject({ submitted: [], inProgress: [{ jobId: OTHER_JOB, shotIds: ['sh_01_02'] }] })
  })

  it('같은 판에서 이미 낸 샷은 앞 요청의 답을 못 받았어도 다시 내지 않고, 새 시트에는 판 표시를 남긴다', async () => {
    // 왜: 실패한 샷이 요청마다 다시 나갔다(운영 9/1 3e0169eb: 같은 시트 10번 실패). 앞 요청이 시간 초과로 끊기면 무엇을 냈는지 화면은 모른다.
    db.shots = shots(8)
    db.generation_jobs = [job('run-job-1', 'failed', { writerShotIds: ids(1, 4), batchRunId: RUN })]
    const body = await (await POST(request({ runId: RUN }))).json()
    expect(reservedGroups()).toEqual([ids(5, 8)])
    expect(mocks.reserveGenerationJob.mock.calls[0][0]).toMatchObject({ target: { batchRunId: RUN } })
    expect(body.data.remaining).toBe(0)
  })

  it('같은 판이 냈는데 답을 못 받은 작업이 아직 그리는 중이면 이 판의 작업이라고 알려 준다', async () => {
    // 왜: 화면이 그 그림을 이 판이 만든 것으로 세고(만든 수 · 채팅 기록) 끝날 때까지 기다린다.
    db.shots = shots(8)
    db.generation_jobs = [job('run-job-2', 'queued', { writerShotIds: ids(1, 4), batchRunId: RUN })]
    const body = await (await POST(request({ runId: RUN }))).json()
    expect(body.data.inProgress).toEqual([{ jobId: 'run-job-2', shotIds: ids(1, 4), sameRun: true }])
    expect(reservedGroups()).toEqual([ids(5, 8)])
  })

  it('실패한 샷은 버튼을 다시 누르면(새 판) 다시 낸다', async () => {
    // 정상 경로 고정 — 다른 판에서 실패한 샷은 이번 판의 대상이다.
    db.shots = shots(8)
    db.generation_jobs = [job('old-job', 'failed', { writerShotIds: ids(1, 4), batchRunId: EARLIER_RUN })]
    await POST(request({ runId: RUN }))
    expect(reservedGroups()).toEqual([ids(1, 4), ids(5, 8)])
  })

  it('전체 재생성도 같은 판에서 이미 다시 그린 샷은 다시 내지 않는다', async () => {
    // 왜: 전체 재생성은 요청마다 맨 앞 8개 샷을 다시 골라, 앞 8개만 거듭 다시 그리고 나머지 샷에는 닿지 못했다.
    db.shots = shots(12, { withImage: true })
    db.generation_jobs = [
      job('run-job-1', 'completed', { writerShotIds: ids(1, 4), batchRunId: RUN }),
      job('run-job-2', 'completed', { writerShotIds: ids(5, 8), batchRunId: RUN }),
    ]
    await POST(request({ force: true, runId: RUN }))
    expect(reservedGroups()).toEqual([ids(9, 12)])
  })

  it('앞쪽 샷에 인물 시트가 아직 없어도 시트가 준비된 뒤쪽 샷들을 먼저 낸다', async () => {
    // 왜: 앞쪽 8샷에 시트 없는 인물이 있으면 준비된 뒤쪽 샷을 두고 "낼 것 없음"으로 판이 멈췄다. 시트를 기다리는 샷은 이유와 함께 알린다.
    db.shots = shots(12, { characterUntil: 8 })
    db.characters = [{ character_id: 'char', name: '소녀' }]
    db.character_appearances = [{ character_id: 'char', appearance_key: 'current', sheet_url: null }]
    const body = await (await POST(request())).json()
    expect(reservedGroups()).toEqual([ids(9, 12)])
    expect(body.data.skipped).toHaveLength(8)
    expect(body.data.skipped[0]).toMatchObject({ shotId: 'sh_01_01', reason: 'missing_character_sheets', missing: [{ characterId: 'char', name: '소녀' }] })
  })

  it('판 표시가 올바른 형식이 아니면 요청을 받지 않는다', async () => {
    // 왜: 잘못 온 표시로 다른 판의 작업을 이 판의 것으로 착각하지 않게 한다.
    db.shots = shots(4)
    for (const runId of ['abc', 123, '', ['x']]) {
      const res = await POST(request({ runId }))
      expect(res.status).toBe(400)
    }
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
  })
})
