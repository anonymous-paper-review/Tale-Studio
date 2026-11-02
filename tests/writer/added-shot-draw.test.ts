// Storyboard 에서 샷을 더하면(보드 [+ 샷 추가] · 채팅) 그 샷 러프를 잠금 없이 바로 그리고, 자리 한도 · 실패 · 다른 프로젝트 · 보드 떠나기 규칙을 지키는지 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scene, Shot } from '@/types'

const db = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  insertGate: null as null | Promise<{ error: { message: string } | null }>,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      insert: async (values: Record<string, unknown>) => {
        db.inserts.push({ table, values })
        return db.insertGate ? await db.insertGate : { error: null }
      },
      update: () => {
        const query = { eq: () => query, then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve) }
        return query
      },
    }),
  }),
}))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined), loadShotsResult: vi.fn() }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

import {
  addedDrawJob,
  addedDrawJobs,
  addedDrawOutcome,
  boardMissingRoughIds,
  createAddedShotDraws,
  type AddedDrawOutcome,
  type AddedShotEvent,
  type DrawAddedShot,
} from '@/lib/writer/added-shot-draws'
import { USER_LIMIT_RECHECK_MS, USER_LIMIT_WAIT_MAX_MS } from '@/lib/artist/draw-continue'
import { INITIAL_BOARD_LOCK, advanceBoardLock, storyboardBusyView, type BoardLockFacts } from '@/lib/writer/board-busy'
import { summarizeRoughProgress } from '@/lib/writer/rough-progress'
import { validateWriterUpdates } from '@/lib/writer-chat-updates'
import { onShotAdded, useWriterStore, type WriterChatUpdate } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'


/** 요청 하나를 손으로 풀 수 있게 — 앞 요청이 끝나기 전에 다음 요청이 나가는지 본다. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
const submitted = (): AddedDrawOutcome => ({ kind: 'submitted', done: new Promise(() => {}) })
const event = (projectId: string, shotId: string, saved: Promise<boolean> = Promise.resolve(true), origin: AddedShotEvent['origin'] = 'board'): AddedShotEvent => ({ projectId, shotId, origin, saved })
const tick = () => vi.advanceTimersByTimeAsync(1)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-02T10:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('샷을 더하면 바로 그리기', () => {
  // 왜: 2026-11-02 오너 결정 "더할 때마다 자동"(샷을 더하면 그 샷 러프를 바로 그려요). 저장이 끝나기 전에 보내면 서버가 아직 없는 샷이라 그리지 못한다.
  it('[+ 샷 추가]로 샷을 더하면 저장이 끝나자마자 그 샷 러프를 그린다', async () => {
    const draws = createAddedShotDraws()
    const draw = vi.fn<DrawAddedShot>(async () => submitted())
    draws.attach('p', draw)
    const saved = deferred<boolean>()
    draws.add(event('p', 'sh_01_03', saved.promise))
    expect(addedDrawJob(draws.view('p').get('sh_01_03'), 'ko')).toEqual({ status: 'generating' })
    await tick()
    expect(draw).not.toHaveBeenCalled()
    saved.resolve(true)
    await tick()
    expect(draw).toHaveBeenCalledWith('sh_01_03', { redraw: false })
    expect(draws.view('p').get('sh_01_03')?.phase).toBe('drawing')
  })

  // 왜: 저장에 실패하면 화면에서도 그 샷이 빠진다(되돌림) — 없는 샷을 그리려 돈을 쓰지 않는다.
  it('저장에 실패한 샷은 그리지 않고 내려놓는다', async () => {
    const draws = createAddedShotDraws()
    const draw = vi.fn<DrawAddedShot>(async () => submitted())
    draws.attach('p', draw)
    draws.add(event('p', 'sh_01_03', Promise.resolve(false)))
    await tick()
    expect(draw).not.toHaveBeenCalled()
    expect(draws.view('p').has('sh_01_03')).toBe(false)
  })

  // 왜: 리드 지시(빠르게 셋을 더하면 셋 다, 한도에 맞춰 차례로) — 한꺼번에 보내면 자리 검사가 엇갈려 한도를 넘길 수 있다(2026-09-11 감사). 그리기는 함께 돈다.
  it('샷 셋을 빠르게 더하면 셋 다 그린다 — 앞 요청이 접수된 뒤에 다음을 보낸다', async () => {
    const draws = createAddedShotDraws()
    const gates = [deferred<AddedDrawOutcome>(), deferred<AddedDrawOutcome>(), deferred<AddedDrawOutcome>()]
    const order: string[] = []
    draws.attach('p', async (shotId) => {
      order.push(shotId)
      return gates[order.length - 1].promise
    })
    for (const id of ['sh_01_03', 'sh_01_04', 'sh_02_02']) draws.add(event('p', id))
    await tick()
    expect(order).toEqual(['sh_01_03'])
    gates[0].resolve(submitted())
    await tick()
    expect(order).toEqual(['sh_01_03', 'sh_01_04'])
    gates[1].resolve(submitted())
    await tick()
    gates[2].resolve(submitted())
    await tick()
    expect(order).toEqual(['sh_01_03', 'sh_01_04', 'sh_02_02'])
    expect([...draws.view('p').values()].every((view) => view.phase === 'drawing')).toBe(true)
  })

  // 왜: 같은 샷을 두 번 그리면 돈이 두 번 든다 — 같은 알림이 두 번 와도, 그리는 중에 다시 와도, 다 그린 뒤 작업 목록이 바뀌어도 다시 보내지 않는다.
  it('같은 샷은 두 번 그리지 않는다', async () => {
    const draws = createAddedShotDraws()
    const finished = deferred<void>()
    const draw = vi.fn<DrawAddedShot>(async () => ({ kind: 'submitted', done: finished.promise }))
    draws.attach('p', draw)
    draws.add(event('p', 'sh_01_03'))
    draws.add(event('p', 'sh_01_03'))
    await tick()
    draws.add(event('p', 'sh_01_03'))
    finished.resolve()
    await tick()
    draws.jobsChanged('p', ['job-1'])
    draws.jobsChanged('p', [])
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS * 3)
    expect(draw).toHaveBeenCalledTimes(1)
    expect(draws.view('p').get('sh_01_03')?.phase).toBe('done')
  })

  // 왜: 시리즈 화들은 샷 번호가 같다(sh_01_03) — 다른 프로젝트 보드로 옮긴 뒤 앞 프로젝트에서 더한 샷을 새 보드의 그리기로 그리면 엉뚱한 화에 그림이 생긴다.
  it('다른 프로젝트의 샷은 그리지 않는다', async () => {
    const draws = createAddedShotDraws()
    const drawA = vi.fn<DrawAddedShot>(async () => submitted())
    const drawB = vi.fn<DrawAddedShot>(async () => submitted())
    draws.add(event('project-b', 'sh_09_01'))
    const leaveA = draws.attach('project-a', drawA)
    draws.add(event('project-b', 'sh_09_02'))
    const saved = deferred<boolean>()
    draws.add(event('project-a', 'sh_01_03', saved.promise))
    leaveA()
    draws.attach('project-b', drawB)
    saved.resolve(true)
    await tick()
    expect(drawA).not.toHaveBeenCalled()
    expect(drawB).not.toHaveBeenCalled()
    expect(draws.view('project-b').size).toBe(0)
  })

  // 왜: 리드 지시(그리는 중에 보드를 떠나면 다른 곳에서 그리기를 시작하지 않는다) — 같은 프로젝트 보드로 돌아오면 남은 샷을 이어 그린다(혼자 정한 것).
  it('보드를 떠나면 아직 보내지 않은 더한 샷을 보내지 않고, 같은 프로젝트 보드로 돌아오면 이어 그린다', async () => {
    const draws = createAddedShotDraws()
    const first = deferred<AddedDrawOutcome>()
    const draw = vi.fn<DrawAddedShot>(async (shotId) => (shotId === 'sh_01_03' ? first.promise : submitted()))
    const leave = draws.attach('p', draw)
    draws.add(event('p', 'sh_01_03'))
    draws.add(event('p', 'sh_01_04'))
    await tick()
    leave()
    first.resolve(submitted())
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS)
    expect(draw.mock.calls.map(([id]) => id)).toEqual(['sh_01_03'])
    const drawAgain = vi.fn<DrawAddedShot>(async () => submitted())
    draws.attach('p', drawAgain)
    await tick()
    expect(drawAgain.mock.calls.map(([id]) => id)).toEqual(['sh_01_04'])
  })

  // 왜: 2026-09-11 오너 (가) "내 한도에 막힌 건 내 것이 끝나면 이어 간다" — 이 프로젝트의 그림이 하나 끝나면 자리가 났을 수 있어 바로 다시 본다.
  it('내 동시 생성 자리가 차 있으면 카드에 기다림을 보이고 자리가 나면 그린다', async () => {
    const draws = createAddedShotDraws()
    const outcomes: AddedDrawOutcome[] = [{ kind: 'user_limit' }, submitted()]
    const draw = vi.fn<DrawAddedShot>(async () => outcomes.shift()!)
    draws.attach('p', draw)
    draws.jobsChanged('p', ['job-1', 'job-2'])
    draws.add(event('p', 'sh_01_03'))
    await tick()
    expect(addedDrawJob(draws.view('p').get('sh_01_03'), 'ko')).toEqual({ status: 'waiting' })
    draws.jobsChanged('p', ['job-2'])
    await tick()
    expect(draw).toHaveBeenCalledTimes(2)
    expect(draw.mock.calls[1]).toEqual(['sh_01_03', { redraw: false }])
    expect(draws.view('p').get('sh_01_03')?.phase).toBe('drawing')
  })

  // 왜: 내 자리를 다른 프로젝트 그림이 잡고 있으면 이 보드는 끝나는 것을 못 본다 — Artist 이어 그리기처럼 1분마다 다시 본다.
  it('내 한도를 기다리는 동안 1분마다 다시 본다', async () => {
    const draws = createAddedShotDraws()
    const draw = vi.fn<DrawAddedShot>(async () => ({ kind: 'user_limit' }))
    draws.attach('p', draw)
    draws.add(event('p', 'sh_01_03'))
    await tick()
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS)
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS)
    expect(draw.mock.calls.map(([id]) => id)).toEqual(['sh_01_03', 'sh_01_03', 'sh_01_03'])
  })

  // 왜: 2026-11-02 리뷰 R5 — 기다리던 샷 둘 중 하나가 접수되면 남은 샷이 "보낼 차례"라는 까닭으로 기다림이 풀려, 그 사이 더한 샷이
  //   자리가 없는데 곧바로 나갔고(예전엔 한도 안내도 다시 떴다) 30분 셈도 끊겼다. 남은 샷이 있는 동안은 기다림을 이어 간다.
  it('내 한도를 기다리던 샷이 여럿이면 하나가 접수돼도 남은 샷은 기다림을 이어 가, 그 사이 더한 샷도 함께 기다린다', async () => {
    const draws = createAddedShotDraws()
    const hang = deferred<AddedDrawOutcome>()
    let open = false
    const draw = vi.fn<DrawAddedShot>(async (shotId) => {
      if (!open) return { kind: 'user_limit' }
      return shotId === 'sh_01_03' ? submitted() : hang.promise
    })
    draws.attach('p', draw)
    draws.add(event('p', 'sh_01_03'))
    draws.add(event('p', 'sh_01_04'))
    await tick()
    expect(draws.view('p').get('sh_01_04')?.phase).toBe('waiting')
    open = true
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS)
    expect(draws.view('p').get('sh_01_03')?.phase).toBe('drawing')
    expect(draws.view('p').get('sh_01_04')?.phase).toBe('requesting')
    draws.add(event('p', 'sh_01_05'))
    await tick()
    expect(draws.view('p').get('sh_01_05')?.phase).toBe('waiting')
  })

  // 왜: 2026-11-02 리뷰 R6 — 기다림 중에 더한 샷은 "기다림"으로 들어가는데, 앞 요청이 실패 · 건너뜀으로 끝나면 다시 볼 시계가 없어
  //   그 샷이 영영 기다렸다(30분 멈춤에도 닿지 않았다). 기다리는 샷이 남아 있으면 언제나 1분 뒤 다시 본다.
  it('기다림 중에 더한 샷은 앞 요청이 실패로 끝나도 1분 뒤 다시 보고, 30분이 지나도 자리가 없으면 멈춘다', async () => {
    const draws = createAddedShotDraws()
    const hang = deferred<AddedDrawOutcome>()
    let firstSeen = false
    const draw = vi.fn<DrawAddedShot>(async (shotId) => {
      if (shotId === 'sh_01_03') {
        if (!firstSeen) { firstSeen = true; return { kind: 'user_limit' } }
        return hang.promise
      }
      return { kind: 'user_limit' }
    })
    draws.attach('p', draw)
    draws.add(event('p', 'sh_01_03'))
    await tick()
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS)
    expect(draws.view('p').get('sh_01_03')?.phase).toBe('requesting')
    draws.add(event('p', 'sh_01_04'))
    await tick()
    expect(draws.view('p').get('sh_01_04')?.phase).toBe('waiting')
    hang.resolve({ kind: 'failed', reason: '러프 스토리보드 생성 요청 실패' })
    await tick()
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS)
    expect(draw.mock.calls.some(([id]) => id === 'sh_01_04')).toBe(true)
    for (let waited = 0; waited <= USER_LIMIT_WAIT_MAX_MS; waited += USER_LIMIT_RECHECK_MS) await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS)
    expect(draws.view('p').get('sh_01_04')).toMatchObject({ phase: 'stopped', noSlot: true })
  })

  // 왜: 끝없이 두드리지 않는다 — 처음 막힌 뒤 30분이 지나도 자리가 없으면 멈추고, 카드의 [다시 시도]로 사람이 다시 시작한다(Artist 와 같은 30분).
  it('내 한도에 막혀 30분을 기다려도 자리가 나지 않으면 멈추고 카드에 까닭과 [다시 시도]를 둔다', async () => {
    const draws = createAddedShotDraws()
    const draw = vi.fn<DrawAddedShot>(async () => ({ kind: 'user_limit' }))
    draws.attach('p', draw)
    draws.add(event('p', 'sh_01_03'))
    await tick()
    for (let waited = 0; waited <= USER_LIMIT_WAIT_MAX_MS; waited += USER_LIMIT_RECHECK_MS) await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS)
    expect(addedDrawJob(draws.view('p').get('sh_01_03'), 'ko')).toEqual({ status: 'failed', error: '30분 동안 자리가 나지 않아 러프를 그리지 못했어요.' })
    const calls = draw.mock.calls.length
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS * 5)
    expect(draw.mock.calls.length).toBe(calls)
  })

  // 왜: 2026-09-11 오너 결정 — 모두의 자리가 찼거나 검사가 멈춘 거절은 기다려도 내 것이 끝나서 풀리지 않는다. 멈추고 까닭을 보인다.
  it('모두의 자리가 찼거나 검사가 멈춰 거절되면 멈추고 까닭을 보인다 — 기다리던 다른 더한 샷도 같이 멈춘다', async () => {
    expect(addedDrawOutcome({ submitted: 0, done: Promise.resolve(), refusal: 'global' }, 'sh_01_03', '', 'ko'))
      .toEqual({ kind: 'stop_all', reason: '지금 생성 자리가 모두 사용 중이에요. 잠시 뒤에 다시 시도해 주세요.' })
    expect(addedDrawOutcome({ submitted: 0, done: Promise.resolve(), refusal: 'moderation' }, 'sh_01_03', '', 'ko').kind).toBe('stop_all')
    const draws = createAddedShotDraws()
    const draw = vi.fn<DrawAddedShot>(async () => ({ kind: 'stop_all', reason: '지금 생성 자리가 모두 사용 중이에요. 잠시 뒤에 다시 시도해 주세요.' }))
    draws.attach('p', draw)
    draws.add(event('p', 'sh_01_03'))
    draws.add(event('p', 'sh_01_04'))
    await tick()
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS * 3)
    expect(draw).toHaveBeenCalledTimes(1)
    for (const id of ['sh_01_03', 'sh_01_04']) {
      expect(addedDrawJob(draws.view('p').get(id), 'ko')).toEqual({ status: 'failed', error: '지금 생성 자리가 모두 사용 중이에요. 잠시 뒤에 다시 시도해 주세요.' })
    }
  })

  // 왜: 2026-09-11 오너 결정 — 실패한 그림은 저절로 다시 그리지 않는다. 카드에 실패와 [다시 시도]가 남고, 사람이 고른다.
  it('더한 샷 그리기가 실패하면 저절로 다시 그리지 않고 카드에 실패를 남긴다', async () => {
    expect(addedDrawOutcome(null, 'sh_01_03', '', 'ko')).toEqual({ kind: 'failed', reason: '러프 스토리보드 생성 요청 실패' })
    const draws = createAddedShotDraws()
    const draw = vi.fn<DrawAddedShot>(async () => ({ kind: 'failed', reason: '러프 스토리보드 생성 요청 실패' }))
    draws.attach('p', draw)
    draws.add(event('p', 'sh_01_03'))
    await tick()
    draws.jobsChanged('p', ['job-1'])
    draws.jobsChanged('p', [])
    await vi.advanceTimersByTimeAsync(USER_LIMIT_WAIT_MAX_MS)
    expect(draw).toHaveBeenCalledTimes(1)
    expect(addedDrawJob(draws.view('p').get('sh_01_03'), 'ko')).toEqual({ status: 'failed', error: '러프 스토리보드 생성 요청 실패' })
  })

  // 왜(혼자 정한 것): 내용 규칙은 그 샷의 글 때문이다 — 다른 더한 샷까지 멈출 까닭이 없다.
  it('내용 규칙에 걸린 샷만 멈추고 나머지 더한 샷은 이어 그린다', async () => {
    const content = addedDrawOutcome({ submitted: 0, done: Promise.resolve(), refusal: 'content' }, 'sh_01_03', '', 'ko')
    expect(content.kind).toBe('failed')
    const draws = createAddedShotDraws()
    const draw = vi.fn<DrawAddedShot>(async (shotId) => (shotId === 'sh_01_03' ? content : submitted()))
    draws.attach('p', draw)
    draws.add(event('p', 'sh_01_03'))
    draws.add(event('p', 'sh_01_04'))
    await tick()
    await tick()
    expect(draws.view('p').get('sh_01_03')?.phase).toBe('stopped')
    expect(draws.view('p').get('sh_01_04')?.phase).toBe('drawing')
  })

  // 왜(혼자 정한 것): 스토리가 비면 그릴 것이 없다. 나중에 샷 고치기 창에서 스토리를 쓰면 그 창의 안내("고친 내용으로 그려요")대로 그때 그린다.
  it('스토리 없이 더한 샷은 그리지 않고 스토리가 생기면 그때 그린다', async () => {
    expect(addedDrawOutcome({ submitted: 0, done: Promise.resolve(), skipped: [{ shotId: 'sh_01_03', reason: 'no_info' }] }, 'sh_01_03', '', 'ko'))
      .toEqual({ kind: 'no_story', story: '' })
    const draws = createAddedShotDraws()
    const outcomes: AddedDrawOutcome[] = [{ kind: 'no_story', story: '' }, submitted()]
    const draw = vi.fn<DrawAddedShot>(async () => outcomes.shift()!)
    draws.attach('p', draw)
    draws.add(event('p', 'sh_01_03'))
    await tick()
    expect(addedDrawJob(draws.view('p').get('sh_01_03'), 'ko')).toBeUndefined()
    draws.storyChanged('p', 'sh_01_03', '')
    await tick()
    expect(draw).toHaveBeenCalledTimes(1)
    draws.storyChanged('p', 'sh_01_03', '민호가 돌아선다.')
    await tick()
    draws.storyChanged('p', 'sh_01_03', '민호가 돌아선다.')
    await tick()
    expect(draw).toHaveBeenCalledTimes(2)
  })

  // 왜: 서버가 건너뛴 샷(이미 그림 있음 · 다른 곳에서 그리는 중)은 할 일이 끝났다 — 다시 보내지 않는다.
  it('이미 그림이 있거나 다른 곳에서 그리는 중인 더한 샷은 다시 보내지 않는다', () => {
    const round = { submitted: 0, done: Promise.resolve(), skipped: [{ shotId: 'sh_01_03', reason: 'in_flight' }, { shotId: 'sh_01_04', reason: 'exists' }] }
    expect(addedDrawOutcome(round, 'sh_01_03', '', 'ko')).toEqual({ kind: 'skipped' })
    expect(addedDrawOutcome(round, 'sh_01_04', '', 'ko')).toEqual({ kind: 'skipped' })
    expect(addedDrawOutcome({ submitted: 1, done: Promise.resolve(), submittedShotIds: ['sh_01_05'] }, 'sh_01_05', '', 'ko').kind).toBe('submitted')
  })
})

describe('더한 샷 그리기와 보드 · 채팅 잠금', () => {
  const facts = (patch: Partial<BoardLockFacts>): BoardLockFacts => ({ runActive: false, reloading: false, hasShots: true, generating: 0, failed: 0, pumpActive: false, autoDrawPending: false, ...patch })
  const shots = [
    { shotId: 'sh_01_01', roughStoryboard: { status: 'completed', url: 'a.png' } },
    { shotId: 'sh_01_02', roughStoryboard: null },
  ] as unknown as Shot[]

  // 왜: 다른 길(보드의 남은 컷 그리기 등)로 이미 그림이 생긴 더한 샷에 옛 기다림 · 실패 표시를 얹으면 다 그린 샷이 실패로 세어진다.
  it('그림이 이미 있는 더한 샷에는 기다림 · 실패 표시를 얹지 않는다', () => {
    const views = new Map([['sh_01_01', { phase: 'stopped' as const, reason: '실패' }], ['sh_01_02', { phase: 'waiting' as const }]])
    expect(addedDrawJobs(shots, views, (shot) => shot.roughStoryboard?.status === 'completed', 'ko')).toEqual({ sh_01_02: { status: 'waiting' } })
  })

  // 왜: 2026-11-02 리뷰 R2 — 스토리 없이 더한 샷에 스토리를 쓰면 그 샷이 "빠진 러프"로 세어져 진입 자동 그리기가 깨고, 보드 · 채팅이
  //   그리기 내내 잠겼다. 더한 샷 그리기가 맡고 있는 동안(멈춤 · 끝남 전)은 빠진 러프가 아니다 — 더한 샷 그리기가 잠금 없이 그린다.
  it('스토리 없이 더한 샷에 스토리가 생겨도 진입 자동 그리기(보드 · 채팅 잠금)로 그리지 않는다', () => {
    const shots2 = [
      { shotId: 'story-later', actionDescription: '민호가 돌아선다.' },
      { shotId: 'waiting', actionDescription: '캔이 떨어진다.' },
      { shotId: 'gave-up', actionDescription: '수진이 웃는다.' },
      { shotId: 'stopped', actionDescription: '불이 꺼진다.' },
    ]
    const views = new Map([
      ['story-later', { phase: 'no_story' as const }],
      ['waiting', { phase: 'waiting' as const }],
      ['gave-up', { phase: 'done' as const }],
      ['stopped', { phase: 'stopped' as const }],
    ])
    const missing = boardMissingRoughIds(shots2, { hasPanel: () => false, hasJob: () => false }, views)
    expect(missing).toEqual(['gave-up', 'stopped'])
    const facts2 = facts({ autoDrawPending: missing.includes('story-later') })
    expect(storyboardBusyView({ status: null, facts: facts2, lock: advanceBoardLock(INITIAL_BOARD_LOCK, facts2), rough: summarizeRoughProgress([], {}, {}, new Set()), sceneCount: 1 }, 'ko').open).toBe(false)
  })
})

describe('샷을 더한 순간의 알림 (writer-store)', () => {
  const scene = (sceneId: string): Scene => ({
    sceneId, sortOrder: 0, location: 'room', timeOfDay: 'day', mood: 'calm', narrativeSummary: sceneId,
    originalTextQuote: '', charactersPresent: ['min_ho'], estimatedDurationSeconds: 5,
  })
  beforeEach(() => {
    db.inserts.length = 0
    db.insertGate = null
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ started: true, pipeline_completed: true }) }))
    useProjectStore.setState({ projectId: 'project-add', currentStage: 'writer' })
    useWriterStore.setState({ sceneManifest: { scenes: [scene('sc_01')], characters: [], locations: [] }, shots: [], error: null })
  })
  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync()
    useWriterStore.getState().reset()
    vi.unstubAllGlobals()
  })

  // 왜: 화면에 넣는 그 순간 보드가 맡아야 카드가 처음부터 "그리는 중"이고, 진입 자동 그리기(잠금)가 그 샷을 빠진 러프로 보지 않는다.
  it('샷을 더하면 화면에 넣는 그 순간 알리고 저장이 끝나면 성공 여부를 알린다', async () => {
    const heard: AddedShotEvent[] = []
    const stop = onShotAdded((added) => heard.push(added))
    const gate = deferred<{ error: { message: string } | null }>()
    db.insertGate = gate.promise
    try {
      const pending = useWriterStore.getState().addShot('sc_01', { fields: { actionDescription: '민호가 돌아선다.' } })
      await Promise.resolve()
      expect(heard).toHaveLength(1)
      expect(heard[0]).toMatchObject({ projectId: 'project-add', shotId: 'sh_01_01', origin: 'board' })
      expect(useWriterStore.getState().shots.map((s) => s.shotId)).toEqual(['sh_01_01'])
      gate.resolve({ error: null })
      await expect(heard[0].saved).resolves.toBe(true)
      await pending
      db.insertGate = Promise.resolve({ error: { message: 'insert failed' } })
      await useWriterStore.getState().addShot('sc_01', { fields: { actionDescription: '다시.' } })
      expect(heard).toHaveLength(2)
      await expect(heard[1].saved).resolves.toBe(false)
    } finally {
      stop()
    }
  })

  // 왜(혼자 정한 것): 채팅으로 더한 샷도 같은 "샷을 더했다"이고 지킬 그림이 없다 — 보드 [+ 샷 추가]와 똑같이 바로 그린다.
  it('채팅으로 더한 샷도 바로 그린다', async () => {
    const draws = createAddedShotDraws()
    const draw = vi.fn<DrawAddedShot>(async () => submitted())
    draws.attach('project-add', draw)
    const stop = onShotAdded((added) => draws.add(added))
    try {
      const updates = validateWriterUpdates([{ type: 'addShot', sceneId: 'sc_01', actionDescription: '수진이 문을 연다.' }]) as WriterChatUpdate[]
      const result = await useWriterStore.getState().applyChatUpdates(updates)
      expect(result.applied).toBe(1)
      await tick()
      expect(draw).toHaveBeenCalledWith('sh_01_01', { redraw: false })
      expect(draws.view('project-add').get('sh_01_01')?.phase).toBe('drawing')
    } finally {
      stop()
    }
  })
})
