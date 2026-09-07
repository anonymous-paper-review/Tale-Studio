// 위험한 인물 묘사가 들어오면 미성년·유혈 표현을 덜어 안전한 인물 이미지를 만든다 (#A)
import { describe, it, expect } from 'vitest'
import {
  buildCharacterMainPrompt,
  buildCharacterViewPrompt,
  type CharacterPromptInput,
} from '@/lib/artist/turnaround'

// safe-mode(#A): 모더레이션류 실패 재시도 시 명시 미성년 나이 + 그래픽 묘사를 제거하고
//   adult/stylized/non-graphic 토큰을 더한다. safeMode 미지정/false면 출력은 기존과 동일(byte-identical).
const base: CharacterPromptInput = {
  name: '소녀',
  appearance: '10대 초반 백금발 소녀, 유혈이 낭자한 흰 피부',
  age: '12',
  role: 'antagonist',
  costumes: ['피범벅 흰 드레스', '낡은 망토'],
  artStyle: 'dark_fantasy_gothic',
  shapeLanguage: 'angular',
  palette: ['#1A1A1A', '#B22222'],
}

describe('인물 앞·뒤·옆모습 안전 변환', () => {
  it('안전 기능을 끄거나 지정하지 않으면 기존 설명을 그대로 유지한다', () => {
    expect(buildCharacterMainPrompt({ ...base, safeMode: false })).toBe(buildCharacterMainPrompt(base))
    expect(buildCharacterViewPrompt({ ...base, safeMode: false }, 'back')).toBe(
      buildCharacterViewPrompt(base, 'back'),
    )
  })

  it('안전 기능을 끄면 원래 묘사와 나이를 유지한다', () => {
    const off = buildCharacterMainPrompt(base)
    expect(off).toContain('10대 초반')
    expect(off).toContain('유혈')
    expect(off).toContain('age 12')
    expect(off).not.toContain('age-ambiguous')
  })

  it('안전 기능을 켜면 미성년·유혈 표현을 덜고 자극 없는 성인풍 묘사로 바꾼다', () => {
    const on = buildCharacterMainPrompt({ ...base, safeMode: true })
    // 제거 대상
    expect(on).not.toMatch(/10대|유혈|낭자|피범벅/)
    expect(on).not.toContain('age 12')
    // 추가 토큰
    expect(on).toContain('age-ambiguous')
    expect(on).toContain('stylized non-graphic')
    // 보존: 성별 명사 + 룩
    expect(on).toContain('소녀')
    expect(on).toContain('dark_fantasy_gothic')
    // "피부(skin)"는 오삭제 안 됨(bare 피 제외)
    expect(on).toContain('피부')
  })

  it('안전 기능을 켜면 옆모습도 같은 기준으로 인물 일관성을 지킨다', () => {
    const on = buildCharacterViewPrompt({ ...base, safeMode: true }, 'sideLeft')
    expect(on).toContain('age-ambiguous')
    expect(on).not.toMatch(/유혈|10대/)
    expect(on).toContain('identical character')
  })
})
