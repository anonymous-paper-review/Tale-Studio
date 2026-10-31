// 화면의 작품 스타일 기록 검토 지적(2026-10-28) — 완료 뒤엔 이어 그리기를 멈추고, 멈춘 재생성은 이전 버전으로 돌아갈 수 있고, 겹친 배경 요청 · 다른 스타일 거절을 바르게 알린다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), message: vi.fn(), info: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { completeVersionBlock, useArtistVersionStore, versionsNeedRefresh } from '@/stores/artist-version-store'
import { refreshAfterCompleteRefused } from '@/features/artist-room/artist-complete-dialog'
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
function fakeServer(opts: { completed?: boolean; keptBackgrounds?: number; loadNoAnswer?: boolean } = {}) {
  const server = {
    current: 3, restoring: false, loadFailed: null as null | { n: number; from: number | null }, regen: regenView({ 'c:minho:current': 'todo', 'l:hall:default': 'todo' }) as ReturnType<typeof regenView> | null,
    calls: [] as Array<{ url: string; body: Record<string, unknown> | null }>,
  }
  const styles: Record<number, string> = { 1: 'real', 2: 'watercolor', 3: 'watercolor' }
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null
    server.calls.push({ url, body })
    if (url.startsWith('/api/artist/generation-slots')) return Response.json({ limit: 3 })
    if (url.startsWith('/api/artist/versions/load')) {
      server.current = body!.n as number
      server.regen = null
      // 함수가 시간 제한에 끊긴 것처럼 — 서버는 바꿨지만 답은 오지 않는다.
      if (opts.loadNoAnswer) return new Response('An error occurred', { status: 504 })
      return Response.json({ ok: true, n: body!.n, styleKey: styles[body!.n as number], customStyle: null, keptBackgrounds: opts.keptBackgrounds ?? 0 })
    }
    if (url.startsWith('/api/artist/versions/regen')) {
      // 접수 전에 막힌 칸은 실패로 적는다 — 이어 그리기가 같은 칸을 다시 보내지 않는다.
      if (body?.action === 'fail' && server.regen) {
        for (const key of body.slots as string[]) server.regen.states[key] = 'failed'
        const values = Object.values(server.regen.states)
        server.regen.complete = values.every((s) => s === 'done' || s === 'failed')
      }
      if (body?.action === 'finish' && server.regen?.complete && !server.regen.announced) {
        server.regen.announced = true
        return Response.json({ ok: true, announced: true, complete: true, failed: 0 })
      }
      return Response.json({ ok: true, announced: false, complete: server.regen?.complete ?? true, failed: 0 })
    }
    if (url.startsWith('/api/artist/versions')) {
      return Response.json({
        versions: [1, 2, 3].map((n) => version(n, styles[n], n === server.current)), currentN: server.current, regen: server.regen, completed: opts.completed === true,
        restoring: server.restoring, loadFailed: server.loadFailed, style: { key: styles[server.current], custom: null },
      })
    }
    return Response.json({})
  }))
  return server
}

const artistMessages = () => useGlobalChatStore.getState().messages.filter((m) => m.stage === 'artist' && m.role === 'model').map((m) => m.content)
const original = { ...useArtistStore.getState() }

beforeEach(() => {
  toast.error.mockClear()
  toast.info.mockClear()
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

describe('그대로 둔 배경 알리기', () => {
  it('불러온 버전에서 다른 모습이 있는 배경을 지금 그림 그대로 두었으면 "다른 모습이 있는 배경 n곳은 지금 그림 그대로예요."를 알린다', async () => {
    // 왜: 2026-10-31 오너 결정 A — 불러왔는데 일부 배경이 그대로면 고장 난 줄 안다. 몇 곳이 왜 그대로인지 한 줄로 알린다.
    fakeServer({ keptBackgrounds: 2 })
    useArtistStore.setState({ loadData: vi.fn(async () => {}) } as never)
    expect(await useArtistVersionStore.getState().loadVersion(1)).toBe(true)
    expect(toast.info).toHaveBeenCalledWith('다른 모습이 있는 배경 2곳은 지금 그림 그대로예요.')

    toast.info.mockClear()
    fakeServer({ keptBackgrounds: 0 })
    await useArtistVersionStore.getState().loadVersion(2)
    expect(toast.info).not.toHaveBeenCalled()
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
    // 채팅 도구도 같은 함수를 부른다 — 실패를 돌려줘야 "바꿨어요"라고 말하지 않는다(2026-10-31 재검토 지적).
    await expect(useArtistStore.getState().selectLocationCandidate('hall', 'lc-1', null)).resolves.toMatchObject({ ok: false, code: 'other_style' })
    expect(toast.error).toHaveBeenCalledWith('다른 스타일이라 불러올 수 없어요')
  })
})

describe('끊긴 불러오기 · 멈춘 재생성 화면 맞추기(2026-10-31 재검토)', () => {
  it('버전 불러오기 답을 받지 못하면 기록을 다시 읽어 작품 스타일 이름 · 카드 기록 가리기도 서버의 지금 스타일로 맞춘다', async () => {
    // 왜: 끊긴 불러오기는 서버가 이미 바꿨을 수 있다 — 화면이 옛 스타일 이름 · 카드 기록 가리기를 그대로 쓰면 다른 스타일 그림을 고를 수 있었다.
    const server = fakeServer({ loadNoAnswer: true })
    useArtistStore.setState({ loadData: vi.fn(async () => {}) } as never)
    expect(await useArtistVersionStore.getState().loadVersion(1)).toBe(false)
    expect(server.current).toBe(1)
    expect(useArtistVersionStore.getState().currentN).toBe(1)
    expect(useProducerStore.getState().styleAnchorKey).toBe('real')
  })

  it('[완료하기]가 버전을 불러오는 중이라 막히면 기록을 다시 읽어 머리 줄에 불러오는 중을 보인다', async () => {
    // 왜: 막혔다는 알림만 뜨고 화면은 그대로라 언제 다시 눌러야 할지 몰랐다.
    const server = fakeServer()
    server.restoring = true
    await refreshAfterCompleteRefused('version_restoring')
    await vi.waitFor(() => expect(useArtistVersionStore.getState().restoring).toBe(true))
    server.restoring = false
    await refreshAfterCompleteRefused('artist_images_missing')
    expect(useArtistVersionStore.getState().restoring).toBe(true)
  })

  it('불러오는 중이거나, 재생성이 멈췄어도 그리던 그림이 남았으면 기록을 몇 초마다 다시 읽는다', () => {
    // 왜: 멈춘 뒤에 끝난 그림이 진행 · "만들었어요" 알림에 반영되지 않고 단추를 눌러야 바뀌었다.
    const regen = regenView({ 'c:minho:current': 'drawing', 'l:hall:default': 'failed' }, { drawing: 1 })
    const idle = { running: false, stopped: false, userWaitSince: null }
    const stopped = { ...idle, stopped: true }
    expect(versionsNeedRefresh({ regen, run: idle, restoring: false })).toBe(true)
    expect(versionsNeedRefresh({ regen, run: stopped, restoring: false })).toBe(true)
    const waiting = regenView({ 'c:minho:current': 'todo', 'l:hall:default': 'failed' }, { drawing: 0 })
    expect(versionsNeedRefresh({ regen: waiting, run: stopped, restoring: false })).toBe(false)
    expect(versionsNeedRefresh({ regen: null, run: idle, restoring: true })).toBe(true)
    expect(versionsNeedRefresh({ regen: null, run: idle, restoring: false })).toBe(false)
  })

  it('재생성이 멈춘 뒤에도 그리던 그림이 끝나 다 그렸으면, 단추를 누르지 않아도 다 그렸다고 알리고 멈춤을 푼다', async () => {
    // 왜: 모두의 자리로 멈춘 뒤 이미 보낸 그림이 끝나도 "만들었어요" 알림 · 잠금 화면이 그대로였다(2026-10-31 재검토 지적).
    const server = fakeServer()
    server.regen = regenView({ 'c:minho:current': 'drawing', 'l:hall:default': 'failed' }, { drawing: 1 })
    await useArtistVersionStore.getState().refresh()
    useArtistVersionStore.setState({ run: { running: false, stopped: true, userWaitSince: null } })
    server.regen = regenView({ 'c:minho:current': 'done', 'l:hall:default': 'failed' }, { failed: 1, complete: true })
    await useArtistVersionStore.getState().refresh()
    await vi.waitFor(() => expect(artistMessages().some((message) => message.startsWith('수채화로 v3을 만들었어요.'))).toBe(true))
    expect(useArtistVersionStore.getState().run.stopped).toBe(false)
  })
})

describe('다 불러오지 못한 버전(2026-10-31 재검토)', () => {
  it('버전을 다 불러오지 못했으면 기록 읽기로 그 상태를 받아, [다시 불러오기]는 그 버전을, [이전 버전으로 돌아가기]는 불러오기 전 버전을 불러온다', async () => {
    // 왜: 반쯤 불러온 버전이 아무 말 없이 지금 버전으로 남았다 — 다시 불러오거나 돌아가는 두 길을 단추로 준다.
    const server = fakeServer()
    server.current = 1
    server.regen = null
    server.loadFailed = { n: 1, from: 3 }
    useArtistStore.setState({ loadData: vi.fn(async () => {}) } as never)
    await useArtistVersionStore.getState().refresh()
    expect(useArtistVersionStore.getState().loadFailed).toEqual({ n: 1, from: 3 })
    expect(await useArtistVersionStore.getState().retryFailedLoad()).toBe(true)
    expect(server.calls.filter((call) => call.url.startsWith('/api/artist/versions/load')).at(-1)?.body).toMatchObject({ n: 1 })

    server.current = 1
    server.loadFailed = { n: 1, from: 3 }
    await useArtistVersionStore.getState().refresh()
    expect(await useArtistVersionStore.getState().goBackFromFailedLoad()).toBe(true)
    expect(server.calls.filter((call) => call.url.startsWith('/api/artist/versions/load')).at(-1)?.body).toMatchObject({ n: 3 })
  })

  it('버전을 불러오는 중이 끝나면 카드 그림을 다시 읽는다', async () => {
    // 왜: 서버가 끊긴 불러오기를 마저 했는데 카드는 반쯤 불러온 그림을 그대로 보였다(2026-10-31 재검토 지적).
    const server = fakeServer()
    const loadData = vi.fn(async () => {})
    useArtistStore.setState({ loadData } as never)
    server.restoring = true
    await useArtistVersionStore.getState().refresh()
    expect(loadData).not.toHaveBeenCalled()
    server.restoring = false
    await useArtistVersionStore.getState().refresh()
    expect(loadData).toHaveBeenCalledTimes(1)
  })

  it('버전을 불러오는 중이거나 다 불러오지 못했으면 [완료하기]를 끄고 그 까닭을 고른다', () => {
    // 왜: 서버가 막아도 단추가 켜져 있으면 눌러 본 뒤에야 알 수 있었다(2026-10-31 재검토 지적). 서버 거절 알림은 그대로 둔다.
    expect(completeVersionBlock({ restoring: true, loadFailed: null })).toBe('restoring')
    expect(completeVersionBlock({ restoring: false, loadFailed: { n: 1, from: 2 } })).toBe('loadFailed')
    expect(completeVersionBlock({ restoring: false, loadFailed: null })).toBeNull()
  })
})

