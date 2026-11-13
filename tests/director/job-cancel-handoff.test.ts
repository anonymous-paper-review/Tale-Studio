// Editor 로 넘기기 · 내보내기도 화면에서 멈춘 Take 를 ★ 로 고르지 않은 한 고르지 않는다 — 멈춤은 그 Take 의 마지막 작업에 적혀 있다 (오너 2026-11-14 7번 · 리드 C "넘기기 고르기")
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { withCancelledTakes } from '@/lib/director/take-cancellations'
import { selectHandoffTake } from '@/lib/director-video-take-selection'

const reader = (rows: unknown[] | null, error: unknown = null) => {
  const query = { select: vi.fn(() => query), in: vi.fn(() => query), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error }).then(resolve) }
  return { from: vi.fn(() => query) }
}

describe('넘기기 고르기의 멈춘 Take', () => {
  it('Take 줄에 멈춘 때를 붙여, 늦게 끝난 멈춘 Take 대신 앞 Take 를 Editor 로 넘긴다', async () => {
    // 왜: 오너 7번 "백그라운드에서 끝나면 히스토리로" — Editor · 내보내기가 늦게 끝난 영상을 저절로 쓰지 않는다.
    const clips = [
      { id: 'a', url: 'https://media.test/a.mp4', status: 'completed', take_number: 1, created_at: '2026-11-14T00:00:00Z', is_final: false, last_attempt_job_id: 'job-a' },
      { id: 'b', url: 'https://media.test/b.mp4', status: 'completed', take_number: 2, created_at: '2026-11-14T01:00:00Z', is_final: false, last_attempt_job_id: 'job-b' },
    ]
    const marked = await withCancelledTakes(reader([{ job_id: 'job-b', cancelled_at: '2026-11-14T01:01:00Z' }]), clips)
    expect(marked.map((c) => [c.id, c.cancelled_at ?? null])).toEqual([['a', null], ['b', '2026-11-14T01:01:00Z']])
    expect(selectHandoffTake(marked)?.id).toBe('a')
  })

  it('멈춤을 읽지 못하면 종전처럼 고른다', async () => {
    // 왜: 멈춤 표를 아직 못 읽는 환경(표가 없는 DB · 접근 실패)에서도 Editor 로 넘기기는 멈추지 않아야 한다.
    const clips = [{ id: 'a', last_attempt_job_id: 'job-a' }]
    expect(await withCancelledTakes(reader(null, { message: 'missing' }), clips)).toEqual(clips)
    expect(await withCancelledTakes({ from: () => { throw new Error('no table') } }, clips)).toEqual(clips)
  })

  it('Editor 로 넘기기 · 내보내기 · 내보내기 크기 셈이 모두 멈춘 Take 를 붙여 고른다', () => {
    // 왜: 리드 C "넘기기 고르기가 그 표를 보고 빼게" — 고르는 곳이 셋이라 하나라도 빠지면 그 길로 늦은 영상이 나간다.
    for (const file of ['src/stores/editor-store.ts', 'src/lib/export/director.ts', 'src/components/export-menu.tsx']) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).toMatch(/withCancelledTakes\(/)
      expect(src, file).toMatch(/last_attempt_job_id/)
    }
  })
})
