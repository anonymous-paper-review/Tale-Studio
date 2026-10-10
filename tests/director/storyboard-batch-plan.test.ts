// 스토리보드 일괄 요청은 그리는 중인 샷과 이번 판에 이미 낸 샷을 건너뛰고 다음 샷을 낸다 (오너 제보 2026-10-10 "중간에 끊김")
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
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `sh_01_${String(from + i).padStart(2, '0')}`)

let db: Record<string, Array<Record<string, unknown>>>

/** supabase-js 체인 최소 스텁 — 거르기는 하지 않는다(표에 넣은 행이 곧 조회 결과). */
function queryFor(table: string) {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'order', 'gte', 'limit', 'not', 'is']) q[name] = () => q
  q.maybeSingle = q.single = async () => ({ data: db[table]?.[0] ?? null, error: null })
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: db[table] ?? [], error: null }).then(resolve)
  return q
}

/** 한 씬에 러프 3장이 갖춰진 샷 count 개 — 4개씩 시트 한 장이 된다. */
function shots(count: number, withImage = false) {
  return ids(1, count).map((shot_id) => ({
    shot_id,
    scene_id: 'scene-1',
    characters: [],
    character_appearance_keys: {},
    rough_storyboard: { frames: { start: 'https://r/s.png', direction: 'https://r/d.png', end: 'https://r/e.png' }, generatedAt: 1000 },
    storyboard_image: withImage ? { url: 'https://img/old.png', status: 'completed' } : null,
    static_spec: null,
    director_refs: null,
  }))
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
    db.generation_jobs = [{ id: OTHER_JOB, target: { writerShotIds: ids(1, 4) }, created_at: new Date().toISOString() }]
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
    db.generation_jobs = [{ id: OTHER_JOB, target: { writerShotIds: ids(1, 4) }, created_at: new Date(Date.now() - 11 * 60_000).toISOString() }]
    const body = await (await POST(request())).json()
    expect(reservedGroups()).toEqual([ids(5, 8)])
    expect(body.data.inProgress).toEqual([])
  })

  it('다른 탭이 같은 샷을 막 먼저 접수했으면 새로 내지 않고 그 작업을 기다리라고 알려 준다', async () => {
    // 왜: 확인과 예약 사이에 다른 탭이 끼어들면 예약이 막힌다. 그 작업이 끝나야 다음 차례로 넘어갈 수 있다.
    db.shots = shots(4)
    mocks.reserveGenerationJob.mockRejectedValue({ code: 'P0001', message: 'storyboard_already_generating', details: OTHER_JOB })
    const body = await (await POST(request())).json()
    expect(mocks.falImageSubmit).not.toHaveBeenCalled()
    expect(body.data).toMatchObject({ submitted: [], inProgress: [{ jobId: OTHER_JOB, shotIds: ids(1, 4) }] })
  })

  it('이번 판에 이미 낸 샷이라고 알려 준 샷은 다시 내지 않는다', async () => {
    // 왜: 실패한 샷이 판이 끝날 때까지 요청마다 다시 나갔다(운영 9/1 3e0169eb: 같은 시트 10번 실패). 다시 그리려면 버튼을 다시 누른다.
    db.shots = shots(8)
    const body = await (await POST(request({ skipShotIds: ids(1, 4) }))).json()
    expect(reservedGroups()).toEqual([ids(5, 8)])
    expect(body.data.remaining).toBe(0)
  })

  it('전체 재생성도 이번 판에 이미 다시 그린 샷은 다시 내지 않는다', async () => {
    // 왜: 전체 재생성은 요청마다 맨 앞 8개 샷을 다시 골라, 앞 8개만 거듭 다시 그리고 나머지 샷에는 닿지 못했다.
    db.shots = shots(12, true)
    await POST(request({ force: true, skipShotIds: ids(1, 8) }))
    expect(reservedGroups()).toEqual([ids(9, 12)])
  })

  it('이번 판에 낸 샷 목록이 샷 이름 목록이 아니면 요청을 받지 않는다', async () => {
    // 정상 경로 고정 — 잘못 온 목록으로 아무것도 고르지 않는다.
    db.shots = shots(4)
    for (const skipShotIds of ['sh_01_01', [1, 2], [''], Array.from({ length: 5001 }, (_, i) => `s${i}`)]) {
      const res = await POST(request({ skipShotIds }))
      expect(res.status).toBe(400)
    }
    expect(mocks.reserveGenerationJob).not.toHaveBeenCalled()
  })
})
