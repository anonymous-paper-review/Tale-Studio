// 한 틱에 도는 작업 여러 개는 서버에 한 번만 묻는다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetGenerationJobPollingForTests, pollGenerationJob, type GenerationJobReceipt } from '@/lib/generation-jobs-client'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const batch = (jobs: Record<string, unknown>, missing: string[] = []) => json({ ok: true, data: { jobs, missing } })
const done = (kind = 'shot_image') => ({ status: 'completed', resultUrl: 'https://s/r.png', error: null, kind })
const waiting = (kind = 'shot_image') => ({ status: 'queued', resultUrl: null, error: null, kind })

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_POLL_BATCH_MAX', '50')
})

afterEach(() => {
  _resetGenerationJobPollingForTests()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('pollGenerationJob 묶어 묻기', () => {
  it('같은 틱에 등록된 작업 세 개는 요청 한 번으로 묻는다', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(batch({ a: done(), b: done(), c: done() }))

    await Promise.all(['a', 'b', 'c'].map((id) => pollGenerationJob(id, { intervalMs: 0 })))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/generation-jobs?ids=a,b,c')
  })

  it('묶음 응답에서 끝난 작업만 끝내고 나머지는 계속 묻는다', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(batch({ a: done(), b: waiting() }))
      .mockResolvedValueOnce(json({ data: done() }))
    const seenB: GenerationJobReceipt[] = []

    const a = pollGenerationJob('a', { intervalMs: 0 })
    const b = pollGenerationJob('b', { intervalMs: 0, onStatus: (r) => seenB.push(r) })

    await expect(a).resolves.toBe('https://s/r.png')
    await expect(b).resolves.toBe('https://s/r.png')
    expect(seenB.map((r) => r.status)).toEqual(['queued', 'completed'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // 남은 작업이 하나뿐이면 단일 주소로 묻는다
    expect(String(fetchMock.mock.calls[1][0])).toBe('/api/generation-jobs/b')
  })

  it('묶음 응답의 missing 에 든 작업은 실패로 끝낸다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(batch({ a: done() }, ['ghost']))
    const seen: GenerationJobReceipt[] = []

    const a = pollGenerationJob('a', { intervalMs: 0 })
    const ghost = pollGenerationJob('ghost', { intervalMs: 0, onStatus: (r) => seen.push(r) })

    await expect(a).resolves.toBe('https://s/r.png')
    await expect(ghost).rejects.toThrow('HTTP 404')
    expect(seen).toEqual([expect.objectContaining({ status: 'failed', httpStatus: 404 })])
  })

  it('영상 작업은 응답의 종류를 보고 30분까지 기다린다', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      batch({ img: waiting('shot_image'), vid: waiting('shot_video') }),
    )
    const seen: Record<string, string[]> = { img: [], vid: [] }
    const img = pollGenerationJob('img', { onStatus: (r) => seen.img.push(r.status) })
    const vid = pollGenerationJob('vid', { onStatus: (r) => seen.vid.push(r.status) })
    const imgResult = img.then(() => 'ok', (e: Error) => e.message)
    let vidSettled = false
    void vid.then(() => (vidSettled = true), () => (vidSettled = true))

    await vi.advanceTimersByTimeAsync(11 * 60 * 1000)

    expect(await imgResult).toContain('taking longer')
    expect(seen.img.at(-1)).toBe('timed_out')
    expect(vidSettled).toBe(false)
    expect(seen.vid).not.toContain('timed_out')

    const vidResult = vid.then(() => 'ok', (e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
    expect(await vidResult).toContain('taking longer')
    expect(seen.vid.at(-1)).toBe('timed_out')
  })
})
