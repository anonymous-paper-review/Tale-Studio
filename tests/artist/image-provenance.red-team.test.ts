// 외모와 룩이 바뀌었는지 정확히 판단하고, 다양한 입력에서도 이미지 출처를 안전하게 구분한다
import { describe, expect, it } from 'vitest'
import {
  computeImageSourceHash,
  computeLookFingerprint,
  computeWorldImageSourceHash,
  isImageStale,
} from '@/lib/image-provenance'

describe('이미지 출처 판단의 예외 사례', () => {
  it('룩 정보가 비어 있거나 공백뿐이면 룩 정보를 만들지 않는다', () => {
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

  it('외모 설명에 구분 문자가 있어도 룩을 붙인 결과와 섞이지 않는다', () => {
    const appearanceOnly = computeImageSourceHash('portrait\u0000look:art:anime')
    const lookScoped = computeImageSourceHash('portrait', 'art:anime')

    expect(appearanceOnly).not.toBe(lookScoped)
  })

  it('색상 값이 중복되거나 비어 있어도 같은 룩 정보로 정리한다', () => {
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

  it('매우 긴 외모와 룩도 내용이 같으면 같게, 달라지면 다르게 판단한다', () => {
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

  it('한글과 이모지는 보존하고 공백 차이는 무시한다', () => {
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

  it('의상만 있어도 룩 정보를 만든다', () => {
    expect(computeLookFingerprint(null, '  은색   갑옷 🛡️  ')).toBe('costume:은색 갑옷 🛡️')
  })

  it('외모나 룩이 바뀌었을 때와 정보가 없을 때 이미지 변경 여부를 올바르게 판단한다', () => {
    const draftHash = computeImageSourceHash('검은 망토', null)

    expect(isImageStale('검은 망토', null, draftHash)).toBe(false)
    expect(isImageStale('흰 망토', null, draftHash)).toBe(true)
    expect(isImageStale('검은 망토', 'art:anime', draftHash)).toBe(true)
    expect(isImageStale('흰 망토', 'art:anime', draftHash)).toBe(true)
    expect(isImageStale(null, null, computeImageSourceHash(null, null))).toBe(false)
    expect(isImageStale('검은 망토', 'art:anime', null)).toBe(false)
  })

  it('배경 이미지도 기존 캐릭터 이미지와 같은 기준으로 출처를 판단한다', () => {
    const visualDescription = '  네온   뒷골목 🌃  '
    const base = computeWorldImageSourceHash(visualDescription)

    expect(computeWorldImageSourceHash(visualDescription, null)).toBe(base)
    expect(computeWorldImageSourceHash(visualDescription, undefined)).toBe(base)
    expect(computeWorldImageSourceHash(visualDescription, '')).toBe(base)
    expect(computeWorldImageSourceHash('네온 뒷골목 🌃', 'palette:#0ff')).not.toBe(base)
  })
})
