// 지운 샷 번호를 새 샷에 다시 주지 않아, 새로 더한 샷에 지운 샷의 그림이 앉거나 그리기가 빠지지 않는지 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scene, Shot } from '@/types'

const db = vi.hoisted(() => ({
  deleteError: null as null | { message: string },
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const chain = (result: { error: { message: string } | null }) => {
        const query = {
          eq: () => query,
          then: (resolve: (value: { error: { message: string } | null }) => unknown) => Promise.resolve(result).then(resolve),
        }
        return query
      }
      return {
        insert: async () => ({ error: null }),
        update: () => chain({ error: null }),
        delete: () => chain({ error: db.deleteError }),
      }
    },
  }),
}))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined), loadShotsResult: vi.fn() }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

import { createAddedShotDraws, type AddedDrawOutcome, type DrawAddedShot } from '@/lib/writer/added-shot-draws'
import { _setGenerationQueueSnapshotForTests } from '@/lib/generation-queue'
import { onShotsRemoved, useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'

const PROJECT = 'project-reuse'
const scene = (sceneId: string): Scene => ({
  sceneId, sortOrder: 0, location: 'hall', timeOfDay: 'night', mood: '', narrativeSummary: sceneId,
  originalTextQuote: '', charactersPresent: ['su_jin'], estimatedDurationSeconds: 5,
})
const shot = (shotId: string, sceneId = 'sc_01', sortOrder = 0): Shot => ({
  shotId, sceneId, sortOrder, shotType: 'MS', actionDescription: `${shotId} 행동`, characters: ['su_jin'], durationSeconds: 5,
  generationMethod: 'T2V', dialogueLines: [], camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
  lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
})

beforeEach(() => {
  vi.useFakeTimers()
  db.deleteError = null
  useProjectStore.setState({ projectId: PROJECT, currentStage: 'writer' })
  useWriterStore.setState({
    sceneManifest: { scenes: [scene('sc_01'), scene('sc_02')], characters: [], locations: [] },
    shots: [shot('sh_01_01', 'sc_01', 0), shot('sh_01_02', 'sc_01', 1), shot('sh_01_03', 'sc_01', 2), shot('sh_02_01', 'sc_02', 3)],
    error: null,
  })
  _setGenerationQueueSnapshotForTests({ projectId: PROJECT, jobs: [] })
})
afterEach(async () => {
  await vi.runOnlyPendingTimersAsync()
  useWriterStore.getState().reset()
  vi.useRealTimers()
})

describe('지운 샷 번호를 다시 쓰지 않기', () => {
  // 왜: 2026-11-02 리뷰 R1 — 그리는 중인 sh_01_03 을 지우고 샷을 더하면 새 샷이 sh_01_03 을 다시 받았다. 서버는 그 번호의 옛 작업을
  //   "이미 그리는 중"으로 돌려주고 완료는 번호로 써서, 새 카드에 지운 샷의 그림이 앉고 다시 그려지지 않았다.
  it('Storyboard 에서 지운 샷 번호는 다시 쓰지 않는다 — 지운 뒤 더한 샷은 새 번호를 받는다', async () => {
    await useWriterStore.getState().deleteShot('sh_01_03')
    expect(useWriterStore.getState().shots.map((s) => s.shotId)).not.toContain('sh_01_03')
    const id = await useWriterStore.getState().addShot('sc_01', { fields: { actionDescription: '새로 더한 샷' } })
    expect(id).toBe('sh_01_04')
  })

  // 왜: 다른 창 · 새로고침 전에 지운 샷이라도 그 번호의 러프 작업이 아직 돌면 완료가 같은 번호의 새 샷에 앉는다 — 그 번호도 피한다.
  it('러프를 그리는 중인 번호는 그 샷이 없어도 새 샷에 주지 않는다', async () => {
    _setGenerationQueueSnapshotForTests({
      projectId: PROJECT,
      jobs: [{ id: 'job-1', kind: 'shot_rough_storyboard', target: { writerShotIds: ['sh_01_04'] } }],
    })
    const id = await useWriterStore.getState().addShot('sc_01', { fields: { actionDescription: '새로 더한 샷' } })
    expect(id).toBe('sh_01_05')
  })

  // 왜: 다른 프로젝트에서 지운 번호까지 피하면 번호가 괜히 건너뛴다 — 지운 번호는 그 프로젝트에서만 센다(정상 경로 고정).
  it('다른 프로젝트에서 지운 샷 번호는 이 프로젝트의 새 번호에 영향을 주지 않는다', async () => {
    await useWriterStore.getState().deleteShot('sh_01_03')
    useProjectStore.setState({ projectId: 'project-other' })
    useWriterStore.setState({ shots: [shot('sh_01_01'), shot('sh_01_02')] })
    _setGenerationQueueSnapshotForTests({ projectId: 'project-other', jobs: [] })
    const id = await useWriterStore.getState().addShot('sc_01', { fields: { actionDescription: '다른 프로젝트' } })
    expect(id).toBe('sh_01_03')
  })

  // 왜: 지우기가 실패해 샷이 되돌아왔으면 그 번호는 아직 쓰는 중이다 — 지웠다고 알리지 않는다.
  it('샷이나 씬을 지우면 그 샷들을 지웠다고 알리고, 지우기가 실패하면 알리지 않는다', async () => {
    const heard: Array<{ projectId: string; shotIds: string[] }> = []
    const stop = onShotsRemoved((event) => heard.push(event))
    try {
      await useWriterStore.getState().deleteShot('sh_01_02')
      await useWriterStore.getState().deleteScene('sc_02')
      db.deleteError = { message: 'denied' }
      await useWriterStore.getState().deleteShot('sh_01_01')
      expect(heard).toEqual([
        { projectId: PROJECT, shotIds: ['sh_01_02'] },
        { projectId: PROJECT, shotIds: ['sh_02_01'] },
      ])
    } finally {
      stop()
    }
  })
})

describe('지운 더한 샷과 그리기 장부', () => {
  // 왜: 리뷰 R1 — 장부가 지운 샷을 "그리는 중"으로 붙들고 있으면 같은 번호의 새 샷을 무시해 그리지 않았다.
  it('더한 샷을 지우면 장부에서 내려놓고, 같은 번호가 다시 더해지면 새 샷으로 그린다', async () => {
    const draws = createAddedShotDraws()
    const draw = vi.fn<DrawAddedShot>(async (): Promise<AddedDrawOutcome> => ({ kind: 'submitted', done: new Promise(() => {}) }))
    draws.attach(PROJECT, draw)
    draws.add({ projectId: PROJECT, shotId: 'sh_01_04', origin: 'board', saved: Promise.resolve(true) })
    await vi.advanceTimersByTimeAsync(1)
    expect(draws.view(PROJECT).get('sh_01_04')?.phase).toBe('drawing')
    draws.remove(PROJECT, ['sh_01_04'])
    expect(draws.view(PROJECT).has('sh_01_04')).toBe(false)
    draws.add({ projectId: PROJECT, shotId: 'sh_01_04', origin: 'chat', saved: Promise.resolve(true) })
    await vi.advanceTimersByTimeAsync(1)
    expect(draw).toHaveBeenCalledTimes(2)
  })
})
