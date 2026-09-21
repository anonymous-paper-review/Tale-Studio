// 여러 장면의 영상을 한 번에 만들 때 중복 없이 진행 상황과 실패 수를 정확히 보여준다
//
// #server-batch-assertions(2026-09-09): 오너 승인 — "브라우저 루프 검사를 서버 저장·조회
//   구조로 옮기자"(오너: "음 테스트를 업데이트하자는거지? 새 서버방식으로? 그게 맞는듯?").
//   예전 검사는 러너가 각 샷마다 store.generateVideoForShot 을 직접 불러 동시성(maxActive=3)을
//   스스로 관리한다고 전제했지만, 지금 러너는 시작 순간 고른 목록을 POST 한 번으로 서버에
//   고정하고(#batch-resume) 그 뒤로는 GET 으로 진행만 읽는다 — 실제 제출·동시 한도는 서버 쪽
//   (tests/job/batch-continue-submission.test.ts, tests/manual/batch-resume-db.manual.test.ts)이
//   검사한다. 그래서 여기서는 클라이언트 계약만 본다:
//     · 브라우저가 유료 샷 제출(generateVideoForShot)을 0회 하고 서버에 목록을 1회만 보내는지
//     · POST 본문의 items 순서·개수(limit)가 시작 순간 고른 목록과 일치하는지
//     · running 응답을 받으면 GET 폴링으로 완료까지 집계하는지
//     · 늦게 끝난 이전 실행/이전 프로젝트의 응답이 새 실행의 busy·진행 상태를 건드리지 않는지
//   최종 수량(started/failed)은 기존 fixture와 같은 5개 중 4/1 패턴을 그대로 지킨다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorNode } from '@/types/director'
import type { VideoBatchSummary } from '@/lib/director/video-batch-types'

const mockStore = vi.hoisted(() => {
  const state = {
    projectId: 'project-1',
    nodes: [] as DirectorNode[],
    videoBatchBusy: false,
    videoBatchProgress: null as { done: number; total: number; failed: number } | null,
    videoBatchCancelled: false,
    videoBatchRunId: null as string | null,
    beginVideoBatch: vi.fn((total: number) => {
      state.videoBatchBusy = true
      state.videoBatchCancelled = false
      state.videoBatchRunId = crypto.randomUUID()
      state.videoBatchProgress = { done: 0, total, failed: 0 }
    }),
    cancelVideoBatch: vi.fn(() => {
      if (state.videoBatchBusy) state.videoBatchCancelled = true
    }),
    generateVideoForShot: vi.fn(),
    hydrateFromDb: vi.fn(async () => {}),
  }
  const setState = vi.fn((patch: Record<string, unknown>) => {
    Object.assign(state, patch)
  })
  return { state, setState }
})

vi.mock('@/stores/director-store', () => ({
  useDirectorCanvasStore: {
    getState: () => mockStore.state,
    setState: mockStore.setState,
  },
}))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

// 완료 job이 새로 보이면 poller가 shots 캐시를 무효화한다 — 실제 네트워크(Supabase) 금지.
vi.mock('@/lib/shots-cache', () => ({
  invalidateShots: vi.fn().mockResolvedValue(undefined),
}))

// buildVideoBatchInputs 는 별도 계약(tests/director/batch-input-snapshot.test.ts)이 검사한다.
// 여기서는 러너가 고른 shotId 목록을 그대로 items 로 감쌌다고 가정하고 서버 POST/GET 계약만 본다.
const buildInputsMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/director/video-batch-inputs', () => ({
  buildVideoBatchInputs: buildInputsMock,
}))

import {
  eligibleVideoBatchShotIds,
  runVideoBatch,
} from '@/lib/director/video-batch-client'

function node(id: string, data: Record<string, unknown>): DirectorNode {
  return {
    id,
    type: String(data.kind),
    position: { x: 0, y: 0 },
    data,
  } as unknown as DirectorNode
}

const shot = (id: string) => node(id, { kind: 'shot' })
const video = (
  id: string,
  parentShotNodeId: string,
  patch: Record<string, unknown> = {},
) =>
  node(id, {
    kind: 'video',
    parentShotNodeId,
    status: 'pending',
    lastAttemptStatus: null,
    videoUrl: null,
    ...patch,
  })

function echoItems(_projectId: string, _nodes: unknown, shotIds: readonly string[]) {
  return { items: shotIds.map((shotId) => ({ shotId, request: {} })), skipped: [] }
}

// #server-batch-assertions: started(접수)/failedToStart(접수실패)는 done/failed(작업 종결 상태)와 다른
// 축이다 — 기본값은 done/failed 그대로 따라가고(전량 접수 = 전량 종결 가정), 접수와 종결이
// 갈리는 케이스만 overrides 로 명시적으로 따로 준다.
function summary(overrides: Partial<VideoBatchSummary> = {}): VideoBatchSummary {
  const done = overrides.done ?? 0
  const failed = overrides.failed ?? 0
  return {
    id: 'run-x',
    projectId: 'project-1',
    status: 'completed',
    total: 0,
    done,
    failed,
    pending: 0,
    active: 0,
    stopReason: null,
    jobs: [],
    started: done,
    failedToStart: failed,
    ...overrides,
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

/**
 * POST 는 body.batchId 로 라우팅해 각 실행을 따로 resolve 할 수 있게 하고, GET 은 미리 채워둔
 * 큐에서 하나씩 꺼내 돌려주는 fetch mock — 이전 실행 응답 무시(ownsRun)와 GET 폴링 완료를
 * 함께 검사하려고 POST를 즉시 resolve하지 않는(deferred) 형태로 만든다.
 */
function makeFetchMock() {
  const pendingPosts = new Map<string, (res: Response) => void>()
  const getResponses: unknown[] = []
  const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = []
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined
    calls.push({ url, method, body })
    if (method === 'POST') {
      return new Promise<Response>((resolve) => {
        pendingPosts.set(String(body?.batchId), resolve)
      })
    }
    const next = getResponses.shift()
    if (next === undefined) throw new Error(`이 테스트가 준비하지 않은 GET: ${url}`)
    return Promise.resolve(jsonResponse(next))
  })
  return {
    fetchMock,
    calls,
    resolvePost(batchId: string, payload: unknown) {
      const resolve = pendingPosts.get(batchId)
      if (!resolve) throw new Error(`POST 대기 없음: ${batchId}`)
      pendingPosts.delete(batchId)
      resolve(jsonResponse(payload))
    },
    queueGet(payload: unknown) {
      getResponses.push(payload)
    },
  }
}

beforeEach(() => {
  mockStore.state.projectId = 'project-1'
  mockStore.state.nodes = []
  mockStore.state.videoBatchBusy = false
  mockStore.state.videoBatchProgress = null
  mockStore.state.videoBatchRunId = null
  mockStore.state.generateVideoForShot.mockReset()
  mockStore.state.hydrateFromDb.mockClear()
  mockStore.setState.mockClear()
  buildInputsMock.mockReset()
  buildInputsMock.mockImplementation(echoItems)
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('eligibleVideoBatchShotIds', () => {
  it('영상 일괄 생성 대상은 장면 순서를 지키고 이미 재생 가능하거나 생성 중인 장면은 제외한다', () => {
    const nodes = [
      shot('shot-3'),
      video('video-generating', 'shot-3', { status: 'generating' }),
      shot('shot-1'),
      video('video-complete', 'shot-1', {
        status: 'completed',
        videoUrl: 'https://media.example/complete.mp4',
      }),
      shot('shot-4'),
      video('video-attempt', 'shot-4', { lastAttemptStatus: 'generating' }),
      shot('shot-2'),
      video('video-unplayable', 'shot-2', { status: 'completed', videoUrl: null }),
    ]

    expect(eligibleVideoBatchShotIds(nodes)).toEqual(['shot-2'])
  })
})

describe('runVideoBatch — 서버 저장·조회 구조(#batch-resume)', () => {
  it('브라우저는 유료 샷 제출을 하지 않고 서버에 목록을 한 번만 보낸다(POST items 순서·수)', async () => {
    mockStore.state.nodes = [shot('shot-1'), shot('shot-2'), shot('shot-3'), shot('shot-4'), shot('shot-5')]
    const { fetchMock, calls, resolvePost } = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    const runPromise = runVideoBatch('project-1', { silent: true })
    const runId = mockStore.state.videoBatchRunId!

    const posts = calls.filter((c) => c.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0]!.url).toBe('/api/director/video-batches')
    expect(posts[0]!.body).toEqual({
      batchId: runId,
      projectId: 'project-1',
      items: ['shot-1', 'shot-2', 'shot-3', 'shot-4', 'shot-5'].map((shotId) => ({ shotId, request: {} })),
    })

    // 전량 완료를 POST 응답으로 바로 돌려주는 경우 — GET 폴링은 필요 없다.
    resolvePost(runId, { batch: summary({ id: runId, total: 5, done: 4, failed: 1 }), skipped: [] })
    const result = await runPromise

    expect(result).toEqual({ total: 5, started: 4, failed: 1 })
    expect(mockStore.state.generateVideoForShot).not.toHaveBeenCalled()
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
    expect(mockStore.state.videoBatchBusy).toBe(false)
    expect(mockStore.state.videoBatchProgress).toBeNull()
  })

  it('실행 중(running) 응답을 받으면 서버 GET 조회로 완료까지 진행을 집계한다', async () => {
    vi.useFakeTimers()
    mockStore.state.nodes = [shot('shot-1'), shot('shot-2')]
    const { fetchMock, calls, resolvePost, queueGet } = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    const runPromise = runVideoBatch('project-1', { silent: true })
    const runId = mockStore.state.videoBatchRunId!

    resolvePost(runId, {
      batch: summary({ id: runId, status: 'running', total: 2, done: 0, failed: 0, pending: 1, active: 1 }),
      skipped: [],
    })
    // 첫 GET: 하나 완료됐지만 아직 도는 중.
    queueGet({
      batches: [
        summary({
          id: runId,
          status: 'running',
          total: 2,
          done: 1,
          failed: 0,
          pending: 0,
          active: 1,
          jobs: [{ jobId: 'job-1', status: 'completed', resultUrl: 'https://x/1.mp4' }],
        }),
      ],
    })
    // 두 번째 GET: 나머지 하나가 실패로 끝나 전체 완료.
    queueGet({
      batches: [
        summary({
          id: runId,
          status: 'completed',
          total: 2,
          done: 1,
          failed: 1,
          pending: 0,
          active: 0,
          jobs: [
            { jobId: 'job-1', status: 'completed', resultUrl: 'https://x/1.mp4' },
            { jobId: 'job-2', status: 'failed', error: 'boom' },
          ],
        }),
      ],
    })

    await vi.advanceTimersByTimeAsync(2500)
    await vi.advanceTimersByTimeAsync(2500)
    const result = await runPromise

    expect(result).toEqual({ total: 2, started: 1, failed: 1 })
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2)
    // 새로 본 종결 job이 있으면 DB 재수화를 한 번 건다(#batch-resume).
    expect(mockStore.state.hydrateFromDb).toHaveBeenCalledWith('project-1')
    expect(mockStore.state.generateVideoForShot).not.toHaveBeenCalled()
  })

  // #batch-resume: A의 요청이 늦게 끝나도 이미 다른 프로젝트로 옮긴 뒤라면 그 응답은 조용히 버려진다.
  it('프로젝트를 떠나면 이전 일괄의 응답을 무시한다(재제출도, 진행 갱신도 하지 않는다)', async () => {
    mockStore.state.nodes = ['shot-1', 'shot-2', 'shot-3', 'shot-4'].map(shot)
    const { calls, fetchMock, resolvePost } = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    const previous = runVideoBatch('project-1', { silent: true })
    const previousRunId = mockStore.state.videoBatchRunId!

    // 사용자가 다른 프로젝트로 옮겨간다 — store 는 이미 새 프로젝트/새 실행 상태다.
    mockStore.state.projectId = 'project-2'
    mockStore.state.videoBatchBusy = false
    mockStore.state.videoBatchRunId = null

    resolvePost(previousRunId, { batch: summary({ id: previousRunId, total: 4, done: 3, failed: 1 }), skipped: [] })
    const result = await previous

    // ownsRun() 이 이미 거짓이라 재제출도, GET 도, store 갱신도 없다.
    expect(calls).toHaveLength(1)
    expect(calls[0]!.method).toBe('POST')
    expect(mockStore.state.generateVideoForShot).not.toHaveBeenCalled()
    expect(mockStore.setState).not.toHaveBeenCalled()
    expect(result).toEqual({ total: 4, started: 0, failed: 4 })
  })

  // #batch-resume: 이전 일괄(A)이 대기 중일 때 새 일괄(B)이 시작되고, A가 늦게 끝나도
  // B의 busy·진행 표시를 덮지 않는다(A 완료 → B busy 보존 → B 완료까지 검사).
  it.each(['project-1', 'project-2'])(
    '이전 일괄이 끝나도 새 일괄의 진행 표시를 지우지 않는다 (%s)',
    async (nextProjectId) => {
      mockStore.state.nodes = ['shot-1', 'shot-2', 'shot-3'].map(shot)
      const { calls, fetchMock, resolvePost } = makeFetchMock()
      vi.stubGlobal('fetch', fetchMock)

      const previous = runVideoBatch('project-1', { silent: true })
      const previousRunId = mockStore.state.videoBatchRunId!

      mockStore.state.projectId = nextProjectId
      mockStore.state.videoBatchBusy = false
      mockStore.state.nodes = [shot('next-shot')]
      const current = runVideoBatch(nextProjectId, { silent: true })
      const currentRunId = mockStore.state.videoBatchRunId!
      expect(currentRunId).not.toBe(previousRunId)

      // A(이전 실행)가 먼저 끝난다 — B가 owns 상태여야 A의 응답이 store를 덮지 않는다.
      resolvePost(previousRunId, { batch: summary({ id: previousRunId, total: 3, done: 2, failed: 1 }), skipped: [] })
      await previous

      expect(mockStore.state.videoBatchBusy).toBe(true)
      expect(mockStore.state.videoBatchRunId).toBe(currentRunId)
      expect(mockStore.state.videoBatchProgress).toEqual({ done: 0, total: 1, failed: 0 })

      resolvePost(currentRunId, { batch: summary({ id: currentRunId, total: 1, done: 1, failed: 0 }), skipped: [] })
      await current

      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2)
    },
  )

  // 왜: 2026-09-11 오너 결정 (가) — 모두의 자리가 차서 서버가 묶음을 멈추면 사용자는 "다시 눌러야 한다"를 알아야 한다.
  //     자동 재시도가 없으므로 안내가 없으면 남은 샷은 조용히 멈춘 채로 남는다.
  it('모두의 자리가 차서 묶음이 멈추면 자리가 없다는 안내를 띄운다', async () => {
    toastMock.info.mockClear()
    mockStore.state.nodes = [shot('shot-1'), shot('shot-2'), shot('shot-3')]
    const { fetchMock, resolvePost } = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    const runPromise = runVideoBatch('project-1')
    const runId = mockStore.state.videoBatchRunId!
    // 첫 샷은 나갔고(이미 끝남), 나머지 둘은 모두의 자리가 차서 보관된 채 멈췄다.
    resolvePost(runId, {
      batch: summary({
        id: runId, status: 'paused', stopReason: 'global_at_capacity',
        total: 3, done: 1, failed: 0, pending: 2, active: 0,
        jobs: [{ jobId: 'job-1', status: 'completed', resultUrl: 'https://x/1.mp4' }],
      }),
      skipped: [],
    })
    const result = await runPromise

    expect(result).toEqual({ total: 3, started: 1, failed: 0 })
    const notices = toastMock.info.mock.calls.map((call) => String(call[0]))
    expect(notices.some((text) => /자리|slots/i.test(text))).toBe(true)
    expect(notices.some((text) => /자동|automatic/i.test(text))).toBe(false)
    expect(mockStore.state.generateVideoForShot).not.toHaveBeenCalled()
  })
})
