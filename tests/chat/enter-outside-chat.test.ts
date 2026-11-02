// 포커스된 단추 · 누를 수 있는 줄 · 입력칸에서 누른 Enter 가 채팅 제안 카드(돈 드는 다시 그리기 · 단계 넘김)를 누르지 않고 그 요소의 일을 하는지 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { enterBelongsToElement, PAGE_INTERACTIVE_SELECTOR } from '@/lib/chat-enter-key'

/** closest() 만 흉내 낸 요소 — 누를 수 있는 요소 안인지만 답한다. */
function element({ interactive }: { interactive: boolean }) {
  return { closest: (selector: string) => (selector === PAGE_INTERACTIVE_SELECTOR && interactive ? {} : null) }
}
const chatInput = element({ interactive: true })
const chat = readFileSync('src/components/layout/global-chat.tsx', 'utf8')

describe('채팅 제안 카드의 Enter', () => {
  // 왜: 2026-11-01 리뷰 M2 — 채팅은 제안 카드가 떠 있으면 화면 어디서 누른 Enter 든 가로채 카드를 눌렀다. 대사 줄 · 보드 카드 · 입력칸에서 친 Enter 가
  //   돈 드는 [러프 다시 그리기]나 단계 넘김을 눌렀다(Dialogue 탭 줄 고치기도 Enter 를 쓴다).
  it('채팅 밖의 단추 · 누를 수 있는 줄 · 링크 · 입력칸에서 Enter를 누르면 채팅 제안 카드를 누르지 않는다', () => {
    expect(enterBelongsToElement(element({ interactive: true }), chatInput)).toBe(true)
    for (const token of ['button', '[role="button"]', 'a[href]', 'input', 'textarea', 'select', '[contenteditable="true"]']) {
      expect(PAGE_INTERACTIVE_SELECTOR).toContain(token)
    }
    // Enter 만 양보한다 — Esc(나중에)는 지금처럼 어디서 눌러도 카드를 내린다(돈이 들지 않는다).
    expect(chat).toMatch(/if \(e\.key === 'Enter' && enterBelongsToElement\(target, textareaRef\.current\)\) return/)
  })

  // 왜: 2026-11-02 리뷰 M2b — 채팅 패널 안은 통째로 빠져 있어, Tab 으로 [나중에] · [다시 열기] · [취소]에 가서 Enter 를 쳐도
  //   그 단추 대신 돈 드는 [러프 다시 그리기]가 눌렸다. 채팅 안의 단추도 포커스된 단추면 Enter 는 그 단추의 것이다.
  it('채팅 안의 단추([나중에] · [다시 열기] · [취소])에서 Enter를 누르면 그 단추가 눌리고 채팅 제안 카드는 누르지 않는다', () => {
    const laterButton = element({ interactive: true })
    expect(enterBelongsToElement(laterButton, chatInput)).toBe(true)
    expect(readFileSync('src/lib/chat-enter-key.ts', 'utf8')).not.toContain('[data-chat-panel]')
  })

  // 왜: 키보드만으로 넘김 · 승인을 받는 약속(#keyboard-only 2026-08-11)은 그대로 — 채팅 입력칸이나 아무것도 고르지 않은 곳의 Enter 는 지금처럼 카드를 누른다.
  it('채팅 입력칸이 비었거나 화면 빈 곳에서 Enter를 누르면 지금처럼 채팅 제안 카드를 누른다', () => {
    expect(enterBelongsToElement(chatInput, chatInput)).toBe(false)
    expect(enterBelongsToElement(element({ interactive: false }), chatInput)).toBe(false)
    expect(enterBelongsToElement(null, chatInput)).toBe(false)
  })
})
