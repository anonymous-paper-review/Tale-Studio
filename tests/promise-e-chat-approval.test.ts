// 약속 E3 — 채팅 승인 카드(directorGenerateVideoBatch)를 승인하면 버튼과 똑같이 runVideoBatch 가 돈다.
//   실제 global-chat-store 를 쓰고 러너만 모의한다(러너 자체는 promise-e-video-batch-takes 에서 검증).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runner = vi.hoisted(() => ({ runVideoBatch: vi.fn(), eligibleVideoBatchShotIds: vi.fn(() => []) }))
vi.mock('@/lib/director/video-batch-client', () => runner)

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { createPendingProposal } from '@/lib/pending-proposal'

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ currentStage: 'director', reachedStage: 'director' })
  useDirectorCanvasStore.setState({ projectId: 'project-e' })
  runner.runVideoBatch.mockReset()
})

describe('약속 E3 — 채팅 승인 카드', () => {
  it('승인하면 카드에 적힌 만들 수 있는 수(limit)만큼 runVideoBatch 를 부른다', async () => {
    runner.runVideoBatch.mockResolvedValue({ total: 2, started: 2, failed: 0 })
    const accepted = useGlobalChatStore.getState().offerPendingProposal(
      createPendingProposal({
        traceId: 'trace-e',
        stage: 'director',
        kind: 'directorGenerateVideoBatch',
        target: 'Videos',
        action: 'Generate videos for 4 shots',
        impact: ['Takes needed: 20. Takes you have: 12.', 'Only 2 of 4 videos can be made with your Takes. The first 2 will be generated.'],
        payload: { limit: 2, total: 4, requiredTakes: 20, balance: 12, mode: 'enforce' },
      }),
    )
    expect(accepted).toBe(true)
    expect(useGlobalChatStore.getState().pendingProposal?.kind).toBe('directorGenerateVideoBatch')

    const approved = await useGlobalChatStore.getState().approvePendingProposal()
    expect(approved).toBe(true)
    expect(runner.runVideoBatch).toHaveBeenCalledTimes(1)
    const [pid, opts] = runner.runVideoBatch.mock.calls[0] as [string, { limit?: number; onJob?: unknown }]
    expect(pid).toBe('project-e')
    expect(opts.limit).toBe(2)
    expect(typeof opts.onJob).toBe('function')
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
  })

  it('만들 수 있는 수가 0이면 승인해도 돌지 않고 충전 안내가 남는다', async () => {
    useGlobalChatStore.getState().offerPendingProposal(
      createPendingProposal({
        stage: 'director',
        kind: 'directorGenerateVideoBatch',
        target: 'Videos',
        action: 'Generate videos for 2 shots',
        impact: ['No videos can be made until you add Takes.'],
        payload: { limit: 0, total: 2, requiredTakes: 10, balance: 3, mode: 'enforce' },
      }),
    )
    const approved = await useGlobalChatStore.getState().approvePendingProposal()
    expect(approved).toBe(false)
    expect(runner.runVideoBatch).not.toHaveBeenCalled()
    const last = useGlobalChatStore.getState().messages.at(-1)
    expect(last?.content ?? useGlobalChatStore.getState().error ?? '').toMatch(/Take/)
  })
})
