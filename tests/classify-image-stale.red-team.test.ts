import { describe, expect, it } from 'vitest'
import {
  classifyImageStale,
  computeImageSourceHash,
  computeLookFingerprint,
  lookVersionKey,
} from '@/lib/image-provenance'

type LookTokensInput = Parameters<typeof computeLookFingerprint>[0]
type CostumeInput = Parameters<typeof computeLookFingerprint>[1]

function mustLook(name: string, tokens: LookTokensInput, costume: CostumeInput) {
  const fingerprint = computeLookFingerprint(tokens, costume)
  if (!fingerprint) throw new Error(`look fixture ${name} unexpectedly produced null`)
  return { name, fingerprint }
}

const lookFixtures = [
  mustLook(
    'gothic-array-costume',
    {
      l1: { art_style: 'dark   gothic', shape_language: 'angular\nsilhouette' },
      palette: { primary: 'black', secondary: 'bone white', accent: 'crimson' },
    },
    ['white linen tunic', 'silver boots'],
  ),
  mustLook(
    'watercolor-hanbok',
    {
      l1: { art_style: 'soft watercolor', shape_language: 'round forms' },
      palette: { primary: 'sky blue', secondary: 'pearl', accent: 'gold' },
    },
    'embroidered hanbok',
  ),
  mustLook(
    'noir-emoji-costume',
    {
      l1: { art_style: 'noir ink', shape_language: 'long shadows' },
      palette: { primary: 'charcoal', secondary: 'neon pink', accent: 'acid green' },
    },
    '🚀 pilot suit',
  ),
  mustLook(
    'clay-palettes',
    {
      l1: { art_style: 'stop motion clay', shape_language: 'chunky silhouettes' },
      palette: { primary: 'ochre', secondary: 'teal', accent: 'ivory' },
    },
    ['patched coat', 'muddy boots'],
  ),
] as const

const appearanceFixtures = [
  {
    name: 'korean-baseline',
    appearance: '백금발 소녀, 흰 천 상의',
    edited: '백금발 소녀, 검은 갑옷',
  },
  {
    name: 'emoji-zwj',
    appearance: '👩‍🚀 파일럿 — 네온 헬멧',
    edited: '👩‍🚀 파일럿 — 깨진 네온 헬멧',
  },
  {
    name: 'combining-mark',
    appearance: 'cafe\u0301 owner in a linen coat',
    edited: 'cafe\u0301 owner in a leather coat',
  },
  {
    name: 'embedded-look-separator',
    appearance: 'literal \u0000look: marker in prompt text',
    edited: 'literal \u0000look: marker in changed prompt text',
  },
] as const

const scenario6Cases = appearanceFixtures.flatMap((appearanceCase) =>
  lookFixtures.map((lookV1, index) => ({
    ...appearanceCase,
    lookV1,
    lookV2: lookFixtures[(index + 1) % lookFixtures.length],
  })),
)

describe('classifyImageStale SCENARIO-6 red-team matrix', () => {
  it.each(scenario6Cases)(
    'keeps writer rerun look-pending for %s %#',
    ({ appearance, edited, lookV1, lookV2 }) => {
      const appearanceOnly = computeImageSourceHash(appearance, null)
      const draft = { sourceHash: appearanceOnly, appearanceHash: appearanceOnly }

      expect(classifyImageStale(appearance, lookV1.fingerprint, draft)).toBe('look-pending')

      const refreshed = {
        sourceHash: computeImageSourceHash(appearance, lookV1.fingerprint),
        appearanceHash: appearanceOnly,
      }

      expect(classifyImageStale(appearance, lookV1.fingerprint, refreshed)).toBe('fresh')
      expect(classifyImageStale(appearance, lookV2.fingerprint, refreshed)).toBe('look-pending')
      expect(classifyImageStale(edited, lookV2.fingerprint, refreshed)).toBe('edited')
    },
  )
})

const whitespaceNormalizationCases = [
  {
    name: 'ascii-tabs-newlines',
    canonical: '백금발 소녀 흰 천 상의',
    noisy: '  백금발\t소녀\n흰   천  상의  ',
  },
  {
    name: 'nbsp-and-ideographic-space',
    canonical: '카페 주인 전각 공백',
    noisy: '\u00a0카페\u00a0\u00a0주인\u3000전각\t공백\u00a0',
  },
  {
    name: 'emoji-survives-space-normalization',
    canonical: '👩‍🚀 파일럿 🚀 슈트',
    noisy: '\n👩‍🚀\t파일럿   🚀\u00a0슈트\n',
  },
  {
    name: 'combining-mark-with-whitespace',
    canonical: 'cafe\u0301 owner linen coat',
    noisy: ' cafe\u0301\nowner\t\tlinen   coat ',
  },
] as const

describe('classifyImageStale appearance normalization boundaries', () => {
  it.each(whitespaceNormalizationCases)(
    'does not misclassify normalized whitespace/unicode appearance %s',
    ({ canonical, noisy }) => {
      const look = lookFixtures[0].fingerprint
      const nextLook = lookFixtures[1].fingerprint
      const appearanceOnly = computeImageSourceHash(canonical, null)

      expect(computeImageSourceHash(noisy, null)).toBe(appearanceOnly)
      expect(computeImageSourceHash(noisy, look)).toBe(computeImageSourceHash(canonical, look))

      expect(
        classifyImageStale(noisy, look, {
          sourceHash: computeImageSourceHash(canonical, look),
          appearanceHash: appearanceOnly,
        }),
      ).toBe('fresh')
      expect(
        classifyImageStale(noisy, nextLook, {
          sourceHash: appearanceOnly,
          appearanceHash: appearanceOnly,
        }),
      ).toBe('look-pending')
    },
  )

  it('fuzzes normalized appearance equivalence against fresh/look-pending/edited branches', () => {
    const whitespace = [' ', '  ', '\t', '\n', '\r\n', '\u00a0', '\u3000']

    for (let i = 0; i < 64; i += 1) {
      const parts = ['인물', `실루엣-${i}`, i % 2 === 0 ? '👑' : '카페\u0301', `의상-${i % 7}`]
      const canonical = parts.join(' ')
      const noisy = `${whitespace[i % whitespace.length]}${parts.join(
        whitespace[(i * 3 + 1) % whitespace.length],
      )}${whitespace[(i * 5 + 2) % whitespace.length]}`
      const look = lookFixtures[i % lookFixtures.length].fingerprint
      const nextLook = lookFixtures[(i + 1) % lookFixtures.length].fingerprint
      const appearanceOnly = computeImageSourceHash(canonical, null)
      const refreshed = {
        sourceHash: computeImageSourceHash(canonical, look),
        appearanceHash: appearanceOnly,
      }

      expect(computeImageSourceHash(noisy, null)).toBe(appearanceOnly)
      expect(classifyImageStale(noisy, look, refreshed)).toBe('fresh')
      expect(classifyImageStale(noisy, nextLook, refreshed)).toBe('look-pending')
      expect(classifyImageStale(`${noisy} 편집`, nextLook, refreshed)).toBe('edited')
    }
  })
})

describe('classifyImageStale null/empty/collision-boundary handling', () => {
  it('treats empty appearanceHash as a recorded value, not legacy null', () => {
    const appearance = '흰 천 상의'
    const look = lookFixtures[0].fingerprint
    const appearanceOnly = computeImageSourceHash(appearance, null)

    expect(classifyImageStale(appearance, look, { sourceHash: appearanceOnly, appearanceHash: null })).toBe(
      'look-pending',
    )
    expect(
      classifyImageStale(appearance, look, { sourceHash: appearanceOnly, appearanceHash: undefined }),
    ).toBe('look-pending')
    expect(classifyImageStale(appearance, look, { sourceHash: appearanceOnly, appearanceHash: '' })).toBe(
      'edited',
    )
  })

  it('treats empty sourceHash as unknown provenance and therefore fresh', () => {
    expect(
      classifyImageStale('외형이 바뀌어도 지문 미상', lookFixtures[0].fingerprint, {
        sourceHash: '',
        appearanceHash: '',
      }),
    ).toBe('fresh')
  })

  it('documents the FNV-1a boundary: appearanceHash equality is the available discriminator', () => {
    const appearance = '충돌 가능성을 인지하는 외형'
    const appearanceOnly = computeImageSourceHash(appearance, null)
    const previousLookSource = computeImageSourceHash(appearance, lookFixtures[0].fingerprint)

    expect(
      classifyImageStale(appearance, lookFixtures[1].fingerprint, {
        sourceHash: previousLookSource,
        appearanceHash: appearanceOnly,
      }),
    ).toBe('look-pending')
  })
})

describe('lookVersionKey red-team boundaries', () => {
  it('returns none for empty, nullish, and empty-string-only inputs', () => {
    expect(lookVersionKey([])).toBe('none')
    expect(lookVersionKey([null, undefined])).toBe('none')
    expect(lookVersionKey(['', null, undefined])).toBe('none')
  })

  it('is reorder-invariant while preserving duplicate multiplicity', () => {
    const [a, b, c] = lookFixtures.map((fixture) => fixture.fingerprint)

    expect(lookVersionKey([a, b, a, null, c])).toBe(lookVersionKey([c, a, null, b, a]))
    expect(lookVersionKey([a, a])).not.toBe(lookVersionKey([a]))
  })

  it('changes when costume or look tokens change', () => {
    const baseTokens = {
      l1: { art_style: 'ink wash', shape_language: 'thin lines' },
      palette: { primary: 'black', secondary: 'white', accent: 'red' },
    }
    const base = computeLookFingerprint(baseTokens, 'plain coat')!
    const changedCostume = computeLookFingerprint(baseTokens, 'armored coat')!
    const changedLook = computeLookFingerprint(
      { ...baseTokens, l1: { art_style: 'oil paint', shape_language: 'thin lines' } },
      'plain coat',
    )!

    expect(lookVersionKey([base])).not.toBe(lookVersionKey([changedCostume]))
    expect(lookVersionKey([base])).not.toBe(lookVersionKey([changedLook]))
  })

  it('is deterministic for sorted palette values, null elision, and repeated aggregation', () => {
    const fingerprintA = computeLookFingerprint(
      {
        l1: { art_style: 'graphic novel', shape_language: 'sharp triangles' },
        palette: { primary: 'red', secondary: 'blue', accent: 'green' },
      },
      'cape',
    )!
    const fingerprintB = computeLookFingerprint(
      {
        l1: { art_style: 'graphic   novel', shape_language: 'sharp\ntriangles' },
        palette: { primary: 'green', secondary: 'red', accent: 'blue' },
      },
      ' cape ',
    )!

    expect(fingerprintA).toBe(fingerprintB)
    expect(lookVersionKey([fingerprintA, null])).toBe(lookVersionKey([fingerprintB]))
    expect(lookVersionKey([fingerprintA, fingerprintB])).toBe(
      lookVersionKey([fingerprintB, fingerprintA]),
    )
  })

  it('fuzzes reorder determinism with duplicate and null entries', () => {
    const fingerprints = lookFixtures.map((fixture) => fixture.fingerprint)

    for (let i = 0; i < 32; i += 1) {
      const bag = [
        fingerprints[i % fingerprints.length],
        null,
        fingerprints[(i + 1) % fingerprints.length],
        undefined,
        fingerprints[i % fingerprints.length],
      ]
      const shuffled = [bag[3], bag[4], bag[1], bag[2], bag[0]]

      expect(lookVersionKey(bag)).toBe(lookVersionKey(shuffled))
      expect(lookVersionKey(bag)).toBe(lookVersionKey([...bag]))
    }
  })
})

describe('computeImageSourceHash determinism and source-boundaries', () => {
  it('is deterministic for identical appearance/look inputs', () => {
    for (const appearance of appearanceFixtures.map((fixture) => fixture.appearance)) {
      for (const look of [null, undefined, ...lookFixtures.map((fixture) => fixture.fingerprint)]) {
        expect(computeImageSourceHash(appearance, look)).toBe(computeImageSourceHash(appearance, look))
      }
    }
  })

  it('normalizes nullish and whitespace-only appearances to the same source hash', () => {
    expect(computeImageSourceHash(null, null)).toBe(computeImageSourceHash(undefined, null))
    expect(computeImageSourceHash('', null)).toBe(computeImageSourceHash(' \n\t\u00a0 ', null))
  })

  it('keeps look-scoped hashes distinct from appearance-only hashes for the same normalized text', () => {
    const appearance = 'same normalized text'
    const look = lookFixtures[0].fingerprint

    expect(computeImageSourceHash(appearance, look)).not.toBe(computeImageSourceHash(appearance, null))
  })

  it('changes when only the look fingerprint changes', () => {
    const appearance = '룩만 바뀌는 캐릭터'

    expect(computeImageSourceHash(appearance, lookFixtures[0].fingerprint)).not.toBe(
      computeImageSourceHash(appearance, lookFixtures[1].fingerprint),
    )
  })
})
