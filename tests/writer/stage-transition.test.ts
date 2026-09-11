// 단계 화면을 옮길 때 올바른 방향으로 움직이고, 준비가 늦어도 멈추지 않는다
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createStageCommitWaiter,
  resolveStageCommit,
  slideDirectionBetween,
  stageIndexFromPathname,
  stageNavMemory,
  startStageViewTransition,
  STAGE_VT_COMMIT_TIMEOUT_MS,
} from '@/lib/stage-transition'

describe('stageIndexFromPathname', () => {
  it('단계 주소를 열면 정해진 순서의 위치를 알아낸다', () => {
    expect(stageIndexFromPathname('/studio/producer')).toBe(0)
    expect(stageIndexFromPathname('/studio/writer')).toBe(1)
    expect(stageIndexFromPathname('/studio/editor')).toBe(4)
  })
  it('주소 뒤에 추가 경로가 붙어도 같은 단계로 알아본다', () => {
    expect(stageIndexFromPathname('/studio/director')).toBe(3)
  })
  it('단계가 아닌 주소는 해당 위치가 없다고 알린다', () => {
    expect(stageIndexFromPathname('/login')).toBe(-1)
  })
})

describe('slideDirectionBetween', () => {
  it('앞 단계에서 다음 단계로 가면 오른쪽에서 화면이 들어온다', () => {
    expect(slideDirectionBetween(0, 1)).toBe('forward')
    expect(slideDirectionBetween(0, 4)).toBe('forward')
  })
  it('뒤 단계로 돌아가면 왼쪽에서 화면이 들어온다', () => {
    expect(slideDirectionBetween(3, 0)).toBe('back')
  })
  it('처음 열거나 같은 단계이거나 단계가 아니면 화면 움직임을 만들지 않는다', () => {
    expect(slideDirectionBetween(null, 2)).toBe('none')
    expect(slideDirectionBetween(2, 2)).toBe('none')
    expect(slideDirectionBetween(-1, 2)).toBe('none')
    expect(slideDirectionBetween(2, -1)).toBe('none')
  })
})

describe('createStageCommitWaiter — 새 화면이 준비되기를 기다리기', () => {
  afterEach(() => {
    stageNavMemory.resolveCommit = null
    vi.useRealTimers()
  })

  it('새 화면이 준비되면 기다림을 바로 끝낸다', async () => {
    vi.useFakeTimers()
    const p = createStageCommitWaiter()
    resolveStageCommit()
    await expect(p).resolves.toBeUndefined()
    expect(stageNavMemory.resolveCommit).toBeNull()
  })

  it('화면 준비가 늦어도 정해진 시간이 지나면 기다림을 끝내 화면을 멈추지 않는다', async () => {
    vi.useFakeTimers()
    const p = createStageCommitWaiter()
    vi.advanceTimersByTime(STAGE_VT_COMMIT_TIMEOUT_MS)
    await expect(p).resolves.toBeUndefined()
    expect(stageNavMemory.resolveCommit).toBeNull()
  })

  it('완료 알림을 두 번 보내도 문제없이 한 번만 처리한다', () => {
    void createStageCommitWaiter()
    resolveStageCommit()
    expect(() => resolveStageCommit()).not.toThrow()
  })
})

describe('startStageViewTransition — 화면 움직임을 지원하지 않을 때의 이동', () => {
  it('화면 움직임을 지원하지 않아도 바로 이동한다', () => {
    const navigate = vi.fn()
    startStageViewTransition('forward', navigate)
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('움직임 방향이 없으면 효과 없이 바로 이동한다', () => {
    const navigate = vi.fn()
    startStageViewTransition('none', navigate)
    expect(navigate).toHaveBeenCalledTimes(1)
  })
})

describe('startStageViewTransition — 전환 연출 실패 뒤 복구', () => {
  afterEach(() => {
    resolveStageCommit()
    stageNavMemory.viaViewTransition = false
    vi.unstubAllGlobals()
  })

  it('전환 연출이 시간 초과로 거절돼도 미처리 오류를 남기지 않고 다음 화면 이동을 계속한다', async () => {
    const dataset: Record<string, string> = {}
    const rejectors: Array<(error: unknown) => void> = []
    const rejected = () => new Promise<void>((_resolve, reject) => { rejectors.push(reject) })
    const start = vi.fn((update: () => void) => {
      update()
      return { ready: rejected(), updateCallbackDone: rejected(), finished: rejected() }
    })
    vi.stubGlobal('document', { documentElement: { dataset }, startViewTransition: start })
    const navigate = vi.fn()
    startStageViewTransition('forward', navigate)
    rejectors.forEach(reject => reject(new DOMException('Transition was aborted because of timeout in DOM update', 'TimeoutError')))
    // 실제 Promise 거절을 한 턴 처리한다. 미처리 거절이면 Vitest 자체가 실행을 실패로 판정한다.
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(dataset.stageNav).toBeUndefined()
    expect(stageNavMemory.viaViewTransition).toBe(false)
    expect(stageNavMemory.resolveCommit).toBeNull()
    start.mockImplementation(update => { update(); return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: Promise.resolve() } })
    startStageViewTransition('back', navigate)
    await Promise.resolve()
    expect(navigate).toHaveBeenCalledTimes(2)
    expect(stageNavMemory.viaViewTransition).toBe(false)
  })

  it('브라우저가 전환 연출 시작을 거절해도 화면 이동은 한 번 실행한다', () => {
    const dataset: Record<string, string> = {}
    vi.stubGlobal('document', { documentElement: { dataset }, startViewTransition: () => { throw new Error('Transition unavailable') } })
    const navigate = vi.fn()
    expect(() => startStageViewTransition('forward', navigate)).not.toThrow()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(dataset.stageNav).toBeUndefined()
    expect(stageNavMemory.viaViewTransition).toBe(false)
  })

  it('이전 화면의 전환 종료가 뒤이어 시작한 전환의 임시 상태를 지우지 않는다', async () => {
    const dataset: Record<string, string> = {}
    const finish: Array<() => void> = []
    vi.stubGlobal('document', { documentElement: { dataset }, startViewTransition: (update: () => void) => {
      update()
      return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: new Promise<void>(resolve => { finish.push(resolve) }) }
    } })
    const navigate = vi.fn()
    startStageViewTransition('forward', navigate)
    startStageViewTransition('back', navigate)
    const currentCommit = stageNavMemory.resolveCommit
    finish[0]()
    await Promise.resolve()
    expect(dataset.stageNav).toBe('back')
    expect(stageNavMemory.viaViewTransition).toBe(true)
    expect(stageNavMemory.resolveCommit).toBe(currentCommit)
    finish[1]()
    await Promise.resolve()
    expect(dataset.stageNav).toBeUndefined()
    expect(stageNavMemory.resolveCommit).toBeNull()
    expect(navigate).toHaveBeenCalledTimes(2)
  })
})
