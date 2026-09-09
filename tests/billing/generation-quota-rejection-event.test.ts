// 생성 한도가 가득 차면 사용자에게 이유를 알리고, 거절 기록도 남긴다 (#a2-observability 2026-08-26)
import { beforeEach, describe, expect, it, vi } from 'vitest'

// #a2-observability (2026-08-26) — 429(한도 거부)는 generation_jobs 행이 생기기 전에 일어나
//   장부에 흔적이 없었다(오너 세션 부검: "다 죽음" 체감인데 failed 잡 거의 0). 이 헬퍼가
//   거부를 writer_observability_events 로 남기는지, 표준 429 본문을 유지하는지 잠근다.

const recordMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/writer/debug-events', () => ({
  recordWriterObservabilityEvent: (...args: unknown[]) => recordMock(...args),
}))

import { quotaRejectionResponse, videoCapacityReservationRejection } from '@/lib/api/quota'
import type { QuotaCheck } from '@/lib/generation-quota'

const userBlocked: QuotaCheck = { ok: false, queued: 6, limit: 6, scope: 'user', category: 'image' }
const globalBlocked: QuotaCheck = { ok: false, queued: 18, limit: 18, scope: 'global', category: 'video' }

describe('예약 경쟁에서 한도에 걸리면 대기 안내를 보내는 약속', () => {
  const context = { projectId: 'proj-1', kind: 'shot_video', userId: 'user-1' }

  it.each([
    { message: 'video_user_at_capacity', details: '4', code: 'P0001' },
    Object.assign(new Error('video_user_at_capacity'), { details: '4' }),
  ])('예약 시 한도에 걸리면 실제 대기 수로 안내하고 기록한다 (%#)', async (error) => {
    const response = videoCapacityReservationRejection(error, context)
    expect(response?.status).toBe(429)
    expect(await response?.json()).toMatchObject({ code: 'quota_exceeded', queued: 4, limit: 3 })
    expect(recordMock).toHaveBeenCalledWith('proj-1', 'generation_submit_rejected_quota', {
      kind: 'shot_video', scope: 'user', queued: 4, limit: 3, userId: 'user-1',
    })
  })

  it.each(['3junk', '3.5', '3e2', '9007199254740993', '2', '', undefined])(
    '대기 수를 확인할 수 없으면 임의의 수로 안내하지 않는다 (%s)',
    (details) => {
      const error = Object.assign(new Error('video_user_at_capacity'), { details })
      expect(videoCapacityReservationRejection(error, context)).toBeNull()
      expect(recordMock).not.toHaveBeenCalled()
    },
  )
})

beforeEach(() => {
  recordMock.mockClear()
})

describe('quotaRejectionResponse', () => {
  it('거절되면 어떤 한도에서 얼마나 대기 중인지 기록한다', async () => {
    const res = quotaRejectionResponse(userBlocked, {
      projectId: 'proj-1',
      kind: 'storyboard_real_grid',
      userId: 'user-1',
    })
    expect(res.status).toBe(429)
    expect(recordMock).toHaveBeenCalledTimes(1)
    expect(recordMock).toHaveBeenCalledWith('proj-1', 'generation_submit_rejected_quota', {
      kind: 'storyboard_real_grid',
      scope: 'user',
      queued: 6,
      limit: 6,
      userId: 'user-1',
    })
  })

  it('한도 초과 응답에는 화면에 필요한 상태 정보를 담는다', async () => {
    const res = quotaRejectionResponse(globalBlocked, { projectId: 'proj-2', kind: 'shot_video' })
    const body = await res.json()
    expect(body.code).toBe('quota_exceeded')
    expect(body.scope).toBe('global')
    expect(body.queued).toBe(18)
    expect(body.limit).toBe(18)
    expect(recordMock).toHaveBeenCalledWith(
      'proj-2',
      'generation_submit_rejected_quota',
      expect.objectContaining({ kind: 'shot_video', scope: 'global', userId: null }),
    )
  })

  it('기록에 실패해도 한도 초과 응답은 그대로 반환한다', async () => {
    recordMock.mockRejectedValueOnce(new Error('db down'))
    const res = quotaRejectionResponse(userBlocked, { projectId: 'proj-3', kind: 'character_view' })
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.code).toBe('quota_exceeded')
  })
})
