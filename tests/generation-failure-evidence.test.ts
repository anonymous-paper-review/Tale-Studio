import { describe, expect, it } from 'vitest'
import { describeFinalizeError, normalizeFailureEvidence } from '@/lib/fal/error-evidence'
import { computeSettledJobs } from '@/lib/generation-ui-reflected'
import type { ActiveJob } from '@/lib/generation-queue'

// #a2-observability (2026-08-26) — 좌표 ③(실패 증거) 보강 + 좌표 ④(반영 감지) 헬퍼의 회귀 잠금.
//   실측 근거: 오너 세션 실패 2건의 error 가 리터럴 "<none>"(fal 의 무상세 플레이스홀더)로 저장돼
//   error_class=unknown, UI 표시 불가였다.

describe('normalizeFailureEvidence — 좌표 ③', () => {
  it('wraps fal placeholder "<none>" with job context instead of storing it bare', () => {
    const out = normalizeFailureEvidence('<none>', 'storyboard_real_grid')
    expect(out).toContain('provider reported no failure detail')
    expect(out).toContain('"<none>"')
    expect(out).toContain('storyboard_real_grid')
  })

  it('wraps other meaningless placeholders (undefined/null/[object Object])', () => {
    for (const raw of ['undefined', 'null', '[object Object]', 'Error']) {
      expect(normalizeFailureEvidence(raw)).toContain('provider reported no failure detail')
    }
  })

  it('passes real failure messages through untouched', () => {
    const real = 'image too small — blank/moderated'
    expect(normalizeFailureEvidence(real, 'world_shot')).toBe(real)
  })
})

describe('describeFinalizeError — 좌표 ③', () => {
  it('includes error name, HTTP status and cause when present', () => {
    const cause = new Error('storage upload timed out')
    const err = Object.assign(new TypeError('fetch failed'), { status: 502, cause })
    const out = describeFinalizeError(err)
    expect(out).toContain('TypeError: fetch failed')
    expect(out).toContain('(status 502)')
    expect(out).toContain('caused by: storage upload timed out')
  })

  it('stringifies non-Error throwables', () => {
    expect(describeFinalizeError('boom')).toBe('boom')
  })
})

describe('computeSettledJobs — 좌표 ④', () => {
  const job = (id: string): ActiveJob => ({ id, kind: 'shot_storyboard', target: {} as ActiveJob['target'] })

  it('returns jobs that left the active queue since the previous tick', () => {
    const prev = [job('a'), job('b'), job('c')]
    const next = [job('b')]
    expect(computeSettledJobs(prev, next).map((j) => j.id)).toEqual(['a', 'c'])
  })

  it('returns nothing when the queue only grew', () => {
    expect(computeSettledJobs([], [job('a')])).toEqual([])
    expect(computeSettledJobs([job('a')], [job('a'), job('b')])).toEqual([])
  })
})
