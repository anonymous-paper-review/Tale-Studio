// Writer의 아직 보지 않은 완료는 하루가 지나거나 생성 이력이 500건을 넘어도 숫자에서 사라지지 않는다.
import { beforeEach, expect, it, vi } from 'vitest'
import { completionsOf, deriveStageBadges, type GenerationBatchRow } from '@/lib/generation-batches'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
import * as jobs from '@/lib/generation-jobs'

const now = Date.parse('2026-09-10T10:00:00Z')
const old = now - 3 * 24 * 60 * 60 * 1000
const done = (id: string): GenerationBatchRow => ({
  id, kind: 'shot_rough_storyboard', status: 'completed', target: { writerShotIds: [id] },
  created_at: new Date(old - 1000).toISOString(), completed_at: new Date(old).toISOString(),
  updated_at: new Date(old).toISOString(),
})
const calls: Array<{ method: string; args: unknown[] }> = []
function installRows(rows: GenerationBatchRow[], failPage = -1) {
  mocks.from.mockImplementation(() => {
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'or', 'order']) query[method] = (...args: unknown[]) => {
      calls.push({ method, args }); return query
    }
    query.range = async (start: number, end: number) => {
      calls.push({ method: 'range', args: [start, end] })
      return start === failPage ? { data: null, error: new Error('completion page unavailable') } : { data: rows.slice(start, end + 1), error: null }
    }
    return query
  })
}
beforeEach(() => { calls.length = 0; vi.clearAllMocks() })

it('사흘 전에 완료한 러프도 아직 보지 않았다면 Writer 완료 숫자에 남는다.', async () => {
  installRows([done('old-image')])
  const rows = await jobs.listGenerationCompletionRows('project', now)
  expect(deriveStageBadges(completionsOf(rows), { writer: old - 1 }, 'artist')).toEqual({ writer: 1 })
  expect(calls).toContainEqual({ method: 'eq', args: ['status', 'completed'] })
  expect(calls).toContainEqual({ method: 'or', args: [`completed_at.lte.${new Date(now).toISOString()},completed_at.is.null`] })
})

it('완료 이력이 500건을 넘으면 남은 페이지까지 읽어 완료 이미지 수를 빠짐없이 표시한다.', async () => {
  installRows(Array.from({ length: 1002 }, (_, i) => done(`image-${i}`)))
  const rows = await jobs.listGenerationCompletionRows('project', now)
  expect(deriveStageBadges(completionsOf(rows), { writer: old - 1 }, 'artist')).toEqual({ writer: 1002 })
  expect(calls.filter(call => call.method === 'range')).toEqual([
    { method: 'range', args: [0, 499] }, { method: 'range', args: [500, 999] }, { method: 'range', args: [1000, 1499] },
  ])
})

it('완료 이력의 다음 페이지를 읽지 못하면 일부 개수만 정상 결과처럼 돌려주지 않는다.', async () => {
  installRows(Array.from({ length: 501 }, (_, i) => done(`image-${i}`)), 500)
  await expect(jobs.listGenerationCompletionRows('project', now)).rejects.toThrow('completion page unavailable')
})
