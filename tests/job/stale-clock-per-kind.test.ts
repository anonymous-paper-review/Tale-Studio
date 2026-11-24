// 영상은 30분, 그림은 10분을 넘겨 대기 중이면 유령으로 본다
import { describe, expect, it } from 'vitest'
import {
  STALE_QUEUED_MS,
  STALE_QUEUED_VIDEO_MS,
  staleQueuedMsFor,
  staleQueuedOrFilter,
} from '@/lib/generation-job-timing'
import { summarizeGenerationBatches, type GenerationBatchRow } from '@/lib/generation-batches'

const NOW = Date.parse('2026-11-24T10:00:00.000Z')
const MIN = 60 * 1000

function row(kind: GenerationBatchRow['kind'], minutesAgo: number): GenerationBatchRow {
  return {
    id: `${kind}-${minutesAgo}`,
    kind,
    status: 'queued',
    target: null,
    created_at: new Date(NOW - minutesAgo * MIN).toISOString(),
  }
}

describe('종류별 유령 기준', () => {
  it('영상 종류는 30분, 그 외는 10분을 기준으로 삼는다', () => {
    expect(staleQueuedMsFor('shot_video')).toBe(STALE_QUEUED_VIDEO_MS)
    expect(staleQueuedMsFor('shot_previz_video')).toBe(30 * MIN)
    expect(staleQueuedMsFor('shot_storyboard')).toBe(STALE_QUEUED_MS)
    expect(staleQueuedMsFor(null)).toBe(10 * MIN)
  })

  it('진행 중 필터는 영상 30분·그림 10분을 한 질문에 담는다', () => {
    const f = staleQueuedOrFilter('fresh', NOW)
    expect(f).toContain(new Date(NOW - 30 * MIN).toISOString())
    expect(f).toContain(new Date(NOW - 10 * MIN).toISOString())
    expect(f).toContain('kind.in.(shot_video,shot_previz_video)')
    expect(f).toContain('kind.not.in.(shot_video,shot_previz_video)')
    expect(f).toContain('created_at.gte.')
  })

  it('유령 청소는 영상 30분·그림 10분이 지난 것만 고른다', () => {
    // 진행 목록(fresh)과 유령 청소(stale)는 같은 두 시각의 반대쪽이다 — 사이에 아무도 안 보는 구간이 없다.
    const f = staleQueuedOrFilter('stale', NOW)
    expect(f).toContain(`kind.in.(shot_video,shot_previz_video),created_at.lt.${new Date(NOW - 30 * MIN).toISOString()}`)
    expect(f).toContain(`kind.not.in.(shot_video,shot_previz_video),created_at.lt.${new Date(NOW - 10 * MIN).toISOString()}`)
    expect(f).not.toContain('gte')
  })

  it('일괄 집계도 같은 기준으로 도는 것을 센다', () => {
    const video = summarizeGenerationBatches([row('shot_video', 11)], NOW)
    expect(video.find((b) => b.lane === 'director-video')?.active).toBe(1)

    const image = summarizeGenerationBatches([row('shot_storyboard', 11)], NOW)
    expect(image.find((b) => b.lane === 'director-storyboard')?.active ?? 0).toBe(0)
  })
})
