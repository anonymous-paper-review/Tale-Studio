// 실사 끝 장 다시 그리기(N4b)를 [멈추기]로 멈출 때의 안내 — 다시 그리던 끝 장은 버려지고 끝 장은 그대로라고(판에 남지 않음) — 를 검사한다(검토 rev-realarrow 8)
import { describe, expect, it, vi } from 'vitest'
import { shotStopTarget, stopNotice, stopShotWork, stoppedCounts } from '@/lib/director/stop-work'
import { KO } from '@/lib/i18n/messages-ko'
import type { ActiveJob } from '@/lib/generation-queue'

// 이 시험을 위해 지은 작업 — 샷 b 의 실사 끝 장 작업, 샷 a 의 실사 한 샷 다시 그리기.
const end = { id: 'job-end', kind: 'shot_storyboard', target: { writerShotId: 'b', realEnd: { versionId: 'arrows-1', direction: 'd', line: 'l' } }, cancelledAt: null } as unknown as ActiveJob
const strip = { id: 'job-strip', kind: 'shot_storyboard', target: { writerShotId: 'a', gridVariant: 'strip1' }, cancelledAt: null } as unknown as ActiveJob
const ENDED = 'Stopped. The end frame being redrawn was discarded, so the end frame stays as it was.'
const MIXED = 'Stopped. If the images being made finish later, they stay in the versions. The end frame being redrawn was discarded.'

describe('끝 장 다시 그리기 멈추기 안내', () => {
  // 왜(검토 rev-realarrow 8): 멈춘 끝 장 작업은 끼우지 않는다(혼자 정한 것 j) — "판에 남아요"라고 하면 기다리던 사람이 판 줄을 뒤진다.
  it('끝 장 다시 그리기를 멈추면 다시 그리던 끝 장은 버려지고 끝 장은 그대로라고 알린다', async () => {
    expect(stopNotice(stoppedCounts([end], new Set(['job-end']), false))).toBe(ENDED)
    expect(stopNotice(stoppedCounts([end, strip], new Set(['job-end', 'job-strip']), false))).toBe(MIXED)
    const target = shotStopTarget([end], 'b', 'image')!
    const cancel = vi.fn(async () => ['job-end'])
    await expect(stopShotWork(cancel, target, 'image')).resolves.toEqual({ ok: true, text: ENDED })
    expect(KO[ENDED]).toBe('멈췄어요. 다시 그리던 끝 장은 버려져 끝 장은 그대로예요.')
    expect(KO[MIXED]).toBe('멈췄어요. 그리던 이미지는 뒤늦게 끝나면 버전으로 남아요. 다시 그리던 끝 장은 버려져요.')
  })

  // 왜: 정상 경로 고정 — 다른 이미지 작업만 멈췄으면 지금처럼 뒤늦게 끝나면 판에 남는다고 알린다.
  it('다른 이미지를 멈추면 지금처럼 뒤늦게 끝나면 판에 남는다고 알린다', async () => {
    expect(stopNotice(stoppedCounts([strip], new Set(['job-strip']), false))).toBe('Stopped. If the images being made finish later, they stay in the versions.')
    const target = shotStopTarget([strip], 'a', 'image')!
    await expect(stopShotWork(vi.fn(async () => ['job-strip']), target, 'image')).resolves.toEqual({ ok: true, text: 'Stopped. If the images being made finish later, they stay in the versions.' })
  })
})
