// 생성 서비스의 실패 사유를 헷갈리지 않게 구분해 알맞게 안내한다
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

describe('실패 사유를 분류할 때의 경계 상황', () => {
  it('차단을 뜻하는 단어가 단독으로 있을 때만 콘텐츠 정책 문제로 분류한다', () => {
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

  it('콘텐츠 정책의 표기 방식과 대소문자가 달라도 같은 문제로 분류한다', () => {
    expectClassifications([
      { message: 'content-policy from fal', expected: 'moderation' },
      { message: 'content_policy from fal', expected: 'moderation' },
      { message: 'content policy rejected the prompt', expected: 'moderation' },
      { message: 'CONTENT POLICY rejected the prompt', expected: 'moderation' },
      { message: 'contentpolicy matcher rejected the prompt', expected: 'moderation' },
    ])
  })

  it('정책 위반이나 허용되지 않음을 나타내면 콘텐츠 정책 문제로 분류한다', () => {
    expectClassifications([
      { message: 'policy violation detected', expected: 'moderation' },
      { message: 'the prompt violates provider guidance', expected: 'moderation' },
      { message: 'provider reported violating content', expected: 'moderation' },
      { message: 'request was disallowed by the model', expected: 'moderation' },
      { message: 'asset was DISALLOWLISTED by provider rules', expected: 'moderation' },
    ])
  })

  it('네트워크나 서버 같은 일반 오류는 콘텐츠 정책 문제로 잘못 보지 않는다', () => {
    expectClassifications([
      { message: 'fal webhook reported ERROR', expected: 'generic' },
      { message: 'network timeout after 120 seconds', expected: 'generic' },
      { message: 'provider returned 500 internal server error', expected: 'generic' },
      { message: 'no image url in webhook payload', expected: 'generic' },
      { message: 'rate limit exceeded while polling request', expected: 'generic' },
      { message: 'queue worker restarted before result persisted', expected: 'generic' },
    ])
  })

  it('오류 내용이 비어 있거나 특수 문자와 긴 문장을 포함해도 일관되게 분류한다', () => {
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
