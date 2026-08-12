import { describe, expect, it } from 'vitest'
import { computeIgnoredFields, pickAllowedFields } from '@/lib/fal/model-schemas'

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

describe('pickAllowedFields', () => {
  it('drops fields the registered model does not accept (e.g. negative_prompt on happy-horse)', () => {
    expect(
      pickAllowedFields(
        {
          prompt: 'A dancer crosses the frame',
          image_urls: ['https://example.com/ref.png'],
          negative_prompt: 'blurry',
          duration: 5,
        },
        'happy-horse',
      ),
    ).toEqual({
      prompt: 'A dancer crosses the frame',
      image_urls: ['https://example.com/ref.png'],
      duration: 5,
    })
  })

  it('keeps a field the registered model does accept (negative_prompt on kling v2.1 T2V)', () => {
    expect(
      pickAllowedFields(
        {
          prompt: 'A dancer crosses the frame',
          negative_prompt: 'blurry',
          duration: '5',
          aspect_ratio: '16:9',
        },
        'fal-ai/kling-video/v2.1/master/text-to-video',
      ),
    ).toEqual({
      prompt: 'A dancer crosses the frame',
      negative_prompt: 'blurry',
      duration: '5',
      aspect_ratio: '16:9',
    })
  })

  it('passes unregistered models through unchanged, matching computeIgnoredFields’ empty-array contract', () => {
    const input = {
      prompt: 'A dancer crosses the frame',
      unsupported_field: true,
    }
    expect(pickAllowedFields(input, 'unregistered/model')).toEqual(input)
  })
})
