import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// vitest 는 node(isServer=true)라 진짜 getQueryClient 는 호출마다 새 인스턴스 — 공유시킨다.
const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient }))
vi.mock('@/lib/query-client', () => ({
  getQueryClient: () => shared.client,
}))

// supabase 읽기 체인(.from('shots').select('*').eq().order() → { data, error })만 흉내낸다.
const db = vi.hoisted(() => ({
  rows: [] as Array<{ shot_id: string }>,
  error: null as { message: string } | null,
  fetchCount: 0,
  /** 응답을 붙잡아 동시성 시험에서 순서를 제어한다. null 이면 즉시 응답. */
  gate: null as null | Promise<void>,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => {
            db.fetchCount += 1
            if (db.gate) await db.gate
            return { data: db.error ? null : db.rows, error: db.error }
          },
        }),
      }),
    }),
  }),
}))

import { invalidateShots, loadShots, loadShotsResult, shotsKey } from '@/lib/shots-cache'

beforeEach(() => {
  shared.client = new QueryClient()
  db.rows = [{ shot_id: 's1' }, { shot_id: 's2' }]
  db.error = null
  db.fetchCount = 0
  db.gate = null
})

describe('loadShots — 칸 하나를 여러 소비처가 공유한다', () => {
  it('동시 호출 둘은 한 요청으로 합쳐진다 (writer·director 가 같이 진입하는 상황)', async () => {
    let open!: () => void
    db.gate = new Promise((r) => { open = r })

    const a = loadShots('p1')
    const b = loadShots('p1')
    open()
    const [ra, rb] = await Promise.all([a, b])

    expect(db.fetchCount).toBe(1)
    expect(ra.map((s) => s.shot_id)).toEqual(['s1', 's2'])
    expect(rb).toBe(ra) // 같은 칸의 같은 결과 객체
  })

  it('신선 기간(30초) 안의 재호출은 네트워크 없이 즉답한다', async () => {
    await loadShots('p1')
    await loadShots('p1')
    await loadShots('p1')

    expect(db.fetchCount).toBe(1)
  })

  it('프로젝트가 다르면 칸이 다르다 — 섞이지 않는다', async () => {
    await loadShots('p1')
    db.rows = [{ shot_id: 'other' }]
    const p2 = await loadShots('p2')

    expect(db.fetchCount).toBe(2)
    expect(p2.map((s) => s.shot_id)).toEqual(['other'])
    expect(
      shared.client.getQueryData<Array<{ shot_id: string }>>(shotsKey('p1'))?.map((s) => s.shot_id),
    ).toEqual(['s1', 's2'])
  })
})

describe('invalidateShots — 쓰기 성공·생성 완료 지점의 "이 칸 못 믿겠다"', () => {
  it('무효화 뒤의 loadShots 는 신선 기간과 무관하게 다시 받는다', async () => {
    await loadShots('p1')
    expect(db.fetchCount).toBe(1)

    db.rows = [{ shot_id: 's1' }, { shot_id: 's2' }, { shot_id: 'new' }]
    await invalidateShots('p1')
    const after = await loadShots('p1')

    expect(db.fetchCount).toBe(2)
    expect(after.map((s) => s.shot_id)).toContain('new')
  })

  it('다른 프로젝트의 칸은 건드리지 않는다', async () => {
    await loadShots('p1')
    await loadShots('p2')
    expect(db.fetchCount).toBe(2)

    await invalidateShots('p1')
    await loadShots('p2') // p2 는 여전히 신선 — 재조회 없음

    expect(db.fetchCount).toBe(2)
  })
})

describe('loadShotsResult — 옛 Promise.all 다리용 { data, error } 어댑터', () => {
  it('성공: { data: 행들, error: null }', async () => {
    const res = await loadShotsResult('p1')
    expect(res.error).toBeNull()
    expect(res.data?.map((s) => s.shot_id)).toEqual(['s1', 's2'])
  })

  it('실패: 던지지 않고 { data: null, error: { message } } — 옛 supabase 반환 모양 보존', async () => {
    db.error = { message: 'permission denied' }
    const res = await loadShotsResult('p-err')
    expect(res.data).toBeNull()
    expect(res.error?.message).toContain('permission denied')
  })
})
