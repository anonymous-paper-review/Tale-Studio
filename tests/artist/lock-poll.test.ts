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
  it('stops and unlocks when images_ready (no stalled latch)', () => {
    const d = decideLockPoll(
      assets({ images_ready: true, chars_ready: 2, worlds_ready: 1, queued_count: 0 }),
      0,
    )
    expect(d.stop).toBe(true)
    expect(d.gate.stalled).toBe(false)
    expect(d.stalledStreak).toBe(0)
  })

  it('stops immediately (no debounce) when failed_count>0', () => {
    const d = decideLockPoll(assets({ failed_count: 1, queued_count: 0 }), 0)
    expect(d.stop).toBe(true)
    // failure latches via failed_count, not via the debounced stalled flag
    expect(d.gate.stalled).toBe(false)
    expect(d.stalledStreak).toBe(0)
  })

  it('does NOT latch stalled on the first stalled poll (persist→submit race debounce)', () => {
    const d = decideLockPoll(assets({ stalled: true, queued_count: 0 }), 0)
    expect(d.stop).toBe(false)
    expect(d.gate.stalled).toBe(false)
    expect(d.stalledStreak).toBe(1)
  })

  it('latches stalled and stops on the second consecutive stalled poll', () => {
    const d = decideLockPoll(assets({ stalled: true, queued_count: 0 }), 1)
    expect(d.stop).toBe(true)
    expect(d.gate.stalled).toBe(true)
    expect(d.stalledStreak).toBe(2)
  })

  it('resets the streak when a poll is no longer stalled (jobs queued again)', () => {
    const d = decideLockPoll(assets({ stalled: false, queued_count: 2 }), 1)
    expect(d.stop).toBe(false)
    expect(d.gate.stalled).toBe(false)
    expect(d.stalledStreak).toBe(0)
  })

  it('does not treat stalled as a stalled-signal when images_ready is also set', () => {
    const d = decideLockPoll(
      assets({ stalled: true, images_ready: true, chars_ready: 2, worlds_ready: 1, queued_count: 0 }),
      1,
    )
    expect(d.stop).toBe(true)
    expect(d.gate.stalled).toBe(false)
    expect(d.stalledStreak).toBe(0)
  })

  it('failure takes precedence over stalled (no stalled latch even at streak 2)', () => {
    const d = decideLockPoll(assets({ stalled: true, failed_count: 1, queued_count: 0 }), 1)
    expect(d.stop).toBe(true)
    expect(d.gate.stalled).toBe(false)
    expect(d.stalledStreak).toBe(0)
  })

  it('does not latch failure while retry jobs are queued (in-flight)', () => {
    const d = decideLockPoll(assets({ failed_count: 2, queued_count: 1 }), 0)
    expect(d.stop).toBe(false)
    expect(d.gate.stalled).toBe(false)
    expect(d.stalledStreak).toBe(0)
  })
})
