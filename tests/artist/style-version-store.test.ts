// 화면의 작품 스타일 기록 — [다시 만들기] 뒤 남은 칸을 기본 모습부터 그리고, 실패 · 한도 거절 규칙을 지키며, 다 그리거나 불러오면 채팅에 알린다 (2026-10-28 오너)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useArtistStore } from '@/stores/artist-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { USER_LIMIT_RECHECK_MS } from '@/lib/artist/draw-continue'
import type { GenerationJobReceipt } from '@/lib/generation-jobs-client'

type SlotState = 'done' | 'failed' | 'drawing' | 'todo'
const SLOTS = [
  { kind: 'character', id: 'minho', appearanceKey: 'current', phase: 0, fromUrl: 'https://img/m.png' },
  { kind: 'character', id: 'minho', appearanceKey: 'young', phase: 1, fromUrl: 'https://img/my.png' },
  { kind: 'character', id: 'soonja', appearanceKey: 'current', phase: 0, fromUrl: 'https://img/s.png' },
  { kind: 'location', id: 'hall', appearanceKey: null, phase: 0, fromUrl: 'https://img/h.png' },
  { kind: 'location', id: 'hall', appearanceKey: 'night', phase: 1, fromUrl: 'https://img/hn.png' },
] as const
const keyOf = (slot: { kind: string; id: string; appearanceKey: string | null }) => `${slot.kind === 'character' ? 'c' : 'l'}:${slot.id}:${slot.appearanceKey ?? 'default'}`

/** 화면이 부르는 서버 창구를 흉내 낸다 — 버전 · 재생성 상태를 들고 있다. */
function fakeServer() {
  const server = {
    current: 1,
    style: { 1: 'real', 2: 'watercolor' } as Record<number, string>,
    regen: null as null | { n: number; states: Record<string, SlotState>; announced: boolean },
    calls: [] as Array<{ url: string; method: string; body: unknown }>,
  }
  const view = () => {
    const versions = Object.keys(server.style).map(Number).filter((n) => n <= Math.max(server.current, server.regen?.n ?? 1)).map((n) => ({
      n, styleId: server.style[n], styleKey: server.style[n], customStyle: null, current: n === server.current, active: [], createdAt: '', thumbs: [],
    }))
    const regen = server.regen ? (() => {
      const values = Object.values(server.regen.states)
      return {
        n: server.regen.n, startedAt: '', slots: SLOTS, states: { ...server.regen.states }, total: values.length,
        done: values.filter((s) => s === 'done').length, failed: values.filter((s) => s === 'failed').length, drawing: values.filter((s) => s === 'drawing').length,
        complete: values.every((s) => s === 'done' || s === 'failed'), announced: server.regen.announced,
      }
    })() : null
    return { versions, currentN: server.current, regen, completed: false }
  }
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : null
    server.calls.push({ url, method, body })
    if (url.startsWith('/api/artist/generation-slots')) return Response.json({ limit: 3 })
    if (url.startsWith('/api/artist/versions/regenerate')) {
      server.current = 2
      server.regen = { n: 2, states: Object.fromEntries(SLOTS.map((slot) => [keyOf(slot), 'todo' as SlotState])), announced: false }
      return Response.json({ ok: true, n: 2, slots: SLOTS })
    }
    if (url.startsWith('/api/artist/versions/load')) {
      server.current = body.n
      return Response.json({ ok: true, n: body.n, styleKey: server.style[body.n], customStyle: null })
    }
    if (url.startsWith('/api/artist/versions/regen')) {
      if (body.action === 'fail') for (const key of body.slots) server.regen!.states[key] = 'failed'
      if (body.action === 'finish') {
        const done = view().regen!
        const announced = done.complete && !server.regen!.announced
        if (announced) server.regen!.announced = true
        return Response.json({ ok: true, announced, complete: done.complete, failed: done.failed })
      }
      return Response.json({ ok: true })
    }
    if (url.startsWith('/api/artist/versions')) return Response.json(view())
    return Response.json({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return server
}

/** 카드 다시 그리기(지금의 다시 만들기와 같은 함수)를 흉내 낸다 — 그린 칸은 서버에서 다 그린 칸이 된다. */
function drawer(server: ReturnType<typeof fakeServer>, outcome: (key: string, attempt: number) => GenerationJobReceipt = () => ({ jobId: 'job', status: 'completed' })) {
  const order: string[] = []
  const attempts = new Map<string, number>()
  const run = (key: string, onJob?: (r: GenerationJobReceipt) => void) => {
    order.push(key)
    const attempt = (attempts.get(key) ?? 0) + 1
    attempts.set(key, attempt)
    const receipt = outcome(key, attempt)
    onJob?.(receipt)
    if (receipt.jobId && receipt.status === 'completed') server.regen!.states[key] = 'done'
    if (receipt.jobId && receipt.status === 'failed') server.regen!.states[key] = 'failed'
    return receipt
  }
  useArtistStore.setState({
    generateCharacterView: vi.fn(async (characterId: string, appearanceKey: string, _view: unknown, _actor: unknown, _i: unknown, _s: unknown, _m: unknown, options?: { onJob?: (r: GenerationJobReceipt) => void }) => run(`c:${characterId}:${appearanceKey}`, options?.onJob)),
    generateWorldShot: vi.fn(async (locationId: string, _shot: unknown, _p: unknown, _actor: unknown, _m: unknown, extra?: { appearanceKey?: string | null; onJob?: (r: GenerationJobReceipt) => void }) => { run(`l:${locationId}:${extra?.appearanceKey ?? 'default'}`, extra?.onJob) }),
    loadData: vi.fn(async () => {}),
    syncGenerationStatus: vi.fn(async () => {}),
  } as never)
  return { order, attempts }
}

const artistMessages = () => useGlobalChatStore.getState().messages.filter((m) => m.stage === 'artist' && m.role === 'model').map((m) => m.content)
const original = { ...useArtistStore.getState() }

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useArtistVersionStore.getState().reset()
  useProjectStore.setState({ projectId: 'p1', currentStage: 'artist', reachedStage: 'artist', projectLocale: 'ko', projectLocaleLocked: true })
  useProducerStore.setState({
    styleAnchorKey: 'real', customStyleAnchor: null,
    styleAnchors: [
      { key: 'real', label: '실사', medium: 'photo', imageUrl: null, previewUrl: null, subtitle: null },
      { key: 'watercolor', label: '수채화', medium: 'watercolor', imageUrl: null, previewUrl: null, subtitle: null },
    ],
  } as never)
  useArtistVersionStore.getState().setScreenOpen('p1', true)
})
afterEach(() => {
  useArtistStore.setState(original as never)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('[다시 만들기] 뒤 그리기', () => {
  it('[다시 만들기]를 누르면 새 버전의 칸을 기본 모습부터 지금의 다시 만들기와 같은 길로 그리고, 다 그리면 채팅에 "{스타일}로 v{n}을 만들었어요. 이전 버전은 [불러오기]에 있어요."를 남긴다', async () => {
    // 왜: 오너 결정(1) — 카드 하나씩 [다시 만들기]와 같은 방법(지금 그림을 얼굴 참고로)으로 그린다. 다 그린 것을 채팅으로 알린다.
    const server = fakeServer()
    const { order } = drawer(server)
    expect(await useArtistVersionStore.getState().regenerate('watercolor')).toBe(true)
    await useArtistVersionStore.getState().continueRegen()

    expect(order.slice(0, 3).sort()).toEqual(['c:minho:current', 'c:soonja:current', 'l:hall:default'])
    expect(order.slice(3).sort()).toEqual(['c:minho:young', 'l:hall:night'])
    const draw = useArtistStore.getState().generateCharacterView as unknown as ReturnType<typeof vi.fn>
    expect(draw.mock.calls[0].slice(2, 4)).toEqual(['main', 'ui'])
    expect(useProducerStore.getState().styleAnchorKey).toBe('watercolor')
    expect(artistMessages()).toContain('수채화로 v2를 만들었어요. 이전 버전은 [불러오기]에 있어요.')
    expect(useArtistVersionStore.getState().run.running).toBe(false)
  })

  it('그리다 실패한 칸은 다시 보내지 않고 나머지를 다 그리면 끝내며, 못 그린 장수를 함께 알린다', async () => {
    // 왜: 9/11 규칙 — 실패한 그림을 자동으로 다시 그리면 같은 실패로 과금만 되풀이된다. 실패 카드의 다시 만들기로 사람이 고른다.
    const server = fakeServer()
    const { attempts } = drawer(server, (key) => (key === 'c:soonja:current' ? { jobId: 'job-f', status: 'failed', error: 'boom' } : { jobId: 'job', status: 'completed' }))
    await useArtistVersionStore.getState().regenerate('watercolor')
    await useArtistVersionStore.getState().continueRegen()
    expect(attempts.get('c:soonja:current')).toBe(1)
    expect(artistMessages().at(-1)).toBe('수채화로 v2를 만들었어요. 이전 버전은 [불러오기]에 있어요. 1장은 그리지 못했어요. 카드에서 다시 만들어 주세요.')
  })

  it('접수 전에 다른 까닭으로 거절된 칸은 실패로 적어 다시 보내지 않는다', async () => {
    // 왜: 혼자 정한 것 — 내용 규칙 · 기준 얼굴 없음 같은 거절은 다시 보내도 같은 답이다. 실패로 적어야 이어 그리기가 끝난다.
    const server = fakeServer()
    const { attempts } = drawer(server, (key) => (key === 'c:minho:young' ? { jobId: null, status: 'failed', httpStatus: 409, error: 'no base face' } : { jobId: 'job', status: 'completed' }))
    await useArtistVersionStore.getState().regenerate('watercolor')
    await useArtistVersionStore.getState().continueRegen()
    expect(attempts.get('c:minho:young')).toBe(1)
    expect(server.calls.some((call) => call.url.startsWith('/api/artist/versions/regen') && (call.body as { action?: string; slots?: string[] }).action === 'fail' && (call.body as { slots: string[] }).slots.includes('c:minho:young'))).toBe(true)
    expect(artistMessages().at(-1)).toContain('1장은 그리지 못했어요.')
  })

  it('내 한도에 막혀 접수되지 않은 칸은 잠시 뒤 다시 보내고, 모두의 자리가 차서 막히면 멈추고 남은 그림 그리기 단추로 남긴다', async () => {
    // 왜: 2026-09-11 오너 (가) — 내 한도에 막힌 건 내 것이 끝나면 이어 간다. 모두의 자리는 자동으로 다시 두드리지 않는다.
    vi.useFakeTimers()
    const server = fakeServer()
    const { attempts } = drawer(server, (key, attempt) => (key === 'c:minho:current' && attempt === 1 ? { jobId: null, status: 'failed', httpStatus: 429, quotaScope: 'user' } : { jobId: 'job', status: 'completed' }))
    await useArtistVersionStore.getState().regenerate('watercolor')
    const running = useArtistVersionStore.getState().continueRegen()
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS + 1000)
    await running
    expect(attempts.get('c:minho:current')).toBe(2)
    expect(artistMessages().at(-1)).toBe('수채화로 v2를 만들었어요. 이전 버전은 [불러오기]에 있어요.')

    useGlobalChatStore.getState().reset()
    useArtistVersionStore.getState().reset()
    useArtistVersionStore.getState().setScreenOpen('p1', true)
    const again = fakeServer()
    const blocked = drawer(again, (key) => (key === 'l:hall:default' ? { jobId: null, status: 'failed', httpStatus: 429, quotaScope: 'global' } : { jobId: 'job', status: 'completed' }))
    await useArtistVersionStore.getState().regenerate('watercolor')
    await useArtistVersionStore.getState().continueRegen()
    expect(useArtistVersionStore.getState().run.stopped).toBe(true)
    expect(blocked.attempts.get('l:hall:default')).toBe(1)
    expect(artistMessages()).toHaveLength(0)
    // 단추([남은 그림 그리기])는 멈춘 이어 그리기를 다시 켠다.
    blocked.order.length = 0
    await useArtistVersionStore.getState().resumeRegen()
    expect(blocked.order).toContain('l:hall:default')
  })

  it('Artist 화면을 떠나 있으면 남은 칸을 보내지 않고, 돌아오면 남은 칸만 이어 그린다', async () => {
    // 왜: 오너 "화면을 떠났다 돌아오면 남은 것을 이어 그린다" — 화면이 없는데 그림을 보내면 보는 사람 없이 과금된다.
    const server = fakeServer()
    const { order } = drawer(server)
    useArtistVersionStore.getState().setScreenOpen('p1', false)
    await useArtistVersionStore.getState().regenerate('watercolor')
    await useArtistVersionStore.getState().continueRegen()
    expect(order).toEqual([])

    server.regen!.states['c:minho:current'] = 'done'
    server.regen!.states['l:hall:default'] = 'drawing'
    useArtistVersionStore.getState().setScreenOpen('p1', true)
    vi.useFakeTimers()
    const running = useArtistVersionStore.getState().continueRegen()
    await vi.advanceTimersByTimeAsync(10)
    server.regen!.states['l:hall:default'] = 'done'
    await vi.advanceTimersByTimeAsync(10_000)
    await running
    expect(order).not.toContain('c:minho:current')
    expect(order).not.toContain('l:hall:default')
    expect(order.sort()).toEqual(['c:minho:young', 'c:soonja:current', 'l:hall:night'])
  })
})

describe('불러오기', () => {
  it('버전을 불러오면 그림과 작품 스타일을 다시 읽고 채팅에 "v{n}({스타일})을 불러왔어요. 작품 스타일도 {스타일}으로 바뀌었어요."를 남긴다', async () => {
    // 왜: 오너 문구 — 다시 그리지 않고 돌아왔다는 것과 작품 스타일이 함께 바뀌었다는 것을 알린다.
    const server = fakeServer()
    drawer(server)
    server.current = 2
    useProducerStore.setState({ styleAnchorKey: 'watercolor' } as never)
    expect(await useArtistVersionStore.getState().loadVersion(1)).toBe(true)
    expect(useProducerStore.getState().styleAnchorKey).toBe('real')
    expect(useArtistStore.getState().loadData).toHaveBeenCalled()
    expect(artistMessages()).toContain('v1(실사)를 불러왔어요. 작품 스타일도 실사로 바뀌었어요.')
  })
})
