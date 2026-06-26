import { describe, expect, it } from 'vitest'
import { isTransientLlmError } from '@/lib/writer/llm/retry'

describe('isTransientLlmError', () => {
  it('classifies network / overload errors as transient (retryable)', () => {
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

  it('classifies per-request timeout / abort as transient (sleep/stall recovery)', () => {
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

  it('treats permanent errors (4xx / parse) as non-transient (fail fast)', () => {
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
