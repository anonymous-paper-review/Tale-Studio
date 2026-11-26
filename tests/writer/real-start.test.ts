// Storyboard [시작] · [멈추기]가 Director [이미지 만들기] · [모두 멈추기]와 같은 길로 화면이 센 샷만 보내고, 멈출 때는 실사 작업만 멈추는지 검사한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  run: vi.fn(async () => ({ generated: 0, quotaBlocked: false })),
  afterStopped: vi.fn((start: () => void, _key?: string) => {
    start()
    return Promise.resolve()
  }),
  cancelResume: vi.fn(),
  cancelWaiting: vi.fn(),
  fresh: vi.fn(async () => [] as unknown[]),
  cancelBatch: vi.fn(),
  cancelJobs: vi.fn(async (ids: string[]) => ids),
  info: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/lib/director/real-batch-client', () => ({
  runRealBatch: calls.run,
  afterStoppedRealBatch: calls.afterStopped,
  cancelRealBatchResume: calls.cancelResume,
  cancelWaitingRealBatch: calls.cancelWaiting,
}))
vi.mock('@/lib/director/stop-all-client', () => ({ freshActiveJobs: calls.fresh }))
vi.mock('sonner', () => ({ toast: { info: calls.info, error: calls.error, success: vi.fn(), warning: vi.fn() } }))
vi.mock('@/stores/director-store', () => {
  const state = { realBatchBusy: false, realBatchCancelled: false, cancelRealBatch: calls.cancelBatch, cancelRunningJobs: calls.cancelJobs }
  return { useDirectorCanvasStore: Object.assign(() => state, { getState: () => state, setState: (patch: Record<string, unknown>) => Object.assign(state, patch) }) }
})

import { startStoryboardReal, stopStoryboardReal } from '@/lib/storyboard/start-real'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockClear()
  ;(useDirectorCanvasStore as unknown as { setState: (patch: Record<string, unknown>) => void }).setState({ realBatchBusy: false, realBatchCancelled: false })
  useLocaleStore.setState({ locale: 'ko' })
})

describe('[시작]', () => {
  // 왜(오너 S2): 실사가 없는 샷 전부를 Director [이미지 만들기]와 같은 일괄로 — 화면이 센 샷을 그대로 실어 서버가 따로 고르지 않게(Director 와 같은 규칙).
  it('[시작]을 누르면 화면이 센 샷만 Director 와 같은 실사 일괄로 보내고 끝 알림 자리는 Storyboard 다', async () => {
    await startStoryboardReal('p1', ['a', 'd'])
    expect(calls.run).toHaveBeenCalledTimes(1)
    expect(calls.run).toHaveBeenCalledWith('p1', { shotIds: ['a', 'd'], stage: 'writer' })
  })

  // 왜(Director 와 같은 길): 앞 판을 멈추고 정리하는 동안 누르면 정리가 끝난 뒤 시작한다 — 누름이 말없이 버려지지 않게(검토 a S1e).
  it('[시작]은 멈춘 앞 판의 정리를 기다리는 Director 와 같은 문을 지난다', async () => {
    await startStoryboardReal('p1', ['a'])
    expect(calls.afterStopped).toHaveBeenCalledTimes(1)
    expect(typeof calls.afterStopped.mock.calls[0][1]).toBe('string')
  })

  // 왜: 만들 샷이 없는데 보내면 서버가 실사 없는 샷 전부를 고른다(shotIds 없음 = 전부).
  it('만들 샷이 없으면 [시작]을 눌러도 아무것도 보내지 않는다', async () => {
    await startStoryboardReal('p1', [])
    expect(calls.run).not.toHaveBeenCalled()
    expect(calls.afterStopped).not.toHaveBeenCalled()
  })
})

describe('[멈추기]', () => {
  // 왜(Director [모두 멈추기]와 같은 약속 — 오너 2026-11-14 7번): 아직 보내지 않은 장은 보내지 않고, 이미 만드는 장은 화면에서 멈춘다.
  //   Storyboard 는 실사만 만든다 — Director 에서 시작한 영상은 여기서 멈추지 않는다.
  it('[멈추기]를 누르면 일괄의 남은 장을 보내지 않고 만들고 있는 실사 작업만 멈춘다', async () => {
    ;(useDirectorCanvasStore as unknown as { setState: (patch: Record<string, unknown>) => void }).setState({ realBatchBusy: true, realBatchCancelled: false })
    calls.fresh.mockResolvedValueOnce([
      { id: 'grid-1', kind: 'storyboard_real_grid', target: { writerShotIds: ['a'] } },
      { id: 'one-1', kind: 'shot_storyboard', target: { writerShotId: 'b' } },
      { id: 'video-1', kind: 'shot_video', target: { writerShotId: 'c' } },
      { id: 'rough-1', kind: 'shot_rough_storyboard', target: { shotId: 'd' } },
    ])
    await stopStoryboardReal('p1')
    expect(calls.cancelBatch).toHaveBeenCalledTimes(1)
    expect(calls.cancelResume).toHaveBeenCalledWith('p1')
    expect(calls.cancelWaiting).toHaveBeenCalledTimes(1)
    expect(calls.cancelJobs).toHaveBeenCalledWith(['grid-1', 'one-1'])
    expect(calls.info).toHaveBeenCalledWith('멈췄어요. 그리던 이미지는 뒤늦게 끝나면 버전으로 남아요.')
  })

  // 왜: 멈추기가 실패하면 멈춘 줄 알고 기다리게 된다 — 다시 누르라고 알린다(Director 와 같은 말).
  it('[멈추기]가 실패하면 다시 해 달라고 알린다', async () => {
    calls.fresh.mockResolvedValueOnce([{ id: 'grid-1', kind: 'storyboard_real_grid', target: { writerShotIds: ['a'] } }])
    calls.cancelJobs.mockRejectedValueOnce(new Error('HTTP 500'))
    await stopStoryboardReal('p1')
    expect(calls.error).toHaveBeenCalledTimes(1)
  })
})
