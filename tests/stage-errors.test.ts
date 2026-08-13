import { describe, it, expect } from 'vitest'
import {
  classifyStageError,
  shouldAutoRetry,
  AUTO_RETRY_PER_STAGE,
  NET_RETRY_CAP,
  netBackoffMs,
} from '@/lib/writer/pipeline/stage-errors'

// #stage-retry (2026-08-13, 오너 정책) — 계약: 일시 오류는 자동 1회 재시도 후 표면화('이어서
// 재시도' 버튼), 결정 오류는 재시도 없이 즉시 표면화. 분류 기본값은 transient — 오분류의
// 대가가 "1회 낭비"로 상한이 있는 쪽으로 기운다.

describe('classifyStageError', () => {
  it('network — 429/타임아웃/네트워크/5xx 는 예산 무차감 재시도 클래스 (오너 정책 확장)', () => {
    for (const msg of [
      '429 Too Many Requests',
      'Resource has been exhausted (e.g. check quota).', // 프로바이더 rate limit — quota 단어에 낚이면 안 된다
      'fetch failed',
      'socket hang up',
      'The operation timed out',
      'ECONNRESET',
      '503 Service Unavailable',
      'model is overloaded',
    ]) {
      expect(classifyStageError(new Error(msg)), msg).toBe('network')
    }
  })

  it('LLM 출력 형태 실패(JSON/계약)는 transient — 재샘플이 고칠 수 있다', () => {
    expect(classifyStageError(new Error('Unexpected token < in JSON at position 0'))).toBe(
      'transient',
    )
    expect(classifyStageError(new Error('repairJson: unrecoverable'))).toBe('transient')
  })

  it('결정 오류 — DB 제약/권한/결제/모더레이션은 permanent', () => {
    for (const msg of [
      // F5-R2 인계철선이 여기로 온다 — 재시도로 문지르면 F-005 재연.
      'shots insert failed: new row for relation "shots" violates check constraint "shots_prompt_not_blanked"',
      'duplicate key value violates unique constraint "shots_project_id_shot_id_key"',
      'permission denied for table shots',
      'new row violates row-level security policy',
      'Invalid API key provided',
      'insufficient credit balance',
      'blocked by content policy: moderation',
    ]) {
      expect(classifyStageError(new Error(msg)), msg).toBe('permanent')
    }
  })

  it('모르는 오류는 transient — 1회 재시도 후 표면화 (비용 상한 있음)', () => {
    expect(classifyStageError(new Error('something inexplicable'))).toBe('transient')
    expect(classifyStageError('string error')).toBe('transient')
  })
})

describe('shouldAutoRetry — 오너 정책: transient 만 예산 1회 (network 는 별도 무차감 경로)', () => {
  const transient = new Error('Unexpected token < in JSON')
  const network = new Error('fetch failed')
  const permanent = new Error('violates check constraint')

  it('transient 첫 시도(count=1) 실패는 자동 재시도한다', () => {
    expect(shouldAutoRetry(transient, 1)).toBe(true)
  })

  it('두 번째(count=2)부터는 표면화 — resume 버튼이 사람 방아쇠', () => {
    expect(shouldAutoRetry(transient, 1 + AUTO_RETRY_PER_STAGE)).toBe(false)
  })

  it('permanent 는 첫 시도도 재시도하지 않는다', () => {
    expect(shouldAutoRetry(permanent, 1)).toBe(false)
  })

  it('network 는 이 예산 경로가 아니다 — 러너의 무차감 경로(캡 소진 후엔 즉시 표면화)', () => {
    expect(shouldAutoRetry(network, 1)).toBe(false)
  })
})

describe('network 무차감 재시도 파라미터', () => {
  it('안전핀 캡은 양수, 백오프는 지수 증가 후 15s 상한', () => {
    expect(NET_RETRY_CAP).toBeGreaterThan(0)
    expect(netBackoffMs(1)).toBe(2_000)
    expect(netBackoffMs(2)).toBe(4_000)
    expect(netBackoffMs(4)).toBe(15_000) // 16s → 상한 클램프
    expect(netBackoffMs(NET_RETRY_CAP)).toBe(15_000)
  })
})
