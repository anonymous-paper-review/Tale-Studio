import { describe, expect, it } from 'vitest'
import {
  completionsOf,
  LANE_OF_KIND,
  summarizeGenerationBatches,
  type GenerationBatchRow,
} from '@/lib/generation-batches'
import { queueWorks } from '@/lib/pipeline-progress'

const NOW = Date.parse('2026-09-14T00:00:00Z')
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

function row(
  over: Partial<GenerationBatchRow> &
    Pick<GenerationBatchRow, 'id' | 'kind' | 'status'>,
): GenerationBatchRow {
  return {
    target: null,
    created_at: iso(0),
    updated_at: iso(0),
    ...over,
  }
}

describe('image_generation 진행 집계', () => {
  it('수동 이미지 결과 기록은 영상·스토리보드 배치 숫자에 섞이지 않는다', () => {
    expect(LANE_OF_KIND.image_generation).toBeNull()

    const rows = [
      row({ id: 'manual-image', kind: 'image_generation', status: 'queued' }),
      row({
        id: 'manual-image-done',
        kind: 'image_generation',
        status: 'completed',
        created_at: iso(1_000),
        updated_at: iso(2_000),
      }),
      row({ id: 'storyboard', kind: 'shot_storyboard', status: 'queued' }),
      row({ id: 'video', kind: 'shot_video', status: 'queued' }),
    ]

    expect(summarizeGenerationBatches(rows, NOW + 3_000)).toEqual([
      {
        lane: 'director-storyboard',
        stage: 'director',
        active: 1,
        total: 1,
        done: 0,
        failed: 0,
      },
      {
        lane: 'director-video',
        stage: 'director',
        active: 1,
        total: 1,
        done: 0,
        failed: 0,
      },
    ])
    expect(completionsOf(rows)).toEqual([])
  })

  it('큐 진행 문구도 image_generation을 제외하고 다른 known kind은 유지한다', () => {
    const works = queueWorks({
      image_generation: 4,
      character_view: 2,
      shot_rough_storyboard: 3,
      shot_storyboard: 5,
      storyboard_real_grid: 6,
      shot_video: 7,
      shot_previz_video: 8,
      world_shot: 9,
    })

    expect(works.find((work) => work.key === 'queue-image_generation')).toBeUndefined()
    expect(works.map((work) => work.key)).toEqual([
      'queue-character_view',
      'queue-shot_rough_storyboard',
      'queue-shot_storyboard',
      'queue-storyboard_real_grid',
      'queue-shot_video',
      'queue-shot_previz_video',
      'queue-world_shot',
    ])
    expect(works.find((work) => work.key === 'queue-shot_video')).toMatchObject({
      total: 7,
      stage: 'director',
    })
    expect(works.find((work) => work.key === 'queue-shot_rough_storyboard')).toMatchObject({
      total: 3,
      stage: 'writer',
    })
  })
})
