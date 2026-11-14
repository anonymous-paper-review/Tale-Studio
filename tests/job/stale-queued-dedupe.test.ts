// 10분 넘게 대기로 멈춘 그림 작업은 같은 칸 중복 막기에서 세지 않아, 멈춘 칸을 다시 만들면 새로 시작한다(옛 기록은 그대로)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), submitWorld: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true, userId: 'owner' }) }))
vi.mock('@/lib/generation-quota', () => ({ checkGenerationCapacity: async () => ({ ok: true }) }))
vi.mock('@/lib/chat-trace-server', () => ({ chatTraceBelongsToProject: async () => true }))
vi.mock('@/lib/style-anchor', () => ({ resolveStyleAnchor: async () => null, applyStyleAnchor: (_: unknown, value: unknown) => value }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/artist/world-submit', () => ({ submitWorldShotJob: mocks.submitWorld }))

import { POST as generateWorld } from '@/app/api/artist/generate-world/route'
import { triggerWorldDrafts } from '@/lib/artist/draft-trigger'
import { hasQueuedCharacterViewJob, hasQueuedWorldShotJob } from '@/lib/generation-jobs'

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

/** 한 번 읽히는 표 — 결과를 그대로 돌려주는 체인(서버 그림 목록 시험과 같은 꼴). */
function rowsOnce(data: unknown) {
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'order', 'gte', 'limit']) q[name] = () => q
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve)
  return q
}

describe('같은 칸 중복 막기 — 멈춘 작업은 세지 않는다', () => {
  beforeEach(() => mocks.from.mockReset())

  it('같은 칸에 10분 넘게 대기로 멈춘 배경 작업이 있어도 중복으로 막지 않는다', async () => {
    // 왜: 웹훅을 놓치거나 접수 확인이 안 된 예약이 며칠째 queued 로 남아, 그 칸의 [다시 만들기] · 채팅 재시도가 조용히 아무 일도 안 했다(2026-11-14 오너).
    mocks.from.mockReturnValueOnce(rowsOnce([
      { id: 'old', created_at: minutesAgo(40), target: { locationId: 'roof', column: 'wide_shot' } },
    ]))
    await expect(hasQueuedWorldShotJob('project-1', 'roof', 'wide_shot', null)).resolves.toBe(false)
  })

  it('같은 칸에 10분 넘게 대기로 멈춘 인물 시트 작업이 있어도 중복으로 막지 않는다', async () => {
    // 왜: 인물 시트 칸도 같은 막기를 쓴다 — 멈춘 칸을 다시 만들 수 없으면 인물도 같은 고장이다.
    mocks.from.mockReturnValueOnce(rowsOnce([
      { id: 'old', created_at: minutesAgo(25), target: { characterId: 'mina', appearanceKey: 'young', view: 'main' } },
    ]))
    await expect(hasQueuedCharacterViewJob('project-1', 'mina', 'young', 'main')).resolves.toBe(false)
  })

  it('10분 안의 대기 작업은 지금처럼 중복으로 막는다', async () => {
    // 왜: 정상 경로 고정 — 막 접수한 그림을 사람이 연달아 눌러 두 번 그리고 두 번 과금되면 안 된다.
    mocks.from.mockReturnValueOnce(rowsOnce([
      { id: 'fresh', created_at: minutesAgo(3), target: { locationId: 'roof', column: 'wide_shot' } },
    ]))
    await expect(hasQueuedWorldShotJob('project-1', 'roof', 'wide_shot', null)).resolves.toBe(true)

    mocks.from.mockReturnValueOnce(rowsOnce([
      { id: 'fresh', created_at: minutesAgo(9), target: { characterId: 'mina', appearanceKey: 'young', view: 'main' } },
    ]))
    await expect(hasQueuedCharacterViewJob('project-1', 'mina', 'young', 'main')).resolves.toBe(true)
  })

  it('만든 때를 모르는 옛 행은 지금처럼 막 들어온 것으로 본다', async () => {
    // 왜: 목록 함수와 같은 기준이다 — 시각이 없는 행을 멈춘 것으로 보면 도는 작업을 두 번 낸다.
    mocks.from.mockReturnValueOnce(rowsOnce([{ id: 'no-time', target: { locationId: 'roof', column: 'wide_shot' } }]))
    await expect(hasQueuedWorldShotJob('project-1', 'roof', 'wide_shot', null)).resolves.toBe(true)
  })
})

describe('멈춘 배경 칸을 다시 만든다', () => {
  let rows: Record<string, Array<Record<string, unknown>>>
  let updated: string[]

  function chain(table: string) {
    let single = false
    let mutation = false
    const filters: Array<[string, unknown]> = []
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.order = () => q
    q.update = () => { mutation = true; updated.push(table); return q }
    q.eq = (key: string, value: unknown) => { filters.push([key, value]); return q }
    q.is = (key: string, value: unknown) => { filters.push([key, value]); return q }
    q.maybeSingle = q.single = () => { single = true; return q }
    q.then = (resolve: (value: unknown) => unknown) => {
      const matches = (rows[table] ?? []).filter((row) => filters.every(([key, value]) => !(key in row) || row[key] === value))
      return Promise.resolve({ data: mutation ? null : single ? matches[0] ?? null : matches, error: null }).then(resolve)
    }
    return q
  }

  const post = (body: Record<string, unknown>) => generateWorld(new Request('http://localhost/api/artist/generate-world', { method: 'POST', body: JSON.stringify(body) }))
  const request = { projectId: 'project-1', locationId: 'roof', column: 'wide_shot', prompt: 'a roof', actor: 'ui' }
  const queuedRow = (minutes: number) => ({
    id: 'queued-1', project_id: 'project-1', kind: 'world_shot', status: 'queued', created_at: minutesAgo(minutes),
    target: { locationId: 'roof', column: 'wide_shot' },
  })

  beforeEach(() => {
    mocks.from.mockReset()
    mocks.submitWorld.mockReset()
    updated = []
    rows = {
      projects: [{ id: 'project-1', workspace_id: 'ws', design_tokens: null, style_anchor_key: null }],
      locations: [{ project_id: 'project-1', location_id: 'roof', name: 'Rooftop', visual_description: 'a roof', wide_shot: null }],
      generation_jobs: [],
    }
    mocks.from.mockImplementation(chain)
    mocks.submitWorld.mockResolvedValue({ id: 'job-new' })
  })

  it('멈춘 배경 칸을 사람이 다시 만들면 새로 접수하고 옛 기록은 그대로 둔다', async () => {
    // 왜: 화면이 "멈춤"이라고 하는 칸을 다시 눌렀는데 서버가 "이미 대기 중"으로 건너뛰어 아무 일도 안 했다. 옛 기록은 접수 여부를 확인할 수 없어 시간만으로 닫지 않는다(예약 보존 약속).
    rows.generation_jobs = [queuedRow(40)]

    const response = await post(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, jobId: 'job-new', status: 'queued' })
    expect(body.deduped).toBeUndefined()
    expect(mocks.submitWorld).toHaveBeenCalledTimes(1)
    expect(updated).not.toContain('generation_jobs')
    expect(rows.generation_jobs[0].status).toBe('queued')
  })

  it('10분 안에 접수한 배경 칸을 다시 누르면 지금처럼 겹친 요청으로 건너뛴다', async () => {
    // 왜: 정상 경로 고정 — 막 접수한 같은 그림을 한 번 더 그려 두 번 과금하지 않는다.
    rows.generation_jobs = [queuedRow(2)]

    const response = await post(request)

    await expect(response.json()).resolves.toMatchObject({ ok: true, status: 'queued', deduped: true })
    expect(mocks.submitWorld).not.toHaveBeenCalled()
  })

  it('서버 초안 재시도는 10분 넘게 멈춘 배경 칸을 건너뛰지 않고 새로 낸다', async () => {
    // 왜: 멈춤 상태의 [다시 시도]가 같은 막기를 만나 "건너뜀 1 · 제출 0"으로 끝나, 멈춤 → 다시 시도 → 또 멈춤으로 돌았다.
    rows.generation_jobs = [queuedRow(40)]
    rows.locations = [{
      project_id: 'project-1', location_id: 'roof', name: 'Rooftop', visual_description: 'a roof', style_description: null,
      lighting_direction: null, lighting_sources: null, time_of_day: 'night', purpose: 'meeting', props: [], wide_shot: null,
    }]

    const result = await triggerWorldDrafts('project-1')

    expect(result).toEqual({ submitted: 1, skipped: 0, failed: 0 })
    expect(mocks.submitWorld).toHaveBeenCalledTimes(1)
  })

  it('서버 초안 재시도는 10분 안에 접수한 배경 칸은 지금처럼 건너뛴다', async () => {
    // 왜: 정상 경로 고정 — 접수한 지 얼마 안 된 칸을 자동 초안이 또 내지 않는다.
    rows.generation_jobs = [queuedRow(4)]
    rows.locations = [{
      project_id: 'project-1', location_id: 'roof', name: 'Rooftop', visual_description: 'a roof', style_description: null,
      lighting_direction: null, lighting_sources: null, time_of_day: 'night', purpose: 'meeting', props: [], wide_shot: null,
    }]

    const result = await triggerWorldDrafts('project-1')

    expect(result).toEqual({ submitted: 0, skipped: 1, failed: 0 })
    expect(mocks.submitWorld).not.toHaveBeenCalled()
  })
})
