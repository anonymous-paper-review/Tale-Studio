// ⌘/Ctrl 를 누르고 있는 동안 콘티 카드에 "⌘/Ctrl+클릭 멘션" 표시가 Producer 카드처럼 나오고, 이벤트를 받을 수 없는 화면에서도 오류 없이 꺼져 있는지 검사한다 (D9 오너 2026-11-22)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { subscribeModifierHeld } from '@/hooks/use-modifier-held'
import { MentionHint } from '@/features/writer/mention-hint'

/** 키 · 창 이벤트를 흉내 내는 대상 — 붙인 듣개를 직접 부른다. */
function fakeWindow() {
  const listeners = new Map<string, Set<(event: Partial<KeyboardEvent>) => void>>()
  return {
    addEventListener: (type: string, fn: (event: Partial<KeyboardEvent>) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    removeEventListener: (type: string, fn: (event: Partial<KeyboardEvent>) => void) => listeners.get(type)?.delete(fn),
    fire: (type: string, event: Partial<KeyboardEvent> = {}) => listeners.get(type)?.forEach((fn) => fn(event)),
    count: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
  }
}

describe('⌘/Ctrl 를 누르고 있음 표시', () => {
  it('⌘ 나 Ctrl 를 누르고 있는 동안만 누르고 있음 표시가 켜지고, 떼거나 창을 떠나면 꺼진다', () => {
    // 왜: 정상 경로 고정 — Producer 카드가 쓰던 표시 규칙 그대로(창을 떠나면 keyup 이 오지 않아 blur 로 끈다).
    const target = fakeWindow()
    const held = vi.fn()
    const stop = subscribeModifierHeld(target as unknown as Window, held)
    target.fire('keydown', { metaKey: true, ctrlKey: false })
    expect(held).toHaveBeenLastCalledWith(true)
    target.fire('keyup', { metaKey: false, ctrlKey: false })
    expect(held).toHaveBeenLastCalledWith(false)
    target.fire('keydown', { metaKey: false, ctrlKey: true })
    target.fire('blur')
    expect(held).toHaveBeenLastCalledWith(false)
    stop()
    expect(target.count()).toBe(0)
  })

  it('이벤트를 받을 수 없는 화면에서도 누르고 있음 표시는 꺼진 채 오류가 나지 않는다', () => {
    // 왜(리드 2026-11-22): 화면을 서버에서 그리거나 창 흉내가 덜 된 곳(시험 화면)에서 표시 하나 때문에 화면 전체가 깨지면 안 된다.
    const held = vi.fn()
    expect(() => subscribeModifierHeld({} as unknown as Window, held)()).not.toThrow()
    expect(() => subscribeModifierHeld(undefined, held)()).not.toThrow()
    expect(held).not.toHaveBeenCalled()
  })

  it('⌘/Ctrl 를 누르고 있으면 콘티 카드에 "⌘/Ctrl+클릭 멘션" 표시가 나오고, 붙은 카드에는 "멘션 해제"가 나온다', () => {
    // 왜: D9 "모든 탭에서 같게" — Producer 카드와 같은 표시(오른쪽 위 알약 · 붙이기 커서)로 이 조작을 알아보게 한다.
    expect(renderToStaticMarkup(createElement(MentionHint, { armed: true, mentioned: false }))).toMatch(/opacity-100[^>]*>.*⌘\/Ctrl\+클릭 멘션</)
    expect(renderToStaticMarkup(createElement(MentionHint, { armed: true, mentioned: true }))).toContain('⌘/Ctrl+클릭 멘션 해제')
    expect(renderToStaticMarkup(createElement(MentionHint, { armed: false, mentioned: false }))).not.toContain('opacity-100')
    const board = readFileSync('src/features/writer/rough-storyboard-view.tsx', 'utf8')
    expect(board).toMatch(/const mentionArmed = useModifierHeld\(\)/)
    expect(board).toMatch(/<MentionHint armed=\{mentionArmed\} mentioned=\{mentionedRefs\.includes\(contiMentionRef\('shot', shot\.shotId\)\)\} \/>/)
  })
})
