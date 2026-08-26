import { describe, expect, it } from 'vitest'
import { buildChatTrace, totalInputTokens } from '@/lib/chat-trace'

describe('chat trace', () => {
  it('keeps request shape separate from provider usage', () => {
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

  it('provides safe zero usage when a mocked LLM does not report metadata', () => {
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
