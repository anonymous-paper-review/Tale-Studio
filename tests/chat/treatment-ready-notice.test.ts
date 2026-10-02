// 트리트먼트 초안을 다 쓰면 채팅에 한 줄 알린다 — 넘기기 단추 없이, 같은 초안은 한 번만 (2026-10-02 오너 · 시안 v04)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { saveChatMessage } from '@/lib/chat-persistence'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { shouldAnnounceTreatmentReady } from '@/lib/writer/scene-gate'

beforeEach(() => {
  vi.mocked(saveChatMessage).mockClear()
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'ready-project', currentStage: 'producer', producerLocked: false, treatmentDraft: true, projectLocale: 'ko' })
})
afterEach(() => {
  useLocaleStore.setState({ locale: 'en' })
})

describe('트리트먼트를 다 썼다는 알림', () => {
  it('트리트먼트 초안을 다 쓰면 채팅에 다 썼다고 한 줄 남기고 넘기기 단추는 띄우지 않는다', () => {
    expect(useGlobalChatStore.getState().announceTreatmentReady('ready-project', 'run-1')).toBe(true)
    const last = useGlobalChatStore.getState().messages.at(-1)
    expect(last?.role).toBe('model')
    expect(last?.content).toContain('트리트먼트를 만들었어요')
    expect(last?.content).toContain('Writer로 넘기기')
    expect(useGlobalChatStore.getState().suggestion).toBeNull()
    expect(saveChatMessage).toHaveBeenCalledWith('ready-project', 'producer', 'model', last?.content)
  })

  it('같은 트리트먼트 초안으로는 다 썼다는 말을 두 번 남기지 않는다', () => {
    const chat = useGlobalChatStore.getState()
    expect(chat.announceTreatmentReady('ready-project', 'run-1')).toBe(true)
    expect(chat.announceTreatmentReady('ready-project', 'run-1')).toBe(false)
    expect(useGlobalChatStore.getState().messages.filter((message) => message.content.includes('트리트먼트를 만들었어요'))).toHaveLength(1)
  })

  it('지금 값으로 다시 쓴 새 초안을 다 쓰면 다시 알린다', () => {
    const chat = useGlobalChatStore.getState()
    chat.announceTreatmentReady('ready-project', 'run-1')
    expect(chat.announceTreatmentReady('ready-project', 'run-2')).toBe(true)
  })

  it('다른 프로젝트로 옮긴 뒤 늦게 끝난 초안은 지금 채팅에 알리지 않는다', () => {
    expect(useGlobalChatStore.getState().announceTreatmentReady('other-project', 'run-1')).toBe(false)
    expect(useGlobalChatStore.getState().messages).toHaveLength(0)
  })

  it('쓰는 것을 지켜본 화면만 알리고 다 쓴 트리트먼트를 열기만 하면 알리지 않는다', () => {
    expect(shouldAnnounceTreatmentReady({ previous: 'writing', phase: 'gate', draftLive: true })).toBe(true)
    expect(shouldAnnounceTreatmentReady({ previous: null, phase: 'gate', draftLive: true })).toBe(false)
    expect(shouldAnnounceTreatmentReady({ previous: 'before', phase: 'gate', draftLive: true })).toBe(false)
    expect(shouldAnnounceTreatmentReady({ previous: 'gate', phase: 'gate', draftLive: true })).toBe(false)
  })

  it('넘긴 뒤의 확정 대기에는 이 알림을 남기지 않는다', () => {
    expect(shouldAnnounceTreatmentReady({ previous: 'writing', phase: 'gate', draftLive: false })).toBe(false)
  })
})
