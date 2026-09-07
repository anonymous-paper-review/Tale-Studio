// 이미지 요청에는 각 모델이 받을 수 있는 정보만 남겨 잘못된 설정을 보내지 않는다
import { describe, expect, it } from 'vitest'
import { computeIgnoredFields } from '@/lib/fal/model-schemas'

describe('computeIgnoredFields', () => {
  it('허용된 정보만 보내면 빠지는 정보가 없다', () => {
    expect(
      computeIgnoredFields(
        {
          prompt: 'A dancer crosses the frame',
          image_urls: ['https://example.com/ref.png'],
          duration: 5,
          aspect_ratio: '16:9',
          resolution: '720p',
        },
        'happy-horse',
      ),
    ).toEqual([])
  })

  it('모델이 받지 않는 정보는 빠질 항목으로 알려준다', () => {
    expect(
      computeIgnoredFields(
        {
          prompt: 'A dancer crosses the frame',
          image_urls: ['https://example.com/ref.png'],
          negative_prompt: 'blurry',
          audio: true,
        },
        'happy-horse',
      ),
    ).toEqual(['negative_prompt', 'audio'])
  })

  it('등록되지 않은 모델은 비교하지 않고 빠지는 정보도 없다고 본다', () => {
    expect(
      computeIgnoredFields(
        {
          prompt: 'A dancer crosses the frame',
          unsupported_field: true,
        },
        'unregistered/model',
      ),
    ).toEqual([])
  })
})
