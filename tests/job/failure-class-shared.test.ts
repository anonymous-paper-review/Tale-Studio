// 생성 실패 글을 가르는 규칙(내용 검사 · 잔액 · 일시 장애 …)은 서버 전용 파일에 묶이지 않은 공용 파일에 있고, 서버는 그 규칙을 그대로 쓴다
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

import { classifyFalFailure as sharedClassifyFalFailure, classifyJobError as sharedClassifyJobError } from '@/lib/fal/failure-class'
import { classifyFalFailure, classifyJobError } from '@/lib/generation-jobs'

describe('실패 글 분류 규칙의 자리', () => {
  it('실패 글 분류 규칙은 화면 코드도 가져다 쓸 수 있게 서버 전용 파일을 끌어오지 않는다', () => {
    // 왜: 화면(러프 알림)이 서버가 쓰는 것과 같은 규칙으로 내용 검사 실패를 가려야 안전 모드 판단과 안내가 어긋나지 않는다.
    //   그런데 generation-jobs 는 서비스 키 클라이언트를 끌어와 화면 번들에 들어가면 빌드가 깨진다.
    const source = readFileSync('src/lib/fal/failure-class.ts', 'utf8')
    expect(source).not.toMatch(/from '@\/lib\/supabase\/admin'/)
    expect(source).not.toMatch(/from '@\/lib\/generation-jobs'/)
    expect(source).not.toMatch(/server-only/)
  })

  it('서버의 분류 함수는 공용 파일의 같은 규칙이다', () => {
    // 왜: 두 군데에 규칙이 있으면 한쪽만 고쳐 화면과 서버가 같은 실패를 다르게 부른다.
    expect(classifyJobError).toBe(sharedClassifyJobError)
    expect(classifyFalFailure).toBe(sharedClassifyFalFailure)
  })

  it('분류 결과는 옮기기 전과 같다', () => {
    // 왜: 정상 경로 고정 — 규칙을 옮기다 우선순위가 바뀌면 안전 모드 재시도와 포기 횟수 계산이 달라진다.
    expect(classifyJobError('[moderation] content_policy_violation')).toBe('moderation')
    expect(classifyJobError('image too small — blank/moderated')).toBe('moderation_soft')
    expect(classifyJobError('fal 잔액 소진')).toBe('billing')
    expect(classifyJobError('status=503 overloaded')).toBe('provider')
    expect(classifyJobError('stale queued reaped: manual cleanup')).toBe('infra')
    expect(classifyJobError('')).toBe('unknown')
    expect(classifyFalFailure('NSFW content flagged')).toBe('moderation')
    expect(classifyFalFailure('timeout')).toBe('generic')
  })
})
