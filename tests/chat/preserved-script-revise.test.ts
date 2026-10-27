// 원작 그대로 쓰는 대본은 Writer 채팅에서 산문 수정을 요청해도 고칠 수 없다는 까닭과 넘어가는 방법을 말한다 (2026-10-27 오너)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }),
}))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { resetActionGuard } from '@/lib/action-guard'

beforeEach(() => {
  resetActionGuard()
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer', projectLocale: 'ko' })
})

afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('원작 그대로 대본의 수정 요청', () => {
  it('원작 그대로인 프로젝트에서 수정 요청이 막히면 원작 그대로라 고칠 수 없다는 까닭과 넘어가는 방법을 말한다', async () => {
    // 왜: 2026-10-27 운영 — 서버는 원작 그대로 대본의 수정을 받지 않는데(preserved_script), 채팅은 "수정 요청을 보내지 못했어요. 다시 시도해 주세요."만
    //   보여 다시 눌러도 같은 말만 돌아왔다(오너 "이 프로젝트 오류").
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/writer/scene-gate'
      ? Response.json({ error: 'Preserved script scenes cannot be changed', code: 'preserved_script' }, { status: 409 })
      : Response.json({}))))

    expect(await useGlobalChatStore.getState().reviseSceneGate('완료')).toBe(false)
    expect(useGlobalChatStore.getState().error).toBe('원작 그대로 쓰는 대본이라 산문을 고칠 수 없어요. 다 읽었으면 [브레이크다운하기]를 눌러 넘어가 주세요.')
  })

  it('그 밖의 까닭으로 수정 요청을 보내지 못하면 지금처럼 다시 시도하라고 한다', async () => {
    // 왜: 정상 경로 고정 — 서버 오류처럼 다시 하면 될 수 있는 실패는 그대로 안내한다.
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'boom' }, { status: 500 })))

    expect(await useGlobalChatStore.getState().reviseSceneGate('S2를 줄여줘')).toBe(false)
    expect(useGlobalChatStore.getState().error).toBe('수정 요청을 보내지 못했어요. 다시 시도해 주세요.')
  })
})
