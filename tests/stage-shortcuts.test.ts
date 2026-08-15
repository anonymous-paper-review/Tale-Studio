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
  it('Alt + 1~5 가 STAGES 순서와 1:1 로 대응한다 (넘패드 포함)', () => {
    const got = STAGES.map((s) => stageForShortcut(ev(`Digit${STAGE_ACCESS_KEY[s.id]}`, { altKey: true })))
    expect(got).toEqual(STAGES.map((s) => s.id))
    const numpad = STAGES.map((s) => stageForShortcut(ev(`Numpad${STAGE_ACCESS_KEY[s.id]}`, { altKey: true })))
    expect(numpad).toEqual(STAGES.map((s) => s.id))
  })

  it('모디파이어가 없으면 발화하지 않는다 (그냥 타이핑)', () => {
    expect(stageForShortcut(ev('Digit2'))).toBeNull()
  })

  it('Ctrl/Cmd/Shift 가 섞이면 양보한다 — 브라우저·선택 조작의 몫', () => {
    expect(stageForShortcut(ev('Digit2', { altKey: true, ctrlKey: true }))).toBeNull()
    expect(stageForShortcut(ev('Digit2', { altKey: true, metaKey: true }))).toBeNull()
    expect(stageForShortcut(ev('Digit2', { altKey: true, shiftKey: true }))).toBeNull()
    expect(stageForShortcut(ev('Digit2', { metaKey: true }))).toBeNull()
  })

  it('할당되지 않은 키는 무시한다', () => {
    expect(stageForShortcut(ev('KeyA', { altKey: true }))).toBeNull()
    expect(stageForShortcut(ev('KeyQ', { altKey: true }))).toBeNull() // 구 배열 폐기 확인
    expect(stageForShortcut(ev('Digit6', { altKey: true }))).toBeNull()
  })

  it('e.key 가 아니라 code 로 판정 — macOS 의 Option+숫자(¡™£…)도 잡힌다', () => {
    // 실제 이벤트에서 key 는 '¡' 등으로 오지만 code 는 물리 위치라 변하지 않는다.
    expect(stageForShortcut(ev('Digit1', { altKey: true }))).toBe('producer')
    expect(stageForShortcut(ev('Digit3', { altKey: true }))).toBe('artist')
  })
})

describe('accessModifierLabel', () => {
  it('macOS 는 Option, 나머지는 Alt 로 표기', () => {
    expect(accessModifierLabel('MacIntel')).toBe('Option')
    expect(accessModifierLabel('iPhone')).toBe('Option')
    expect(accessModifierLabel('Win32')).toBe('Alt')
    expect(accessModifierLabel('Linux x86_64')).toBe('Alt')
  })
})
