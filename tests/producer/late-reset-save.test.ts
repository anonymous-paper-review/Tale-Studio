// 읽어 둔 지금 프로젝트의 Producer 자료가 늦게 비워지면, 다시 읽기 전에는 그 빈 상태로 저장된 초안을 덮어쓰지 않는지 검사한다 (QA 2026-11-03 밤 늦은 비우기 유실 점검)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ save: vi.fn(), project: null as unknown }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          single: async () => ({ data: table === 'projects' ? db.project : null, error: null }),
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve, reject),
        }
        return chain
      },
      update: (patch: Record<string, unknown>) => ({
        eq: (_column: string, projectId: string) => ({
          select: () => ({ single: () => db.save(projectId, patch) }),
        }),
      }),
    }),
  }),
  createCatalogClient: vi.fn(),
}))

import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

// 저장해 둔 초안 — 오너가 고른 설정 · 넘기기 전 이야기 · 인물 카드.
const savedDraft = {
  version: 1,
  savedAt: 1,
  storyText: '바닷가 마을 우체부가 오래된 편지를 전한다.',
  storyReady: true,
  settings: { playtime: 90, genre: 'drama', format: 'vertical_9:16', tone: ['warm'], dialogueLanguage: 'ko' },
  cast: [{ localId: 'cast-1', name: '우체부', entityType: 'person', appearance: '40대', origin: 'producer', userEdited: true }],
  backgrounds: [],
  preserveScript: null,
  treatmentSyncedVersion: null,
}
type SavedPatch = { producer_draft: typeof savedDraft }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('window', {})
  useProducerStore.getState().reset()
  useProjectStore.setState({ projectId: 'p-open', currentStage: 'producer', reachedStage: 'producer', producerLocked: false, treatmentDraft: false })
  db.project = { story_text: '', settings: {}, last_writer_run_id: null, producer_draft: savedDraft, style_anchor_key: null, custom_style_anchor: null }
  db.save.mockImplementation(async (_projectId: string, patch: SavedPatch) => ({ data: patch, error: null }))
})
afterEach(() => {
  useProducerStore.getState().reset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('늦게 비워진 Producer 자료', () => {
  it('화면이 이미 읽어 둔 지금 프로젝트가 늦게 비워지면, 다시 읽기 전에는 그 빈 상태로 초안을 덮어쓰지 않는다', async () => {
    // 왜: 프로젝트를 여는 길의 늦은 비우기가 읽어 둔 설정 · 이야기 · 카드를 기본값으로 비운다. 그 빈 화면에서 무엇이든 고치면(조건 바꾸기 · 채팅이 설정을 바꿈)
    //   기본값에 그 한 줄을 더한 초안이 저장돼, 오너가 고른 설정 전부와 넘기기 전 이야기가 사라졌다.
    await useProducerStore.getState().loadProject()
    expect(useProducerStore.getState().projectSettings.genre).toBe('drama')
    useProducerStore.getState().reset()
    useProducerStore.getState().updateSettings({ playtime: 30 })
    await vi.advanceTimersByTimeAsync(800)
    expect(db.save).not.toHaveBeenCalled()
    expect(await useProducerStore.getState().saveDraftNow()).toBe(false)
    expect(db.save).not.toHaveBeenCalled()
    // 고친 것이 저장되지 않았다고 화면에 알린다(조용히 버리지 않는다).
    expect(useProducerStore.getState().error).toBeTruthy()
  })

  it('그 프로젝트를 다시 읽은 뒤에는 지금처럼 고친 것을 초안에 저장한다', async () => {
    // 왜: 막는 것은 읽지 않은 빈 상태뿐이다 — 다시 읽으면 오너의 설정 · 카드 위에 고친 것만 더해 저장한다.
    await useProducerStore.getState().loadProject()
    useProducerStore.getState().reset()
    await useProducerStore.getState().loadProject()
    useProducerStore.getState().updateSettings({ playtime: 30 })
    await vi.advanceTimersByTimeAsync(800)
    expect(db.save).toHaveBeenCalledOnce()
    const [projectId, patch] = db.save.mock.calls[0] as [string, SavedPatch]
    expect(projectId).toBe('p-open')
    expect(patch.producer_draft.settings).toMatchObject({ genre: 'drama', tone: ['warm'], playtime: 30 })
    expect(patch.producer_draft.storyText).toBe(savedDraft.storyText)
    expect(patch.producer_draft.cast.map((c) => c.name)).toEqual(['우체부'])
  })

  it('다른 프로젝트로 바꾸며 비운 뒤 새 프로젝트에서 고친 것은 지금처럼 저장한다', async () => {
    // 왜: 정상 경로 고정 — 이전 프로젝트를 비우는 것은 늦은 비우기가 아니다. 새 프로젝트의 편집은 막지 않는다.
    await useProducerStore.getState().loadProject()
    useProjectStore.setState({ projectId: 'p-next' })
    useProducerStore.getState().reset()
    useProducerStore.getState().updateSettings({ dialogueLanguage: 'en' })
    await vi.advanceTimersByTimeAsync(800)
    expect(db.save.mock.calls.map(([projectId]) => projectId)).toEqual(['p-next'])
  })
})
