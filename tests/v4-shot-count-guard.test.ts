// #p4-json-guard — v4 샷 배열 가드 (Q6 "repairJson 무신호 손실"의 현장).
// ① judgeShotCount 판정 행렬 — 재시도/치명/수용의 경계.
// ② Q6 시나리오 재현 — 잘린 8샷 응답이 repairJson 을 통과해 2샷이 되는 경로가
//    (a) 이제 경고를 남기고 (b) 개수 가드에서 fatal 로 잡히는지.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { judgeShotCount, parseL4Shots } from '@/lib/writer/pipeline/stages/v4_shots'
import { repairJson } from '@/lib/writer/llm/json_repair'

describe('judgeShotCount — 판정 행렬', () => {
  it('정확히 맞으면 ok', () => {
    expect(judgeShotCount(8, 8, { tolerance: 0, isFinalAttempt: false })).toEqual({ kind: 'ok' })
  })

  it('기대치가 없으면(Compact) 항상 ok', () => {
    expect(judgeShotCount(3, null, { tolerance: 0, isFinalAttempt: true })).toEqual({ kind: 'ok' })
  })

  it('plan 경로의 ±1 은 허용(프롬프트 계약과 합치)', () => {
    expect(judgeShotCount(7, 8, { tolerance: 1, isFinalAttempt: true })).toEqual({ kind: 'ok' })
    expect(judgeShotCount(9, 8, { tolerance: 1, isFinalAttempt: true })).toEqual({ kind: 'ok' })
  })

  it('데쿠파주 경로는 ±1 도 재시도 대상(index 매핑이라 정확 일치 필요)', () => {
    const v = judgeShotCount(7, 8, { tolerance: 0, isFinalAttempt: false })
    expect(v.kind).toBe('retry')
  })

  it('Q6 시나리오: 최종 시도에 8→2 는 fatal (수용 금지)', () => {
    const v = judgeShotCount(2, 8, { tolerance: 0, isFinalAttempt: true })
    expect(v.kind).toBe('fatal')
    expect(v.kind === 'fatal' && v.reason).toContain('절반 이하')
  })

  it('경미한 어긋남(8→6)은 최종 시도에서 수용 — 배지로만 남는다', () => {
    expect(judgeShotCount(6, 8, { tolerance: 0, isFinalAttempt: true }).kind).toBe('accept')
  })

  it('절반 경계(8→4)는 수용, 그 아래(8→3)는 fatal', () => {
    expect(judgeShotCount(4, 8, { tolerance: 0, isFinalAttempt: true }).kind).toBe('accept')
    expect(judgeShotCount(3, 8, { tolerance: 0, isFinalAttempt: true }).kind).toBe('fatal')
  })

  it('초과는 소실이 아니므로 최종 시도에서 수용(배지)', () => {
    expect(judgeShotCount(12, 8, { tolerance: 0, isFinalAttempt: true }).kind).toBe('accept')
  })
})

describe('Q6 재현 — 잘린 응답이 조용히 통과하지 않는다', () => {
  afterEach(() => vi.restoreAllMocks())

  // 8샷을 내려다 2샷째 도중에 잘린 실제 형태의 응답
  const truncated =
    '{"shots":[' +
    ['shot_1', 'shot_2']
      .map((id) => `{"intent":{"shot_id":"${id}"},"static_spec":{},"dynamic_spec":{}}`)
      .join(',') +
    ',{"intent":{"shot_id":"shot_3"},"static_spec":{"first_frame_prompt":"잘린 문자열'

  it('repairJson 은 복구에 성공하지만 손실 경고를 남긴다(종전: 무신호)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repaired = repairJson<{ shots: unknown[] }>(truncated)
    // 복구 자체는 성공 — 파이프라인은 계속 굴러간다
    expect(Array.isArray(repaired.shots)).toBe(true)
    expect(repaired.shots.length).toBeLessThan(8)
    // 그러나 이제 흔적이 남는다
    expect(warn).toHaveBeenCalled()
    const msg = warn.mock.calls.map((c) => String(c[0])).join('\n')
    expect(msg).toContain('손실 복구')
  })

  it('복구된 배열은 파싱을 통과하지만 개수 가드가 fatal 로 잡는다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repaired = repairJson<{ shots: unknown[] }>(truncated)
    // 종전 경로: parseL4Shots 는 정상 통과시킨다(에러 0) — 여기가 무신호의 지점이었다
    const shots = parseL4Shots(repaired, 'scene_1')
    expect(shots.length).toBeLessThan(8)
    // 새 가드: 기대 8개 대비 절반 이하 → 씬 실패로 승격
    const verdict = judgeShotCount(shots.length, 8, { tolerance: 0, isFinalAttempt: true })
    expect(verdict.kind).toBe('fatal')
  })
})
