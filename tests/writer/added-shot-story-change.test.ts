// 더한 샷을 그리는 동안 스토리 · 샷 타입 · 등장인물을 고치면 지금 그리기가 끝난 뒤 그 샷을 한 번 더 그리는지(실패면 저절로 다시 그리지 않는지) 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scene, Shot } from '@/types'

const hooks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)> }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect) },
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

import {
  addedDrawJobs,
  addedDrawOutcome,
  createAddedShotDraws,
  roughContentSignature,
  type AddedDrawOutcome,
  type DrawAddedShot,
} from '@/lib/writer/added-shot-draws'
import { USER_LIMIT_RECHECK_MS, USER_LIMIT_WAIT_MAX_MS } from '@/lib/artist/draw-continue'
import { useAddedShotDraws } from '@/features/writer/use-added-shot-draws'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
const tick = () => vi.advanceTimersByTimeAsync(1)
const add = (draws: ReturnType<typeof createAddedShotDraws>, shotId: string) =>
  draws.add({ projectId: 'p', shotId, origin: 'board', saved: Promise.resolve(true) })

beforeEach(() => {
  vi.useFakeTimers()
  hooks.effects = []
})
afterEach(() => {
  vi.useRealTimers()
})

describe('그리는 동안 고친 더한 샷', () => {
  // 왜: 2026-11-02 리드 결정(리뷰 R3) — 그리는 중인 더한 샷의 스토리를 팝업에서 고치면 팝업은 "고친 내용으로 그려요"라고 하지만
  //   그리던 그림은 옛 스토리로 앉았다. 지금 그리기가 끝나면 그 샷을 한 번 더(덮어) 그린다.
  it('더한 샷을 그리는 동안 스토리 · 샷 타입 · 등장인물을 고치면 지금 그리기가 끝난 뒤 그 샷을 한 번 더 그린다', async () => {
    const draws = createAddedShotDraws()
    const first = deferred<unknown>()
    const outcomes: AddedDrawOutcome[] = [
      { kind: 'submitted', signature: 'v1', done: first.promise },
      { kind: 'submitted', signature: 'v2', done: new Promise(() => {}) },
    ]
    const draw = vi.fn<DrawAddedShot>(async () => outcomes.shift()!)
    draws.attach('p', draw)
    add(draws, 'sh_01_04')
    await tick()
    draws.contentChanged('p', 'sh_01_04', 'v2')
    await tick()
    expect(draw).toHaveBeenCalledTimes(1)
    first.resolve('drawn')
    await tick()
    expect(draw.mock.calls).toEqual([['sh_01_04', { redraw: false }], ['sh_01_04', { redraw: true }]])
    expect(draws.view('p').get('sh_01_04')?.phase).toBe('drawing')
  })

  // 왜: 2026-09-11 규칙 — 실패는 저절로 다시 그리지 않는다. 카드에 실패와 [다시 시도]가 남고, 그 다시 시도가 고친 스토리를 읽는다.
  it('그리던 그리기가 실패하면 고친 스토리로 저절로 다시 그리지 않는다', async () => {
    const draws = createAddedShotDraws()
    const first = deferred<unknown>()
    const draw = vi.fn<DrawAddedShot>(async () => ({ kind: 'submitted', signature: 'v1', done: first.promise }))
    draws.attach('p', draw)
    add(draws, 'sh_01_04')
    await tick()
    draws.contentChanged('p', 'sh_01_04', 'v2')
    first.resolve('failed')
    await tick()
    expect(draw).toHaveBeenCalledTimes(1)
    expect(draws.view('p').get('sh_01_04')?.phase).toBe('done')
  })

  // 왜: 리드 결정 — 아직 보내지 않은(차례를 기다리는) 샷은 보낼 때 고친 스토리를 읽으므로 한 번만 그린다.
  it('보내기 전(차례를 기다리는 중)에 고치면 그 샷은 한 번만 그린다', async () => {
    const draws = createAddedShotDraws()
    const gate = deferred<AddedDrawOutcome>()
    const finished = deferred<unknown>()
    const draw = vi.fn<DrawAddedShot>(async (shotId) => (shotId === 'sh_01_04' ? gate.promise : { kind: 'submitted', signature: 'v2', done: finished.promise }))
    draws.attach('p', draw)
    add(draws, 'sh_01_04')
    add(draws, 'sh_01_05')
    await tick()
    expect(draws.view('p').get('sh_01_05')?.phase).toBe('pending')
    draws.contentChanged('p', 'sh_01_05', 'v2')
    gate.resolve({ kind: 'submitted', signature: 'a', done: new Promise(() => {}) })
    await tick()
    finished.resolve('drawn')
    await tick()
    expect(draw.mock.calls.filter(([id]) => id === 'sh_01_05')).toEqual([['sh_01_05', { redraw: false }]])
  })

  // 왜: 고쳤다가 처음 보낸 내용으로 되돌렸으면 다시 그릴 까닭이 없다 — 그림 한 장 값만 든다.
  it('그리는 동안 고친 것이 처음 보낸 내용으로 되돌아오면 다시 그리지 않는다', async () => {
    const draws = createAddedShotDraws()
    const first = deferred<unknown>()
    const draw = vi.fn<DrawAddedShot>(async () => ({ kind: 'submitted', signature: 'v1', done: first.promise }))
    draws.attach('p', draw)
    add(draws, 'sh_01_04')
    await tick()
    draws.contentChanged('p', 'sh_01_04', 'v2')
    draws.contentChanged('p', 'sh_01_04', 'v1')
    first.resolve('drawn')
    await tick()
    expect(draw).toHaveBeenCalledTimes(1)
  })

  // 왜: 대사 · 길이는 러프에 그려지지 않는다(러프 요청이 읽지 않는다) — 대사만 고쳐서는 다시 그리지 않는다.
  it('대사 · 길이만 고치면 다시 그릴 내용이 바뀌지 않은 것으로 본다', () => {
    const base = { actionDescription: '민호가 돌아선다.', shotType: 'MS', characters: ['min_ho'], dialogueLines: [], durationSeconds: 5 }
    expect(roughContentSignature({ ...base, dialogueLines: [{ characterId: 'min_ho', text: '어?', emotion: '', delivery: '', durationHint: 1 }], durationSeconds: 3 }))
      .toBe(roughContentSignature(base))
    expect(roughContentSignature({ ...base, actionDescription: '민호가 웃는다.' })).not.toBe(roughContentSignature(base))
    expect(roughContentSignature({ ...base, shotType: 'CU' })).not.toBe(roughContentSignature(base))
    expect(roughContentSignature({ ...base, characters: ['min_ho', 'su_jin'] })).not.toBe(roughContentSignature(base))
  })

  // 왜: 다시 그릴지는 처음 그리기가 정말 그려졌는지에 달렸다 — 보드 요청의 끝(작업마다 그림 · 실패)을 하나로 읽는다.
  it('보드 요청이 모두 그려지면 그려짐, 하나라도 실패하거나 끝을 모르면 실패로 읽는다', async () => {
    const outcome = (results: unknown) => addedDrawOutcome({ submitted: 1, submittedShotIds: ['sh_01_04'], done: Promise.resolve(results) }, 'sh_01_04', '', 'ko')
    const doneOf = async (results: unknown) => { const o = outcome(results); return o.kind === 'submitted' ? o.done : null }
    expect(await doneOf([{ status: 'fulfilled', value: 'drawn' }])).toBe('drawn')
    expect(await doneOf([{ status: 'fulfilled', value: 'drawn' }, { status: 'fulfilled', value: 'failed' }])).toBe('failed')
    expect(await doneOf([{ status: 'fulfilled', value: 'unknown' }])).toBe('failed')
    expect(await doneOf([{ status: 'rejected', reason: new Error('x') }])).toBe('failed')
  })
})

describe('그려 둔 더한 샷의 다시 그리기가 막히거나 실패할 때', () => {
  const drawn = [{ shotId: 'sh_01_04' }]
  /** 첫 그리기가 그려진 뒤(그리는 동안 v2 로 고침) 다시 그리기를 보내게 한다 — 그 뒤의 요청 결과는 next 가 정한다. */
  async function redrawAfterEdit(next: () => AddedDrawOutcome) {
    const draws = createAddedShotDraws()
    const first = deferred<unknown>()
    let sent = 0
    const draw = vi.fn<DrawAddedShot>(async () => (sent++ === 0 ? { kind: 'submitted', signature: 'v1', done: first.promise } : next()))
    draws.attach('p', draw)
    add(draws, 'sh_01_04')
    await tick()
    draws.contentChanged('p', 'sh_01_04', 'v2')
    first.resolve('drawn')
    await tick()
    return { draws, draw }
  }

  // 왜: 2026-11-02 최종 리뷰 L2 — 다시 그리기가 내 한도에 막히면 카드는 고치기 전 그림만 보여 줘 기다리는 줄 몰랐고(공용 안내도 끈다),
  //   30분 뒤 멈추면 아무 표시 없이 영영 다시 그리지 않았다. 그림이 있어도 기다림 · 멈춤을 카드에 남긴다.
  it('그려 둔 더한 샷의 다시 그리기가 내 한도에 막히거나 30분 뒤 멈추면, 그림이 있어도 카드에 기다림 · 멈춤을 보인다', async () => {
    const { draws } = await redrawAfterEdit(() => ({ kind: 'user_limit' }))
    expect(draws.view('p').get('sh_01_04')).toMatchObject({ phase: 'waiting', redraw: true })
    expect(addedDrawJobs(drawn, draws.view('p'), () => true, 'ko')).toEqual({ sh_01_04: { status: 'waiting' } })
    for (let waited = 0; waited <= USER_LIMIT_WAIT_MAX_MS; waited += USER_LIMIT_RECHECK_MS) await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS)
    expect(addedDrawJobs(drawn, draws.view('p'), () => true, 'ko')).toEqual({
      sh_01_04: { status: 'failed', error: '30분 동안 자리가 나지 않아 고친 내용으로 다시 그리지 못했어요.' },
    })
  })

  // 왜(혼자 정한 것): 최종 리뷰 L2 와 같은 자리 — 다시 그리기 작업이 실패해도 그림은 고치기 전 그대로라 아무 표시가 없었다.
  //   실패는 저절로 다시 그리지 않는다(9/11) — 그림 아래에 까닭과 [다시 시도]를 둔다.
  it('그려 둔 더한 샷의 다시 그리기 작업이 실패하면 저절로 다시 그리지 않고, 그림이 있어도 카드에 까닭과 [다시 시도]를 둔다', async () => {
    const second = deferred<unknown>()
    const { draws, draw } = await redrawAfterEdit(() => ({ kind: 'submitted', signature: 'v2', done: second.promise }))
    expect(draws.view('p').get('sh_01_04')?.phase).toBe('drawing')
    second.resolve('failed')
    await tick()
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS * 3)
    expect(draw).toHaveBeenCalledTimes(2)
    expect(addedDrawJobs(drawn, draws.view('p'), () => true, 'ko')).toEqual({ sh_01_04: { status: 'failed', error: '고친 내용으로 다시 그리지 못했어요.' } })
  })

  // 왜(혼자 정한 것): 기다리거나 멈춘 동안 사람이 샷 고치기 창 · 채팅으로 그 샷을 새로 그렸으면 장부의 다시 그리기는 할 일이 없다 —
  //   남겨 두면 다 그린 그림 아래에 "멈췄어요"가 남고, 기다리던 다시 그리기는 자리가 나면 같은 그림을 한 장 더 그린다.
  it('다시 그리기를 기다리거나 멈춘 동안 다른 길(샷 고치기 창 · 채팅)이 그 샷을 새로 그리면 장부는 그 다시 그리기를 내려놓는다', async () => {
    const { draws, draw } = await redrawAfterEdit(() => ({ kind: 'user_limit' }))
    draws.pictureSeen('p', 'sh_01_04', 'start.png?v=1')
    draws.pictureSeen('p', 'sh_01_04', 'start.png?v=1')
    expect(draws.view('p').get('sh_01_04')?.phase).toBe('waiting')
    draws.pictureSeen('p', 'sh_01_04', 'start.png?v=2')
    expect(draws.view('p').get('sh_01_04')?.phase).toBe('done')
    expect(addedDrawJobs(drawn, draws.view('p'), () => true, 'ko')).toEqual({})
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS * 3)
    expect(draw).toHaveBeenCalledTimes(2)
  })
})

describe('보드 훅이 고친 내용을 장부에 알린다', () => {
  const scene: Scene = { sceneId: 'sc_01', sortOrder: 0, location: 'hall', timeOfDay: 'night', mood: '', narrativeSummary: '', originalTextQuote: '', charactersPresent: ['su_jin'], estimatedDurationSeconds: 5 }
  const run = () => { for (const effect of hooks.effects.splice(0)) effect() }

  // 왜: 장부의 다시 그리기는 화면의 샷 내용이 바뀐 것을 알아야 한다 — 보드 훅이 그리는 중인 더한 샷의 내용을 장부에 넘긴다(배선 고정).
  it('그리는 중인 더한 샷의 스토리를 고치면 보드 훅이 그 변화를 넘겨, 지금 그리기 뒤에 한 번 더 그린다', async () => {
    useProjectStore.setState({ projectId: 'hook-project', currentStage: 'writer' })
    useWriterStore.setState({ sceneManifest: { scenes: [scene], characters: [], locations: [] }, shots: [], error: null })
    const first = deferred<unknown>()
    const outcomes: AddedDrawOutcome[] = [
      { kind: 'submitted', signature: roughContentSignature({ actionDescription: '민호가 선다.', shotType: 'MS', characters: ['su_jin'] }), done: first.promise },
      { kind: 'submitted', done: new Promise(() => {}) },
    ]
    const draw = vi.fn<DrawAddedShot>(async () => outcomes.shift()!)
    const render = () => useAddedShotDraws({ projectId: 'hook-project', draw, activeJobsKey: '', shots: useWriterStore.getState().shots })
    render()
    run()
    await useWriterStore.getState().addShot('sc_01', { fields: { actionDescription: '민호가 선다.' } })
    await tick()
    expect(draw).toHaveBeenCalledTimes(1)
    render()
    run()
    useWriterStore.getState().updateShot('sh_01_01', { actionDescription: '민호가 돌아선다.' })
    render()
    run()
    first.resolve('drawn')
    await tick()
    expect(draw.mock.calls.map(([id, options]) => [id, options.redraw])).toEqual([['sh_01_01', false], ['sh_01_01', true]])
    await vi.runOnlyPendingTimersAsync()
    useWriterStore.getState().reset()
  })
})
