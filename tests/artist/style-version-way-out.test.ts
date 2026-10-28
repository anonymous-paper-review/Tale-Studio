// 화면의 작품 스타일 기록 검토 지적(2026-10-28) — 완료 뒤엔 이어 그리기를 멈추고, 멈춘 재생성은 이전 버전으로 돌아갈 수 있고, 겹친 배경 요청 · 다른 스타일 거절을 바르게 알린다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), message: vi.fn(), info: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useArtistStore } from '@/stores/artist-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import type { GenerationJobReceipt } from '@/lib/generation-jobs-client'

const SLOTS = [
  { kind: 'character', id: 'minho', appearanceKey: 'current', phase: 0, fromUrl: 'https://img/m.png' },
  { kind: 'location', id: 'hall', appearanceKey: null, phase: 0, fromUrl: 'https://img/h.png' },
] as const
const version = (n: number, styleKey: string, current: boolean) => ({ n, styleId: styleKey, styleKey, customStyle: null, current, active: [], createdAt: '', thumbs: [] })
const regenView = (states: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  n: 3, startedAt: '', fromN: 1, slots: SLOTS, states, total: 2, done: Object.values(states).filter((s) => s === 'done').length,
  failed: 0, drawing: 0, complete: false, announced: false, ...extra,
})

/** 서버 창구 흉내 — 버전 v1(실사) · v2(수채화) · v3(수채화, 재생성 중). */
function fakeServer(opts: { completed?: boolean } = {}) {
  const server = { current: 3, regen: regenView({ 'c:minho:current': 'todo', 'l:hall:default': 'todo' }) as ReturnType<typeof regenView> | null, calls: [] as Array<{ url: string; body: Record<string, unknown> | null }> }
  const styles: Record<number, string> = { 1: 'real', 2: 'watercolor', 3: 'watercolor' }
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null
    server.calls.push({ url, body })
    if (url.startsWith('/api/artist/generation-slots')) return Response.json({ limit: 3 })
    if (url.startsWith('/api/artist/versions/load')) {
      server.current = body!.n as number
      server.regen = null
      return Response.json({ ok: true, n: body!.n, styleKey: styles[body!.n as number], customStyle: null })
    }
    if (url.startsWith('/api/artist/versions/regen')) {
      // 접수 전에 막힌 칸은 실패로 적는다 — 이어 그리기가 같은 칸을 다시 보내지 않는다.
      if (body?.action === 'fail' && server.regen) {
        for (const key of body.slots as string[]) server.regen.states[key] = 'failed'
        const values = Object.values(server.regen.states)
        server.regen.complete = values.every((s) => s === 'done' || s === 'failed')
      }
      return Response.json({ ok: true, announced: false, complete: server.regen?.complete ?? true, failed: 0 })
    }
    if (url.startsWith('/api/artist/versions')) {
      return Response.json({ versions: [1, 2, 3].map((n) => version(n, styles[n], n === server.current)), currentN: server.current, regen: server.regen, completed: opts.completed === true })
    }
    return Response.json({})
  }))
  return server
}

const artistMessages = () => useGlobalChatStore.getState().messages.filter((m) => m.stage === 'artist' && m.role === 'model').map((m) => m.content)
const original = { ...useArtistStore.getState() }

beforeEach(() => {
  toast.error.mockClear()
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useArtistVersionStore.getState().reset()
  useProjectStore.setState({ projectId: 'p1', currentStage: 'artist', reachedStage: 'artist', projectLocale: 'ko', projectLocaleLocked: true })
  useProducerStore.setState({
    styleAnchorKey: 'watercolor', customStyleAnchor: null,
    styleAnchors: [
      { key: 'real', label: '실사', medium: 'photo', imageUrl: null, previewUrl: null, subtitle: null },
      { key: 'watercolor', label: '수채화', medium: 'watercolor', imageUrl: null, previewUrl: null, subtitle: null },
    ],
  } as never)
  useArtistVersionStore.getState().setScreenOpen('p1', true)
})
afterEach(() => {
  useArtistStore.setState(original as never)
  vi.unstubAllGlobals()
})

describe('완료 뒤 이어 그리기', () => {
  it('재생성 그림이 남았어도 Storyboard 를 연 뒤(완료)면 이어 그리기를 멈추고 더 보내지 않는다', async () => {
    // 왜: 다른 창에서 완료한 뒤에도 이 화면이 남은 칸을 계속 그리면 Storyboard 에 넘어간 그림이 바뀐다(2026-10-28 검토 지적).
    fakeServer({ completed: true })
    const draw = vi.fn(async () => ({ jobId: 'job', status: 'queued' }))
    useArtistStore.setState({ generateCharacterView: draw, generateWorldShot: draw, loadData: vi.fn(async () => {}) } as never)
    await useArtistVersionStore.getState().continueRegen()
    expect(draw).not.toHaveBeenCalled()
  })
})

describe('멈춘 재생성에서 돌아가기', () => {
  it('재생성 그림이 멈췄을 때 [이전 버전으로 돌아가기]를 누르면 재생성 전 버전을 불러오고 남은 재생성은 그만둔다', async () => {
    // 왜: 모두의 자리가 차서 멈춘 재생성은 빠져나갈 길이 없었다 — 재생성 전 버전(그림 · 스타일)으로 돌아간다(2026-10-28 검토 지적).
    const server = fakeServer()
    useArtistStore.setState({ loadData: vi.fn(async () => {}) } as never)
    await useArtistVersionStore.getState().refresh()
    useArtistVersionStore.setState({ run: { running: false, stopped: true, userWaitSince: null } })

    expect(await useArtistVersionStore.getState().goBackToPrevious()).toBe(true)
    const load = server.calls.find((call) => call.url.startsWith('/api/artist/versions/load'))
    expect(load?.body).toMatchObject({ n: 1, cancelRegen: true })
    expect(useArtistVersionStore.getState().run.stopped).toBe(false)
    expect(useProducerStore.getState().styleAnchorKey).toBe('real')
    expect(artistMessages()).toContain('v1(실사)를 불러왔어요. 작품 스타일도 실사로 바뀌었어요.')
  })

  it('[이전 버전으로 돌아가기]를 누른 뒤 불러오기가 끝날 때까지는 멈춘 상태를 두어, 잠금 화면이 "그림을 만들고 있어요"로 다시 열리지 않는다', async () => {
    // 왜: 불러오기 답을 받자마자 멈춤을 풀었더니 기록을 다시 읽기 전 잠깐 잠금 화면이 "그림을 만들고 있어요 · 수채 · v5"로 다시 떴다(2026-10-28 개발 DB e2e).
    const server = fakeServer()
    useArtistStore.setState({ loadData: vi.fn(async () => {}) } as never)
    await useArtistVersionStore.getState().refresh()
    useArtistVersionStore.setState({ run: { running: false, stopped: true, userWaitSince: null }, overlayDismissedFor: 3 })
    const seen: Array<{ url: string; stopped: boolean; dismissed: number | null }> = []
    const inner = globalThis.fetch as unknown as (input: string, init?: RequestInit) => Promise<Response>
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      const state = useArtistVersionStore.getState()
      seen.push({ url: String(input), stopped: state.run.stopped, dismissed: state.overlayDismissedFor })
      return inner(input, init)
    }))
    expect(await useArtistVersionStore.getState().goBackToPrevious()).toBe(true)
    const reread = seen.filter((call) => call.url.startsWith('/api/artist/versions?'))
    expect(reread.length).toBeGreaterThan(0)
    for (const call of reread) expect(call).toMatchObject({ stopped: true, dismissed: 3 })
    expect(useArtistVersionStore.getState().run.stopped).toBe(false)
    expect(server.current).toBe(1)
  })

  it('재생성 그림이 멈췄을 때 생성 기록에서 불러오면 남은 재생성을 그만두고 불러오고, 그리는 중에는 그만두지 않는다', async () => {
    // 왜: [불러오기]가 멈춘 재생성을 빠져나가는 다른 길이다. 그리는 중에 그만두면 늦게 온 그림이 불러온 버전에 들어간다.
    const server = fakeServer()
    useArtistStore.setState({ loadData: vi.fn(async () => {}) } as never)
    await useArtistVersionStore.getState().refresh()
    await useArtistVersionStore.getState().loadVersion(2)
    expect(server.calls.find((call) => call.url.startsWith('/api/artist/versions/load'))?.body).not.toHaveProperty('cancelRegen')

    const again = fakeServer()
    await useArtistVersionStore.getState().refresh()
    useArtistVersionStore.setState({ run: { running: false, stopped: true, userWaitSince: null } })
    await useArtistVersionStore.getState().loadVersion(2)
    expect(again.calls.find((call) => call.url.startsWith('/api/artist/versions/load'))?.body).toMatchObject({ n: 2, cancelRegen: true })
  })
})

describe('겹친 배경 요청', () => {
  it('배경 [다시 만들기]를 1초 안에 두 번 누르면 두 번째는 겹친 요청으로 알려, 재생성 이어 그리기가 그 배경을 실패로 적지 않는다', async () => {
    // 왜: 두 번째 요청이 아무 답 없이 끝나면 이어 그리기는 그 칸을 "접수 전 거절"로 보고 실패로 적었다(2026-10-28 검토 지적).
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({})))
    const receipts: GenerationJobReceipt[] = []
    const store = useArtistStore.getState()
    await store.generateWorldShot('hall-dup', 'wideShot', undefined, 'ui')
    await store.generateWorldShot('hall-dup', 'wideShot', undefined, 'ui', undefined, { onJob: (receipt) => { receipts.push(receipt) } })
    expect(receipts).toEqual([{ jobId: null, status: 'deduped' }])
  })
})

describe('다른 스타일 거절', () => {
  it('다른 창에서 스타일이 바뀌어 카드 기록의 그림을 고르지 못하면 "다른 스타일이라 불러올 수 없어요"를 한국어 알림으로 띄운다', async () => {
    // 왜: 오래 열어 둔 화면은 기록이 바뀐 줄 모른다 — 서버가 막은 까닭이 영어 오류로 조용히 묻혔다(2026-10-28 검토 지적).
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'This image is in another style', code: 'other_style' }, { status: 409 })))
    await useArtistStore.getState().selectCandidate('minho', 'current', 'main', 'cand-1')
    expect(toast.error).toHaveBeenCalledWith('다른 스타일이라 불러올 수 없어요')
    expect(useArtistStore.getState().error).not.toBe('This image is in another style')

    toast.error.mockClear()
    await expect(useArtistStore.getState().selectLocationCandidate('hall', 'lc-1', null)).resolves.toBeUndefined()
    expect(toast.error).toHaveBeenCalledWith('다른 스타일이라 불러올 수 없어요')
  })
})
