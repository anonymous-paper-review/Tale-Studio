// Artist 그림은 러프 스토리보드가 만들어지는 동안 한 장씩, 없거나 끝나면 세 장까지 동시에 만든다 (2026-10-09 오너)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  countQueuedJobsByUser: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ countQueuedJobsByUser: mocks.countQueuedJobsByUser }))

import {
  ARTIST_SLOTS_IDLE,
  ARTIST_SLOTS_WHILE_ROUGH,
  artistGenerationLimit,
  fetchArtistGenerationLimit,
  runAdaptivePool,
} from '@/lib/artist/generation-slots'
import { GET } from '@/app/api/artist/generation-slots/route'

/** 손으로 끝내는 작업 — 지금 몇 장이 동시에 돌고 있는지 센다. */
function manualTasks(count: number) {
  const started: number[] = []
  const finishers: Array<() => void> = []
  let active = 0
  let maxActive = 0
  const tasks = Array.from({ length: count }, (_, i) => async () => {
    started.push(i)
    active++
    maxActive = Math.max(maxActive, active)
    await new Promise<void>((resolve) => {
      finishers[i] = () => {
        active--
        resolve()
      }
    })
  })
  return { tasks, started, finish: (i: number) => finishers[i](), active: () => active, maxActive: () => maxActive }
}

/** 다시 확인하는 대기를 손으로 넘긴다. */
function manualWait() {
  const pending: Array<() => void> = []
  return {
    wait: () => new Promise<void>((resolve) => pending.push(resolve)),
    tick: () => pending.splice(0).forEach((resolve) => resolve()),
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('Artist 동시 생성 장수', () => {
  it('러프 스토리보드가 만들어지는 중이면 Artist는 한 번에 1장만 만든다', () => {
    // 왜: 러프 스토리보드가 먼저다 — Artist 가 유저 상한과 fal 자리를 오래 잡으면 러프 첫 일괄 생성이 밀린다(2026-07-15).
    expect(ARTIST_SLOTS_WHILE_ROUGH).toBe(1)
    expect(artistGenerationLimit(1)).toBe(1)
    expect(artistGenerationLimit(4)).toBe(1)
  })

  it('러프 스토리보드가 없거나 끝났으면 Artist는 한 번에 3장까지 만든다', () => {
    // 왜: gpt-image-2 는 한 장 75~80초라 한 장씩이면 인물 11명 · 배경 7곳에 25분이 걸렸다(10/9 운영 재시험).
    expect(ARTIST_SLOTS_IDLE).toBe(3)
    expect(artistGenerationLimit(0)).toBe(3)
  })

  it('러프 스토리보드가 만들어지는 중인지 알 수 없으면 Artist는 1장씩 만든다', async () => {
    // 왜: 확인이 실패했을 때는 예전 규칙(러프 우선)이 안전하다.
    expect(artistGenerationLimit(null)).toBe(1)
    const failing = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(fetchArtistGenerationLimit(failing as unknown as typeof fetch)).resolves.toBe(1)
    const notOk = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }))
    await expect(fetchArtistGenerationLimit(notOk as unknown as typeof fetch)).resolves.toBe(1)
    const ok = vi.fn().mockResolvedValue(Response.json({ limit: 3, roughActive: 0 }))
    await expect(fetchArtistGenerationLimit(ok as unknown as typeof fetch)).resolves.toBe(3)
  })
})

describe('Artist 생성 자리 수를 알려주는 창구', () => {
  beforeEach(() => {
    mocks.getUser.mockReset().mockResolvedValue({ id: 'user-1' })
    mocks.countQueuedJobsByUser.mockReset()
  })

  it('러프 스토리보드는 그 유저의 모든 프로젝트를 보고 판단한다', async () => {
    // 왜: 유저당 그림 작업 상한(6)을 러프와 Artist 가 같이 쓴다 — 다른 프로젝트의 러프도 밀릴 수 있다.
    mocks.countQueuedJobsByUser.mockResolvedValueOnce(2).mockResolvedValueOnce(0)
    expect(await (await GET()).json()).toEqual({ limit: 1, roughActive: 2 })
    expect(await (await GET()).json()).toEqual({ limit: 3, roughActive: 0 })
    expect(mocks.countQueuedJobsByUser).toHaveBeenCalledWith('user-1', ['shot_rough_storyboard'])
  })

  it('러프 스토리보드 작업 수를 세지 못하면 1장씩 만들라고 알려준다', async () => {
    // 왜: DB 조회가 실패한 순간에 3장을 열어 주면 러프가 밀릴 수 있다.
    mocks.countQueuedJobsByUser.mockRejectedValueOnce(new Error('db down'))
    expect(await (await GET()).json()).toEqual({ limit: 1, roughActive: null })
  })

  it('로그인하지 않은 요청에는 자리 수를 알려주지 않는다', async () => {
    // 왜: 유저 단위 작업 수라 누구의 것인지 알아야 한다.
    mocks.getUser.mockResolvedValueOnce(null)
    expect((await GET()).status).toBe(401)
    expect(mocks.countQueuedJobsByUser).not.toHaveBeenCalled()
  })
})

describe('Artist 그림 보내기 순서', () => {
  it('Artist가 만드는 도중 러프 스토리보드가 끝나면 다음 그림부터 3장까지 늘린다', async () => {
    // 왜: 러프가 일찍 끝났는데 남은 Artist 그림이 계속 한 장씩 가면 화면을 오래 열어 둬야 한다.
    const t = manualTasks(5)
    const clock = manualWait()
    let limit = 1
    const done = runAdaptivePool(t.tasks, async () => limit, { wait: clock.wait })
    await flush()
    expect(t.started).toEqual([0])
    limit = 3
    clock.tick()
    await flush()
    expect(t.started).toEqual([0, 1, 2])
    expect(t.active()).toBe(3)
    t.finish(1)
    await flush()
    expect(t.started).toEqual([0, 1, 2, 3])
    ;[0, 2, 3].forEach(t.finish)
    await flush()
    t.finish(4)
    await done
    expect(t.maxActive()).toBe(3)
  })

  it('러프 스토리보드가 새로 시작되면 새로 보내는 그림은 1장씩으로 줄이고 이미 보낸 그림은 그대로 둔다', async () => {
    // 왜: 이미 보낸 그림을 취소하면 그 자리의 과금 · 대기가 헛된다. 새로 보낼 것만 러프에 양보한다.
    const t = manualTasks(5)
    const clock = manualWait()
    let limit = 3
    const done = runAdaptivePool(t.tasks, async () => limit, { wait: clock.wait })
    await flush()
    expect(t.started).toEqual([0, 1, 2])
    limit = 1
    t.finish(0)
    await flush()
    expect(t.started).toEqual([0, 1, 2])
    t.finish(1)
    await flush()
    expect(t.started).toEqual([0, 1, 2])
    t.finish(2)
    await flush()
    expect(t.started).toEqual([0, 1, 2, 3])
    t.finish(3)
    await flush()
    t.finish(4)
    await done
    expect(t.active()).toBe(0)
  })

  it('보낼 그림을 하나도 빠뜨리거나 두 번 보내지 않는다', async () => {
    // 정상 경로 고정 — 자리 수가 오르내려도 그림마다 정확히 한 번 보낸다.
    const runs = Array.from({ length: 7 }, () => 0)
    const limits = [1, 3, 2, 3, 1, 3, 3, 3, 3, 3]
    let call = 0
    await runAdaptivePool(
      runs.map((_, i) => async () => {
        runs[i]++
        await flush()
      }),
      async () => limits[Math.min(call++, limits.length - 1)],
      { wait: () => flush().then(() => undefined) },
    )
    expect(runs).toEqual([1, 1, 1, 1, 1, 1, 1])
  })

  it('Artist 화면의 자동 생성 · 빈 시트 다시 만들기 · 채팅 다시 만들기가 모두 같은 가변 규칙으로 보낸다', () => {
    // 왜: 세 경로가 같은 유저 상한을 쓴다 — 한 곳만 3장이면 러프 우선이 깨진다.
    const store = readFileSync('src/stores/artist-store.ts', 'utf8')
    expect(store.match(/runAdaptivePool\(/g)?.length).toBe(3)
    expect(store.match(/runAdaptivePool\([\s\S]*?,\s*fetchArtistGenerationLimit\s*,?\s*\)/g)?.length).toBe(3)
    expect(store).not.toMatch(/runPool\(/)
    expect(store).not.toContain('ARTIST_GENERATION_CONCURRENCY')
  })
})
