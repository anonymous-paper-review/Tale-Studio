// 채팅 밖의 단추 · 누를 수 있는 줄 · 입력칸에서 누른 Enter 가 채팅 제안 카드(돈 드는 다시 그리기 · 단계 넘김)를 누르지 않는지 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { enterBelongsToPage, PAGE_INTERACTIVE_SELECTOR } from '@/lib/chat-enter-key'

/** closest() 만 흉내 낸 요소 — 채팅 패널 안인지 · 누를 수 있는 요소 안인지 두 가지만 답한다. */
function element({ interactive, inChat }: { interactive: boolean; inChat: boolean }) {
  return {
    closest: (selector: string) => (selector === '[data-chat-panel]' ? (inChat ? {} : null) : selector === PAGE_INTERACTIVE_SELECTOR && interactive ? {} : null),
  }
}

describe('채팅 제안 카드의 Enter', () => {
  // 왜: 2026-11-01 리뷰 M2 — 채팅은 제안 카드가 떠 있으면 화면 어디서 누른 Enter 든 가로채 카드를 눌렀다. 대사 줄 · 보드 카드 · 입력칸에서 친 Enter 가
  //   돈 드는 [러프 다시 그리기]나 단계 넘김을 눌렀다(Dialogue 탭 줄 고치기도 Enter 를 쓴다).
  it('채팅 밖의 단추 · 누를 수 있는 줄 · 링크 · 입력칸에서 Enter를 누르면 채팅 제안 카드를 누르지 않는다', () => {
    expect(enterBelongsToPage(element({ interactive: true, inChat: false }))).toBe(true)
    for (const token of ['button', '[role="button"]', 'a[href]', 'input', 'textarea', 'select', '[contenteditable="true"]']) {
      expect(PAGE_INTERACTIVE_SELECTOR).toContain(token)
    }
    const chat = readFileSync('src/components/layout/global-chat.tsx', 'utf8')
    expect(chat).toMatch(/if \(enterBelongsToPage\(target\)\) return/)
  })

  // 왜: 키보드만으로 넘김 · 승인을 받는 약속(#keyboard-only 2026-08-11)은 그대로 — 채팅 입력칸이나 화면 빈 곳의 Enter 는 지금처럼 카드를 누른다.
  it('채팅 입력칸이 비었거나 화면 빈 곳에서 Enter를 누르면 지금처럼 채팅 제안 카드를 누른다', () => {
    expect(enterBelongsToPage(element({ interactive: true, inChat: true }))).toBe(false)
    expect(enterBelongsToPage(element({ interactive: false, inChat: false }))).toBe(false)
    expect(enterBelongsToPage(null)).toBe(false)
  })
})
