// 콘티에서 Artist 로 넘기는 길(머리 [Artist로 가기] · 채팅 "Artist로 넘겨줘")이 씬 · 샷이 있을 때만 넘기고 Artist 를 여는지 검사한다 (오너 2026-11-26 O1 · W4, 리드 구조 C)
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
import { useWriterStore } from '@/stores/writer-store'
import { resetActionGuard } from '@/lib/action-guard'
import type { Shot } from '@/types'

const shot = { shotId: 'sh_01_01', sceneId: 'sc_01', shotType: 'MS', actionDescription: '여자가 앉는다', characters: [], durationSeconds: 3, generationMethod: 'T2V', dialogueLines: [], camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5600 } } as unknown as Shot
const userLines = () => useGlobalChatStore.getState().messages.filter((m) => m.role === 'user').map((m) => m.content)
const modelLines = () => useGlobalChatStore.getState().messages.filter((m) => m.role === 'model').map((m) => m.content)

beforeEach(() => {
  resetActionGuard()
  nav.handoffToStage.mockClear()
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'proj-1', currentStage: 'conti', reachedStage: 'conti', producerLocked: true })
  useWriterStore.setState({ sceneManifest: { scenes: [{ sceneId: 'sc_01' }], characters: [], locations: [] } as never, shots: [shot] })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}))
})
afterEach(() => {
  vi.restoreAllMocks()
  useLocaleStore.setState({ locale: 'en' })
})

describe('콘티 → Artist', () => {
  // 왜: O1 · W4 — 콘티를 마치면 [Artist로 가기]로 Artist 를 연다. 단추는 넘김 문장을 채팅에 친 것과 같다(다른 단계와 같은 길).
  it('콘티에서 [Artist로 가기]를 누르면 "Artist로 넘겨주세요"를 채팅에 남기고 Artist 를 연다', async () => {
    await useGlobalChatStore.getState().requestNextStep()
    expect(userLines()).toEqual(['Artist로 넘겨주세요'])
    expect(nav.handoffToStage).toHaveBeenCalledWith('artist', { verify: true })
    // 넘김 초대 연출(⇄)이 보인 뒤 화면을 옮긴다 — 다른 단계 넘김과 같은 시간.
    await vi.waitFor(() => expect(useGlobalChatStore.getState().pendingNavigatePath).toBe('/studio/artist'), { timeout: 4000 })
  })

  // 왜: 정상 경로 고정 — 채팅에 말로 부탁해도 단추와 같은 길로 넘긴다.
  it('콘티 채팅에서 "Artist로 넘겨줘"라고 하면 같은 길로 Artist 를 연다', async () => {
    await useGlobalChatStore.getState().sendMessage('Artist로 넘겨줘')
    expect(nav.handoffToStage).toHaveBeenCalledWith('artist', { verify: true })
  })

  // 왜(혼자 정한 것): 씬 · 샷을 아직 나누지 않았으면(나누는 중 · 실패) Artist 로 넘길 콘티가 없다 — 넘기지 않고 까닭을 말한다.
  it('씬 · 샷이 아직 없으면 콘티에서 Artist 로 넘기지 않고 씬 · 샷을 먼저 나눠야 한다고 말한다', async () => {
    useWriterStore.setState({ shots: [] })
    await useGlobalChatStore.getState().requestNextStep()
    expect(nav.handoffToStage).not.toHaveBeenCalled()
    expect(modelLines().join('\n')).toContain('씬 · 샷을 아직 나누지 않았어요')
  })
})
