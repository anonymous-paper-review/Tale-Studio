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

describe('turnaround merge prompt (AC13 — 룩 토대 + 유저 델타)', () => {
  it('델타 없으면 델타 절 미포함(하위호환)', () => {
    const p = buildCharacterMainPrompt(base)
    expect(p).not.toContain('requested changes')
    expect(p).toContain('지아')
    expect(p).toContain('art style: anime')
  })

  it('델타 주면: 룩 토대(스타일/팔레트/외형) 유지 + 델타 절 덮어쓰기로 추가', () => {
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

  it('방향뷰도 델타 + reference 일관성 지시 유지', () => {
    const p = buildCharacterViewPrompt({ ...base, delta: '머리 붉게' }, 'sideLeft')
    expect(p).toContain('머리 붉게')
    expect(p).toContain('identical character')
    expect(p).toContain('reference image')
  })

  it('공백만인 델타는 무시', () => {
    const p = buildCharacterMainPrompt({ ...base, delta: '   ' })
    expect(p).not.toContain('requested changes')
  })
})
