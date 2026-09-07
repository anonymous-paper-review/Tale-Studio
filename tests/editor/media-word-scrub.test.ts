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

describe('tokenUnlessMediaWord — 토큰 정책 (B4)', () => {
  it('매체어를 품은 토큰은 토큰째 드롭 (2026-07-14 dark_cinematic_realism 교훈 보존)', () => {
    expect(tokenUnlessMediaWord('photorealistic')).toBeUndefined()
    expect(tokenUnlessMediaWord('dark_cinematic_realism')).toBeUndefined()
    expect(tokenUnlessMediaWord('hyper-realistic rendering')).toBeUndefined()
  })

  it('무해한 토큰은 유지 — 앵커에 부합하는 3d_animation 이 살아남는 것이 이 수리의 목적', () => {
    expect(tokenUnlessMediaWord('3d_animation')).toBe('3d_animation')
    expect(tokenUnlessMediaWord('ink-and-wash adventure illustration')).toBe(
      'ink-and-wash adventure illustration',
    )
    expect(tokenUnlessMediaWord('weathered_industrial')).toBe('weathered_industrial')
    expect(tokenUnlessMediaWord(undefined)).toBeUndefined()
  })
})

describe('scrubMediaWords — 산문 정책 (B5)', () => {
  it('영어·한국어 매체어를 걷어내고 문장은 유지한다', () => {
    expect(scrubMediaWords('각진 포토리얼리스틱 식생 지대')).toBe('각진 식생 지대')
    expect(scrubMediaWords('거칠고 실사적인 사구 질감')).toBe('거칠고 사구 질감')
    expect(scrubMediaWords('massive photorealistic fortress at dusk')).toBe(
      'massive fortress at dusk',
    )
  })

  it('개행은 프롬프트 구조라 보존한다', () => {
    const multi = 'line one photorealistic\nline two\n\nline three'
    expect(scrubMediaWords(multi)).toBe('line one\nline two\n\nline three')
  })

  it('매체어가 없으면 원문 그대로 (no-op)', () => {
    const clean = 'Massive fortress built from tropical timber, lighting direction: side_right'
    expect(scrubMediaWords(clean)).toBe(clean)
  })

  it('containsMediaWord 는 부분 문자열(리얼리스틱 안의 실사 아님)도 정확히 잡는다', () => {
    expect(containsMediaWord('3D 리얼리스틱 단면')).toBe(true)
    expect(containsMediaWord('스타일라이즈드 3D')).toBe(false)
    expect(containsMediaWord(null)).toBe(false)
  })
})

describe('applyStyleAnchor — 앵커 존재 시 본문 산문 자동 스크럽 (B5)', () => {
  const anchor = { key: 'real_3d', imageUrl: 'https://x/a.png', medium: '3d' }

  it('앵커가 있으면 base.prompt 의 매체어가 걷힌다', () => {
    const out = applyStyleAnchor(anchor, { prompt: '포토리얼리스틱 식생 지대를 그려라' }, 'single')
    expect(out.prompt).toContain(STYLE_ANCHOR_CLAUSE)
    expect(out.prompt).not.toContain('포토리얼리스틱')
    expect(out.prompt).toContain('식생 지대를 그려라')
  })

  it('앵커가 없으면 스크럽도 없다 (전체 no-op)', () => {
    const base = { prompt: 'photorealistic scene' }
    expect(applyStyleAnchor(null, base, 'single')).toBe(base)
  })
})
