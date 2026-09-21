// 작업을 불러올 때 어느 묶음에 속하는지도 함께 읽는다
//
// #batch-resume(2026-09-09) 슬라이스 B의 전제. 완료 알림이 "이 영상이 어느 일괄에서 나왔나" 를
// 알아야 다음 것을 낼 수 있다. 조회 컬럼 목록에 batch_id/batch_total 이 빠져 있으면 잡을 읽어도
// 그 값이 undefined 라, 이어가기가 조용히 아무것도 안 하고 끝난다 — 오류도 안 난다.
//
// 이 저장소는 같은 종류의 사고를 이미 겪었다: COLUMNS 에서 빠진 칸 때문에 finalize 가 필요한
// 값을 못 받아 회귀가 났고, 그래서 generation-jobs-columns.test.ts 가 생겼다. 같은 가드를 둔다.
import { describe, expect, it } from 'vitest'
import { GENERATION_JOB_COLUMNS } from '@/lib/generation-jobs'

describe('작업 조회 컬럼', () => {
  it('묶음 표시를 함께 읽는다', () => {
    const columns = GENERATION_JOB_COLUMNS.split(',').map((c) => c.trim())

    expect(columns).toContain('batch_id')
    expect(columns).toContain('batch_total')
  })

  it('기존 경로가 쓰는 칸은 그대로 있다', () => {
    // 이어가기를 붙이면서 다른 경로를 깨지 않는다.
    const columns = GENERATION_JOB_COLUMNS.split(',').map((c) => c.trim())

    for (const required of [
      'id',
      'project_id',
      'request_id',
      'status',
      'kind',
      'target',
      'video_clip_id',
      'input_snapshot',
      'result_url',
      'fal_key_id',
    ]) {
      expect(columns).toContain(required)
    }
  })
})
