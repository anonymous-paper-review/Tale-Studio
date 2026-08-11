import { describe, it, expect } from 'vitest'
import {
  activeShotIds,
  activeAssetIds,
  activeStartedAt,
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
  it('그리드 잡의 writerShotIds 를 펴서 전부 대상으로 삼는다', () => {
    const ids = activeShotIds(
      [job('shot_rough_storyboard', { writerShotIds: ['sh_01', 'sh_02', 'sh_03'] })],
      ['shot_rough_storyboard'],
    )
    expect([...ids].sort()).toEqual(['sh_01', 'sh_02', 'sh_03'])
  })

  it('구 단일 경로(writerShotId)와 director 의 shotId 도 함께 인식한다', () => {
    const ids = activeShotIds(
      [
        job('shot_rough_storyboard', { writerShotId: 'sh_old' }),
        job('shot_storyboard', { shotId: 'sh_dir' }),
      ],
      ['shot_rough_storyboard', 'shot_storyboard'],
    )
    expect([...ids].sort()).toEqual(['sh_dir', 'sh_old'])
  })

  it('요청하지 않은 종류의 잡은 세지 않는다 (영상 큐가 이미지 스피너를 켜면 안 된다)', () => {
    const ids = activeShotIds(
      [job('shot_video', { shotId: 'sh_01' })],
      ['shot_rough_storyboard'],
    )
    expect(ids.size).toBe(0)
  })

  it('target 이 비어도 터지지 않는다', () => {
    expect(activeShotIds([job('shot_video', {})], ['shot_video']).size).toBe(0)
  })
})

describe('activeAssetIds', () => {
  it('캐릭터/로케이션을 종류별로 갈라 담는다', () => {
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
  it('해당 종류가 하나라도 있으면 true', () => {
    const jobs = [job('shot_previz_video', { writerShotId: 'sh_1' })]
    expect(hasActiveKind(jobs, ['shot_previz_video'])).toBe(true)
    expect(hasActiveKind(jobs, ['shot_video'])).toBe(false)
    expect(hasActiveKind([], ['shot_video'])).toBe(false)
  })
})

describe('activeStartedAt — 경과시간 durable 기준점', () => {
  const at = (kind: ActiveJob['kind'], target: ActiveJob['target'], startedAt: number | null): ActiveJob => ({
    id: `j-${startedAt}`,
    kind,
    target,
    startedAt,
  })

  it('샷을 겨냥한 잡의 시작 시각을 찾는다 (그리드 잡의 writerShotIds 포함)', () => {
    const jobs = [
      at('storyboard_real_grid', { writerShotIds: ['sh_01', 'sh_02'] }, 1000),
      at('shot_video', { writerShotId: 'sh_01' }, 2000),
    ]
    expect(activeStartedAt(jobs, ['storyboard_real_grid', 'shot_storyboard'], 'sh_02')).toBe(1000)
    expect(activeStartedAt(jobs, ['shot_video'], 'sh_01')).toBe(2000)
  })

  it('여러 잡이면 가장 이른 시각 — 라운드가 갈려도 처음부터 센다', () => {
    const jobs = [
      at('shot_video', { writerShotId: 'sh_01' }, 3000),
      at('shot_video', { writerShotId: 'sh_01' }, 1500),
    ]
    expect(activeStartedAt(jobs, ['shot_video'], 'sh_01')).toBe(1500)
  })

  it('대상 잡이 없거나 시각이 없으면 undefined (mount 폴백에 맡긴다)', () => {
    expect(activeStartedAt([], ['shot_video'], 'sh_01')).toBeUndefined()
    expect(
      activeStartedAt([at('shot_video', { writerShotId: 'sh_01' }, null)], ['shot_video'], 'sh_01'),
    ).toBeUndefined()
  })
})
