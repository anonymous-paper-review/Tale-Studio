// 숫자 Alt 단축키는 지정된 단계로만 이동하고, 다른 키 조합과 일반 입력은 건드리지 않는다 (#keyboard-only 2026-08-12, Alt+숫자로 이관)
import { describe, it, expect } from 'vitest'
import {
  STAGE_ACCESS_KEY,
  accessModifierLabel,
  stageForShortcut,
} from '@/lib/stage-shortcuts'
import { STAGES } from '@/lib/constants'

// #keyboard-only — 스테이지 전환 단축키의 계약 (2026-08-12 Alt+숫자로 이관).
// 핵심: 모디파이어는 Alt 단독일 때만 발화한다. Ctrl/Cmd+숫자는 브라우저 탭 전환 예약키라
// 확실히 못 가로챈다 — Alt 가 유일하게 안전한 모디파이어다.

const ev = (code: string, mods: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey', boolean>> = {}) => ({
  code,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
})

describe('stageForShortcut', () => {
  it('Alt 숫자 1~5를 누르면 해당 단계로 이동하고 숫자 키패드도 똑같이 동작한다', () => {
    const got = STAGES.map((s) => stageForShortcut(ev(`Digit${STAGE_ACCESS_KEY[s.id]}`, { altKey: true })))
    expect(got).toEqual(STAGES.map((s) => s.id))
    const numpad = STAGES.map((s) => stageForShortcut(ev(`Numpad${STAGE_ACCESS_KEY[s.id]}`, { altKey: true })))
    expect(numpad).toEqual(STAGES.map((s) => s.id))
  })

  it('Alt 없이 숫자를 입력하면 단계 이동 없이 글자로 입력된다', () => {
    expect(stageForShortcut(ev('Digit2'))).toBeNull()
  })

  it('다른 보조 키를 함께 누르면 단계 이동을 가로채지 않는다', () => {
    expect(stageForShortcut(ev('Digit2', { altKey: true, ctrlKey: true }))).toBeNull()
    expect(stageForShortcut(ev('Digit2', { altKey: true, metaKey: true }))).toBeNull()
    expect(stageForShortcut(ev('Digit2', { altKey: true, shiftKey: true }))).toBeNull()
    expect(stageForShortcut(ev('Digit2', { metaKey: true }))).toBeNull()
  })

  it('지정하지 않은 키를 누르면 아무 단계도 열지 않는다', () => {
    expect(stageForShortcut(ev('KeyA', { altKey: true }))).toBeNull()
    expect(stageForShortcut(ev('KeyQ', { altKey: true }))).toBeNull() // 구 배열 폐기 확인
    expect(stageForShortcut(ev('Digit6', { altKey: true }))).toBeNull()
  })

  it('Mac에서 Option과 숫자를 눌러도 해당 단계로 이동한다', () => {
    // 실제 이벤트에서 key 는 '¡' 등으로 오지만 code 는 물리 위치라 변하지 않는다.
    expect(stageForShortcut(ev('Digit1', { altKey: true }))).toBe('producer')
    expect(stageForShortcut(ev('Digit3', { altKey: true }))).toBe('artist')
  })
})

describe('accessModifierLabel', () => {
  it('사용하는 운영체제에 맞는 보조 키 이름을 보여준다', () => {
    expect(accessModifierLabel('MacIntel')).toBe('Option')
    expect(accessModifierLabel('iPhone')).toBe('Option')
    expect(accessModifierLabel('Win32')).toBe('Alt')
    expect(accessModifierLabel('Linux x86_64')).toBe('Alt')
  })
})
