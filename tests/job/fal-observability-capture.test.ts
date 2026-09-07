import { describe, expect, it } from 'vitest'
import { buildFalRequestCapturePatch } from '@/lib/fal/observability'

describe('fal observability capture', () => {
  it('reports fields omitted by a registered fal model allowlist', () => {
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

  it('maps the exact fal request body into an input snapshot patch', () => {
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
