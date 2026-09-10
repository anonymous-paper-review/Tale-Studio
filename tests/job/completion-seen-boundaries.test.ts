// 보고 있는 단계에서 확인한 완료는 떠난 뒤 다시 미확인으로 돌아오지 않으며 다른 단계의 새 완료는 유지한다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { GenerationCompletion } from '@/lib/generation-batches'

const hooks = vi.hoisted(() => ({
  completions: [] as GenerationCompletion[],
  effects: [] as Array<() => void>,
}))
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => void) => { hooks.effects.push(effect) },
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}))
vi.mock('@/lib/generation-queue', () => ({ useGenerationCompletions: () => hooks.completions }))
import { markStageSeen, readStageSeen, useStageBadges } from '@/lib/stage-seen'

beforeEach(() => { hooks.completions = []; hooks.effects = [] })
afterEach(() => vi.unstubAllGlobals())
const commitEffects = () => { for (const effect of hooks.effects.splice(0)) effect() }

it('보고 있는 단계에서 완료된 결과는 다른 단계로 떠난 뒤에도 미확인으로 다시 표시하지 않는다.', () => {
  markStageSeen('seen-then-leave', 'writer', 1000)
  hooks.completions = [{ stage: 'writer', lane: 'writer-rough', at: 2000, units: 4 }]
  expect(useStageBadges('seen-then-leave', 'writer')).toEqual({})
  commitEffects()
  expect(useStageBadges('seen-then-leave', 'artist')).toEqual({})
  expect(readStageSeen('seen-then-leave').writer).toBe(2000)
})

it('다른 단계로 떠난 뒤 새로 완료된 결과는 미확인으로 표시한다.', () => {
  markStageSeen('new-after-leave', 'writer', 1000)
  hooks.completions = [{ stage: 'writer', lane: 'writer-rough', at: 2000, units: 4 }]
  useStageBadges('new-after-leave', 'writer')
  commitEffects()
  hooks.completions.push({ stage: 'writer', lane: 'writer-rough', at: 3000, units: 1 })
  expect(useStageBadges('new-after-leave', 'artist')).toEqual({ writer: 1 })
  commitEffects()
  expect(readStageSeen('new-after-leave').writer).toBe(2000)
})

it('같은 완료를 다시 받아도 확인 시각을 반복 저장하거나 다른 단계의 알림을 지우지 않는다.', () => {
  markStageSeen('same-completion', 'writer', 1000)
  markStageSeen('same-completion', 'artist', 1000)
  const save = vi.fn()
  vi.stubGlobal('localStorage', { setItem: save })
  hooks.completions = [
    { stage: 'writer', lane: 'writer-rough', at: 2000, units: 4 },
    { stage: 'artist', lane: 'artist', at: 3000, units: 2 },
  ]
  expect(useStageBadges('same-completion', 'writer')).toEqual({ artist: 2 })
  commitEffects()
  expect(useStageBadges('same-completion', 'writer')).toEqual({ artist: 2 })
  commitEffects()
  expect(save).toHaveBeenCalledTimes(1)
})
