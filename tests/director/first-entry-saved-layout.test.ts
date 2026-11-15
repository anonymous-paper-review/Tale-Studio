// Director 처음 정렬은 DB 에 저장된 자리(씬 · 샷 canvas_position)나 영상 테이크가 하나라도 있으면 하지 않고, 읽기가 실패하면 안 하는 쪽으로 간다 (오너 2026-11-16)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  rows: { scenes: [] as unknown[], shots: [] as unknown[] },
  error: null as { message: string } | null,
  takes: [] as unknown[],
  takesStatus: 200,
  reads: [] as string[],
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: 'scenes' | 'shots') => {
      const query = {
        select: () => query,
        eq: () => query,
        not: (column: string, op: string, value: unknown) => {
          db.reads.push(`${table}.${column} ${op} ${String(value)}`)
          return query
        },
        limit: () => Promise.resolve({ data: db.rows[table], error: db.error }),
      }
      return query
    },
  }),
}))

import { projectHasSavedLayout } from '@/features/director/first-entry-layout'
import { arrangeIfFirstEntry } from '@/features/director/hooks/use-writer-director-sync'

beforeEach(() => {
  db.rows = { scenes: [], shots: [] }
  db.error = null
  db.takes = []
  db.takesStatus = 200
  db.reads = []
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ takes: db.takes }), { status: db.takesStatus })))
})
afterEach(() => vi.unstubAllGlobals())

describe('DB 에 저장된 자리가 있는가', () => {
  // 왜: 아무것도 저장되지 않은 프로젝트만 처음 정렬을 한다 — 이 답이 false 일 때만 정렬이 일어난다.
  it('저장된 자리도 영상 테이크도 없으면 없다고 답한다', async () => {
    expect(await projectHasSavedLayout('p1')).toBe(false)
    // 저장된 자리는 "canvas_position 이 비어 있지 않은 행"으로 읽는다(씬 · 샷 둘 다).
    expect(db.reads).toEqual(['scenes.canvas_position is null', 'shots.canvas_position is null'])
  })

  // 왜: 샷 자리는 사람이 끌었을 때 저장된다. 하나만 저장돼 있어도 사람이 손댄 프로젝트다.
  it('저장된 샷 자리가 하나라도 있으면 있다고 답한다', async () => {
    db.rows.shots = [{ project_id: 'p1' }]

    expect(await projectHasSavedLayout('p1')).toBe(true)
  })

  // 왜: 씬 자리는 [자동 정렬]이 저장한다(숨은 씬 카드의 자리). 정렬해 둔 프로젝트는 다시 정렬하지 않는다.
  it('저장된 씬 자리가 있으면 있다고 답한다', async () => {
    db.rows.scenes = [{ project_id: 'p1' }]

    expect(await projectHasSavedLayout('p1')).toBe(true)
  })

  // 왜: 영상 테이크가 있으면 영상 작업이 시작된 프로젝트다. 테이크 자리는 만들 때 저장돼 있어 다시 놓으면 저장된 자리를 새로 쓰게 된다.
  it('영상 테이크가 있으면 있다고 답한다', async () => {
    db.takes = [{ id: 'clip-1' }]

    expect(await projectHasSavedLayout('p1')).toBe(true)
  })

  // 왜: 모르는데 덮는 것보다 안 고치는 편이 안전하다 — 읽기가 실패하면 처음 정렬을 하지 않는다(단추를 누르면 된다).
  it('읽기가 실패하거나 답이 이상하면 있다고 보고 아무것도 안 한다', async () => {
    db.error = { message: 'permission denied' }
    expect(await projectHasSavedLayout('p1')).toBe(true)

    db.error = null
    db.takesStatus = 500
    expect(await projectHasSavedLayout('p1')).toBe(true)

    db.takesStatus = 200
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    expect(await projectHasSavedLayout('p1')).toBe(true)

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 })))
    expect(await projectHasSavedLayout('p1')).toBe(true)
  })
})

describe('DB 를 읽는 때', () => {
  // 왜: 다시 열기(카드가 이미 있어 이번 진입에서 새로 만든 카드가 없다)는 처음일 수 없다. 그 판별에 DB 읽기 셋(씬 · 샷 · 테이크)을 매번 쓸 까닭이 없다.
  it('이번 진입에서 카드를 새로 만들지 않았으면 DB 를 읽지 않고 정렬도 하지 않는다', async () => {
    expect(await arrangeIfFirstEntry(new Map(), 'p1')).toBe(false)

    expect(db.reads).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})
