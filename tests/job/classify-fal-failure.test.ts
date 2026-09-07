import { describe, it, expect } from 'vitest'
import { classifyFalFailure } from '@/lib/generation-jobs'

// fal 실패 분류(best-effort): 모더레이션/콘텐츠정책류 → 'moderation'(safe-mode 재시도 자격),
//   그 외/불명 → 'generic'(원본 프롬프트 재시도, 안전 측).
describe('classifyFalFailure', () => {
  it('모더레이션/콘텐츠정책 키워드 → moderation', () => {
    for (const msg of [
      'Response was blocked due to content policy',
      'content_policy_violation',
      'flagged by moderation',
      'image blocked: safety system',
      'NSFW content prohibited',
      'request flagged',
      'disallowed content',
    ]) {
      expect(classifyFalFailure(msg)).toBe('moderation')
    }
  })

  it('일반 에러 → generic', () => {
    for (const msg of [
      'fal webhook reported ERROR',
      'network timeout',
      'internal server error 500',
      'no image url in webhook payload',
      'rate limit exceeded',
    ]) {
      expect(classifyFalFailure(msg)).toBe('generic')
    }
  })

  it('null/undefined/빈 문자열 → generic', () => {
    expect(classifyFalFailure(null)).toBe('generic')
    expect(classifyFalFailure(undefined)).toBe('generic')
    expect(classifyFalFailure('')).toBe('generic')
  })

  it('대소문자 무관', () => {
    expect(classifyFalFailure('CONTENT POLICY')).toBe('moderation')
    expect(classifyFalFailure('Blocked')).toBe('moderation')
  })
})
