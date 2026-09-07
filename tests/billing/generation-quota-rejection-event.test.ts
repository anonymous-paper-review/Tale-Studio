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
  it('records the rejection as an observability event with kind/scope/counts', async () => {
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

  it('keeps the standard quota body contract the client toast depends on', async () => {
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

  it('never lets a recording failure change the 429 response', async () => {
    recordMock.mockRejectedValueOnce(new Error('db down'))
    const res = quotaRejectionResponse(userBlocked, { projectId: 'proj-3', kind: 'character_view' })
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.code).toBe('quota_exceeded')
  })
})
