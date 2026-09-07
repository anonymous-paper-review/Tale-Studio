// 외형과 그림체의 작은 차이와 순서 변화에도 이미지 상태를 올바르게 알린다 (SCENARIO-6)
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

describe('classifyImageStale — SCENARIO-6 다양한 외형·그림체 조합 점검', () => {
  it.each(scenario6Cases)(
    '같은 외형에서 Writer를 다시 실행해 그림체만 달라지면 반영 대기로 둔다 (%s %#)',
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

describe('classifyImageStale — 외형 글의 띄어쓰기와 문자 차이를 같은 내용으로 본다', () => {
  it.each(whitespaceNormalizationCases)(
    '띄어쓰기나 특수 문자가 달라도 같은 외형으로 정확히 판단한다 (%s)',
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

  it('띄어쓰기 차이가 있어도 최신·반영 대기·수정 상태를 올바르게 나눈다', () => {
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

describe('classifyImageStale — 기록이 없거나 같은 지문이 생기는 경계도 올바르게 판단한다', () => {
  it('외형 기록이 없을 때와 비어 있을 때를 다르게 판단한다', () => {
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

  it('이미지 출처 기록이 비어 있으면 최신으로 본다', () => {
    expect(
      classifyImageStale('외형이 바뀌어도 지문 미상', lookFixtures[0].fingerprint, {
        sourceHash: '',
        appearanceHash: '',
      }),
    ).toBe('fresh')
  })

  it('같은 외형 기록으로 그림체만 바뀐 상태를 구분한다', () => {
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

describe('lookVersionKey — 그림체 목록의 순서와 중복 경계 점검', () => {
  it('그림체가 없거나 비어 있으면 목록 없음으로 정리한다', () => {
    expect(lookVersionKey([])).toBe('none')
    expect(lookVersionKey([null, undefined])).toBe('none')
    expect(lookVersionKey(['', null, undefined])).toBe('none')
  })

  it('그림체 순서를 바꿔도 같고 같은 항목의 중복은 유지한다', () => {
    const [a, b, c] = lookFixtures.map((fixture) => fixture.fingerprint)

    expect(lookVersionKey([a, b, a, null, c])).toBe(lookVersionKey([c, a, null, b, a]))
    expect(lookVersionKey([a, a])).not.toBe(lookVersionKey([a]))
  })

  it('의상이나 그림체 정보가 바뀌면 다른 목록으로 구분한다', () => {
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

  it('색상 순서와 빈 항목이 달라도 같은 그림체 목록을 일관되게 만든다', () => {
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

  it('중복이나 빈 항목이 섞여도 순서를 바꾼 결과가 같다', () => {
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

describe('computeImageSourceHash — 같은 외형과 그림체는 같은 이미지 출처로 기록한다', () => {
  it('같은 외형과 그림체를 넣으면 같은 이미지 출처를 기록한다', () => {
    for (const appearance of appearanceFixtures.map((fixture) => fixture.appearance)) {
      for (const look of [null, undefined, ...lookFixtures.map((fixture) => fixture.fingerprint)]) {
        expect(computeImageSourceHash(appearance, look)).toBe(computeImageSourceHash(appearance, look))
      }
    }
  })

  it('외형이 없거나 공백뿐이어도 같은 이미지 출처로 기록한다', () => {
    expect(computeImageSourceHash(null, null)).toBe(computeImageSourceHash(undefined, null))
    expect(computeImageSourceHash('', null)).toBe(computeImageSourceHash(' \n\t\u00a0 ', null))
  })

  it('같은 외형이라도 그림체 적용 여부에 따라 이미지 출처를 구분한다', () => {
    const appearance = 'same normalized text'
    const look = lookFixtures[0].fingerprint

    expect(computeImageSourceHash(appearance, look)).not.toBe(computeImageSourceHash(appearance, null))
  })

  it('외형이 같아도 그림체가 바뀌면 이미지 출처를 다르게 기록한다', () => {
    const appearance = '룩만 바뀌는 캐릭터'

    expect(computeImageSourceHash(appearance, lookFixtures[0].fingerprint)).not.toBe(
      computeImageSourceHash(appearance, lookFixtures[1].fingerprint),
    )
  })
})
