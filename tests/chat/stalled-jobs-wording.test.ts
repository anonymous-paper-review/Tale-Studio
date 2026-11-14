// Lumi 에게 가는 도구 안내가 10분 넘게 멈춘 작업을 "실패"나 "대기"가 아니라 "멈춘 작업 N개"로 말하라고 알린다
import { expect, it } from 'vitest'
import { CHAT_TOOL_GUIDE } from '@/lib/chat-tools/protocol'

it('Lumi 에게 가는 도구 안내가 멈춘 작업 수(stale_count)를 실패나 대기로 말하지 말고 멈춘 작업으로 말하라고 알린다', () => {
  // 왜: 현황의 stale_count 키만으로는 모델이 뜻을 못 맞춰, 멈춘 그림을 "대기 0 · 실패 1"로 틀리게 말할 수 있다(2026-11-14 오너).
  expect(CHAT_TOOL_GUIDE).toMatch(/stale_count/)
  expect(CHAT_TOOL_GUIDE).toMatch(/stalled jobs?/i)
  expect(CHAT_TOOL_GUIDE).toMatch(/never (call|say)[^.]*(failed|queued)/i)
  // 실패(failed_count)는 실패한 작업만이다.
  expect(CHAT_TOOL_GUIDE).toMatch(/failed_count[^.]*failed jobs only/i)
})
