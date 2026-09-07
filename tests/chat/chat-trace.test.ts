// 대화 요청의 길이와 사용량은 기록하되 실제 대화 내용은 남기지 않는다.
import { describe, expect, it } from 'vitest'
import { buildChatTrace, totalInputTokens } from '@/lib/chat-trace'

describe('대화 기록', () => {
  it('대화 요청을 기록할 때 본문은 저장하지 않고 길이와 사용량만 남긴다', () => {
    const trace = buildChatTrace({
      traceId: 'trace-1',
      stage: 'director',
      route: 'director/chat',
      system: 'system',
      history: [{ content: 'past turn' }, { content: 'another turn' }],
      contextMessage: 'canvas\n---\nvertical +2',
      usage: {
        model: 'claude-sonnet-4-6',
        durationMs: 1234.5,
        inputTokens: 120,
        outputTokens: 30,
        cacheReadInputTokens: 400,
        cacheCreationInputTokens: 50,
        stopReason: 'end_turn',
      },
      parseStatus: 'ok',
      rawUpdateCount: 1,
      validUpdateCount: 1,
    })

    expect(trace).toMatchObject({
      traceId: 'trace-1',
      stage: 'director',
      route: 'director/chat',
      historyCount: 2,
      historyChars: 'past turn'.length + 'another turn'.length,
      contextChars: 'canvas\n---\nvertical +2'.length,
      parseStatus: 'ok',
      rawUpdateCount: 1,
      validUpdateCount: 1,
    })
    expect(totalInputTokens(trace)).toBe(570)
    expect(JSON.stringify(trace)).not.toContain('vertical +2')
  })

  it('사용량 정보가 없으면 기본값으로 안전하게 기록하고 대기 중 제안은 비워 둔다', () => {
    const trace = buildChatTrace({
      traceId: 'trace-2',
      stage: 'producer',
      route: 'produce/chat',
      system: 'system',
      history: [],
      contextMessage: 'hello',
    })

    expect(trace.model).toBe('unknown')
    expect(totalInputTokens(trace)).toBe(0)
    expect(trace.pendingProposal).toBeNull()
  })
})
