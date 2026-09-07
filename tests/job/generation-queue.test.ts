// 진행 중인 작업을 대상별로 정확히 표시해 해당 카드만 기다리게 한다 (#queue-restore)
import { describe, it, expect } from 'vitest'
import {
  activeShotIds,
  activeAssetIds,
  hasActiveKind,
  type ActiveJob,
} from '@/lib/generation-queue'

// #queue-restore — 큐 잡의 target 에서 "무엇이 도는 중인지"를 뽑는 규칙.
// 러프는 그리드 잡 1개가 샷 여러 개를 묶으므로(writerShotIds), 복수/단수 두 표기를 모두 펴야
// 카드 하나만 스피너가 돌고 나머지 3개가 멈춘 것처럼 보이는 일이 없다.

const job = (kind: ActiveJob['kind'], target: ActiveJob['target']): ActiveJob => ({
  id: `job-${kind}-${JSON.stringify(target)}`,
  kind,
  target,
})

describe('activeShotIds', () => {
  it('여러 장면을 묶은 작업은 해당 장면 모두를 진행 중으로 표시한다', () => {
    const ids = activeShotIds(
      [job('shot_rough_storyboard', { writerShotIds: ['sh_01', 'sh_02', 'sh_03'] })],
      ['shot_rough_storyboard'],
    )
    expect([...ids].sort()).toEqual(['sh_01', 'sh_02', 'sh_03'])
  })

  it('예전 방식으로 지정한 장면과 Director가 지정한 장면도 진행 중으로 표시한다', () => {
    const ids = activeShotIds(
      [
        job('shot_rough_storyboard', { writerShotId: 'sh_old' }),
        job('shot_storyboard', { shotId: 'sh_dir' }),
      ],
      ['shot_rough_storyboard', 'shot_storyboard'],
    )
    expect([...ids].sort()).toEqual(['sh_dir', 'sh_old'])
  })

  it('요청하지 않은 영상 작업은 그림을 진행 중으로 표시하지 않는다', () => {
    const ids = activeShotIds(
      [job('shot_video', { shotId: 'sh_01' })],
      ['shot_rough_storyboard'],
    )
    expect(ids.size).toBe(0)
  })

  it('작업 대상이 비어 있어도 오류 없이 지나간다', () => {
    expect(activeShotIds([job('shot_video', {})], ['shot_video']).size).toBe(0)
  })
})

describe('activeAssetIds', () => {
  it('인물과 장소를 각각 따로 진행 중으로 표시한다', () => {
    const { characters, locations } = activeAssetIds([
      job('character_view', { characterId: 'ch_1', view: 'main' }),
      job('character_view', { characterId: 'ch_2', view: 'side' }),
      job('world_shot', { locationId: 'loc_1' }),
      job('shot_video', { shotId: 'sh_1' }),
    ])
    expect([...characters].sort()).toEqual(['ch_1', 'ch_2'])
    expect([...locations]).toEqual(['loc_1'])
  })
})

describe('hasActiveKind', () => {
  it('해당 작업이 하나라도 있으면 진행 중으로 판단한다', () => {
    const jobs = [job('shot_previz_video', { writerShotId: 'sh_1' })]
    expect(hasActiveKind(jobs, ['shot_previz_video'])).toBe(true)
    expect(hasActiveKind(jobs, ['shot_video'])).toBe(false)
    expect(hasActiveKind([], ['shot_video'])).toBe(false)
  })
})
