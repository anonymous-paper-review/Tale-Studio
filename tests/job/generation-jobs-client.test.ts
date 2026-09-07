import { afterEach, describe, expect, it, vi } from 'vitest'
import { pollGenerationJob } from '@/lib/generation-jobs-client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pollGenerationJob trace callbacks', () => {
  it('reports queued and completed without exposing result data to the trace callback', async () => {
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

  it('reports a failed terminal job before rejecting', async () => {
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
