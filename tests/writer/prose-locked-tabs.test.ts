// 확정한 산문은 고치기 탭 없이 화면 보기로 열고 오른쪽 채팅을 열어 둔다 (2026-10-27 디자이너 QA 1차)
import { describe, expect, it } from 'vitest'
import { proseWorkspaceTab, writerRightChatHidden } from '@/stores/writer-room-store'

describe('확정한 산문의 Writer 탭', () => {
  it('확정한 산문 화면에는 화면에서 고치기 · 채팅으로 고치기 탭이 없고 오른쪽 채팅이 열린다', () => {
    // 왜: 잠긴 산문인데 '화면/채팅으로 고치기' 탭이 그대로 보였다(디자이너 QA 1차 #09).
    //   마지막으로 고른 탭이 채팅이면 오른쪽 채팅까지 닫혀, 잠긴 Writer에는 쓸 수 있는 채팅이 하나도 없었다.
    expect(proseWorkspaceTab({ tab: 'chat', locked: true })).toEqual({ tab: 'screen', tabsShown: false })
    expect(proseWorkspaceTab({ tab: 'screen', locked: true })).toEqual({ tab: 'screen', tabsShown: false })
    expect(writerRightChatHidden({ tab: 'chat', locked: true })).toBe(false)
    // 고칠 수 있는 산문은 고른 탭 그대로 — 채팅 탭이면 가운데가 채팅이라 오른쪽 채팅을 닫는다.
    expect(proseWorkspaceTab({ tab: 'chat', locked: false })).toEqual({ tab: 'chat', tabsShown: true })
    expect(writerRightChatHidden({ tab: 'chat', locked: false })).toBe(true)
  })
})
