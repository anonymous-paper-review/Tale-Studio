import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'

// supabaseAdmin 생성(env)을 피하기 위해 admin 모듈 mock — 이 테스트는 순수 상수만 검증한다.
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

import { GENERATION_JOB_COLUMNS } from '@/lib/generation-jobs'

const generationJobs = readFileSync('src/lib/generation-jobs.ts', 'utf8')

describe('GENERATION_JOB_COLUMNS — 웹훅 finalize 의존 컬럼 회귀 가드', () => {
  it('finalize 가 읽는 input_snapshot 을 포함한다', () => {
    expect(GENERATION_JOB_COLUMNS).toContain('input_snapshot')
  })

  it('finalize 가 읽는 target 을 포함한다', () => {
    expect(GENERATION_JOB_COLUMNS).toContain('target')
  })
})

describe('character_view 작업 슬롯 계약', () => {
  it('작업 target은 appearanceKey를 보존한다', () => {
    expect(generationJobs).toContain('appearanceKey?: string')
  })

  it('대기와 실패 슬롯은 characterId, appearanceKey, view를 모두 구분한다', () => {
    expect(generationJobs).toContain('t.appearanceKey === appearanceKey')
    expect(generationJobs).toContain('`${t.characterId}\\u0000${t.appearanceKey}\\u0000${t.view}`')
  })
})
