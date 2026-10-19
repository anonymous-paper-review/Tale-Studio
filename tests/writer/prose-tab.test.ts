// 리뉴얼 1차: Writer 탭(화면에서 고치기 · 채팅으로 고치기)은 마지막으로 고른 방식을 이어받는다 — Producer 시작 화면에서 고른 것도 (2026-10-19)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readWorkspaceTab, writeWorkspaceTab } from '@/stores/writer-room-store'

let store: Record<string, string>

beforeEach(() => {
  store = {}
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } } })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Writer 탭 기억', () => {
  // 왜: 1안 · 2안을 탭으로 둘 다 둔다(오너 2026-10-19) — 채팅으로 만든 사람은 Writer 도 채팅으로 이어 쓰는 게 자연스럽다.
  it('Producer 시작 화면에서 채팅으로 만들기를 골랐으면 Writer도 채팅으로 고치기 탭으로 연다', () => {
    store['tale.entry.tab.v1'] = 'chat'
    expect(readWorkspaceTab()).toBe('chat')
  })

  // 왜: Writer 에서 직접 바꾼 탭이 시작 화면 기억보다 먼저다.
  it('Writer에서 고른 탭은 다음에도 그대로 연다', () => {
    store['tale.entry.tab.v1'] = 'chat'
    writeWorkspaceTab('screen')
    expect(readWorkspaceTab()).toBe('screen')
  })

  // 왜: Writer 에서 고른 방식은 다음 프로젝트의 시작 화면도 따른다(한 사람의 방식은 하나).
  it('Writer에서 고른 탭은 다음 프로젝트의 Producer 시작 화면 탭도 된다', () => {
    writeWorkspaceTab('chat')
    expect(store['tale.entry.tab.v1']).toBe('chat')
    writeWorkspaceTab('screen')
    expect(store['tale.entry.tab.v1']).toBe('form')
  })

  // 왜: 정상 경로 고정 — 기억이 없으면 화면에서 고치기로 연다.
  it('고른 적이 없으면 화면에서 고치기 탭으로 연다', () => {
    expect(readWorkspaceTab()).toBe('screen')
  })
})
