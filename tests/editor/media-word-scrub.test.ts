// 기준 이미지가 있으면 매체를 가리키는 표현을 덜어내고 나머지 설명은 지킨다 (#F-004 B4/B5, 2026-08-12)
import { describe, it, expect } from 'vitest'
import {
  containsMediaWord,
  tokenUnlessMediaWord,
  scrubMediaWords,
  applyStyleAnchor,
  STYLE_ANCHOR_CLAUSE,
} from '@/lib/style-anchor'

// #F-004 B4/B5 (2026-08-12) — 앵커가 있으면 앵커 이미지가 매체의 유일한 권위다.
// 실측(dc531572): 프롬프트의 매체어("texture: photorealistic", "포토리얼리스틱 식생 지대")가
// 앵커를 이겨 3D 애니메이션 매체 전이가 깨졌다. 계약: 토큰은 매체어 포함 시 토큰째 드롭,
// 산문은 단어만 걷어내고 개행·문장 구조는 보존.

describe('tokenUnlessMediaWord — 매체를 가리키는 표현 묶음 규칙 (B4)', () => {
  it('매체를 설명하는 말이 섞인 표현 묶음은 통째로 빼낸다 (2026-07-14)', () => {
    expect(tokenUnlessMediaWord('photorealistic')).toBeUndefined()
    expect(tokenUnlessMediaWord('dark_cinematic_realism')).toBeUndefined()
    expect(tokenUnlessMediaWord('hyper-realistic rendering')).toBeUndefined()
  })

  it('매체를 설명하지 않는 표현은 그대로 남긴다', () => {
    expect(tokenUnlessMediaWord('3d_animation')).toBe('3d_animation')
    expect(tokenUnlessMediaWord('ink-and-wash adventure illustration')).toBe(
      'ink-and-wash adventure illustration',
    )
    expect(tokenUnlessMediaWord('weathered_industrial')).toBe('weathered_industrial')
    expect(tokenUnlessMediaWord(undefined)).toBeUndefined()
  })
})

describe('scrubMediaWords — 설명 문장에서 매체 표현을 덜어내는 규칙 (B5)', () => {
  it('영어나 한국어로 된 매체 표현을 빼도 문장 나머지는 그대로 둔다', () => {
    expect(scrubMediaWords('각진 포토리얼리스틱 식생 지대')).toBe('각진 식생 지대')
    expect(scrubMediaWords('거칠고 실사적인 사구 질감')).toBe('거칠고 사구 질감')
    expect(scrubMediaWords('massive photorealistic fortress at dusk')).toBe(
      'massive fortress at dusk',
    )
  })

  it('줄을 나눈 모양은 설명의 구조이므로 그대로 둔다', () => {
    const multi = 'line one photorealistic\nline two\n\nline three'
    expect(scrubMediaWords(multi)).toBe('line one\nline two\n\nline three')
  })

  it('매체를 설명하는 말이 없으면 원문을 그대로 둔다', () => {
    const clean = 'Massive fortress built from tropical timber, lighting direction: side_right'
    expect(scrubMediaWords(clean)).toBe(clean)
  })

  it('매체 표현이 다른 말 속에 들어 있어도 찾아내고 비슷한 말은 구별한다', () => {
    expect(containsMediaWord('3D 리얼리스틱 단면')).toBe(true)
    expect(containsMediaWord('스타일라이즈드 3D')).toBe(false)
    expect(containsMediaWord(null)).toBe(false)
  })
})

describe('applyStyleAnchor — 기준 이미지가 있을 때 설명에서 매체 표현을 덜어내는 규칙 (B5)', () => {
  const anchor = { key: 'real_3d', imageUrl: 'https://x/a.png', medium: '3d' }

  it('기준 이미지가 있으면 설명에서 매체 표현을 빼낸다', () => {
    const out = applyStyleAnchor(anchor, { prompt: '포토리얼리스틱 식생 지대를 그려라' }, 'single')
    expect(out.prompt).toContain(STYLE_ANCHOR_CLAUSE)
    expect(out.prompt).not.toContain('포토리얼리스틱')
    expect(out.prompt).toContain('식생 지대를 그려라')
  })

  it('기준 이미지가 없으면 설명을 바꾸지 않는다', () => {
    const base = { prompt: 'photorealistic scene' }
    expect(applyStyleAnchor(null, base, 'single')).toBe(base)
  })
})
