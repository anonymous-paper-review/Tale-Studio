// 프롬프트 트레이스 선택(#debug-prompts 확장) 회귀 — 샷 매칭 3경로 + kind 별 최신 1건 +
//   영상의 최종/소스 분리 + 모션 계약 추출.
import { describe, it, expect } from 'vitest'
import { selectPromptTrace, type PromptTraceJobRow } from '@/lib/prompt-trace'

function row(over: Partial<PromptTraceJobRow>): PromptTraceJobRow {
  return { kind: 'shot_video', status: 'completed', created_at: '2026-08-07T10:00:00Z', input_snapshot: {}, target: {}, ...over }
}

describe('selectPromptTrace', () => {
  it('영상 잡: full_prompt=최종, prompt=소스, motionContract 분리 추출', () => {
    const items = selectPromptTrace(
      [
        row({
          kind: 'shot_video',
          target: { writerShotId: 'sh_01_01' },
          input_snapshot: {
            prompt: 'source desc',
            full_prompt: 'Motion contract: LOCKED... source desc',
            prompt_parts: { motionContract: 'Motion contract: LOCKED...' },
          },
        }),
      ],
      'sh_01_01',
    )
    expect(items).toHaveLength(1)
    expect(items[0].finalPrompt).toContain('Motion contract')
    expect(items[0].sourcePrompt).toBe('source desc')
    expect(items[0].motionContract).toContain('LOCKED')
  })

  it('그리드 잡은 writerShotIds[]/shotIds[] 로도 매칭된다', () => {
    const rows = [
      row({ kind: 'storyboard_real_grid', target: { writerShotIds: ['sh_01_01', 'sh_01_02'] }, input_snapshot: { prompt: 'grid P' } }),
      row({ kind: 'shot_rough_storyboard', target: {}, input_snapshot: { prompt: 'rough P', shotIds: ['sh_01_02'] } }),
    ]
    const items = selectPromptTrace(rows, 'sh_01_02')
    expect(items.map((i) => i.kind).sort()).toEqual(['shot_rough_storyboard', 'storyboard_real_grid'])
    expect(items.every((i) => !i.sourcePrompt)).toBe(true) // 이미지 잡은 prompt 가 곧 최종
  })

  it('kind 별 최신 1건만 — 최신순 입력에서 첫 매칭 채택', () => {
    const rows = [
      row({ created_at: '2026-08-07T12:00:00Z', target: { writerShotId: 's' }, input_snapshot: { prompt: 'new', full_prompt: 'NEW' } }),
      row({ created_at: '2026-08-07T11:00:00Z', target: { writerShotId: 's' }, input_snapshot: { prompt: 'old', full_prompt: 'OLD' } }),
    ]
    const items = selectPromptTrace(rows, 's')
    expect(items).toHaveLength(1)
    expect(items[0].finalPrompt).toBe('NEW')
  })

  it('다른 샷 잡·미허용 kind·빈 프롬프트는 제외', () => {
    const rows = [
      row({ target: { writerShotId: 'other' }, input_snapshot: { prompt: 'x' } }),
      row({ kind: 'character_view', target: { writerShotId: 's' }, input_snapshot: { prompt: 'x' } }),
      row({ target: { writerShotId: 's' }, input_snapshot: {} }),
    ]
    expect(selectPromptTrace(rows, 's')).toHaveLength(0)
  })
})
