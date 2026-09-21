// 완료가 없을 때 Writer를 처음 방문해도 떠난 뒤의 첫 완료를 알리고, 방문하지 않은 단계의 옛 완료는 쌓지 않는다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { GenerationCompletion } from '@/lib/generation-batches'

const hooks = vi.hoisted(() => ({ completions: [] as GenerationCompletion[], effects: [] as Array<() => void> }))
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => void) => { hooks.effects.push(effect) },
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}))
vi.mock('@/lib/generation-queue', () => ({ useGenerationCompletions: () => hooks.completions }))
import { markStageSeen, readStageSeen, useStageBadges } from '@/lib/stage-seen'

const commitEffects = () => { for (const effect of hooks.effects.splice(0)) effect() }
beforeEach(() => { hooks.completions = []; hooks.effects = [] })
afterEach(() => vi.unstubAllGlobals())

it('완료가 없는 Writer를 처음 방문하고 다른 탭으로 떠난 뒤 첫 이미지가 완료되면 숫자는 1이 된다.', () => {
  expect(useStageBadges('first-empty-writer', 'writer')).toEqual({})
  commitEffects()
  expect(readStageSeen('first-empty-writer').writer).toBe(0)
  useStageBadges('first-empty-writer', 'artist')
  commitEffects()
  hooks.completions = [{ stage: 'writer', lane: 'writer-rough', at: 2000, units: 1 }]
  expect(useStageBadges('first-empty-writer', 'artist')).toEqual({ writer: 1 })
})

it('한 번도 방문하지 않은 Writer의 옛 완료는 다른 탭을 처음 보는 동안 새 알림으로 쌓지 않는다.', () => {
  hooks.completions = [{ stage: 'writer', lane: 'writer-rough', at: 2000, units: 4 }]
  expect(useStageBadges('never-visited-writer', 'artist')).toEqual({})
  commitEffects()
  expect(readStageSeen('never-visited-writer').writer).toBeUndefined()
})

it('화면 진입에서 이미 기록한 확인 시각은 완료가 없어도 과거로 되돌리지 않는다.', () => {
  markStageSeen('existing-layout-visit', 'writer', 3000)
  useStageBadges('existing-layout-visit', 'writer')
  commitEffects()
  expect(readStageSeen('existing-layout-visit').writer).toBe(3000)
})

it('완료가 없는 같은 Writer 화면을 다시 그려도 최초 방문 기록은 한 번만 저장한다.', () => {
  const save = vi.fn()
  vi.stubGlobal('localStorage', { setItem: save })
  useStageBadges('same-empty-writer', 'writer')
  commitEffects()
  useStageBadges('same-empty-writer', 'writer')
  commitEffects()
  expect(save).toHaveBeenCalledTimes(1)
})
