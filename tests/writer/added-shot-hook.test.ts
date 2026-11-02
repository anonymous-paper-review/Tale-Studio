// 보드 훅(use-added-shot-draws)이 writer-store 의 샷 지우기 알림과 화면의 그림 바뀜을 장부에 잇는지(지운 샷 · 다른 길로 새로 그린 샷은 다시 보내지 않는다) 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scene } from '@/types'

// 훅을 직접 부른다 — 효과는 deps 가 바뀐 것만 (앞 정리 뒤) 다시 돈다(React 와 같은 규칙), 외부 저장소는 지금 값을 읽는다.
const hooks = vi.hoisted(() => ({
  effects: [] as Array<{ effect: () => void | (() => void); deps?: readonly unknown[] }>,
  mounted: [] as Array<{ deps?: readonly unknown[]; cleanup: void | (() => void) } | undefined>,
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => { hooks.effects.push({ effect, deps }) },
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const query = { eq: () => query, then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve) }
      return { insert: async () => ({ error: null }), update: () => query, delete: () => query }
    },
  }),
}))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined), loadShotsResult: vi.fn() }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

import { USER_LIMIT_RECHECK_MS } from '@/lib/artist/draw-continue'
import { roughContentSignature, type DrawAddedShot } from '@/lib/writer/added-shot-draws'
import { useAddedShotDraws } from '@/features/writer/use-added-shot-draws'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

const scene: Scene = {
  sceneId: 'sc_01', sortOrder: 0, location: 'hall', timeOfDay: 'night', mood: '', narrativeSummary: '',
  originalTextQuote: '', charactersPresent: [], estimatedDurationSeconds: 5,
}

/** 보드가 다시 그린 것처럼 훅을 부르고 바뀐 효과만 돌린다. */
function render(projectId: string, draw: DrawAddedShot) {
  hooks.effects = []
  useAddedShotDraws({ projectId, draw, activeJobsKey: '', shots: useWriterStore.getState().shots })
  const same = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  hooks.effects.forEach(({ effect, deps }, index) => {
    const prev = hooks.mounted[index]
    if (prev && same(prev.deps, deps)) return
    if (typeof prev?.cleanup === 'function') prev.cleanup()
    hooks.mounted[index] = { deps, cleanup: effect() }
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
/** 그 샷에 그림이 앉은 것처럼 화면 값을 바꾼다(대표 그림 주소만 다르다). */
function landPicture(shotId: string, url: string) {
  useWriterStore.setState({
    shots: useWriterStore.getState().shots.map((shot) =>
      shot.shotId === shotId ? { ...shot, roughStoryboard: { url, status: 'completed', errorMessage: null, generatedAt: 1 } } : shot),
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  hooks.effects = []
  hooks.mounted = []
})
afterEach(async () => {
  for (const mounted of hooks.mounted) if (typeof mounted?.cleanup === 'function') mounted.cleanup()
  await vi.runOnlyPendingTimersAsync()
  useWriterStore.getState().reset()
  vi.useRealTimers()
})

describe('보드 훅과 샷 지우기', () => {
  // 왜: 2026-11-02 최종 리뷰 L4 — 지운 샷을 장부에서 내려놓는 연결(writer-store 지우기 알림 → 장부)은 어느 시험도 붙잡지 않아, 빠져도 시험이 그대로 통과했다.
  //   빠지면 지운 샷이 "내 한도를 기다리는 중"으로 남아 1분마다 지운 샷을 다시 보낸다.
  it('샷을 지우면 보드 훅이 장부에 알려, 내 한도를 기다리던 그 샷을 다시 보내지 않는다', async () => {
    useProjectStore.setState({ projectId: 'hook-remove', currentStage: 'writer' })
    useWriterStore.setState({ sceneManifest: { scenes: [scene], characters: [], locations: [] }, shots: [], error: null })
    const draw = vi.fn<DrawAddedShot>(async () => ({ kind: 'user_limit' }))
    render('hook-remove', draw)
    const id = await useWriterStore.getState().addShot('sc_01', { fields: { actionDescription: '민호가 선다.' } })
    await vi.advanceTimersByTimeAsync(1)
    render('hook-remove', draw)
    expect(draw.mock.calls).toEqual([[id, { redraw: false }]])
    await useWriterStore.getState().deleteShot(id!)
    render('hook-remove', draw)
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS * 3)
    expect(draw).toHaveBeenCalledTimes(1)
  })
})

describe('보드 훅과 다른 길로 새로 그린 그림', () => {
  // 왜(혼자 정한 것): 2026-11-02 최종 리뷰 L2 — 다시 그리기를 기다리는 동안 사람이 샷 고치기 창으로 그 샷을 새로 그리면, 장부는 그 그림이 바뀐 것을
  //   화면에서만 알 수 있다. 훅이 그 바뀜을 넘겨야 장부가 다시 그리기를 내려놓고, 자리가 났을 때 같은 그림을 한 장 더 그리지 않는다.
  it('다시 그리기를 기다리던 더한 샷의 그림이 다른 길로 새로 그려지면 보드 훅이 장부에 알려 그 다시 그리기를 내려놓는다', async () => {
    useProjectStore.setState({ projectId: 'hook-picture', currentStage: 'writer' })
    useWriterStore.setState({ sceneManifest: { scenes: [scene], characters: [], locations: [] }, shots: [], error: null })
    const first = deferred<unknown>()
    let sent = 0
    const draw = vi.fn<DrawAddedShot>(async () => sent++ === 0
      ? { kind: 'submitted', signature: roughContentSignature({ actionDescription: '민호가 선다.', shotType: 'MS', characters: [] }), done: first.promise }
      : { kind: 'user_limit' })
    render('hook-picture', draw)
    const id = (await useWriterStore.getState().addShot('sc_01', { fields: { actionDescription: '민호가 선다.' } }))!
    await vi.advanceTimersByTimeAsync(1)
    render('hook-picture', draw)
    useWriterStore.getState().updateShot(id, { actionDescription: '민호가 돌아선다.' })
    render('hook-picture', draw)
    landPicture(id, 'start.png?v=1')
    first.resolve('drawn')
    await vi.advanceTimersByTimeAsync(1)
    render('hook-picture', draw)
    expect(draw.mock.calls.map(([, options]) => options.redraw)).toEqual([false, true])
    landPicture(id, 'start.png?v=2')
    render('hook-picture', draw)
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS * 3)
    expect(draw).toHaveBeenCalledTimes(2)
  })
})
