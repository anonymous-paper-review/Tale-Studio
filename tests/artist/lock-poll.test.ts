// 작가 이미지 준비 상태를 확인할 때 완료·실패·멈춤을 올바른 순서로 안내한다
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ARTIST_LOCK_POLL_MS, ARTIST_LOCK_STALL_WATCH_MS, ARTIST_LOCK_WATCH_POLL_MS, artistGateWakeKey, decideLockPoll, stallWatchDelay } from '@/hooks/use-artist-lock-poll'
import { useProjectStore } from '@/stores/project-store'
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
  // 왜(오너 2026-11-27 N7 · m1126 O1 · 검토 rev-flow 리드 결정 8): [이미지 만들기] 전처럼 그리는 작업도 멈춤 · 실패도 없으면 기다릴 것이 없다 —
  //   끝없이 묻지 않고 확인을 멈춘다. Artist 가 그림을 맡기면(대기열에 인물 · 배경 그림 작업이 오르면) 확인을 다시 켠다(아래 artistGateWakeKey).
  it('그리는 작업 · 멈춤 · 실패가 없으면 확인을 멈춘다 — Artist 가 그림을 맡기면 다시 켠다', () => {
    expect(decideLockPoll(assets({ queued_count: 0 }), 0)).toMatchObject({ stop: true, gate: { stalled: false } })
  })

  // 왜(정상 경로 고정): 그리는 작업이 있거나 멈춤을 세는 중이면 지금처럼 5초마다 확인한다.
  it('그리는 작업이 있거나 멈춤을 세는 중이면 지금처럼 5초마다 확인한다', () => {
    expect(decideLockPoll(assets({ queued_count: 2 }), 0).delayMs).toBe(ARTIST_LOCK_POLL_MS)
    expect(decideLockPoll(assets({ stalled: true, queued_count: 0 }), 0).delayMs).toBe(ARTIST_LOCK_POLL_MS)
  })
  // 왜(검토 rev-flow 리드 1): 오래 걸림으로 확정되면 확인을 멈췄다 — 그 뒤 늦게 다 그려져도 새로 고칠 때까지 레일 점이 남았다.
  //   확정된 뒤에도 정해진 시간(30분)까지는 30초마다 다시 봐서 늦게 끝난 그림을 잡고, 그 뒤에는 멈춘다(끝없는 확인 없음).
  it('오래 걸림으로 확정된 뒤에도 30분까지는 30초마다 다시 확인해 늦게 끝난 그림을 잡고, 그 뒤에는 멈춘다', () => {
    expect(ARTIST_LOCK_WATCH_POLL_MS).toBe(30_000)
    expect(ARTIST_LOCK_STALL_WATCH_MS).toBe(30 * 60_000)
    expect(stallWatchDelay(1_000, 1_000)).toBe(ARTIST_LOCK_WATCH_POLL_MS)
    expect(stallWatchDelay(1_000, 1_000 + 29 * 60_000)).toBe(ARTIST_LOCK_WATCH_POLL_MS)
    expect(stallWatchDelay(1_000, 1_000 + 30 * 60_000)).toBeNull()
    const hook = readFileSync('src/hooks/use-artist-lock-poll.ts', 'utf8')
    expect(hook).toMatch(/stallWatchDelay\(/)
  })
})

describe('그림 확인 다시 켜기', () => {
  // 왜(검토 rev-flow 리드 1): 실패 · 오래 걸림에서 확인을 멈추면, Artist 화면에서 다시 그려 다 나와도 레일 점이 새로 고칠 때까지 남았다(풀던 곳은 이제 안 쓰는 레일 다시 그리기뿐).
  //   어느 길(카드 [다시 만들기] · [안 나온 그림 다시 그리기] · [이미지 만들기] · 채팅 · 다른 창)로 맡기든 대기열에 오른 인물 · 배경 그림 작업을 보고 다시 켠다.
  it('대기열에 인물 · 배경 그림 작업이 오르면 확인을 다시 켜는 열쇠가 바뀌고, 멈춘 작업 · 다른 작업은 세지 않는다', () => {
    const job = (id: string, kind: string, cancelledAt?: string) => ({ id, kind, target: {}, ...(cancelledAt ? { cancelledAt } : {}) }) as never
    expect(artistGateWakeKey([])).toBe('')
    expect(artistGateWakeKey([job('v1', 'shot_video'), job('r1', 'shot_rough_storyboard')])).toBe('')
    expect(artistGateWakeKey([job('c2', 'character_view'), job('w1', 'world_shot'), job('c1', 'character_view', '2026-11-27T00:00:00Z')])).toBe('c2|w1')
    const hook = readFileSync('src/hooks/use-artist-lock-poll.ts', 'utf8')
    expect(hook).toMatch(/useActiveGenerationJobs\(/)
    expect(hook).toMatch(/artistGateWakeKey\(/)
    expect(hook).toMatch(/resumeArtistGate\(\)/)
  })

  // 왜(검토 rev-flow 리드 1): 다시 맡긴 그림을 그리는 동안은 지난 실패 · 오래 걸림 점을 내리고, 확인 결과로 다시 정한다.
  it('그림 확인을 다시 켜면 실패 · 오래 걸림 표시를 내리고 확인 차례를 하나 올린다', () => {
    useProjectStore.setState({ artistImagesFailed: true, artistImagesStalled: true, artistGateWake: 0 })
    useProjectStore.getState().resumeArtistGate()
    expect(useProjectStore.getState()).toMatchObject({ artistImagesFailed: false, artistImagesStalled: false, artistGateWake: 1 })
  })
})
