// Storyboard 가 샷마다 실사 그림을 shots 사물함에서 읽고, 새로 읽으라면 사물함을 낡음으로 표시하며, 프로젝트를 옮기면 앞 그림을 버리는지 검사한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cache = vi.hoisted(() => ({
  rows: {} as Record<string, Array<{ shot_id: string; storyboard_image: unknown }>>,
  order: [] as string[],
  gate: null as null | Promise<void>,
  fail: false,
}))
vi.mock('@/lib/shots-cache', () => ({
  invalidateShots: vi.fn(async (projectId: string) => {
    cache.order.push(`invalidate:${projectId}`)
  }),
  loadShots: vi.fn(async (projectId: string) => {
    cache.order.push(`load:${projectId}`)
    if (cache.gate) await cache.gate
    if (cache.fail) throw new Error('network down')
    return cache.rows[projectId] ?? []
  }),
}))

import { useStoryboardRealImages } from '@/lib/storyboard/real-images-store'

beforeEach(() => {
  cache.rows = {
    p1: [
      { shot_id: 'a', storyboard_image: { url: 'https://x/a.png', status: 'completed', generatedAt: 1 } },
      { shot_id: 'b', storyboard_image: null },
    ],
    p2: [{ shot_id: 'z', storyboard_image: { url: 'https://x/z.png', status: 'completed', generatedAt: 1 } }],
  }
  cache.order = []
  cache.gate = null
  cache.fail = false
  useStoryboardRealImages.setState({ projectId: null, images: {}, loaded: false, failed: false })
})

describe('Storyboard 실사 그림 읽기', () => {
  // 왜: Writer 샷 모양에는 실사 칸이 없다(types/shot) — 같은 사물함(select *)의 storyboard_image 를 샷 id 로 들고 카드가 읽는다.
  it('실사 그림은 shots 사물함의 storyboard_image 를 샷마다 읽는다', async () => {
    await useStoryboardRealImages.getState().load('p1')
    const state = useStoryboardRealImages.getState()
    expect(state.loaded).toBe(true)
    expect(state.images).toEqual({ a: cache.rows.p1[0].storyboard_image, b: null })
  })

  // 왜: 실사 작업이 끝난 순간의 30초 신선 사물함은 옛 행이다 — 낡음으로 표시한 뒤 받아야 카드가 새 그림을 보인다(#shots-cache-invalidate).
  it('새로 읽으라고 하면 사물함을 낡음으로 표시한 뒤 다시 받는다', async () => {
    await useStoryboardRealImages.getState().load('p1', { fresh: true })
    expect(cache.order).toEqual(['invalidate:p1', 'load:p1'])
  })

  // 왜: 프로젝트를 옮긴 뒤 늦게 온 앞 프로젝트의 답이 새 프로젝트 카드에 앞 그림을 칠하면 안 된다.
  it('다른 프로젝트로 옮기면 앞 프로젝트의 실사 그림은 늦게 와도 보이지 않는다', async () => {
    let open!: () => void
    cache.gate = new Promise<void>((resolve) => { open = resolve })
    const first = useStoryboardRealImages.getState().load('p1')
    cache.gate = null
    await useStoryboardRealImages.getState().load('p2')
    open()
    await first
    const state = useStoryboardRealImages.getState()
    expect(state.projectId).toBe('p2')
    expect(Object.keys(state.images)).toEqual(['z'])
  })

  // 왜(검토 b 낮음 7과 같은 규칙): 읽지 못한 것을 "실사 없음"으로 세면 넘기기 창이 샷 전부를 실사 없는 수로 보인다 — 못 읽었다고 표시해 아는 만큼만 보이게.
  it('shots 사물함을 읽지 못하면 실사 그림을 못 읽었다고 표시하고 던지지 않는다', async () => {
    cache.fail = true
    await expect(useStoryboardRealImages.getState().load('p1')).resolves.toBeUndefined()
    const state = useStoryboardRealImages.getState()
    expect(state.loaded).toBe(false)
    expect(state.failed).toBe(true)
  })
})
