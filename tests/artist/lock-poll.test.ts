// 작가 이미지 준비 상태를 확인할 때 완료·실패·멈춤을 올바른 순서로 안내한다
import { describe, expect, it } from 'vitest'
import { decideLockPoll } from '@/hooks/use-artist-lock-poll'
import type { WriterStatusAssets } from '@/stores/project-store'

function assets(over: Partial<WriterStatusAssets> = {}): WriterStatusAssets {
  return {
    chars_ready: 0,
    chars_total: 2,
    worlds_ready: 0,
    worlds_total: 1,
    queued_count: 1,
    failed_count: 0,
    stalled: false,
    images_ready: false,
    ...over,
  }
}

describe('decideLockPoll', () => {
  it('모든 이미지가 준비되면 확인을 멈추고 잠금을 푼다', () => {
    const d = decideLockPoll(
      assets({ images_ready: true, chars_ready: 2, worlds_ready: 1, queued_count: 0 }),
      0,
    )
    expect(d.stop).toBe(true)
    expect(d.gate.stalled).toBe(false)
    expect(d.stalledStreak).toBe(0)
  })

  it('실패한 작업이 있으면 즉시 멈추고 실패로 표시한다', () => {
    const d = decideLockPoll(assets({ failed_count: 1, queued_count: 0 }), 0)
    expect(d.stop).toBe(true)
    // failure latches via failed_count, not via the debounced stalled flag
    expect(d.gate.stalled).toBe(false)
    expect(d.stalledStreak).toBe(0)
  })

  it('처음 한 번 멈춰도 바로 실패로 확정하지 않는다', () => {
    const d = decideLockPoll(assets({ stalled: true, queued_count: 0 }), 0)
    expect(d.stop).toBe(false)
    expect(d.gate.stalled).toBe(false)
    expect(d.stalledStreak).toBe(1)
  })

  it('두 번 연속 멈추면 실패로 확정하고 멈춘다', () => {
    const d = decideLockPoll(assets({ stalled: true, queued_count: 0 }), 1)
    expect(d.stop).toBe(true)
    expect(d.gate.stalled).toBe(true)
    expect(d.stalledStreak).toBe(2)
  })

  it('작업이 다시 대기하면 멈춤 횟수를 처음부터 센다', () => {
    const d = decideLockPoll(assets({ stalled: false, queued_count: 2 }), 1)
    expect(d.stop).toBe(false)
    expect(d.gate.stalled).toBe(false)
    expect(d.stalledStreak).toBe(0)
  })

  it('모든 이미지가 준비되면 멈춤 상태가 있어도 실패로 표시하지 않는다', () => {
    const d = decideLockPoll(
      assets({ stalled: true, images_ready: true, chars_ready: 2, worlds_ready: 1, queued_count: 0 }),
      1,
    )
    expect(d.stop).toBe(true)
    expect(d.gate.stalled).toBe(false)
    expect(d.stalledStreak).toBe(0)
  })

  it('실패한 작업이 있으면 멈춤보다 먼저 실패로 처리한다', () => {
    const d = decideLockPoll(assets({ stalled: true, failed_count: 1, queued_count: 0 }), 1)
    expect(d.stop).toBe(true)
    expect(d.gate.stalled).toBe(false)
    expect(d.stalledStreak).toBe(0)
  })

  it('재시도 작업이 대기 중이면 실패로 확정하지 않는다', () => {
    const d = decideLockPoll(assets({ failed_count: 2, queued_count: 1 }), 0)
    expect(d.stop).toBe(false)
    expect(d.gate.stalled).toBe(false)
    expect(d.stalledStreak).toBe(0)
  })
})
