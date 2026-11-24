// 몇 초마다 다시 읽는 화면은 앞 읽기가 끝난 뒤에만 다음 읽기를 예약한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startSequentialPoll } from '@/hooks/use-sequential-poll'

describe('순차 폴링', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('앞 읽기가 간격보다 오래 걸리면 끝난 뒤에 다음 읽기를 예약한다', async () => {
    let finish = () => {}
    const fn = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const stop = startSequentialPoll(fn, 1000)

    await vi.advanceTimersByTimeAsync(999)
    expect(fn).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(1)

    // 읽기가 3초 걸려도 그동안 겹쳐 부르지 않는다.
    await vi.advanceTimersByTimeAsync(3000)
    expect(fn).toHaveBeenCalledTimes(1)

    finish()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(999)
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(2)
    stop()
  })

  it('화면을 떠나면 예약을 취소한다', async () => {
    let finish = () => {}
    const fn = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const stop = startSequentialPoll(fn, 1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(1)

    // 진행 중인 읽기가 끝나도 떠난 화면은 다음을 예약하지 않는다.
    stop()
    finish()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fn).toHaveBeenCalledTimes(1)

    const idle = vi.fn()
    const stopIdle = startSequentialPoll(idle, 1000)
    stopIdle()
    await vi.advanceTimersByTimeAsync(5000)
    expect(idle).not.toHaveBeenCalled()
  })
})
