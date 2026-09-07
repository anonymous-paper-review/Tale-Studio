// 생성 서비스의 실패 사유를 구분해 알맞은 재시도 방법을 선택한다
import { describe, it, expect } from 'vitest'
import { classifyFalFailure } from '@/lib/generation-jobs'

// fal 실패 분류(best-effort): 모더레이션/콘텐츠정책류 → 'moderation'(safe-mode 재시도 자격),
//   그 외/불명 → 'generic'(원본 프롬프트 재시도, 안전 측).
describe('classifyFalFailure', () => {
  it('콘텐츠 정책 위반이나 차단 사유는 일반 오류와 다르게 구분한다', () => {
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

  it('일반적인 네트워크와 서버 문제는 콘텐츠 정책 문제로 잘못 보지 않는다', () => {
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

  it('실패 사유가 없거나 비어 있어도 일반 오류로 구분한다', () => {
    expect(classifyFalFailure(null)).toBe('generic')
    expect(classifyFalFailure(undefined)).toBe('generic')
    expect(classifyFalFailure('')).toBe('generic')
  })

  it('차단과 콘텐츠 정책 표현의 대소문자가 달라도 같은 문제로 구분한다', () => {
    expect(classifyFalFailure('CONTENT POLICY')).toBe('moderation')
    expect(classifyFalFailure('Blocked')).toBe('moderation')
  })
})
