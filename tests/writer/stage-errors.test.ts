// 일시적인 문제는 한 번 다시 시도하고, 결정적인 문제는 이유를 바로 알려준다 (#stage-retry 2026-08-13, 오너 정책)
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
  it('일시적인 연결 문제나 한도 초과·서버 오류는 비용을 쓰지 않고 다시 시도한다 (오너 정책 확장)', () => {
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

  it('답변 형식이 잘못되면 일시적인 문제로 보고 다시 요청한다', () => {
    expect(classifyStageError(new Error('Unexpected token < in JSON at position 0'))).toBe(
      'transient',
    )
    expect(classifyStageError(new Error('repairJson: unrecoverable'))).toBe('transient')
  })

  it('권한·결제·내용 제한처럼 해결이 필요한 문제는 바로 실패로 알린다', () => {
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

  it('원인을 모르는 문제도 한 번 다시 시도한 뒤 실패를 알려준다 (비용 상한 있음)', () => {
    expect(classifyStageError(new Error('something inexplicable'))).toBe('transient')
    expect(classifyStageError('string error')).toBe('transient')
  })
})

describe('shouldAutoRetry — 일시적인 문제만 한 번 다시 시도한다 (네트워크 문제는 별도)', () => {
  const transient = new Error('Unexpected token < in JSON')
  const network = new Error('fetch failed')
  const permanent = new Error('violates check constraint')

  it('처음 발생한 일시적인 문제는 자동으로 한 번 다시 시도한다', () => {
    expect(shouldAutoRetry(transient, 1)).toBe(true)
  })

  it('두 번째 실패부터는 사람에게 알리고 다시 시작할 때 판단하게 한다', () => {
    expect(shouldAutoRetry(transient, 1 + AUTO_RETRY_PER_STAGE)).toBe(false)
  })

  it('해결이 필요한 문제는 처음부터 다시 시도하지 않는다', () => {
    expect(shouldAutoRetry(permanent, 1)).toBe(false)
  })

  it('연결 문제는 별도 경로로 다시 시도하고, 정해진 횟수를 넘으면 바로 알린다', () => {
    expect(shouldAutoRetry(network, 1)).toBe(false)
  })
})

describe('네트워크 문제를 다시 시도하는 간격', () => {
  it('다시 시도하는 횟수는 제한하고, 간격은 점점 늘되 최대 15초를 넘기지 않는다', () => {
    expect(NET_RETRY_CAP).toBeGreaterThan(0)
    expect(netBackoffMs(1)).toBe(2_000)
    expect(netBackoffMs(2)).toBe(4_000)
    expect(netBackoffMs(4)).toBe(15_000) // 16s → 상한 클램프
    expect(netBackoffMs(NET_RETRY_CAP)).toBe(15_000)
  })
})
