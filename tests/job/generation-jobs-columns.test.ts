// 작업을 끝낼 때 필요한 정보를 보존하고, 인물 모습별 작업을 서로 섞지 않는다
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'

// supabaseAdmin 생성(env)을 피하기 위해 admin 모듈 mock — 이 테스트는 순수 상수만 검증한다.
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

import { GENERATION_JOB_COLUMNS } from '@/lib/generation-jobs'

const generationJobs = readFileSync('src/lib/generation-jobs.ts', 'utf8')

describe('GENERATION_JOB_COLUMNS에 작업을 끝내는 데 필요한 정보가 있는지', () => {
  it('작업을 끝낼 때 필요한 입력 정보를 포함한다', () => {
    expect(GENERATION_JOB_COLUMNS).toContain('input_snapshot')
  })

  it('작업 대상을 확인하는 정보를 포함한다', () => {
    expect(GENERATION_JOB_COLUMNS).toContain('target')
  })
})

describe('인물 모습 작업 칸의 약속', () => {
  it('인물의 모습 선택을 작업 칸에 보존한다', () => {
    expect(generationJobs).toContain('appearanceKey?: string')
  })

  it('대기 중이거나 실패한 작업은 인물과 모습과 방향별로 서로 구분한다', () => {
    expect(generationJobs).toContain('t.appearanceKey === appearanceKey')
    expect(generationJobs).toContain('`${t.characterId}\\u0000${t.appearanceKey}\\u0000${t.view}`')
  })
})
