// image_size 우선순위 회귀(#real-strip-guard 2026-08-06 가드가 실제로 걸리게 된 지점, 2026-08-12).
//
// 계약: FalImageOptions.image_size 를 호출자가 명시하면 그 값이 실제 fal 요청 input 에 실린다.
//   생략 시 기존 aspect_ratio → image_size preset 매핑 폴백이 유지된다(후방 호환).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  submit: vi.fn<(...a: unknown[]) => Promise<{ request_id: string }>>(async () => ({ request_id: 'req-1' })),
}))

vi.mock('@fal-ai/client', () => ({
  fal: { config: vi.fn(), queue: { submit: mocks.submit } },
}))

import { falImageSubmit } from '@/lib/writer/llm/fal'

describe('falImageSubmit — image_size 우선순위 (edit 모델)', () => {
  beforeEach(() => {
    mocks.submit.mockClear()
  })

  it('호출자가 image_size 를 주면 그 값이 실제 fal 요청 입력에 실린다 (aspect_ratio 는 무시)', async () => {
    const { fal_request } = await falImageSubmit({
      model: 'openai/gpt-image-2/edit',
      prompt: 'p',
      reference_image_urls: ['https://x/ref.png'],
      image_size: '1024x1536',
      aspect_ratio: '16:9',
    })
    expect(fal_request.image_size).toBe('1024x1536')
  })

  it('image_size 를 안 주면 기존 aspect_ratio 기반 preset 폴백이 유지된다', async () => {
    const { fal_request } = await falImageSubmit({
      model: 'openai/gpt-image-2/edit',
      prompt: 'p',
      reference_image_urls: ['https://x/ref.png'],
      aspect_ratio: '9:16',
    })
    expect(fal_request.image_size).toBe('portrait_16_9')
  })

  it('image_size 도 aspect_ratio 도 없으면 auto 로 폴백한다 (기존 동작 유지)', async () => {
    const { fal_request } = await falImageSubmit({
      model: 'openai/gpt-image-2/edit',
      prompt: 'p',
      reference_image_urls: ['https://x/ref.png'],
    })
    expect(fal_request.image_size).toBe('auto')
  })
})
