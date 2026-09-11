// 대화 문맥은 현재 요청과 승인·보류 상태를 구분하고 과거 발화의 단계 정보를 유지한다
import { expect, it } from 'vitest'
import { buildChatTaskContext, normalizeChatHistory } from '@/lib/chat-harness'
import { summarizeChatUsage } from '@/lib/chat-trace'

it('이전 단계의 발화는 누가 한 말인지 유지하며 원래 대화를 바꾸지 않는다', () => {
  // 왜: Producer의 과거 제안을 현재 Writer의 확정 상태로 오인하지 않도록 출처를 남긴다.
  const history = [{ stage: 'producer', role: 'model', content: '일본어를 제안해요.' }, { stage: 'writer', role: 'user', content: '한국어로 바꿔줘' }]
  const before = structuredClone(history)
  expect(normalizeChatHistory(history)).toEqual([{ role: 'model', content: '[Producer] 일본어를 제안해요.' }, { role: 'user', content: '[Writer] 한국어로 바꿔줘' }])
  expect(history).toEqual(before)
})
it('승인 대기와 보류 작업은 구분해서 전달하고 실행 권한으로 취급하지 않는다', () => {
  // 왜: 최근 대화 밖으로 밀려난 승인 상태도 조회·편집 판단에서 보존해야 한다.
  const state = { pending: [{ id: 'p', stage: 'producer', target: '대사 언어', action: '한국어로 변경' }], deferred: [{ id: 'd', stage: 'artist', target: '우비', action: '외형 변경' }] }
  const context = buildChatTaskContext(state)
  expect(context).toContain('한국어로 변경')
  expect(context).toContain('외형 변경')
  expect(context).toContain('not authorization')
  expect(context).toContain('deferred')
})
it('요청 비용에는 마지막 답변뿐 아니라 도구 왕복과 실패한 응답의 사용량도 포함한다', () => {
  // 왜: thinking으로 출력 한도에 닿은 실패를 0비용으로 표시하면 모델 비교가 왜곡된다.
  const base = { model: 'claude-opus-4-6', effort: 'high' as const, thinking: 'adaptive' as const, durationMs: 100, inputTokens: 3, outputTokens: 10, cacheReadInputTokens: 30, cacheCreationInputTokens: 20, stopReason: 'tool_use' }
  expect(summarizeChatUsage([base, { ...base, outputTokens: 8192, durationMs: 200, stopReason: 'max_tokens' }])).toMatchObject({ modelCalls: 2, durationMs: 300, inputTokens: 6, outputTokens: 8202, cacheReadInputTokens: 60, cacheCreationInputTokens: 40 })
})
