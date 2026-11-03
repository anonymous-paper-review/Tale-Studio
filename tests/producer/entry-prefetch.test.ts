// 다른 단계를 보는 동안 Producer 시작 화면 자료를 미리 받아, 처음 여는 Producer 탭도 바로 보인다 · 미리 받기는 지금 화면을 바꾸지 않는다 (QA 2026-11-03 "Producer 탭 로딩이 너무 길다")
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEntryStore } from '@/features/entry/entry-store'
import { emptyEntryDraft } from '@/lib/entry/draft'

// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const IDEA = '등대지기가 보내지 못한 편지를 바다에 띄우는 이야기.'

type Reply = { status?: number; body?: unknown }
let replies: Array<Reply | Promise<Reply>> = []
let urls: string[] = []

function respond({ status = 200, body = {} }: Reply) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function startedBody(title: string, writer = { started: true, status: 'completed', draft: false }) {
  return { draft: { ...emptyEntryDraft(), idea: IDEA, startedAt: '2026-11-01T00:00:00.000Z' }, title, startedAt: '2026-11-01T00:00:00.000Z', locale: 'en', stage: 'editor', format: null, series: null, writer, writerStart: null }
}
function freshBody(title: string) {
  return { draft: { ...emptyEntryDraft(), idea: IDEA }, title, startedAt: null, locale: 'en', stage: 'entry', format: null, series: null, writer: { started: false, status: null, draft: false }, writerStart: null }
}
function later() {
  let give!: (reply: Reply) => void
  const reply = new Promise<Reply>((resolve) => (give = resolve))
  return { reply, give }
}

beforeEach(() => {
  replies = []
  urls = []
  useEntryStore.getState().reset()
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    urls.push(url)
    if (!url.startsWith('/api/produce/entry?')) return respond({ status: 404, body: { error: 'not_mocked' } })
    return respond(await (replies.shift() ?? { status: 404, body: { error: 'not_mocked' } }))
  }))
})

afterEach(() => {
  useEntryStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('시작 화면 자료 미리 받기', () => {
  it('다른 단계를 보는 동안 시작 화면 자료를 미리 받아 두면, 처음 여는 Producer 탭도 받아 둔 내용을 바로 보여 준다', async () => {
    // 왜: 다른 탭은 스튜디오가 미리 받아 두어 바로 뜨는데, Producer 탭만 처음 열 때마다 "불러오는 중"을 기다렸다(QA 11/3).
    replies.push({ body: startedBody("The Keeper's Letters") })
    await useEntryStore.getState().prefetch('p-warm')

    const slow = later()
    replies.push(slow.reply)
    const opening = useEntryStore.getState().load('p-warm')
    expect(useEntryStore.getState()).toMatchObject({ projectId: 'p-warm', status: 'ready', title: "The Keeper's Letters" })
    slow.give({ body: startedBody("The Keeper's Letters") })
    await opening
  })

  it('미리 받기는 지금 보이는 시작 화면 상태를 바꾸지 않고 Writer 진행도 따라가지 않는다', async () => {
    // 왜: 미리 받기는 다른 단계를 보는 동안 돈다 — 시작 화면 상태를 바꾸거나 산문 초안 진행을 따라가면, 나중에 Producer 를 열 때 엉뚱하게 Writer 로 넘어갈 수 있다.
    replies.push({ body: startedBody('Letters', { started: true, status: 'running', draft: true }) })
    await useEntryStore.getState().prefetch('p-quiet')
    expect(useEntryStore.getState()).toMatchObject({ projectId: null, status: 'idle', title: 'Untitled' })
    expect(useEntryStore.getState().writing.status).toBe('idle')
    expect(urls.filter((u) => u.includes('/api/writer/status'))).toEqual([])
  })

  it('아직 시작하지 않은 프로젝트는 미리 받아도 받아 둔 것으로 쓰지 않는다', async () => {
    // 왜: 시작 전 화면은 글을 고치는 화면이라 늘 새로 받은 초안으로 연다(다시 열기와 같은 규칙).
    replies.push({ body: freshBody('Draft') })
    await useEntryStore.getState().prefetch('p-draft')

    const slow = later()
    replies.push(slow.reply)
    const opening = useEntryStore.getState().load('p-draft')
    expect(useEntryStore.getState().status).toBe('loading')
    slow.give({ body: freshBody('Draft') })
    await opening
  })

  it('미리 받기가 거절되거나 실패해도 아무것도 받아 두지 않는다', async () => {
    // 왜: 거절된 프로젝트 내용을 받아 두면 안 되고, 실패한 미리 받기 때문에 화면이 오류를 보이지도 않는다.
    replies.push({ status: 403, body: { error: 'Forbidden' } })
    await useEntryStore.getState().prefetch('p-refused')
    replies.push({ status: 500, body: { error: 'Failed to process the request.' } })
    await useEntryStore.getState().prefetch('p-refused')
    expect(useEntryStore.getState().status).toBe('idle')

    const slow = later()
    replies.push(slow.reply)
    const opening = useEntryStore.getState().load('p-refused')
    expect(useEntryStore.getState().status).toBe('loading')
    slow.give({ status: 403, body: { error: 'Forbidden' } })
    await opening
  })
})
