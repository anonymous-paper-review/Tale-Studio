import { describe, expect, it } from 'vitest'
import {
  computeImageSourceHash,
  computeLookFingerprint,
  computeWorldImageSourceHash,
  isImageStale,
} from '@/lib/image-provenance'

describe('image provenance red-team/property cases', () => {
  it('empty look containers and whitespace-only fields produce null look fingerprint', () => {
    expect(
      computeLookFingerprint(
        {
          l1: { art_style: '   ', shape_language: '\n\t  ' },
          palette: { primary: '', secondary: '   ', accent: null },
        },
        ' \n\t ',
      ),
    ).toBeNull()
  })

  it('separator-shaped NUL sequence in appearance does not collide with look-scoped hash', () => {
    const appearanceOnly = computeImageSourceHash('portrait\u0000look:art:anime')
    const lookScoped = computeImageSourceHash('portrait', 'art:anime')

    expect(appearanceOnly).not.toBe(lookScoped)
  })

  it('palette duplicate values are deterministic and blank values are ignored', () => {
    const a = computeLookFingerprint(
      { palette: { primary: '#222', secondary: ' ', accent: '#222' } },
      null,
    )
    const b = computeLookFingerprint(
      { palette: { primary: '#222', secondary: '#222', accent: '' } },
      null,
    )

    expect(a).toBe('palette:#222,#222')
    expect(b).toBe(a)
  })

  it('very long appearance and look strings remain deterministic and content-sensitive', () => {
    const longAppearance = `${'긴 머리와 검은 망토 '.repeat(5_000)}끝`
    const longLook = `${'art:수채화 '.repeat(2_000)}palette:#000,#fff`

    expect(computeImageSourceHash(longAppearance, longLook)).toMatch(/^[0-9a-f]{8}$/)
    expect(computeImageSourceHash(longAppearance, longLook)).toBe(
      computeImageSourceHash(longAppearance, longLook),
    )
    expect(computeImageSourceHash(`${longAppearance}!`, longLook)).not.toBe(
      computeImageSourceHash(longAppearance, longLook),
    )
  })

  it('unicode and emoji are preserved while whitespace is normalized', () => {
    const lookA = computeLookFingerprint(
      {
        l1: { art_style: '수묵화   ✨', shape_language: '둥근   실루엣' },
        palette: { primary: '청록 🐉', secondary: '금색', accent: '청록 🐉' },
      },
      '한복   갑옷 🛡️',
    )
    const lookB = computeLookFingerprint(
      {
        l1: { art_style: '수묵화 ✨', shape_language: '둥근 실루엣' },
        palette: { primary: '청록 🐉', secondary: '청록 🐉', accent: '금색' },
      },
      '한복 갑옷 🛡️',
    )

    expect(lookA).toBe(lookB)
    expect(computeImageSourceHash('검은 망토 🐉', lookA)).toBe(
      computeImageSourceHash('검은   망토 🐉 ', lookB),
    )
    expect(computeImageSourceHash('검은 망토 🐉', lookA)).not.toBe(
      computeImageSourceHash('검은 망토 🦊', lookA),
    )
  })

  it('costume-only look creates a normalized look fingerprint', () => {
    expect(computeLookFingerprint(null, '  은색   갑옷 🛡️  ')).toBe('costume:은색 갑옷 🛡️')
  })

  it('isImageStale crosses appearance-only change, look arrival, both changes, and absent data', () => {
    const draftHash = computeImageSourceHash('검은 망토', null)

    expect(isImageStale('검은 망토', null, draftHash)).toBe(false)
    expect(isImageStale('흰 망토', null, draftHash)).toBe(true)
    expect(isImageStale('검은 망토', 'art:anime', draftHash)).toBe(true)
    expect(isImageStale('흰 망토', 'art:anime', draftHash)).toBe(true)
    expect(isImageStale(null, null, computeImageSourceHash(null, null))).toBe(false)
    expect(isImageStale('검은 망토', 'art:anime', null)).toBe(false)
  })

  it('world image hash keeps character-hash backward compatibility symmetry', () => {
    const visualDescription = '  네온   뒷골목 🌃  '
    const base = computeWorldImageSourceHash(visualDescription)

    expect(computeWorldImageSourceHash(visualDescription, null)).toBe(base)
    expect(computeWorldImageSourceHash(visualDescription, undefined)).toBe(base)
    expect(computeWorldImageSourceHash(visualDescription, '')).toBe(base)
    expect(computeWorldImageSourceHash('네온 뒷골목 🌃', 'palette:#0ff')).not.toBe(base)
  })
})
