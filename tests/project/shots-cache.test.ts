// 여러 화면이 같은 프로젝트의 장면 목록을 함께 보되 바뀐 내용은 다시 확인한다
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

describe('한 프로젝트의 장면 목록을 여러 화면이 함께 사용한다', () => {
  it('Writer와 Director가 동시에 장면 목록을 열면 한 번만 불러온다', async () => {
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

  it('30초 안에 다시 열면 인터넷에 다시 묻지 않고 바로 보여준다', async () => {
    await loadShots('p1')
    await loadShots('p1')
    await loadShots('p1')

    expect(db.fetchCount).toBe(1)
  })

  it('다른 프로젝트의 장면 목록은 서로 섞이지 않는다', async () => {
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

describe('장면 목록을 바꾼 뒤 최신 내용을 다시 가져온다', () => {
  it('내용이 바뀌었다고 알리면 30초가 지나지 않아도 최신 장면 목록을 다시 불러온다', async () => {
    await loadShots('p1')
    expect(db.fetchCount).toBe(1)

    db.rows = [{ shot_id: 's1' }, { shot_id: 's2' }, { shot_id: 'new' }]
    await invalidateShots('p1')
    const after = await loadShots('p1')

    expect(db.fetchCount).toBe(2)
    expect(after.map((s) => s.shot_id)).toContain('new')
  })

  it('다른 프로젝트의 장면 목록은 다시 불러오지 않는다', async () => {
    await loadShots('p1')
    await loadShots('p2')
    expect(db.fetchCount).toBe(2)

    await invalidateShots('p1')
    await loadShots('p2') // p2 는 여전히 신선 — 재조회 없음

    expect(db.fetchCount).toBe(2)
  })
})

describe('장면 목록을 성공 또는 오류 결과로 전달한다', () => {
  it('성공하면 장면 목록을 오류 없이 돌려준다', async () => {
    const res = await loadShotsResult('p1')
    expect(res.error).toBeNull()
    expect(res.data?.map((s) => s.shot_id)).toEqual(['s1', 's2'])
  })

  it('불러오기에 실패해도 멈추지 않고 오류 이유를 함께 돌려준다', async () => {
    db.error = { message: 'permission denied' }
    const res = await loadShotsResult('p-err')
    expect(res.data).toBeNull()
    expect(res.error?.message).toContain('permission denied')
  })
})
