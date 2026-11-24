// 상태 확인이 잠깐 실패해도 화면은 작업을 실패로 굳히지 않고 간격을 늘려 다시 묻는다
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _resetGenerationJobPollingForTests, pollGenerationJob, type GenerationJobReceipt } from '@/lib/generation-jobs-client'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const done = () => json({ data: { status: 'completed', resultUrl: 'https://s/r.png', error: null } })
const queued = () => json({ data: { status: 'queued', resultUrl: null, error: null } })

afterEach(() => {
  _resetGenerationJobPollingForTests()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('pollGenerationJob 일시 오류', () => {
  it('서버가 500 으로 답하면 작업을 실패로 보지 않고 다음에 다시 묻는다', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: { message: 'boom' } }, 500))
      .mockResolvedValueOnce(done())
    const seen: GenerationJobReceipt[] = []

    await expect(pollGenerationJob('j500', { intervalMs: 0, onStatus: (r) => seen.push(r) })).resolves.toBe('https://s/r.png')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(seen[0]).toMatchObject({ status: 'queued', httpStatus: 500 })
    expect(seen.map((r) => r.status)).not.toContain('failed')
  })

  it('응답이 10초 안에 오지 않으면 그 시도만 접고 다음에 다시 묻는다', async () => {
    const hang = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(hang.signal)
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError')))
          }),
      )
      .mockResolvedValueOnce(done())
    const seen: GenerationJobReceipt[] = []

    const run = pollGenerationJob('jslow', { intervalMs: 0, onStatus: (r) => seen.push(r) })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    hang.abort()

    await expect(run).resolves.toBe('https://s/r.png')
    expect(seen[0]).toMatchObject({ status: 'queued', httpStatus: null })
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(hang.signal)
  })

  it('실패가 이어지면 묻는 간격을 3초에서 6초, 12초로 늘리고 성공하면 3초로 돌아온다', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(queued())
      .mockResolvedValueOnce(queued())
      .mockResolvedValue(done())
    const run = pollGenerationJob('jback')
    const calls = () => fetchMock.mock.calls.length

    await vi.advanceTimersByTimeAsync(0)
    expect(calls()).toBe(1)
    await vi.advanceTimersByTimeAsync(5_999)
    expect(calls()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls()).toBe(2)
    await vi.advanceTimersByTimeAsync(11_999)
    expect(calls()).toBe(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls()).toBe(3)
    await vi.advanceTimersByTimeAsync(23_999)
    expect(calls()).toBe(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls()).toBe(4)
    // 네 번째 응답이 성공이었으므로 간격은 다시 3초
    await vi.advanceTimersByTimeAsync(2_999)
    expect(calls()).toBe(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls()).toBe(5)
    await vi.advanceTimersByTimeAsync(3_000)
    await expect(run).resolves.toBe('https://s/r.png')
  })

  it('로그인이 풀렸으면(401) 작업을 실패로 끝낸다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: { message: 'Unauthorized' } }, 401))
    const seen: GenerationJobReceipt[] = []

    await expect(pollGenerationJob('j401', { intervalMs: 0, onStatus: (r) => seen.push(r) })).rejects.toThrow('Unauthorized')

    expect(seen).toEqual([expect.objectContaining({ status: 'failed', httpStatus: 401 })])
  })

  it('없는 작업(404)은 실패로 끝낸다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: { message: 'Not found' } }, 404))
    const seen: GenerationJobReceipt[] = []

    await expect(pollGenerationJob('j404', { intervalMs: 0, onStatus: (r) => seen.push(r) })).rejects.toThrow('Not found')

    expect(seen).toEqual([expect.objectContaining({ status: 'failed', httpStatus: 404 })])
  })
})
