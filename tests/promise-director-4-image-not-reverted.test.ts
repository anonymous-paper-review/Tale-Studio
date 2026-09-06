// Director 배선 4 — 생성 직후의 이미지는 옛것으로 되돌아가지 않는다 (2026-09-06)
//
//   무효화 전에 시작된 shots 조회가 아직 진행 중이면, 무효화 뒤의 읽기는 그 결과에 합류하지 않고 다시 받는다.
//   진행 중이던 옛 조회가 뒤늦게 끝나도 사물함을 신선한 것으로 되돌리지 못한다. 단건 이미지 잡도 제출 즉시
//   큐를 갱신해 정산 재수화가 돈다. 문장 하나 = 테스트 하나.
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient }))
vi.mock('@/lib/query-client', () => ({ getQueryClient: () => shared.client }))

const db = vi.hoisted(() => ({
  rows: [] as Array<{ shot_id: string; sort_order: number }>,
  fetchCount: 0,
  gate: null as null | Promise<void>,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => {
            db.fetchCount += 1
            // 요청 시점의 행을 답한다 — 늦게 끝나는 옛 요청은 옛 행을 들고 온다.
            const snapshot = db.rows
            if (db.gate) await db.gate
            return { data: snapshot, error: null }
          },
        }),
      }),
    }),
  }),
}))

import { invalidateShots, loadShots } from '@/lib/shots-cache'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

beforeEach(() => {
  shared.client = new QueryClient()
  db.rows = [{ shot_id: 's1', sort_order: 1 }]
  db.fetchCount = 0
  db.gate = null
})

describe('Director 배선 4 — 생성 직후의 이미지는 옛것으로 되돌아가지 않는다', () => {
  it('무효화 전에 시작된 조회가 진행 중이면, 무효화 뒤의 loadShots 는 그 결과에 합류하지 않고 다시 받는다', async () => {
    let open!: () => void
    db.gate = new Promise((r) => {
      open = r
    })
    const stale = loadShots('p1') // 잡 완료 전에 시작된 옛 조회
    db.rows = [{ shot_id: 's1', sort_order: 2 }] // 웹훅이 DB 를 갱신
    void invalidateShots('p1') // 완료 확정
    const fresh = loadShots('p1') // 재수화의 읽기
    db.gate = null
    open()

    const [staleRows, freshRows] = await Promise.all([stale, fresh])
    expect(freshRows[0].sort_order).toBe(2)
    // 옛 조회를 기다리던 쪽도 무효화를 알아채고 새 행을 받는다 — 둘의 재조회는 한 요청으로 합쳐진다.
    expect(staleRows[0].sort_order).toBe(2)
    expect(db.fetchCount).toBe(2)
  })

  it('뒤늦게 끝난 옛 조회가 사물함을 신선한 것으로 되돌리지 못한다 — 그 뒤 30초 안의 읽기도 새 행이다', async () => {
    let open!: () => void
    db.gate = new Promise((r) => {
      open = r
    })
    const stale = loadShots('p1')
    db.rows = [{ shot_id: 's1', sort_order: 2 }]
    void invalidateShots('p1')
    db.gate = null
    open()
    await stale

    const later = await loadShots('p1')
    expect(later[0].sort_order).toBe(2)
    expect(db.fetchCount).toBe(2)
    expect((await loadShots('p1'))[0].sort_order).toBe(2)
    expect(db.fetchCount).toBe(2)
  })

  it('단건 이미지 잡은 제출 즉시 큐를 갱신해, 정산 재수화(큐 훅)가 이 잡도 본다', () => {
    const store = read('src/stores/director-store.ts')
    expect(store).toMatch(/const \{ jobId \} = \(await res\.json\(\)\) as \{ jobId: string \}\n\s*activeJobId = jobId\n\s*refreshGenerationQueue\(\)/)
  })
})
