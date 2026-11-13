// 영상 묶음에서 차례를 기다리는 샷은 "순서 기다리는 중 · N번째"이고, 맨 앞이 아니면 [먼저 하기]로 다음 차례가 된다 (시안 D4 · 결정 페이지 추천, 리드 S4-2 7)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VideoBatchSummary } from '@/lib/director/video-batch-types'

const store = vi.hoisted(() => {
  const state: Record<string, unknown> = {
    projectId: 'project-1',
    videoBatchRunId: 'batch-1',
    videoBatchQueue: { jobIds: ['job-0'], pendingShotIds: ['w1', 'w2', 'w3'] },
  }
  return { state, setState: vi.fn((patch: Record<string, unknown>) => Object.assign(state, patch)) }
})
vi.mock('@/stores/director-store', () => ({
  useDirectorCanvasStore: Object.assign((select: (s: unknown) => unknown) => select(store.state), {
    getState: () => store.state,
    setState: store.setState,
  }),
}))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { ShotStateTail } from '@/features/director/shot-status'
import { moveVideoBatchShotFirst } from '@/lib/director/video-batch-order'
import { translate } from '@/lib/i18n/translate'

const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const read = (relative: string) => readFileSync(relative, 'utf8')
const summary = (pendingShotIds: string[], status: VideoBatchSummary['status'] = 'running'): VideoBatchSummary => ({
  id: 'batch-1', projectId: 'project-1', status, total: 4, started: 1, failedToStart: 0, done: 0, failed: 0,
  pending: pendingShotIds.length, active: 1, stopReason: null, jobs: [{ jobId: 'job-0', status: 'queued' }], pendingShotIds,
})

beforeEach(() => {
  Object.assign(store.state, { projectId: 'project-1', videoBatchRunId: 'batch-1', videoBatchQueue: { jobIds: ['job-0'], pendingShotIds: ['w1', 'w2', 'w3'] } })
  store.setState.mockClear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('같이 정한 것', () => {
  it('영상 묶음에서 차례를 기다리는 샷의 꼬리는 "순서 기다리는 중 · N번째"이고, 맨 앞이 아니면 [먼저 하기]가 있다', () => {
    // 왜: 시안 D4 "차례를 기다려요 · N번째 · [먼저 하기]"(결정 페이지 추천 — 영상 묶음 순서만). 꼬리 글은 11/5 시안 DG 의 "순서 기다리는 중"에 N번째를 붙인다.
    expect(ko('Waiting in line · #{n}', { n: 2 })).toBe('순서 기다리는 중 · 2번째')
    const tail = renderToStaticMarkup(createElement(ShotStateTail, {
      state: 'video_generating', label: 'Waiting in line · #{n}', labelParams: { n: 2 }, lineAction: createElement('button', null, '먼저 하기'),
    }))
    expect(tail).toContain('순서 기다리는 중 · 2번째')
    expect(tail).toContain('먼저 하기')
    for (const file of ['src/features/director/canvas-views/StoryboardGridView.tsx', 'src/features/director/canvas-nodes/ShotNode.tsx']) {
      const src = read(file)
      expect(src, file).toContain("'Waiting in line · #{n}'")
      expect(src, file).toMatch(/lineAction=\{linePosition > 0 && writerShotId \? <MoveFirstButton shotId=\{writerShotId\}/)
    }
  })

  it('[먼저 하기]를 누르면 서버에 그 샷을 다음 차례로 옮기라고 하고, 돌아온 낼 순서를 바로 보인다', async () => {
    // 왜: 다음 조회(2.5초)를 기다리지 않고 "N번째"가 바로 바뀐다.
    const calls: Array<{ method?: string; body: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ method: init?.method, body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify({ batch: summary(['w3', 'w1', 'w2']) }), { status: 200 })
    }))
    expect(await moveVideoBatchShotFirst('w3')).toBe('moved')
    expect(calls).toEqual([{ method: 'PATCH', body: { projectId: 'project-1', batchId: 'batch-1', shotId: 'w3' } }])
    expect((store.state.videoBatchQueue as { pendingShotIds: string[] }).pendingShotIds).toEqual(['w3', 'w1', 'w2'])
  })
})

describe('혼자 정한 것', () => {
  it('이미 나갔거나 묶음이 멈췄으면(409 · 404) 조용히 두고, 못 바꾸면 "순서를 바꾸지 못했어요. 다시 눌러 주세요."를 알린다', async () => {
    // 왜: 누르는 사이 서버가 그 샷을 냈으면 할 일이 없다(다음 조회가 화면을 맞춘다). 끊김 · 서버 오류만 다시 누르라고 한다.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 409 })))
    expect(await moveVideoBatchShotFirst('w3')).toBe('gone')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    expect(await moveVideoBatchShotFirst('w3')).toBe('gone')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    expect(await moveVideoBatchShotFirst('w3')).toBe('failed')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await moveVideoBatchShotFirst('w3')).toBe('failed')
    expect(store.setState).not.toHaveBeenCalled()
    expect(ko('Could not change the order. Try again.')).toBe('순서를 바꾸지 못했어요. 다시 눌러 주세요.')
    expect(read('src/features/director/move-first-button.tsx')).toContain("toast.error(t('Could not change the order. Try again.'))")
  })

  it('맨 앞(1번째)인 샷과 이미지 차례에는 [먼저 하기]가 없다', () => {
    // 왜: 이미 다음 차례면 할 일이 없다. 이미지는 4샷 한 장이라 줄이 없다(S4 혼자 정한 것 d).
    const first = renderToStaticMarkup(createElement(ShotStateTail, { state: 'video_generating', label: 'Waiting in line · #{n}', labelParams: { n: 1 }, lineAction: null }))
    expect(first).toContain('순서 기다리는 중 · 1번째')
    expect(first).not.toContain('먼저 하기')
    const image = renderToStaticMarkup(createElement(ShotStateTail, { state: 'image_generating', waiting: true, lineAction: createElement('button', null, '먼저 하기') }))
    expect(image).not.toContain('먼저 하기')
  })

  it('[먼저 하기] 사이 그 샷이 이미 나갔으면(서버 200) 줄에서 지우고 오류 말 없이 넘어간다', async () => {
    // 왜: 리드 검토 a 참고 — 서버가 순서를 읽은 뒤 그 샷이 나가면 409 대신 200 이 온다. 돌아온 순서를 실으면 그 샷은 줄에서 빠진다.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ batch: summary(['w1', 'w2']) }), { status: 200 })))
    expect(await moveVideoBatchShotFirst('w3')).toBe('gone')
    expect((store.state.videoBatchQueue as { pendingShotIds: string[] }).pendingShotIds).toEqual(['w1', 'w2'])
    expect(read('src/features/director/move-first-button.tsx')).toMatch(/if \(result === 'failed'\) toast\.error/)
  })

  it('다른 두 샷을 잇달아 [먼저 하기]하면 마지막에 누른 것의 답만 화면에 싣는다 — 늦게 온 앞 답이 덮지 않는다', async () => {
    // 왜: 검토 c G2 — 답이 거꾸로 오면 늦게 온 옛 순서(w2 · w1 · w3)가 서버의 지금 순서(w3 · w2 · w1)를 덮었다(다음 조회까지).
    const resolvers: Array<(r: Response) => void> = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolvers.push(resolve) })))
    const first = moveVideoBatchShotFirst('w2')
    const second = moveVideoBatchShotFirst('w3')
    resolvers[1]!(new Response(JSON.stringify({ batch: summary(['w3', 'w2', 'w1']) }), { status: 200 }))
    await second
    resolvers[0]!(new Response(JSON.stringify({ batch: summary(['w2', 'w1', 'w3']) }), { status: 200 }))
    await first
    expect((store.state.videoBatchQueue as { pendingShotIds: string[] }).pendingShotIds).toEqual(['w3', 'w2', 'w1'])
  })

  it('다른 묶음으로 바뀐 뒤 돌아온 답은 화면에 싣지 않는다', async () => {
    // 왜: 누르는 사이 묶음이 끝나고 새 묶음이 섰으면 옛 순서로 새 묶음을 덮지 않는다.
    vi.stubGlobal('fetch', vi.fn(async () => {
      store.state.videoBatchRunId = 'batch-2'
      return new Response(JSON.stringify({ batch: summary(['w3', 'w1', 'w2']) }), { status: 200 })
    }))
    expect(await moveVideoBatchShotFirst('w3')).toBe('moved')
    expect(store.setState).not.toHaveBeenCalled()
  })
})
