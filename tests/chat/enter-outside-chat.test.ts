// 포커스된 단추 · 누를 수 있는 줄 · 입력칸 · 펼치기 · 메뉴 항목에서 누른 Enter 가 채팅 제안 카드(돈 드는 다시 그리기 · 단계 넘김)를 누르지 않고 그 요소의 일을 하는지 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { enterAcceptsCard } from '@/lib/chat-enter-key'

const body = { tagName: 'BODY' }
const chatInput = { tagName: 'TEXTAREA' }
const focused = (tagName: string) => ({ tagName })
const chat = readFileSync('src/components/layout/global-chat.tsx', 'utf8')

describe('채팅 제안 카드의 Enter', () => {
  // 왜: 2026-11-01 리뷰 M2 — 채팅은 제안 카드가 떠 있으면 화면 어디서 누른 Enter 든 가로채 카드를 눌렀다. 대사 줄 · 보드 카드 · 입력칸에서 친 Enter 가
  //   돈 드는 [러프 다시 그리기]나 단계 넘김을 눌렀다(Dialogue 탭 줄 고치기도 Enter 를 쓴다).
  it('채팅 밖의 단추 · 누를 수 있는 줄 · 링크 · 입력칸에서 Enter를 누르면 채팅 제안 카드를 누르지 않는다', () => {
    for (const tag of ['BUTTON', 'DIV', 'A', 'INPUT', 'TEXTAREA', 'SELECT']) expect(enterAcceptsCard(focused(tag), chatInput)).toBe(false)
    // Enter 만 양보한다 — Esc(나중에)는 지금처럼 어디서 눌러도 카드를 내린다(돈이 들지 않는다).
    expect(chat).toMatch(/if \(e\.key === 'Enter' && !enterAcceptsCard\(target, textareaRef\.current\)\) return/)
  })

  // 왜: 2026-11-02 리뷰 M2b — 채팅 패널 안은 통째로 빠져 있어, Tab 으로 [나중에] · [다시 열기] · [취소]에 가서 Enter 를 쳐도
  //   그 단추 대신 돈 드는 [러프 다시 그리기]가 눌렸다. 채팅 안의 단추도 포커스된 단추면 Enter 는 그 단추의 것이다.
  it('채팅 안의 단추([나중에] · [다시 열기] · [취소])에서 Enter를 누르면 그 단추가 눌리고 채팅 제안 카드는 누르지 않는다', () => {
    expect(enterAcceptsCard(focused('BUTTON'), chatInput)).toBe(false)
    expect(readFileSync('src/lib/chat-enter-key.ts', 'utf8')).not.toContain('[data-chat-panel]')
  })

  // 왜: 2026-11-02 리뷰 3차 M2 — 누를 수 있는 요소 목록으로 고르니 "보류한 작업" 펼치기(<summary>), 채팅 기록 아래 줄, 내보내기 메뉴 항목처럼
  //   목록에 없는 요소의 Enter 가 돈 드는 [러프 다시 그리기]를 눌렀다. 거꾸로 정한다 — 포커스된 요소가 있으면 Enter 는 그 요소의 것이다.
  it('"보류한 작업" 펼치기 · 채팅 기록 아래 줄 · 내보내기 메뉴 항목처럼 포커스된 다른 요소에서 Enter를 누르면 채팅 제안 카드를 누르지 않는다', () => {
    for (const tag of ['SUMMARY', 'DETAILS', 'DIV', 'LI']) expect(enterAcceptsCard(focused(tag), chatInput)).toBe(false)
    expect(readFileSync('src/lib/chat-enter-key.ts', 'utf8')).not.toMatch(/SELECTOR/)
  })

  // 왜: 키보드만으로 넘김 · 승인을 받는 약속(#keyboard-only 2026-08-11)은 그대로 — 채팅 입력칸이나 아무것도 고르지 않은 곳의 Enter 는 지금처럼 카드를 누른다.
  it('채팅 입력칸이 비었거나 화면 빈 곳에서 Enter를 누르면 지금처럼 채팅 제안 카드를 누른다', () => {
    expect(enterAcceptsCard(chatInput, chatInput)).toBe(true)
    expect(enterAcceptsCard(body, chatInput)).toBe(true)
    expect(enterAcceptsCard(null, chatInput)).toBe(true)
  })
})
