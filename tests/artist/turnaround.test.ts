// 캐릭터의 기본 인상은 지키고 사용자가 지정한 변경은 모든 방향에 반영한다
import { describe, it, expect } from 'vitest'
import {
  buildCharacterMainPrompt,
  buildCharacterViewPrompt,
  type CharacterPromptInput,
} from '@/lib/artist/turnaround'

const base: CharacterPromptInput = {
  name: '지아',
  appearance: '검은 코트, 긴 흑발',
  role: 'protagonist',
  artStyle: 'anime',
  shapeLanguage: 'round',
  palette: ['#111', '#eee'],
}

describe('캐릭터 기본 인상과 사용자 변경을 함께 반영한다 (AC13)', () => {
  it('변경 내용을 보내지 않으면 기본 인상만 유지한다', () => {
    const p = buildCharacterMainPrompt(base)
    expect(p).not.toContain('requested changes')
    expect(p).toContain('지아')
    expect(p).toContain('art style: anime')
  })

  it('변경 내용을 보내면 기본 인상을 지키면서 사용자의 변경을 우선 반영한다', () => {
    const p = buildCharacterMainPrompt({ ...base, delta: '머리 붉게, 칼은 허리에' })
    // 룩 토대 유지
    expect(p).toContain('검은 코트, 긴 흑발')
    expect(p).toContain('art style: anime')
    expect(p).toContain('palette: #111, #eee')
    // 유저 델타 덮어쓰기 절
    expect(p).toContain('머리 붉게, 칼은 허리에')
    expect(p).toContain('override defaults where conflicting')
    // 델타는 룩 토대 뒤에 위치(충돌 시 우선)
    expect(p.indexOf('art style: anime')).toBeLessThan(p.indexOf('머리 붉게'))
  })

  it('옆모습을 요청해도 사용자의 변경과 같은 인물이라는 약속을 함께 반영한다', () => {
    const p = buildCharacterViewPrompt({ ...base, delta: '머리 붉게' }, 'sideLeft')
    expect(p).toContain('머리 붉게')
    expect(p).toContain('identical character')
    expect(p).toContain('reference image')
  })

  it('변경 내용이 공백뿐이면 기본 인상만 사용한다', () => {
    const p = buildCharacterMainPrompt({ ...base, delta: '   ' })
    expect(p).not.toContain('requested changes')
  })
})
