// 러프 접수는 서비스 오류에도 HTTP 요청을 한 번만 보내며 영수증을 보존한다
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/generation-jobs', () => ({ countQueuedJobsByKey: async () => 0 }))
vi.mock('@/lib/writer/llm/raw_collector', () => ({ recordRawCall: vi.fn(), noteRateLimitHit: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('FAL_KEYS', JSON.stringify([{ id: 'test-key', key: 'test-only-credential', maxInflight: 2 }]))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('서비스가 503을 반환해도 러프 HTTP 접수는 한 번만 보내고 불확실한 오류를 보존한다', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValue(new Response(JSON.stringify({ request_id: 'duplicate-request' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetch)
  const { falImageSubmit } = await import('@/lib/writer/llm/fal')
  await expect(falImageSubmit({ prompt: 'empty room' }, { retry: false })).rejects.toMatchObject({ cause: { status: 503 } })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('러프 HTTP 접수는 같은 입력과 웹훅을 보내고 요청 번호와 선택한 키 번호를 돌려준다', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ request_id: 'request-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetch)
  const { falImageSubmit } = await import('@/lib/writer/llm/fal')
  const receipt = await falImageSubmit({ prompt: 'empty room', model: 'openai/gpt-image-2', webhookUrl: 'https://example.test/hook?a=1&b=2' }, { retry: false })
  expect(receipt).toMatchObject({ request_id: 'request-1', model: 'openai/gpt-image-2', fal_key_id: 'test-key', fal_request: { prompt: 'empty room' } })
  expect(fetch).toHaveBeenCalledTimes(1)
  const [address, init] = fetch.mock.calls[0]
  const url = new URL(String(address))
  expect(url.origin + url.pathname).toBe('https://queue.fal.run/openai/gpt-image-2')
  expect(url.searchParams.get('fal_webhook')).toBe('https://example.test/hook?a=1&b=2')
  expect(init.method).toBe('POST')
  expect(init.headers.Authorization).toBe('Key test-only-credential')
  expect(JSON.parse(init.body)).toEqual({ prompt: 'empty room' })
})
