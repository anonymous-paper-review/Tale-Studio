// 인물 외형 설명은 올바른 내용만 저장하고, 비어 있거나 너무 길면 받지 않는다
import { describe, it, expect } from 'vitest'
import {
  validateAppearancePatch,
  APPEARANCE_MAX_LENGTH,
} from '@/lib/artist/appearance-patch'

describe('외형 설명 입력 규칙 (C3 F6)', () => {
  it('앞뒤 빈칸이 있는 올바른 외형 설명을 넣으면 빈칸을 정리해 저장한다', () => {
    const r = validateAppearancePatch({ appearance: '  붉은 머리, 허리에 칼  ' })
    expect(r).toEqual({ ok: true, appearance: '붉은 머리, 허리에 칼' })
  })

  it('외형 설명이 글이 아니거나 없으면 받지 않는다', () => {
    expect(validateAppearancePatch({ appearance: 123 }).ok).toBe(false)
    expect(validateAppearancePatch({}).ok).toBe(false)
    expect(validateAppearancePatch({ appearance: null }).ok).toBe(false)
  })

  it('외형 설명이 비어 있으면 받지 않는다', () => {
    expect(validateAppearancePatch({ appearance: '' }).ok).toBe(false)
    expect(validateAppearancePatch({ appearance: '   ' }).ok).toBe(false)
  })

  it('외형 설명이 정한 글자 수를 넘으면 받지 않는다', () => {
    const tooLong = 'a'.repeat(APPEARANCE_MAX_LENGTH + 1)
    const r = validateAppearancePatch({ appearance: tooLong })
    expect(r.ok).toBe(false)
  })

  it('외형 설명이 정한 글자 수까지면 받는다', () => {
    const atLimit = 'a'.repeat(APPEARANCE_MAX_LENGTH)
    expect(validateAppearancePatch({ appearance: atLimit }).ok).toBe(true)
  })

  it('외형 설명을 담은 내용이 올바른 형태가 아니면 받지 않는다', () => {
    expect(validateAppearancePatch(null).ok).toBe(false)
    expect(validateAppearancePatch('x').ok).toBe(false)
  })
})
