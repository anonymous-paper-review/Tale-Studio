// 시작한 프로젝트의 Producer 시작 화면은 다시 열 때 받아 둔 내용을 바로 보여 주고 뒤에서 새로 받는다 · 시작 전 · 다른 프로젝트 · 권한 없음은 받아 둔 것을 쓰지 않는다 (QA 2026-11-03 "Producer 탭 로딩이 너무 길다")
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEntryStore } from '@/features/entry/entry-store'
import { emptyEntryDraft } from '@/lib/entry/draft'

// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const IDEA = '등대지기가 보내지 못한 편지를 바다에 띄우는 이야기.'

type Reply = { status?: number; body?: unknown }
/** 다음 GET /api/produce/entry 들의 답 — 차례로 쓴다. Promise 를 넣으면 그 답이 올 때까지 기다린다. */
let replies: Array<Reply | Promise<Reply>> = []

function respond({ status = 200, body = {} }: Reply) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function startedBody(title: string) {
  return { draft: { ...emptyEntryDraft(), idea: IDEA, startedAt: '2026-11-01T00:00:00.000Z' }, title, startedAt: '2026-11-01T00:00:00.000Z', locale: 'en', stage: 'editor', format: null, series: null, writer: { started: true, status: 'completed', draft: false }, writerStart: null }
}
function freshBody(title: string) {
  return { draft: { ...emptyEntryDraft(), idea: IDEA }, title, startedAt: null, locale: 'en', stage: 'entry', format: null, series: null, writer: { started: false, status: null, draft: false }, writerStart: null }
}
/** 답을 나중에 주는 자리 — 화면이 기다리는 동안의 모습을 본다. */
function later() {
  let give!: (reply: Reply) => void
  const reply = new Promise<Reply>((resolve) => (give = resolve))
  return { reply, give }
}

beforeEach(() => {
  replies = []
  useEntryStore.getState().reset()
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (!url.startsWith('/api/produce/entry?')) return respond({ status: 404, body: { error: 'not_mocked' } })
    const next = replies.shift() ?? { status: 404, body: { error: 'not_mocked' } }
    return respond(await next)
  }))
})

afterEach(() => {
  useEntryStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('Producer 시작 화면을 다시 열 때', () => {
  it('시작한 프로젝트의 시작 화면을 다시 열면 받아 둔 내용을 바로 보여 주고, 새로 받은 내용이 오면 바꾼다', async () => {
    // 왜: 시작한 프로젝트의 시작 화면은 읽기만 하는 완료 화면인데, 탭을 오갈 때마다 처음부터 다시 받아 "불러오는 중"이 길었다(QA 11/3).
    replies.push({ body: startedBody('Letters') })
    await useEntryStore.getState().load('p-started')
    useEntryStore.getState().reset()

    const slow = later()
    replies.push(slow.reply)
    const reloading = useEntryStore.getState().load('p-started')
    expect(useEntryStore.getState()).toMatchObject({ projectId: 'p-started', status: 'ready', title: 'Letters' })
    expect(useEntryStore.getState().draft.startedAt).toBe('2026-11-01T00:00:00.000Z')

    slow.give({ body: startedBody("The Keeper's Letters") })
    await reloading
    expect(useEntryStore.getState()).toMatchObject({ status: 'ready', title: "The Keeper's Letters" })
  })

  it('아직 시작하지 않은 프로젝트는 다시 열 때도 지금처럼 새로 받은 뒤에 보여 준다', async () => {
    // 왜: 정상 경로 고정 — 시작 전 화면은 글을 고치는 화면이다. 받아 둔 옛 초안을 먼저 보이면 고치는 동안 새 초안과 겹칠 수 있다.
    replies.push({ body: freshBody('Draft') })
    await useEntryStore.getState().load('p-fresh')
    useEntryStore.getState().reset()

    const slow = later()
    replies.push(slow.reply)
    const reloading = useEntryStore.getState().load('p-fresh')
    expect(useEntryStore.getState().status).toBe('loading')
    slow.give({ body: freshBody('Draft') })
    await reloading
    expect(useEntryStore.getState().status).toBe('ready')
  })

  it('다른 프로젝트를 열면 앞 프로젝트에서 받아 둔 내용을 보여 주지 않는다', async () => {
    // 왜: 받아 둔 내용은 그 프로젝트 것이다. 다른 프로젝트 화면에 앞 프로젝트 제목 · 이야기가 잠깐이라도 보이면 안 된다.
    replies.push({ body: startedBody('Letters') })
    await useEntryStore.getState().load('p-first')
    useEntryStore.getState().reset()

    const slow = later()
    replies.push(slow.reply)
    const loading = useEntryStore.getState().load('p-second')
    expect(useEntryStore.getState()).toMatchObject({ projectId: 'p-second', status: 'loading', title: 'Untitled' })
    expect(useEntryStore.getState().draft.idea).toBe('')
    slow.give({ body: startedBody('Second') })
    await loading
  })

  it('다시 열 때 서버가 잠깐 실패하면 받아 둔 내용을 그대로 보여 준다', async () => {
    // 왜: 읽기만 하는 완료 화면이라 받아 둔 내용이 오류 화면보다 낫다 — 한 번 실패로 "불러오지 못했어요"가 뜨지 않게.
    replies.push({ body: startedBody('Letters') })
    await useEntryStore.getState().load('p-flaky')
    useEntryStore.getState().reset()

    replies.push({ status: 500, body: { error: 'Failed to process the request.' } })
    await useEntryStore.getState().load('p-flaky')
    expect(useEntryStore.getState()).toMatchObject({ status: 'ready', title: 'Letters' })
  })

  it('다시 열 때 권한이 없다는 답이 오면 받아 둔 내용을 버리고 열지 못했다고 보여 준다', async () => {
    // 왜: 서버가 거절한 프로젝트의 내용을 받아 둔 것으로 계속 보여 주면 안 된다. 다음에 열 때도 받아 둔 것을 쓰지 않는다.
    replies.push({ body: startedBody('Letters') })
    await useEntryStore.getState().load('p-revoked')
    useEntryStore.getState().reset()

    replies.push({ status: 403, body: { error: 'Forbidden' } })
    await useEntryStore.getState().load('p-revoked')
    expect(useEntryStore.getState().status).toBe('error')
    useEntryStore.getState().reset()

    const slow = later()
    replies.push(slow.reply)
    const again = useEntryStore.getState().load('p-revoked')
    expect(useEntryStore.getState().status).toBe('loading')
    slow.give({ status: 403, body: { error: 'Forbidden' } })
    await again
  })
})
