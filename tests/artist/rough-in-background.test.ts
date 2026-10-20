// Artist 에서 만드는 동안 씬 · 샷이 다 나뉘면 Storyboard 러프를 미리 그리고, Artist 머리에 Storyboard 준비 상태를 보인다 (2026-10-20 오너 "시간 절약")
import { describe, expect, it, vi } from 'vitest'
import { backgroundRoughReady, drawRoughsInBackground, storyboardPrepView } from '@/lib/artist/background-roughs'

const done = { started: true, pipeline_completed: true, current_status: 'completed', current_stage: 'persistShots' }
const splitting = { started: true, current_status: 'running', current_stage: 'decoupage' }

describe('러프를 미리 그리는 때', () => {
  it('씬 · 샷이 다 나뉘고 Artist 그림을 다 그렸으면 Artist 화면에서 러프를 미리 그린다', () => {
    // 왜: Artist 에서 카드를 보고 고치는 동안 Storyboard 를 미리 그려 두면, [완료하기] 뒤 기다리지 않는다.
    expect(backgroundRoughReady({ status: done, making: false, demo: false })).toBe(true)
  })

  it('Artist 그림을 그리는 중에는 러프를 시작하지 않는다', () => {
    // 왜: 러프가 돌면 Artist 그림은 한 장씩 그린다(10/9 규칙) — 지금 기다리는 Artist 그림이 느려지지 않게 그림이 끝난 뒤에 시작한다.
    expect(backgroundRoughReady({ status: done, making: true, demo: false })).toBe(false)
  })

  it('씬 · 샷을 아직 나누는 중이거나 멈췄으면 러프를 시작하지 않는다', () => {
    // 왜: 러프는 샷을 그린다 — 샷이 저장되기 전에는 그릴 것이 없다.
    expect(backgroundRoughReady({ status: splitting, making: false, demo: false })).toBe(false)
    expect(backgroundRoughReady({ status: { ...splitting, current_status: 'failed', pipeline_failed: true }, making: false, demo: false })).toBe(false)
  })

  it('공유로 보는 화면에서는 그리지 않는다', () => {
    // 왜: 공유 보기는 읽기 전용이다.
    expect(backgroundRoughReady({ status: done, making: false, demo: true })).toBe(false)
  })
})

describe('러프 미리 그리기', () => {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

  it('빠진 컷을 묶음으로 차례로 맡기고, 남은 컷이 없으면 멈춘다', async () => {
    // 왜: 서버가 한 번에 받는 묶음에 한도가 있어 남은 컷이 없을 때까지 이어 보낸다.
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply(200, { ok: true, data: { submitted: [{ shotId: 's1', jobId: 'j1' }, { shotId: 's2', jobId: 'j1' }], remaining: 3 } }))
      .mockResolvedValueOnce(reply(200, { ok: true, data: { submitted: [{ shotId: 's3', jobId: 'j2' }], remaining: 0 } }))
      .mockResolvedValueOnce(reply(200, { ok: true, data: { submitted: [], remaining: 0 } }))
    const poll = vi.fn(async (_jobId: string) => undefined)

    const outcome = await drawRoughsInBackground('p1', { fetchImpl, poll, isAborted: () => false })

    expect(outcome).toBe('done')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(poll.mock.calls.map((call) => call[0])).toEqual(['j1', 'j2'])
  })

  it('컷을 고르지 않고 빠진 컷 전부를 맡긴다', async () => {
    // 왜: 무엇이 빠졌는지는 서버가 안다 — Artist 화면은 샷 목록을 읽지 않아도 된다.
    const fetchImpl = vi.fn().mockResolvedValue(reply(200, { ok: true, data: { submitted: [], remaining: 0 } }))

    await drawRoughsInBackground('p1', { fetchImpl, poll: async () => undefined, isAborted: () => false })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/writer/rough-storyboard')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ projectId: 'p1' })
  })

  it('생성 자리가 차면 알림 없이 멈춘다', async () => {
    // 왜: Artist 에서 일하는 동안 "자리 부족" 알림이 뜨면 헷갈린다 — 남은 러프는 Storyboard 화면이 이어 그린다.
    const fetchImpl = vi.fn().mockResolvedValue(reply(429, { error: 'quota' }))

    expect(await drawRoughsInBackground('p1', { fetchImpl, poll: async () => undefined, isAborted: () => false })).toBe('quota')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('화면을 떠나면 다음 묶음을 보내지 않는다', async () => {
    // 왜: 정상 경로 고정 — Storyboard 화면처럼 화면이 열려 있는 동안만 그린다.
    const fetchImpl = vi.fn().mockResolvedValue(reply(200, { ok: true, data: { submitted: [{ shotId: 's1', jobId: 'j1' }], remaining: 5 } }))
    let left = false

    const outcome = await drawRoughsInBackground('p1', { fetchImpl, poll: async () => { left = true }, isAborted: () => left })

    expect(outcome).toBe('aborted')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})

describe('Artist 머리의 Storyboard 준비 상태', () => {
  it('씬 · 샷을 나누는 중이면 Storyboard 준비 중(씬 · 샷 나누기)을 보인다', () => {
    // 왜: 뒤에서 무엇을 하고 있는지 보여야 [완료하기]를 언제 눌러도 되는지 안다.
    expect(storyboardPrepView({ status: splitting, drawing: false, outcome: null, artistCompleted: false })).toBe('splitting')
  })

  it('러프를 미리 그리는 중이면 Storyboard 준비 중(러프 그리기)을 보인다', () => {
    expect(storyboardPrepView({ status: done, drawing: true, outcome: null, artistCompleted: false })).toBe('drawing')
  })

  it('씬 · 샷과 러프가 다 되면 Storyboard 준비됨을 보인다', () => {
    expect(storyboardPrepView({ status: done, drawing: false, outcome: 'done', artistCompleted: false })).toBe('ready')
  })

  it('만들기 전이거나 Storyboard 가 이미 열렸으면 보이지 않는다', () => {
    // 왜: 정상 경로 고정 — 완료한 뒤에는 Storyboard 탭이 그 일을 보여 준다.
    expect(storyboardPrepView({ status: { started: true, current_status: 'awaiting_confirmation', current_stage: 'storyCheck' }, drawing: false, outcome: null, artistCompleted: false })).toBeNull()
    expect(storyboardPrepView({ status: splitting, drawing: false, outcome: null, artistCompleted: true })).toBeNull()
  })
})
