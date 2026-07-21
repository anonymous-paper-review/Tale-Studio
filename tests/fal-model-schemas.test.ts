import { describe, expect, it } from 'vitest'
import { computeIgnoredFields } from '@/lib/fal/model-schemas'

describe('computeIgnoredFields', () => {
  it('returns an empty array when only allowed fields are sent', () => {
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

  it('returns field names that are not allowed for the registered model', () => {
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

  it('returns an empty array for unregistered models so schema diff can be skipped', () => {
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
