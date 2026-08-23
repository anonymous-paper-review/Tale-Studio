import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/app/login/page.tsx', 'utf8')

describe('로그인 비밀번호 Caps Lock 안내', () => {
  it('키 입력에서 CapsLock 상태를 읽고, 꺼짐과 blur 때 안내를 숨긴다', () => {
    expect(source).toContain("e.getModifierState('CapsLock')")
    expect(source).toContain('onKeyDown={updateCapsLockState}')
    expect(source).toContain('onKeyUp={updateCapsLockState}')
    expect(source).toContain('onBlur={() => setCapsLockOn(false)}')
    // 문구는 영어 원문(마케팅·인증 화면은 영어 고정, #i18n-s5) — 존재 여부만 계약.
    expect(source).toContain('Caps Lock is on')
    expect(source).toContain("aria-describedby={capsLockOn ? 'caps-lock-hint' : undefined}")
  })
})
