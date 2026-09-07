// 일시적인 오류는 다시 시도하고 사용 한도 초과는 별도로 센다 (#llm-quota 2026-08-10)
import { describe, expect, it } from 'vitest'
import { isQuotaLlmError, isTransientLlmError, withLlmRetry } from '@/lib/writer/llm/retry'
import { getUsageTotals, resetRawSeq } from '@/lib/writer/llm/raw_collector'

describe('isTransientLlmError가 일시적 오류를 가려내는 약속', () => {
  it('네트워크가 불안정하거나 요청이 몰리면 다시 시도할 오류로 판단한다', () => {
    for (const msg of [
      '[503] Service Unavailable',
      'The model is overloaded. Please try again later.',
      'rate limit exceeded',
      'resource has been exhausted',
      'fetch failed',
      'ECONNRESET',
      'EAI_AGAIN getaddrinfo',
    ]) {
      expect(isTransientLlmError(new Error(msg)), msg).toBe(true)
    }
  })

  it('요청 시간이 초과되거나 중단되면 다시 시도할 오류로 판단한다', () => {
    for (const msg of [
      'This operation was aborted',
      'AbortError: signal timed out',
      'request timed out',
      'Timeout of 120000ms exceeded',
      'deadline exceeded',
    ]) {
      expect(isTransientLlmError(new Error(msg)), msg).toBe(true)
    }
  })

  it('잘못된 요청이나 읽을 수 없는 응답은 다시 시도하지 않고 즉시 실패한다', () => {
    for (const msg of [
      '[400] Invalid argument',
      '[401] API key not valid',
      '[403] Permission denied',
      '[404] models/foo is not found',
      'Unexpected token in JSON at position 0',
    ]) {
      expect(isTransientLlmError(new Error(msg)), msg).toBe(false)
    }
  })
})

// #llm-quota 2026-08-10: 쿼터(429)는 과부하(503)와 갈라져야 한다 — 뭉뚱그리면
//   "한도에 실제로 닿았는지"를 관측할 수 없어 동시 실행 수를 튜닝할 근거가 사라진다.
describe('isQuotaLlmError가 사용 한도 초과를 가려내는 약속', () => {
  it('사용 한도 초과와 일시적인 요청 몰림을 서로 다른 오류로 구분한다', () => {
    for (const msg of [
      '[429] Resource has been exhausted (e.g. check quota).',
      'Quota exceeded for quota metric generate_content_requests',
      'rate limit exceeded',
      'Too Many Requests',
    ]) {
      expect(isQuotaLlmError(new Error(msg)), msg).toBe(true)
    }
    for (const msg of [
      '[503] Service Unavailable',
      'The model is overloaded. Please try again later.',
      'ECONNRESET',
      'deadline exceeded',
    ]) {
      expect(isQuotaLlmError(new Error(msg)), msg).toBe(false)
    }
  })
})

describe('withLlmRetry의 사용 한도 초과 횟수 세기', () => {
  it('사용 한도 초과로 다시 시도한 횟수만 센다', async () => {
    resetRawSeq()
    let calls = 0
    const out = await withLlmRetry(
      async () => {
        calls += 1
        if (calls === 1) throw new Error('[429] Resource has been exhausted')
        if (calls === 2) throw new Error('[503] Service Unavailable')
        return 'ok'
      },
      'test',
      4,
      1, // baseMs — 테스트에서 백오프 대기 최소화
    )
    expect(out).toBe('ok')
    expect(calls).toBe(3)
    expect(getUsageTotals().rateLimitHits).toBe(1)
  })

  it('다시 시도를 모두 써도 사용 한도 초과 횟수를 빠짐없이 센다', async () => {
    resetRawSeq()
    await expect(
      withLlmRetry(
        async () => {
          throw new Error('[429] Quota exceeded for quota metric input tokens per minute')
        },
        'test',
        2,
        1,
      ),
    ).rejects.toThrow(/429/)
    expect(getUsageTotals().rateLimitHits).toBe(2)
  })
})
