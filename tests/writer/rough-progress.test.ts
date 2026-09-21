// 러프 보드의 샷 전체를 완료·생성 중·대기·실패로 나눠 보여주며 재시도해도 전체 수는 늘지 않는다
import { describe, expect, it } from 'vitest'
import { activeShotIds, type ActiveJob } from '@/lib/generation-queue'
import { summarizeRoughProgress } from '@/lib/writer/rough-progress'
import type { RoughStoryboardImage } from '@/types'

function shots47() {
  const lengths = [8, 5, 4, 30]
  let index = 0
  return lengths.flatMap((count, scene) => Array.from({ length: count }, () => ({
    shotId: `shot-${++index}`, sceneId: `scene-${scene + 1}`, actionDescription: '문을 열고 밖을 바라본다', roughStoryboard: null as RoughStoryboardImage | null,
  })))
}

const completed = (shotId: string): RoughStoryboardImage => ({ url: `https://example.test/${shotId}.png`, status: 'completed', errorMessage: null, generatedAt: 1 })
const grid = (id: string, ids: string[]): ActiveJob => ({ id, kind: 'shot_rough_storyboard', target: { writerShotIds: ids } })
const active = (jobs: ActiveJob[]) => activeShotIds(jobs, ['shot_rough_storyboard'])

describe('러프 전체 진행 요약', () => {
  it('러프 생성의 전체 대상, 완료, 생성 중, 대기, 실패를 구분해 알려준다', () => {
    const shots = shots47()
    for (const shot of shots.slice(0, 14)) shot.roughStoryboard = completed(shot.shotId)
    shots[14].roughStoryboard = { ...completed(shots[14].shotId), url: '', status: 'failed', errorMessage: '거절됨' }
    const queued = active([grid('grid-a', ['shot-16', 'shot-17']), grid('grid-b', ['shot-18', 'shot-19', 'shot-20'])])
    expect(summarizeRoughProgress(shots, {}, {}, queued)).toEqual({ total: 47, completed: 14, generating: 5, waiting: 27, failed: 1 })
  })

  it('여러 샷을 만드는 두 작업의 진행 수가 8에서 5와 4로 줄어도 보드 전체는 47샷이다', () => {
    const shots = shots47()
    const first = active([grid('a', ['shot-1', 'shot-2', 'shot-3', 'shot-4']), grid('b', ['shot-5', 'shot-6', 'shot-7', 'shot-8'])])
    expect(summarizeRoughProgress(shots, {}, {}, first)).toEqual({ total: 47, completed: 0, generating: 8, waiting: 39, failed: 0 })
    const saved: Record<string, RoughStoryboardImage> = {}
    for (const id of ['shot-1', 'shot-2', 'shot-3']) saved[id] = completed(id)
    const five = active([grid('a', ['shot-4']), grid('b', ['shot-5', 'shot-6', 'shot-7', 'shot-8'])])
    expect(summarizeRoughProgress(shots, saved, {}, five)).toEqual({ total: 47, completed: 3, generating: 5, waiting: 39, failed: 0 })
    saved['shot-4'] = completed('shot-4')
    const four = active([grid('b', ['shot-5', 'shot-6', 'shot-7', 'shot-8'])])
    expect(summarizeRoughProgress(shots, saved, {}, four)).toEqual({ total: 47, completed: 4, generating: 4, waiting: 39, failed: 0 })
  })

  it('실패한 샷을 다시 생성하면 실패에서 생성 중으로 옮기고 전체 수를 늘리지 않는다', () => {
    const shots = shots47()
    const failed = { 'shot-1': { status: 'failed' as const } }
    expect(summarizeRoughProgress(shots, {}, failed, new Set())).toEqual({ total: 47, completed: 0, generating: 0, waiting: 46, failed: 1 })
    const retry = active([grid('retry', ['shot-1']), grid('duplicate-receipt', ['shot-1'])])
    expect(summarizeRoughProgress(shots, {}, failed, retry)).toEqual({ total: 47, completed: 0, generating: 1, waiting: 46, failed: 0 })
    expect(summarizeRoughProgress(shots, { 'shot-1': completed('shot-1') }, {}, new Set())).toEqual({ total: 47, completed: 1, generating: 0, waiting: 46, failed: 0 })
  })

  it('최근 완료 14샷과 현재 생성 중 4샷을 전체 47샷과 각각 구분한다', () => {
    const shots = shots47()
    for (const shot of shots.slice(0, 14)) shot.roughStoryboard = completed(shot.shotId)
    const current = active([grid('current', ['shot-15', 'shot-16', 'shot-17', 'shot-18'])])
    expect(summarizeRoughProgress(shots, {}, {}, current)).toEqual({ total: 47, completed: 14, generating: 4, waiting: 29, failed: 0 })
  })
})
