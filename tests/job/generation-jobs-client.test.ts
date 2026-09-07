// 작업 상태를 알리고, 끝난 작업은 결과를 돌려주며 실패는 이유와 함께 알린다
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pollGenerationJob } from '@/lib/generation-jobs-client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pollGenerationJob 상태 알림', () => {
  it('작업 상태를 순서대로 알리고, 끝난 결과는 돌려주되 상태 알림에는 결과 주소를 넣지 않는다', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { status: 'queued', resultUrl: null, error: null } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { status: 'completed', resultUrl: 'https://storage/result.png', error: null },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    const observed: Array<Record<string, unknown>> = []

    await expect(
      pollGenerationJob('job-1', {
        intervalMs: 0,
        onStatus: (receipt) => observed.push({ ...receipt, resultUrl: undefined }),
      }),
    ).resolves.toBe('https://storage/result.png')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(observed.map((item) => item.status)).toEqual(['queued', 'completed'])
    expect(observed.at(-1)).toMatchObject({ jobId: 'job-1', status: 'completed' })
  })

  it('작업이 실패하면 오류로 끝내기 전에 실패 상태를 먼저 알린다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ data: { status: 'failed', resultUrl: null, error: 'moderation' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const observed: string[] = []

    await expect(
      pollGenerationJob('job-2', {
        intervalMs: 0,
        onStatus: (receipt) => observed.push(receipt.status),
      }),
    ).rejects.toThrow('moderation')

    expect(observed).toEqual(['failed'])
  })
})
