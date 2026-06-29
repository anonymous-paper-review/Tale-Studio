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

describe('turnaround safe-mode', () => {
  it('safeMode 미지정 == safeMode:false (byte-identical, 기존 동작 보존)', () => {
    expect(buildCharacterMainPrompt({ ...base, safeMode: false })).toBe(buildCharacterMainPrompt(base))
    expect(buildCharacterViewPrompt({ ...base, safeMode: false }, 'back')).toBe(
      buildCharacterViewPrompt(base, 'back'),
    )
  })

  it('safeMode off: 원본 묘사/나이 유지, safe 토큰 없음', () => {
    const off = buildCharacterMainPrompt(base)
    expect(off).toContain('10대 초반')
    expect(off).toContain('유혈')
    expect(off).toContain('age 12')
    expect(off).not.toContain('age-ambiguous')
  })

  it('safeMode on: 미성년 나이 + 그래픽 제거, adult/stylized 토큰 추가', () => {
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

  it('safeMode on: 방향 뷰도 동일 변형 + reference 일관성 문구 유지', () => {
    const on = buildCharacterViewPrompt({ ...base, safeMode: true }, 'sideLeft')
    expect(on).toContain('age-ambiguous')
    expect(on).not.toMatch(/유혈|10대/)
    expect(on).toContain('identical character')
  })
})
