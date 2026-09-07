// 생성 한도가 가득 차면 사용자에게 이유를 알리고, 거절 기록도 남긴다 (#a2-observability 2026-08-26)
import { beforeEach, describe, expect, it, vi } from 'vitest'

// #a2-observability (2026-08-26) — 429(한도 거부)는 generation_jobs 행이 생기기 전에 일어나
//   장부에 흔적이 없었다(오너 세션 부검: "다 죽음" 체감인데 failed 잡 거의 0). 이 헬퍼가
//   거부를 writer_observability_events 로 남기는지, 표준 429 본문을 유지하는지 잠근다.

const recordMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/writer/debug-events', () => ({
  recordWriterObservabilityEvent: (...args: unknown[]) => recordMock(...args),
}))

import { quotaRejectionResponse } from '@/lib/api/quota'
import type { QuotaCheck } from '@/lib/generation-quota'

const userBlocked: QuotaCheck = { ok: false, queued: 6, limit: 6, scope: 'user', category: 'image' }
const globalBlocked: QuotaCheck = { ok: false, queued: 18, limit: 18, scope: 'global', category: 'video' }

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
