// 실사 가운데 장(N4b)의 끝 장 다시 그리기 흐름 — 실사 주소로 보내기 · 작업을 받으면 읽은 줄을 바로 보이기 · 못 읽으면 줄을 직접 적게 하기 · 콘티는 지금 그대로 — 를 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/generation-jobs-client', () => ({ pollGenerationJob: vi.fn(async () => 'https://media.test/end.png') }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn(async () => {}) }))

import { endRedrawDeps, keepLineDeps } from '@/features/writer/unsaved-arrows-confirm'
import { redrawEndFrame, type EndRedrawDeps } from '@/lib/writer/end-frame-ask'

const REAL_URL = '/api/storyboard/real-directing-edit'
const ROUGH_URL = '/api/writer/rough-directing-edit'
const t = ((key: string) => key) as unknown as Parameters<typeof endRedrawDeps>[1]
let posted: Array<{ url: string; body: Record<string, unknown> }>

beforeEach(() => {
  posted = []
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: string }) => {
    posted.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) })
    return new Response(JSON.stringify({ data: { jobId: 'job-1', read: null } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

function fakeDeps(post: EndRedrawDeps['post'], extra: Partial<EndRedrawDeps> = {}) {
  const calls: string[] = []
  const deps: EndRedrawDeps = {
    post,
    waitJob: async () => { calls.push('wait') },
    reload: async () => { calls.push('reload') },
    notify: {
      info: () => calls.push('info'),
      success: () => calls.push('success'),
      error: (message) => calls.push(`error:${message}`),
    },
    messages: { drawing: 'drawing', done: 'done', failed: 'failed', unreadable: 'unreadable', translateFailed: 'translate' },
    ...extra,
  }
  return { deps, calls }
}

describe('실사 끝 장 다시 그리기 흐름', () => {
  // 왜: 실사 끝 장 · 고친 줄 · 줄 읽기는 실사 시트를 바꿔야 한다 — 콘티 주소로 가면 목각 러프의 끝 장이 바뀐다. 물음 창 부품은 콘티와 같이 쓴다.
  it('실사 끝 장 다시 그리기 · 고친 줄 남기기는 실사 주소로 보내고 콘티는 지금 주소로 보낸다', async () => {
    const real = { projectId: 'p1', shotId: 'sh_1', onRedrawn: () => {}, endpoint: REAL_URL }
    await endRedrawDeps(real, t).post({ action: 'regenerate-frame', projectId: 'p1', shotId: 'sh_1', frame: 'end' })
    await keepLineDeps(real, t).post({ action: 'keep-line', projectId: 'p1', shotId: 'sh_1', line: { text: 'x', lang: 'en' } })
    expect(posted.map((p) => p.url)).toEqual([REAL_URL, REAL_URL])
    posted = []
    const rough = { projectId: 'p1', shotId: 'sh_1', onRedrawn: () => {} }
    await endRedrawDeps(rough, t).post({ action: 'regenerate-frame', projectId: 'p1', shotId: 'sh_1', frame: 'end' })
    await keepLineDeps(rough, t).post({ action: 'keep-line', projectId: 'p1', shotId: 'sh_1', line: { text: 'x', lang: 'en' } })
    expect(posted.map((p) => p.url)).toEqual([ROUGH_URL, ROUGH_URL])
  })

  // 왜: 실사는 저장하면 묻지 않고 끝 장을 그린다(N4b) — 줄은 서버가 작업을 낼 때 읽어 남긴다. 그 줄이 편집기 아래에 1분 넘게 안 보이면
  //   무엇으로 그리는지 모른다(리드 "읽은 한 줄은 편집기 아래에 보인다"). 작업을 받으면 기다리기 전에 한 번 다시 읽는다.
  it('끝 장 작업을 받으면 다 그리기 전에 화면을 한 번 다시 읽어 읽은 줄을 보인다', async () => {
    const accepted = vi.fn(async () => {})
    const { deps, calls } = fakeDeps(async () => ({ ok: true, jobId: 'job-1' }), { accepted })
    await expect(redrawEndFrame('p1', 'sh_1', deps)).resolves.toBe(true)
    expect(accepted).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['info', 'wait', 'reload', 'success'])
  })

  // 왜(혼자 정한 것 k): 실사 상세에는 콘티의 "연출 탭"이 없다 — 못 읽었다는 알림 대신 줄을 직접 적는 물음 창을 연다(줄을 적어야 그린다).
  it('읽는 AI 가 화살표를 못 읽었으면 실사는 알림 대신 줄을 직접 적는 창을 연다', async () => {
    const unreadable = vi.fn()
    const { deps, calls } = fakeDeps(async () => ({ ok: false, code: 'direction_unreadable', error: 'x' }), { unreadable })
    await expect(redrawEndFrame('p1', 'sh_1', deps)).resolves.toBe(false)
    expect(unreadable).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['info'])
  })

  // 왜: 정상 경로 고정 — 콘티는 고리를 넘기지 않으므로 지금처럼 다 그린 뒤에만 다시 읽고, 못 읽으면 알림을 띄운다.
  it('콘티 끝 장 다시 그리기는 다 그린 뒤에만 다시 읽고 못 읽으면 알림을 띄운다', async () => {
    const ok = fakeDeps(async () => ({ ok: true, jobId: 'job-1' }))
    await redrawEndFrame('p1', 'sh_1', ok.deps)
    expect(ok.calls).toEqual(['info', 'wait', 'reload', 'success'])
    const bad = fakeDeps(async () => ({ ok: false, code: 'direction_unreadable', error: 'x' }))
    await redrawEndFrame('p1', 'sh_1', bad.deps)
    expect(bad.calls).toEqual(['info', 'error:unreadable'])
  })
})
