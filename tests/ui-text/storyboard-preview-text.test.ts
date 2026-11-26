// 공유 미리보기에서 Storyboard 채팅이 답하는 고정 안내가 새 Storyboard(콘티 그림 → [시작] → 실사, 실사 카드는 채팅으로 고치기)를 말하는지 검사한다 (오너 2026-11-26 S4 · O1 · O7, 리드 지시)
import { describe, expect, it } from 'vitest'
import { cannedFor } from '@/lib/demo/canned'

describe('공유 미리보기의 Storyboard 채팅 안내', () => {
  // 왜(리드 지시 · O1): Storyboard 는 더는 씬 구조 · 러프를 고치는 자리가 아니다 — 공유 링크로 본 사람이 이 화면에서 무엇을 하는지 바로 알게.
  it('공유 미리보기의 Storyboard 채팅 고정 안내는 [시작]으로 콘티 그림을 실사로 바꾸고 실사 카드는 채팅으로 고치는 자리라고 말한다', () => {
    expect(cannedFor('writer', 'ko')).toBe('공유 미리보기 모드예요. 실제로는 여기서 [시작]으로 콘티 그림을 실사 그림으로 바꾸고, 실사 카드는 채팅으로 고쳐요.')
    expect(cannedFor('writer', 'en')).toBe('This is a shared preview. In the real project, you turn the rough sketches into real images with Start here, and fix each real card through the chat.')
  })
})
