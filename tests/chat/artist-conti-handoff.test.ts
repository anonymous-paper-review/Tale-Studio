// Artist 채팅으로 콘티로 넘겨 달라고 해도 [완료하기]와 같은 서버 검사(그림 · 재생성 · 버전)를 거쳐서만 넘어가는지 검사한다 (리드 2026-11-22, D1 고리)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { current_stage: 'artist' }, error: null }) }) }),
    }),
  }),
}))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
const nav = vi.hoisted(() => ({ handoffToStage: vi.fn(async (stage: string) => `/studio/${stage}`) }))
vi.mock('@/lib/stage-nav', () => ({ handoffToStage: nav.handoffToStage }))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { resetActionGuard } from '@/lib/action-guard'
import { EMPTY_LIFECYCLE_STATUS } from '@/lib/lifecycle'

const reply = vi.hoisted(() => ({ status: 200, body: { ok: true } as Record<string, unknown> }))
let completeCalls: Array<{ projectId?: string }> = []
const lastModel = () => useGlobalChatStore.getState().messages.filter((m) => m.role === 'model').at(-1)?.content ?? ''

beforeEach(() => {
  resetActionGuard()
  nav.handoffToStage.mockClear()
  completeCalls = []
  reply.status = 200
  reply.body = { ok: true }
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'proj-a', projectLocale: 'ko', currentStage: 'artist', reachedStage: 'artist', producerLocked: true, lifecycleStatus: EMPTY_LIFECYCLE_STATUS })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    if (u === '/api/writer/artist-complete') {
      completeCalls.push(JSON.parse(String(init?.body ?? '{}')))
      return Response.json(reply.body, { status: reply.status })
    }
    if (u.startsWith('/api/writer/status/')) return Response.json({ started: true, pipeline_completed: true })
    return Response.json({})
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  useLocaleStore.setState({ locale: 'en' })
})

describe('Artist 채팅의 콘티 넘김', () => {
  it('Artist 채팅에서 콘티로 넘겨 달라고 하면 [완료하기]와 같은 서버 검사를 거친 뒤 콘티로 간다', async () => {
    // 왜(리드 2026-11-22 · 혼자 정한 것): 예전 채팅 넘김은 [완료하기]를 거치지 않고 단계만 올렸다 — 그림이 덜 된 채로 콘티가 열리거나
    //   멈춘 실행을 이어 가지 못했다. 단추와 채팅이 같은 검사를 거쳐야 같은 결과가 난다.
    await useGlobalChatStore.getState().sendMessage('콘티로 넘겨줘')
    expect(completeCalls).toEqual([{ projectId: 'proj-a' }])
    expect(nav.handoffToStage).toHaveBeenCalledWith('writer')
    expect(useProjectStore.getState().canNavigateTo('writer')).toBe(true)
  })

  it('그림이 없는 인물 · 배경이 있으면 채팅으로 넘겨 달라고 해도 넘기지 않고 [완료하기]와 같은 까닭을 말한다', async () => {
    // 왜: [완료하기]는 그림이 다 있어야 콘티를 연다(10/19 약속) — 채팅으로 부탁해도 같은 까닭으로 멈춰야 한다.
    reply.status = 409
    reply.body = { code: 'artist_images_missing', missing: { characters: ['민호'], locations: ['옥상'] } }
    await useGlobalChatStore.getState().sendMessage('콘티로 넘겨줘')
    expect(completeCalls).toHaveLength(1)
    expect(nav.handoffToStage).not.toHaveBeenCalled()
    expect(lastModel()).toContain('먼저 이 그림을 만들어 주세요: 민호, 옥상')
    expect(useProjectStore.getState().canNavigateTo('writer')).toBe(false)
  })

  it('다시 그리는 그림이 남아 있으면 채팅 넘김도 넘기지 않는다', async () => {
    // 왜: 옛 스타일 그림이 섞인 채로 콘티가 열리면 러프 · 샷이 섞인 그림으로 만들어진다(10/28 [완료하기] 약속과 같다).
    reply.status = 409
    reply.body = { code: 'regen_pending' }
    await useGlobalChatStore.getState().sendMessage('콘티로 넘겨줘')
    expect(nav.handoffToStage).not.toHaveBeenCalled()
    expect(lastModel()).toContain('다시 만드는 그림을 다 그린 뒤에 완료할 수 있어요')
  })

  it('씬 · 샷을 아직 나누는 중이어도 [완료하기]처럼 채팅 넘김이 된다 — 옛 Director 준비 검사로 막지 않는다', async () => {
    // 왜(리드 2026-11-22 결정): [완료하기]는 씬 · 샷 나누기가 끝나기 전에도 콘티를 연다(나머지는 콘티에서 이어 만들고 그동안 잠금 표시, 10/20).
    //   채팅에만 남아 있던 옛 Director 준비 검사("씬과 샷을 아직 준비 중")로 막으면 단추는 되는데 채팅은 안 되는 엇갈림이 생긴다.
    useProjectStore.setState({
      lifecycleStatus: { ...EMPTY_LIFECYCLE_STATUS, director: { ready: false, blockers: [{ field: 'writer:active', label: '씬과 샷을 아직 준비하고 있어요.' }], warnings: [] } },
    })
    await useGlobalChatStore.getState().sendMessage('콘티로 넘겨줘')
    expect(completeCalls).toHaveLength(1)
    expect(nav.handoffToStage).toHaveBeenCalledWith('writer')
  })
})
