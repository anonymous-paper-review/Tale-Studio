// 비밀번호 입력 중 대문자 잠금이 켜져 있으면 알아보기 쉽게 알려 준다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/app/login/page.tsx', 'utf8')

describe('로그인 비밀번호 Caps Lock 안내', () => {
  it('비밀번호를 입력할 때 대문자 잠금 상태를 알려 주고 입력을 벗어나면 안내를 숨긴다', () => {
    expect(source).toContain("e.getModifierState('CapsLock')")
    expect(source).toContain('onKeyDown={updateCapsLockState}')
    expect(source).toContain('onKeyUp={updateCapsLockState}')
    expect(source).toContain('onBlur={() => setCapsLockOn(false)}')
    // 문구는 영어 원문(마케팅·인증 화면은 영어 고정, #i18n-s5) — 존재 여부만 계약.
    expect(source).toContain('Caps Lock is on')
    expect(source).toContain("aria-describedby={capsLockOn ? 'caps-lock-hint' : undefined}")
  })
})
