// 영상 만들기 요청이 실패해도 같은 요청을 다시 보내지 않는다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  pickFalKey: vi.fn(),
}))

vi.mock('@/lib/fal/keys', () => ({
  pickFalKey: mocks.pickFalKey,
  falKeyById: vi.fn(),
  FalUnknownKeyError: class FalUnknownKeyError extends Error {},
}))

import { falVideoSubmit } from '@/lib/writer/llm/fal'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pickFalKey.mockResolvedValue({
    id: 'key-1',
    client: { queue: { submit: mocks.submit } },
  })
})

describe('영상 만들기 요청 보내기', () => {
  it('한 번 성공하면 한 번만 보낸다', async () => {
    mocks.submit.mockResolvedValue({ request_id: 'req-1' })

    const receipt = await falVideoSubmit({ prompt: '바다', image_url: 'https://cdn/start.png', duration: 5 })

    expect(receipt.request_id).toBe('req-1')
    expect(mocks.submit).toHaveBeenCalledTimes(1)
  })

  it('일시적인 오류가 나도 다시 보내지 않는다', async () => {
    // 제출은 돈이 나가는 동작이다. 서비스가 이미 요청을 받아두고 응답만 못 준 경우,
    // 다시 보내면 같은 영상을 두 번 만들고 두 번 청구된다.
    mocks.submit.mockRejectedValue(new Error('503 service unavailable'))

    await expect(falVideoSubmit({ prompt: '바다', image_url: 'https://cdn/start.png', duration: 5 })).rejects.toThrow(
      '503 service unavailable',
    )
    expect(mocks.submit).toHaveBeenCalledTimes(1)
  })

  it('응답을 기다리다 끊겨도 다시 보내지 않는다', async () => {
    mocks.submit.mockRejectedValue(new Error('fetch failed'))

    await expect(falVideoSubmit({ prompt: '바다', image_url: 'https://cdn/start.png', duration: 5 })).rejects.toThrow('fetch failed')
    expect(mocks.submit).toHaveBeenCalledTimes(1)
  })
})
