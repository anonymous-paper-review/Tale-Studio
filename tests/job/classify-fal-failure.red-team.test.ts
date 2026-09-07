import { describe, it, expect } from 'vitest'
import { classifyFalFailure } from '@/lib/generation-jobs'

type FalFailureClass = ReturnType<typeof classifyFalFailure>

function expectClassifications(
  cases: Array<{ message: string | null | undefined; expected: FalFailureClass }>,
): void {
  for (const { message, expected } of cases) {
    expect(classifyFalFailure(message)).toBe(expected)
  }
}

describe('classifyFalFailure red-team boundaries', () => {
  it('honors blocked as a whole word without broad block false positives', () => {
    expectClassifications([
      { message: 'the retry was unblocked by the provider', expected: 'generic' },
      { message: 'queue worker hit a blocker before upload', expected: 'generic' },
      { message: 'blockchain metadata parser failed', expected: 'generic' },
      { message: 'blockedness state transition was inconsistent', expected: 'generic' },
      { message: 'preblocked cache entry expired', expected: 'generic' },
      { message: 'request blocked by provider policy', expected: 'moderation' },
      { message: 'BLOCKED: provider rejected the image', expected: 'moderation' },
    ])
  })

  it('matches content policy separator variants case-insensitively', () => {
    expectClassifications([
      { message: 'content-policy from fal', expected: 'moderation' },
      { message: 'content_policy from fal', expected: 'moderation' },
      { message: 'content policy rejected the prompt', expected: 'moderation' },
      { message: 'CONTENT POLICY rejected the prompt', expected: 'moderation' },
      { message: 'contentpolicy matcher rejected the prompt', expected: 'moderation' },
    ])
  })

  it('matches violat and disallow stems as intentional partial keywords', () => {
    expectClassifications([
      { message: 'policy violation detected', expected: 'moderation' },
      { message: 'the prompt violates provider guidance', expected: 'moderation' },
      { message: 'provider reported violating content', expected: 'moderation' },
      { message: 'request was disallowed by the model', expected: 'moderation' },
      { message: 'asset was DISALLOWLISTED by provider rules', expected: 'moderation' },
    ])
  })

  it('keeps ordinary infrastructure failures generic', () => {
    expectClassifications([
      { message: 'fal webhook reported ERROR', expected: 'generic' },
      { message: 'network timeout after 120 seconds', expected: 'generic' },
      { message: 'provider returned 500 internal server error', expected: 'generic' },
      { message: 'no image url in webhook payload', expected: 'generic' },
      { message: 'rate limit exceeded while polling request', expected: 'generic' },
      { message: 'queue worker restarted before result persisted', expected: 'generic' },
    ])
  })

  it('handles nullish, blank, unicode, symbols, and long messages deterministically', () => {
    const longGenericMessage = `${'transient render retry '.repeat(200)}끝 🚧 500`
    const longModerationMessage = `${'provider detail '.repeat(200)}content-policy 🚫 flagged`

    expectClassifications([
      { message: null, expected: 'generic' },
      { message: undefined, expected: 'generic' },
      { message: '', expected: 'generic' },
      { message: ' \n\t ', expected: 'generic' },
      { message: '서버 오류 🚧 再試行 500 — no usable image URL', expected: 'generic' },
      { message: 'symbols []{}()^$.*+? timeout', expected: 'generic' },
      { message: '🚫 FLAGGED: safety filter rejected 内容', expected: 'moderation' },
      { message: longGenericMessage, expected: 'generic' },
      { message: longModerationMessage, expected: 'moderation' },
    ])
  })
})
