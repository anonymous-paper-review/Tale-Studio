// 씬 스토리 확정을 Producer 에서 기다리는 동안 Writer 채팅의 수정 요청은 Producer 로 안내한다 (2026-10-01)
import { expect, it } from 'vitest'
import { writerInputRoute } from '@/lib/chat-harness'

it('씬 스토리 확정을 기다리는 동안 Writer 채팅의 수정 요청은 Producer로 안내한다', () => {
  // 왜: 확정 단계를 Producer 로 옮긴 뒤 Writer 채팅에 쓴 수정 요청이, 아직 씬이 저장되지 않은 Writer 채팅 모델로 가서 헛돌았다.
  expect(writerInputRoute('첫 씬을 두 개로 나눠줘', { running: false, sceneGate: false, gateElsewhere: true })).toBe('elsewhere')
  expect(writerInputRoute('대사를 바꿔줘', { running: false, sceneGate: false, gateElsewhere: true })).toBe('elsewhere')
})

it('씬 스토리 확정을 기다리는 동안에도 Writer 채팅의 상태 질문은 그대로 답한다', () => {
  // 왜: 상태 조회까지 막으면 왜 멈췄는지 물을 길이 없다.
  expect(writerInputRoute('지금 몇 퍼센트야?', { running: false, sceneGate: false, gateElsewhere: true })).toBe('chat')
  expect(writerInputRoute('왜 여기서 멈췄어?', { running: false, sceneGate: false, gateElsewhere: true })).toBe('chat')
})
