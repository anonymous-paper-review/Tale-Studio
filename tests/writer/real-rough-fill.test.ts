// Storyboard 화면이 열려 있는 동안 빠진 콘티 그림(목각 러프)을 예전 Storyboard 와 같은 러프 펌프 규칙으로 이어 그리는지 — 언제 시작하고, 어떻게 묶음을 이어 보내고, 언제 멈추고, 그리는 중을 어떻게 세는지 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  refresh: vi.fn(),
  quota: vi.fn((_status: number, _body: unknown) => true),
  poll: vi.fn(async (_jobId: string) => 'https://x/rough.png'),
  invalidate: vi.fn(async (_projectId: string) => {}),
  load: vi.fn(async () => {}),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@/lib/generation-queue', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), refreshGenerationQueue: calls.refresh }))
vi.mock('@/lib/generation-jobs-client', () => ({ pollGenerationJob: calls.poll }))
vi.mock('@/lib/generation-quota-toast', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), notifyIfQuotaExceeded: calls.quota }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: calls.invalidate }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: { getState: () => ({ loadProject: calls.load }) } }))
vi.mock('sonner', () => ({ toast: { info: calls.toastInfo, error: calls.toastError } }))

import { fillMissingRoughs, missingContiShotIds, roughFillStart } from '@/lib/storyboard/rough-fill'
import { useRoughFillStore } from '@/lib/storyboard/rough-fill-store'

// 이 시험을 위해 지은 서버 답 — 한 묶음에 보낸 샷과 남은 샷 수.
const round = (shotIds: string[], remaining: number, jobId = 'job-1') => ({
  status: 200,
  body: { ok: true, data: { submitted: shotIds.map((shotId) => ({ shotId, jobId })), skipped: [], remaining } },
})
const conti = { url: 'https://x/r.png', status: 'completed', errorMessage: null, generatedAt: 1, frames: { start: 'a', direction: 'b', end: 'c' } }

let replies: Array<{ status: number; body: unknown }>
let sent: Array<{ url: string; body: Record<string, unknown> }>

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockClear()
  useRoughFillStore.setState({ projectId: null, pending: {}, running: false })
  replies = []
  sent = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) })
    const reply = replies.shift() ?? round([], 0)
    return new Response(JSON.stringify(reply.body), { status: reply.status })
  }))
})
afterEach(() => vi.unstubAllGlobals())

const fill = (isAborted: () => boolean = () => false) => fillMissingRoughs('p1', { locale: 'ko', isAborted })
/** 그 작업의 끝을 시험이 정할 때까지 붙잡아 둔다. */
function holdPoll(): () => void {
  let release!: () => void
  calls.poll.mockImplementationOnce(() => new Promise<string>((resolve) => { release = () => resolve('https://x/rough.png') }))
  return () => release()
}

describe('Storyboard 가 빠진 콘티 그림을 이어 그리는 길', () => {
  // 왜(리드 2026-11-26 "예전 Storyboard 와 같은 러프 펌프 규칙"): 같은 서버 길 · 같은 꼴 — 어느 샷을 그릴지는 서버가 고른다(이미 있음 · 그리는 중 · 반복 실패 · 스토리 없음은 서버가 건너뛴다).
  it('이어 그리기는 예전 Storyboard 와 같은 러프 요청에 프로젝트만 실어 서버가 빠진 샷을 고르게 한다', async () => {
    replies = [round(['a', 'b'], 0)]
    expect(await fill()).toBe('done')
    expect(sent[0]).toEqual({ url: '/api/writer/rough-storyboard', body: { projectId: 'p1' } })
  })

  // 왜(예전 규칙 #c1): 서버는 한 번에 시트 두 장(샷 8)까지만 맡는다 — 앞 묶음이 끝나야 다음 묶음을 보내 내 한도를 넘지 않는다. 남은 샷이 없으면 끝.
  it('서버가 남은 샷이 있다고 하면 보낸 묶음이 끝난 뒤에 다음 묶음을 보내고, 더 보낼 샷이 없으면 끝낸다', async () => {
    const releaseFirst = holdPoll()
    replies = [round(['a', 'b'], 2, 'job-1'), round(['c', 'd'], 0, 'job-2')]
    const running = fill()
    await vi.waitFor(() => expect(calls.poll).toHaveBeenCalledTimes(1))
    expect(sent).toHaveLength(1)
    releaseFirst()
    expect(await running).toBe('done')
    expect(sent).toHaveLength(3)
    expect(calls.poll.mock.calls.map(([jobId]) => jobId)).toEqual(['job-1', 'job-2'])
  })

  // 왜(2026-09-11 오너 결정): 자리 부족은 멈춤이다 — 브라우저가 자리를 두드리며 기다리지 않는다. 안내는 다른 그리기와 같은 공용 안내 한 번.
  it('자리가 없다는 답(429)을 받으면 다시 시도하지 않고 멈추고 공용 안내를 띄운다', async () => {
    replies = [{ status: 429, body: { ok: false, code: 'generation_quota_exceeded', scope: 'user', queued: 8, limit: 8 } }]
    expect(await fill()).toBe('quota')
    expect(sent).toHaveLength(1)
    expect(calls.quota).toHaveBeenCalledWith(429, expect.objectContaining({ code: 'generation_quota_exceeded' }))
  })

  // 왜(예전 규칙): 러프 요청 자체가 실패하면 같은 요청을 거듭 보내지 않는다 — 까닭을 한 번 알리고 멈춘다.
  it('러프 요청이 실패하면 까닭을 알리고 더 보내지 않는다', async () => {
    replies = [{ status: 500, body: { ok: false, error: { message: '서버 오류' } } }]
    expect(await fill()).toBe('request_failed')
    expect(sent).toHaveLength(1)
    expect(calls.toastError).toHaveBeenCalledWith('서버 오류')
  })

  // 왜(오너 S5 · O7 "그 카드에만 기다림" · 깜박임 방지): 보낸 샷은 큐에 오르기 전에도, 끝난 뒤 샷을 다시 읽는 동안에도 그리는 중이다 —
  //   다시 읽기가 끝나야 카드가 콘티 그림을 보이고 그리는 중에서 빠진다. 큐도 바로 다시 읽어 채팅 진행 알약이 곧 켜진다.
  it('보낸 샷은 샷을 다시 읽을 때까지 그리는 중으로 세고, 묶음이 끝나면 샷을 다시 읽은 뒤 그리는 중에서 뺀다', async () => {
    const release = holdPoll()
    let pendingWhileLoading: string[] = []
    calls.load.mockImplementationOnce(async () => { pendingWhileLoading = Object.keys(useRoughFillStore.getState().pending) })
    replies = [round(['a', 'b'], 0)]
    const running = fill()
    await vi.waitFor(() => expect(calls.poll).toHaveBeenCalled())
    expect(useRoughFillStore.getState()).toMatchObject({ projectId: 'p1', pending: { a: true, b: true }, running: true })
    expect(calls.refresh).toHaveBeenCalled()
    expect(calls.load).not.toHaveBeenCalled()
    release()
    await running
    expect(calls.invalidate).toHaveBeenCalledWith('p1')
    expect(pendingWhileLoading).toEqual(['a', 'b'])
    expect(useRoughFillStore.getState()).toMatchObject({ pending: {}, running: false })
  })

  // 왜: 같은 샷을 두 번 맡기지 않는다 — 이어 그리기가 도는 중이면 그 이어 그리기가 서버가 고른 남은 샷까지 맡는다.
  it('이어 그리기가 도는 동안 또 시작하면 새 요청을 보내지 않는다', async () => {
    const release = holdPoll()
    replies = [round(['a'], 0)]
    const first = fill()
    await vi.waitFor(() => expect(calls.poll).toHaveBeenCalled())
    expect(await fill()).toBe('busy')
    expect(sent).toHaveLength(1)
    release()
    await first
  })

  // 왜(예전 규칙 "화면 이탈 = 멈춤"): Storyboard 를 떠나면 다음 묶음을 보내지 않는다 — 이미 보낸 묶음은 서버에서 끝까지 그린다.
  it('화면을 떠나면 이미 보낸 묶음은 끝까지 두고 다음 묶음은 보내지 않는다', async () => {
    let left = false
    calls.poll.mockImplementationOnce(async () => { left = true; return 'https://x/rough.png' })
    replies = [round(['a', 'b'], 3)]
    expect(await fill(() => left)).toBe('aborted')
    expect(sent).toHaveLength(1)
  })
})

describe('이어 그리기를 언제 시작하는가', () => {
  // 왜(예전 Storyboard 보드와 같은 판정): 그릴 스토리가 비었으면 그릴 근거가 없고, 그리는 중이면 이미 맡겨졌고,
  //   실패한 콘티가 남은 샷은 서버도 "이미 있음"으로 건너뛴다(다시 그리기는 Writer 콘티 카드의 [다시 시도]).
  it('콘티 그림이 아예 없고 그릴 스토리가 있고 그리는 중이 아닌 샷만 빠진 샷으로 센다', () => {
    const shots = [
      { shotId: 'a', actionDescription: '미나가 돌아본다', roughStoryboard: null },
      { shotId: 'b', actionDescription: '   ', roughStoryboard: null },
      { shotId: 'c', actionDescription: '버스가 온다', roughStoryboard: null },
      { shotId: 'd', actionDescription: '비가 온다', roughStoryboard: { url: '', status: 'failed', errorMessage: 'x', generatedAt: 1 } },
      { shotId: 'e', actionDescription: '우산을 편다', roughStoryboard: conti },
    ]
    expect(missingContiShotIds(shots as never, new Set(['c']))).toEqual(['a'])
  })

  // 왜(리드 2026-11-26 "Storyboard 화면이 열려 있을 때 빠진 러프를 이어 그린다"): 들어왔을 때 빠진 샷이 있으면 바로 그린다 — [시작]을 누르기 전에 콘티가 채워지게.
  it('Storyboard 에 들어왔을 때 콘티 그림이 빠진 샷이 있으면 이어 그리기를 시작한다', () => {
    expect(roughFillStart({ missing: ['a', 'c'], tried: new Set(), running: false, writerRunning: false })).toEqual(['a', 'c'])
    expect(roughFillStart({ missing: [], tried: new Set(), running: false, writerRunning: false })).toEqual([])
  })

  // 왜: 자리 부족 · 반복 실패로 멈춘 샷을 화면이 저절로 거듭 맡기면 멈춘 뜻이 없다 — 이 화면에서 한 번 맡긴 샷은 다시 들어올 때 다시 맡긴다.
  //   그 사이 새로 빠진 샷(채팅으로 더한 샷 등)이 생기면 그 샷 때문에 다시 시작한다.
  it('이 화면에서 이미 맡긴 샷만 빠져 있으면 다시 시작하지 않고, 새로 빠진 샷이 생기면 다시 시작한다', () => {
    expect(roughFillStart({ missing: ['a', 'c'], tried: new Set(['a', 'c']), running: false, writerRunning: false })).toEqual([])
    expect(roughFillStart({ missing: ['a', 'z'], tried: new Set(['a', 'c']), running: false, writerRunning: false })).toEqual(['z'])
  })

  // 왜(예전 규칙): 글 파이프라인이 씬 · 샷을 다시 나누는 동안 그리면 곧 바뀔 샷을 그린다. 이어 그리기가 도는 동안에는 그 이어 그리기가 남은 샷까지 맡는다.
  it('글 파이프라인이 도는 동안이나 이어 그리기가 도는 동안에는 새로 시작하지 않는다', () => {
    expect(roughFillStart({ missing: ['a'], tried: new Set(), running: true, writerRunning: false })).toEqual([])
    expect(roughFillStart({ missing: ['a'], tried: new Set(), running: false, writerRunning: true })).toEqual([])
  })
})
