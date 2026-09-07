import { describe, it, expect } from 'vitest'
import {
  validateAppearancePatch,
  APPEARANCE_MAX_LENGTH,
} from '@/lib/artist/appearance-patch'

describe('validateAppearancePatch — C3 F6 승인 경로 서버 검증', () => {
  it('유효한 외형 문자열 → ok + trim', () => {
    const r = validateAppearancePatch({ appearance: '  붉은 머리, 허리에 칼  ' })
    expect(r).toEqual({ ok: true, appearance: '붉은 머리, 허리에 칼' })
  })

  it('문자열 아님/누락 → 거부', () => {
    expect(validateAppearancePatch({ appearance: 123 }).ok).toBe(false)
    expect(validateAppearancePatch({}).ok).toBe(false)
    expect(validateAppearancePatch({ appearance: null }).ok).toBe(false)
  })

  it('빈 문자열/공백만 → 거부(외형 비우기는 이 경로로 불가)', () => {
    expect(validateAppearancePatch({ appearance: '' }).ok).toBe(false)
    expect(validateAppearancePatch({ appearance: '   ' }).ok).toBe(false)
  })

  it('최대 길이 초과 → 거부', () => {
    const tooLong = 'a'.repeat(APPEARANCE_MAX_LENGTH + 1)
    const r = validateAppearancePatch({ appearance: tooLong })
    expect(r.ok).toBe(false)
  })

  it('최대 길이 경계는 통과', () => {
    const atLimit = 'a'.repeat(APPEARANCE_MAX_LENGTH)
    expect(validateAppearancePatch({ appearance: atLimit }).ok).toBe(true)
  })

  it('body 자체가 객체 아님 → 거부', () => {
    expect(validateAppearancePatch(null).ok).toBe(false)
    expect(validateAppearancePatch('x').ok).toBe(false)
  })
})
