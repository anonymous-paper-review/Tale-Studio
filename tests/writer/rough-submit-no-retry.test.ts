// 러프 외부 접수 응답이 끊기면 같은 이미지를 자동으로 중복 주문하지 않는다
import { beforeEach, expect, it, vi } from 'vitest'
import { falImageSubmit } from '@/lib/writer/llm/fal'

const mocks = vi.hoisted(() => ({ submit: vi.fn() }))
vi.mock('@/lib/fal/keys', () => ({ pickFalKey: async () => ({ id: 'key', client: { queue: { submit: mocks.submit } }, submitQueueOnce: mocks.submit }) }))
vi.mock('@/lib/writer/llm/raw_collector', () => ({ recordRawCall: vi.fn(), noteRateLimitHit: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

it('러프 접수의 응답이 끊기면 자동 재접수 없이 원래 오류를 보존한다', async () => {
  const lost = Object.assign(new Error('service unavailable'), { status: 503 })
  mocks.submit.mockRejectedValue(lost)
  await expect(falImageSubmit({ prompt: 'rough storyboard' }, { retry: false })).rejects.toMatchObject({ cause: lost })
  expect(mocks.submit).toHaveBeenCalledTimes(1)
})

it('러프 접수가 성공하면 같은 모델과 요청 번호를 돌려준다', async () => {
  mocks.submit.mockResolvedValue({ request_id: 'request-1' })
  await expect(falImageSubmit({ prompt: 'rough storyboard', model: 'openai/gpt-image-2' }, { retry: false })).resolves.toMatchObject({ request_id: 'request-1', model: 'openai/gpt-image-2', fal_key_id: 'key' })
  expect(mocks.submit).toHaveBeenCalledTimes(1)
})
