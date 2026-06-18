import { describe, it, expect, vi } from 'vitest'

// supabaseAdmin 생성(env)을 피하기 위해 admin 모듈 mock — 이 테스트는 순수 상수만 검증한다.
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

import { GENERATION_JOB_COLUMNS } from '@/lib/generation-jobs'

describe('GENERATION_JOB_COLUMNS — 웹훅 finalize 의존 컬럼 회귀 가드', () => {
  // 실 e2e 에서 발견된 회귀: COLUMNS 에 input_snapshot 누락 → getGenerationJobByRequestId 가
  //   로드한 job 의 input_snapshot 이 undefined → finalize 의 source_hash ?? null → 후보 source_hash=null
  //   → isImageStale 항상 false → C2/C3/C5 stale 전파가 런타임에서 통째로 무력화.
  it('finalize 가 읽는 input_snapshot 을 포함한다', () => {
    expect(GENERATION_JOB_COLUMNS).toContain('input_snapshot')
  })
  it('finalize 가 읽는 target 을 포함한다', () => {
    expect(GENERATION_JOB_COLUMNS).toContain('target')
  })
})
