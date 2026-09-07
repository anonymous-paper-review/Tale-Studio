// 약속 E — 영상 일괄 생성은 Take를 미리 센다 (_tdd.md E, 2026-09-04 오너 확정)
//
//   오너 결정: E2 = 1안(Take가 모자라면 가진 만큼 앞에서부터 만들고 확인창·채팅에서 미리 알린다).
//   Take 숫자는 shadow 모드에도 보이되 막지 않는다(운영 shadow, 로컬 off). 문장 하나 = 테스트 하나.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { DirectorNode } from '@/types/director'

const mockStore = vi.hoisted(() => {
  const state = {
    projectId: 'project-1',
    nodes: [] as DirectorNode[],
    videoBatchBusy: false,
    videoBatchProgress: null as { done: number; total: number; failed: number } | null,
    generateVideoForShot: vi.fn(),
  }
  const setState = vi.fn((patch: Record<string, unknown>) => {
    Object.assign(state, patch)
  })
  return { state, setState }
})
const notifyMock = vi.hoisted(() => ({ notifyBatchSummary: vi.fn() }))

vi.mock('@/stores/director-store', () => ({
  useDirectorCanvasStore: { getState: () => mockStore.state, setState: mockStore.setState },
}))
vi.mock('@/lib/generation-notify', () => notifyMock)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { runVideoBatch } from '@/lib/director/video-batch-client'
import { describeVideoBatchPlan, planVideoBatch, videoBatchTakeCosts } from '@/lib/director/video-batch-plan'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const tr = (key: string, vars?: Record<string, string | number>) =>
  key.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`))

function node(id: string, data: Record<string, unknown>): DirectorNode {
  return { id, type: String(data.kind), position: { x: 0, y: 0 }, data } as unknown as DirectorNode
}
const shot = (id: string, provider = 'seedance') => node(id, { kind: 'shot', provider })

beforeEach(() => {
  mockStore.state.projectId = 'project-1'
  mockStore.state.nodes = []
  mockStore.state.videoBatchBusy = false
  mockStore.state.videoBatchProgress = null
  mockStore.state.generateVideoForShot.mockReset()
  mockStore.setState.mockClear()
  notifyMock.notifyBatchSummary.mockClear()
})

describe('약속 E — 영상 일괄 생성은 Take를 미리 센다', () => {
  it('"영상 생성"을 누르면 확인창에 만들 영상 수, 필요한 Take 수, 지금 가진 Take 수가 함께 보인다', () => {
    // 단가는 서버 hold 와 같은 계산기: seedance 5, happy-horse 1, legacy kling 은 kling-o3(5).
    const nodes = [shot('s1', 'seedance'), shot('s2', 'happy-horse'), shot('s3', 'kling')]
    expect(videoBatchTakeCosts(nodes, ['s1', 's2', 's3'])).toEqual([5, 1, 5])
    const plan = planVideoBatch([5, 1, 5], 20, 'enforce')
    expect(plan).toMatchObject({ total: 3, requiredTakes: 11, balance: 20, runCount: 3, short: false })
    expect(describeVideoBatchPlan(plan, tr)).toEqual(['Takes needed: 11. Takes you have: 20.'])
    // 확인창이 이 줄들을 그대로 쓴다.
    const page = read('src/app/studio/director/page.tsx')
    expect(page).toMatch(/\.\.\.describeVideoBatchPlan\(videoPlan, t\)/)
    expect(page).toMatch(/count: videoPlan\.total/)
    expect(page).toMatch(/refetchTakeBalance\(\)\s*\n\s*setConfirmVideoBatch\(true\)/)
  })

  it('Take가 모자라면 가진 만큼만 앞에서부터 만들고 확인창에 "N개 중 M개만 만들 수 있어요"라고 미리 알린다', async () => {
    const plan = planVideoBatch([5, 5, 5, 5], 12, 'enforce')
    expect(plan).toMatchObject({ total: 4, requiredTakes: 20, affordable: 2, runCount: 2, short: true })
    expect(describeVideoBatchPlan(plan, tr)).toEqual([
      'Takes needed: 20. Takes you have: 12.',
      'Only 2 of 4 videos can be made with your Takes. The first 2 will be generated.',
    ])
    // 러너는 앞에서부터 그만큼만 요청한다.
    mockStore.state.nodes = [shot('s1'), shot('s2'), shot('s3'), shot('s4')]
    mockStore.state.generateVideoForShot.mockImplementation(async (id: string) => `video-${id}`)
    const result = await runVideoBatch('project-1', { silent: true, limit: 2 })
    expect(result).toEqual({ total: 2, started: 2, failed: 0 })
    expect(mockStore.state.generateVideoForShot.mock.calls.map((c) => c[0])).toEqual(['s1', 's2'])
    // 확인창은 만들 수 있는 수(limit)로 요청한다.
    expect(read('src/app/studio/director/page.tsx')).toMatch(/runVideoBatch\(pid, \{ limit: videoPlan\.runCount \}\)/)
  })

  it('shadow 모드는 숫자를 보이되 막지 않는다. 0개면 충전 안내다', () => {
    const shadow = planVideoBatch([5, 5], 3, 'shadow')
    expect(shadow).toMatchObject({ runCount: 2, affordable: 0, short: true })
    expect(describeVideoBatchPlan(shadow, tr)[1]).toBe('Takes are short by 7. Billing is not enforced yet, so all 2 will be generated.')
    const none = planVideoBatch([5, 5], 3, 'enforce')
    expect(none.runCount).toBe(0)
    expect(describeVideoBatchPlan(none, tr)[1]).toBe('No videos can be made until you add Takes.')
    // off 모드와 무제한(admin)은 Take 이야기를 하지 않거나 무제한이라고만 한다.
    expect(describeVideoBatchPlan(planVideoBatch([5], 0, 'off'), tr)).toEqual([])
    expect(describeVideoBatchPlan(planVideoBatch([5, 1], null, 'enforce'), tr)).toEqual(['Takes needed: 6. This workspace has unlimited Takes.'])
  })

  it('채팅에서 "영상 다 만들어줘"라고 하면 같은 확인 카드가 채팅에 뜨고, 승인하면 버튼과 똑같이 진행된다', () => {
    const route = read('src/app/api/director/chat/route.ts')
    expect(route).toMatch(/'generateVideos',/)
    expect(route).toMatch(/case 'generateVideos': \{/)
    expect(route).toMatch(/emit exactly one \{"type":"generateVideos"\}/)
    expect(route).not.toMatch(/Chat cannot start video generation yet/)
    const store = read('src/stores/global-chat-store.ts')
    expect(store).toMatch(/kind: 'directorGenerateVideoBatch'/)
    expect(store).toMatch(/\.\.\.describeVideoBatchPlan\(plan, tr\)/)
    expect(store).toMatch(/proposal\.kind === 'directorGenerateVideoBatch'/)
    expect(store).toMatch(/runVideoBatch\(pid, \{ onJob: observeGeneration, limit \}\)/)
    expect(read('src/lib/pending-proposal.ts')).toMatch(/\| 'directorGenerateVideoBatch'/)
    // 승인 없이 스토어까지 온 generateVideos 는 돌지 않는다.
    expect(read('src/stores/director-store.ts')).toMatch(/case 'generateVideos': \{[\s\S]*?result\.skipped\.push/)
  })

  it('진행이 끝나면 채팅에 "N개 완료, M개 실패"가 한 줄로 남는다', async () => {
    mockStore.state.nodes = [shot('s1'), shot('s2'), shot('s3')]
    mockStore.state.generateVideoForShot.mockImplementation(async (id: string, opts: { onJob?: (r: { jobId: string; status: string }) => void }) => {
      if (id === 's3') return null // 제출 실패
      opts.onJob?.({ jobId: `job-${id}`, status: 'queued' })
      setTimeout(() => opts.onJob?.({ jobId: `job-${id}`, status: id === 's2' ? 'failed' : 'completed' }), 0)
      return `video-${id}`
    })
    const result = await runVideoBatch('project-1', { silent: true })
    expect(result).toEqual({ total: 3, started: 2, failed: 1 })
    await new Promise((r) => setTimeout(r, 5))
    expect(notifyMock.notifyBatchSummary).toHaveBeenCalledTimes(1)
    expect(notifyMock.notifyBatchSummary.mock.calls[0]).toEqual(['director', '✓ 1 videos done, 2 failed'])
    // 일괄 모드에서는 건별 완료 알림을 내지 않아 줄이 하나다.
    expect(read('src/stores/director-store.ts')).toMatch(/if \(options\?\.batch !== true\) notifyGenerationComplete\('director'/)
    expect(read('src/lib/i18n/messages-ko.ts')).toMatch(/'\{done\} videos done, \{failed\} failed': '영상 \{done\}개 완료, \{failed\}개 실패'/)
  })
})
