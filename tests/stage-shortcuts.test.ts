import { describe, it, expect } from 'vitest'
import {
  STAGE_ACCESS_KEY,
  accessModifierLabel,
  stageForShortcut,
} from '@/lib/stage-shortcuts'
import { STAGES } from '@/lib/constants'

// #keyboard-only — 스테이지 전환 단축키의 계약.
// 핵심: 모디파이어는 Alt 단독일 때만 발화한다. Ctrl/Cmd 조합을 먹으면 브라우저 예약 가속키
// (Cmd+W=탭 닫기 등)와 경쟁하는 것처럼 보이는데, 실제로는 못 막으면서 오동작만 남는다.

const ev = (code: string, mods: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey', boolean>> = {}) => ({
  code,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
})

describe('stageForShortcut', () => {
  it('Alt + Q/W/E/R/T 가 STAGES 순서와 1:1 로 대응한다', () => {
    const got = STAGES.map((s) => stageForShortcut(ev(`Key${STAGE_ACCESS_KEY[s.id]}`, { altKey: true })))
    expect(got).toEqual(STAGES.map((s) => s.id))
  })

  it('모디파이어가 없으면 발화하지 않는다 (그냥 타이핑)', () => {
    expect(stageForShortcut(ev('KeyW'))).toBeNull()
  })

  it('Ctrl/Cmd/Shift 가 섞이면 양보한다 — 브라우저·선택 조작의 몫', () => {
    expect(stageForShortcut(ev('KeyW', { altKey: true, ctrlKey: true }))).toBeNull()
    expect(stageForShortcut(ev('KeyW', { altKey: true, metaKey: true }))).toBeNull()
    expect(stageForShortcut(ev('KeyW', { altKey: true, shiftKey: true }))).toBeNull()
    expect(stageForShortcut(ev('KeyW', { metaKey: true }))).toBeNull()
  })

  it('할당되지 않은 키는 무시한다', () => {
    expect(stageForShortcut(ev('KeyA', { altKey: true }))).toBeNull()
    expect(stageForShortcut(ev('Digit1', { altKey: true }))).toBeNull()
  })

  it('e.key 가 아니라 code 로 판정 — macOS 의 Option+Q(œ)·Option+E(죽은 키)도 잡힌다', () => {
    // 실제 이벤트에서 key 는 'œ'/'´' 로 오지만 code 는 물리 위치라 변하지 않는다.
    expect(stageForShortcut(ev('KeyQ', { altKey: true }))).toBe('producer')
    expect(stageForShortcut(ev('KeyE', { altKey: true }))).toBe('artist')
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
