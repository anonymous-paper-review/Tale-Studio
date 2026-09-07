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
  it('스테이지 경로를 파이프라인 순서로 해석한다', () => {
    expect(stageIndexFromPathname('/studio/producer')).toBe(0)
    expect(stageIndexFromPathname('/studio/writer')).toBe(1)
    expect(stageIndexFromPathname('/studio/editor')).toBe(4)
  })
  it('쿼리·하위 경로가 붙어도 startsWith 로 매칭된다', () => {
    expect(stageIndexFromPathname('/studio/director')).toBe(3)
  })
  it('비스테이지 경로는 -1', () => {
    expect(stageIndexFromPathname('/login')).toBe(-1)
  })
})

describe('slideDirectionBetween', () => {
  it('순방향(파이프라인 진행)은 forward — 오른쪽에서 들어온다', () => {
    expect(slideDirectionBetween(0, 1)).toBe('forward')
    expect(slideDirectionBetween(0, 4)).toBe('forward')
  })
  it('역방향은 back — 왼쪽에서 들어온다', () => {
    expect(slideDirectionBetween(3, 0)).toBe('back')
  })
  it('초기 진입(이전 없음)·같은 stage·비스테이지는 연출 없음', () => {
    expect(slideDirectionBetween(null, 2)).toBe('none')
    expect(slideDirectionBetween(2, 2)).toBe('none')
    expect(slideDirectionBetween(-1, 2)).toBe('none')
    expect(slideDirectionBetween(2, -1)).toBe('none')
  })
})

describe('createStageCommitWaiter — VT 의 라우트 커밋 대기', () => {
  afterEach(() => {
    stageNavMemory.resolveCommit = null
    vi.useRealTimers()
  })

  it('새 template 마운트(resolveStageCommit)로 즉시 해소된다', async () => {
    vi.useFakeTimers()
    const p = createStageCommitWaiter()
    resolveStageCommit()
    await expect(p).resolves.toBeUndefined()
    expect(stageNavMemory.resolveCommit).toBeNull()
  })

  it('커밋이 늦으면 타임아웃으로 해소 — VT 가 화면을 오래 얼리지 않는다', async () => {
    vi.useFakeTimers()
    const p = createStageCommitWaiter()
    vi.advanceTimersByTime(STAGE_VT_COMMIT_TIMEOUT_MS)
    await expect(p).resolves.toBeUndefined()
    expect(stageNavMemory.resolveCommit).toBeNull()
  })

  it('resolve 는 1회용 — StrictMode 이중 effect 의 두 번째 호출은 무해', () => {
    void createStageCommitWaiter()
    resolveStageCommit()
    expect(() => resolveStageCommit()).not.toThrow()
  })
})

describe('startStageViewTransition — 폴백 경로', () => {
  it('VT 미지원 환경(node)에서는 그냥 이동한다', () => {
    const navigate = vi.fn()
    startStageViewTransition('forward', navigate)
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('방향이 없으면 연출 없이 이동한다', () => {
    const navigate = vi.fn()
    startStageViewTransition('none', navigate)
    expect(navigate).toHaveBeenCalledTimes(1)
  })
})
