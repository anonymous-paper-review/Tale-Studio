// 초안·검토·후속 작업을 구분하고 근거가 없는 남은 시간은 표시하지 않는다.
import { describe, expect, it } from 'vitest'
import { writerProgressView } from '@/lib/writer/progress-view'
const base = { started: true, pipeline_completed: false, pipeline_failed: false, current_status: 'running', current_stage: 'scenes', completed_units: 2, total_units: 15 }
describe('Writer 진행 범위', () => {
  it('씬 스토리 초안을 기다릴 때는 초안까지의 진행을 보여주고, 검토 중에는 확정을 기다린다고 알려준다.', () => {
    expect(writerProgressView(base)).toMatchObject({ scope: 'draft', done: 2, total: 4, percent: 50 })
    expect(writerProgressView({ ...base, current_status: 'awaiting_confirmation', completed_units: 4 })).toMatchObject({ scope: 'review', percent: 100, remaining: null })
    expect(writerProgressView({ ...base, current_stage: 'visualFormat', completed_units: 4 })).toMatchObject({ scope: 'production', done: 0, total: 11 })
  })
  it('예상 시간을 표시하면 무엇이 끝날 때까지의 시간인지 함께 알려준다.', () => {
    expect(writerProgressView({ ...base, eta_total_ms: 1080000 }).remaining).toBeNull()
    expect(writerProgressView(base).label).toContain('씬 초안')
    expect(writerProgressView({ ...base, current_stage: 'persistShots' }).label).toContain('샷·대사')
  })
  it('진행 표시가 거의 끝난 것처럼 보이는데 실제로 큰 작업이 남는 경우, 남은 작업을 명확히 알려준다.', () => {
    const saving = writerProgressView({ ...base, current_stage: 'persistShots', completed_units: 15 })
    expect(saving.percent).toBeLessThan(100)
    expect(saving.detail).toContain('저장')
    expect(saving.countLabel).toContain('단계')
    const failed = writerProgressView({ ...base, current_stage: 'persistShots', pipeline_failed: true, completed_units: 14 })
    expect(failed.detail).toContain('멈')
  })
})
it('여러 단계를 한 번에 만든 실행도 검토와 후속 단계의 진행을 빠뜨리지 않는다.', () => {
  expect(writerProgressView({ ...base, current_status:'awaiting_confirmation',current_stage:'storyCheck',completed_units:3 })).toMatchObject({done:4,total:4})
  expect(writerProgressView({ ...base,current_stage:'actVisualArc',completed_units:4 })).toMatchObject({done:1,total:11})
  expect(writerProgressView({ ...base,current_stage:'persistShots',completed_units:13 })).toMatchObject({done:10,total:11})
})
