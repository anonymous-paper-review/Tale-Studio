// [먼저 하기]는 도는 내 영상 묶음에서 아직 안 낸 샷 하나를 다음 차례로 옮기고, 순서만 바꾼다 — Take 예약 · 값은 그대로 (시안 D4 · 결정 페이지 추천, 리드 S4-2 7 승인)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: vi.fn().mockResolvedValue(true) }))
import { moveVideoBatchShotFirst } from '@/lib/director/batch-store'

type Row = Record<string, unknown>
let tables: Record<string, Row[]>
let updates: Array<{ table: string; patch: Row }>

// supabase 체인 흉내 — 읽기는 거르기만(order 는 아무것도 하지 않는다), update 는 거른 줄에 그대로 쓴다.
function query(table: string) {
  let rows = tables[table] ?? []
  let patch: Row | null = null
  const q = {
    select: () => q,
    order: () => q,
    update: (value: Row) => { patch = value; return q },
    eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return q },
    neq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] !== value); return q },
    in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return q },
    limit: () => q,
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[] | null; error: null }) => unknown) => {
      if (patch) {
        updates.push({ table, patch })
        for (const row of rows) Object.assign(row, patch)
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      return Promise.resolve({ data: rows, error: null }).then(resolve)
    },
  }
  return q
}

const USER = 'user-1'
const batch = (status = 'running', userId = USER) => ({ id: 'batch-1', project_id: 'project-1', user_id: userId, status, stop_reason: null })
const item = (shot: string, position: number, status = 'pending') => ({
  id: `item-${shot}`, batch_id: 'batch-1', shot_id: shot, position, status, job_id: status === 'submitted' ? `job-${shot}` : null,
  error: null, submission_response: null, prepared: { model: 'seedance', resolution: '720p', takes: 5 },
})
const move = (shotId: string) => moveVideoBatchShotFirst({ batchId: 'batch-1', projectId: 'project-1', userId: USER, shotId })
const pendingOrder = (result: Awaited<ReturnType<typeof move>>) => (result.ok ? result.batch.pendingShotIds : null)

beforeEach(() => {
  vi.clearAllMocks()
  updates = []
  tables = {
    director_video_batches: [batch()],
    director_video_batch_items: [item('s0', 0, 'submitted'), item('a', 1), item('b', 2), item('c', 3), item('d', 4)],
    generation_jobs: [{ id: 'job-s0', status: 'queued', result_url: null, error: null, request_id: 'fal-1' }],
  }
  mocks.from.mockImplementation(query)
})

describe('같이 정한 것', () => {
  it('도는 묶음에서 아직 안 낸 샷을 [먼저 하기]하면 그 샷이 다음 차례가 되고 나머지 순서는 그대로다', async () => {
    // 왜: 시안 D4 "차례를 기다려요 · N번째 · [먼저 하기]" — 결정 페이지 추천대로 영상 묶음 순서만 바꾼다(오너 답 없음 → 추천).
    expect(pendingOrder(await move('c'))).toEqual(['c', 'a', 'b', 'd'])
  })
})

describe('혼자 정한 것', () => {
  it('이미 낸 · 끝난 항목은 움직이지 않고, 없는 샷도 그대로다', async () => {
    // 왜: 이미 낸 영상은 순서를 바꿀 것이 없다 — 서버가 다음에 낼 것만 고른다.
    expect(await move('s0')).toEqual({ ok: false, reason: 'not_pending' })
    expect(await move('nope')).toEqual({ ok: false, reason: 'not_pending' })
    expect(updates).toEqual([])
  })

  it('도는 중이 아닌 묶음(멈춤 · 쉼 · 끝남)은 순서를 바꾸지 않는다', async () => {
    // 왜: 멈춘 · 쉬는 묶음의 남은 샷은 나가지 않는다 — 순서를 바꿔도 뜻이 없고, 다시 도는 것처럼 보이면 안 된다.
    for (const status of ['cancelled', 'paused', 'completed']) {
      tables.director_video_batches = [batch(status)]
      expect(await move('c')).toEqual({ ok: false, reason: 'not_running' })
    }
    expect(updates).toEqual([])
  })

  it('남이 만든 묶음은 순서를 바꾸지 않는다', async () => {
    // 왜: 내 묶음만 — 멈추기(cancelVideoBatch)와 같은 주인 검사.
    tables.director_video_batches = [batch('running', 'someone-else')]
    expect(await move('c')).toEqual({ ok: false, reason: 'not_found' })
    expect(updates).toEqual([])
  })

  it('두 번 눌러도 같은 결과다 — 이미 다음 차례인 샷은 다시 옮기지 않는다', async () => {
    // 왜: 빠르게 두 번 누르거나 두 탭에서 누를 수 있다.
    await move('c')
    const second = await move('c')
    expect(pendingOrder(second)).toEqual(['c', 'a', 'b', 'd'])
    expect(updates).toHaveLength(1)
  })

  it('Take 예약 · 값은 바뀌지 않는다 — 그 항목의 낼 순서(position)만 바꾸고, 그사이 나간 항목은 건드리지 않는다', async () => {
    // 왜: 리드 — 순서만. 준비된 입력(모델 · 해상도 · Take)과 예약 RPC 는 그대로라 같은 값으로 나간다.
    const before = JSON.stringify(tables.director_video_batch_items.find((row) => row.shot_id === 'c')!.prepared)
    await move('c')
    expect(updates).toHaveLength(1)
    expect(Object.keys(updates[0]!.patch)).toEqual(['position'])
    expect(JSON.stringify(tables.director_video_batch_items.find((row) => row.shot_id === 'c')!.prepared)).toBe(before)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
