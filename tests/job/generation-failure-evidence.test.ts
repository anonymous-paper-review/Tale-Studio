// 생성 실패 이유를 사람이 알아볼 수 있게 보여주고, 끝난 작업을 빠짐없이 알려준다 (#a2-observability 2026-08-26)
import { describe, expect, it } from 'vitest'
import { describeFinalizeError, normalizeFailureEvidence } from '@/lib/fal/error-evidence'
import { computeSettledJobs } from '@/lib/generation-ui-reflected'
import type { ActiveJob } from '@/lib/generation-queue'

// #a2-observability (2026-08-26) — 좌표 ③(실패 증거) 보강 + 좌표 ④(반영 감지) 헬퍼의 회귀 잠금.
//   실측 근거: 오너 세션 실패 2건의 error 가 리터럴 "<none>"(fal 의 무상세 플레이스홀더)로 저장돼
//   error_class=unknown, UI 표시 불가였다.

describe('normalizeFailureEvidence — 좌표 ③', () => {
  it('실패 이유가 없다는 표시만 있으면 작업 정보를 덧붙여 알아볼 수 있게 한다', () => {
    const out = normalizeFailureEvidence('<none>', 'storyboard_real_grid')
    expect(out).toContain('provider reported no failure detail')
    expect(out).toContain('"<none>"')
    expect(out).toContain('storyboard_real_grid')
  })

  it('의미 없는 실패 표시는 상세 내용 없음으로 바꾼다', () => {
    for (const raw of ['undefined', 'null', '[object Object]', 'Error']) {
      expect(normalizeFailureEvidence(raw)).toContain('provider reported no failure detail')
    }
  })

  it('실제 실패 내용은 원문 그대로 남긴다', () => {
    const real = 'image too small — blank/moderated'
    expect(normalizeFailureEvidence(real, 'world_shot')).toBe(real)
  })
})

describe('describeFinalizeError — 좌표 ③ 오류 설명', () => {
  it('오류 이름과 상태 번호와 원인을 함께 알려준다', () => {
    const cause = new Error('storage upload timed out')
    const err = Object.assign(new TypeError('fetch failed'), { status: 502, cause })
    const out = describeFinalizeError(err)
    expect(out).toContain('TypeError: fetch failed')
    expect(out).toContain('(status 502)')
    expect(out).toContain('caused by: storage upload timed out')
  })

  it('오류가 아닌 값도 사람이 읽을 수 있는 내용으로 보여준다', () => {
    expect(describeFinalizeError('boom')).toBe('boom')
  })
})

describe('computeSettledJobs — 좌표 ④ 완료 작업 확인', () => {
  const job = (id: string): ActiveJob => ({ id, kind: 'shot_storyboard', target: {} as ActiveJob['target'] })

  it('진행 중 목록에서 사라진 작업을 완료된 작업으로 알려준다', () => {
    const prev = [job('a'), job('b'), job('c')]
    const next = [job('b')]
    expect(computeSettledJobs(prev, next).map((j) => j.id)).toEqual(['a', 'c'])
  })

  it('새 작업만 추가되면 끝난 작업이 없다고 알려준다', () => {
    expect(computeSettledJobs([], [job('a')])).toEqual([])
    expect(computeSettledJobs([job('a')], [job('a'), job('b')])).toEqual([])
  })
})
