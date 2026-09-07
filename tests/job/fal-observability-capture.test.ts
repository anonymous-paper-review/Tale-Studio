// 생성 요청에 사용한 내용과 빠진 항목을 사람이 확인할 수 있게 기록한다
import { describe, expect, it } from 'vitest'
import { buildFalRequestCapturePatch } from '@/lib/fal/observability'

describe('생성 요청과 빠진 항목 기록', () => {
  it('지원하지 않는 요청 항목은 빠졌다고 알려준다', () => {
    const patch = buildFalRequestCapturePatch(
      {
        prompt: 'move through the alley',
        image_urls: ['https://example.com/ref.png'],
        duration: 5,
        negative_prompt: 'blurry',
      },
      'alibaba/happy-horse/reference-to-video',
    )

    expect(patch.ignored_fields).toEqual(['negative_prompt'])
  })

  it('생성 서비스에 보낸 요청 내용을 그대로 기록한다', () => {
    const falRequest = {
      prompt: 'establishing storyboard panel',
      image_size: 'landscape_16_9',
      reference_image_urls: ['https://example.com/style.png'],
    }
    const patch = buildFalRequestCapturePatch(falRequest, 'openai/gpt-image-2')
    const inputSnapshot = { prompt: 'user prompt', ...patch }

    expect(inputSnapshot.fal_request).toEqual(falRequest)
    expect(inputSnapshot.ignored_fields).toEqual(['reference_image_urls'])
  })
})
