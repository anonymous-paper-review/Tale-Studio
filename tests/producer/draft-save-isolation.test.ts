// 같은 프로젝트의 저장 순서는 유지하고 다른 프로젝트의 저장 지연에는 막히지 않는다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
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

type SavedDraft = { producer_draft: { settings: { dialogueLanguage: string } } }
type SaveResult = { data: SavedDraft | null; error: { message: string } | null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('window', {})
  useProducerStore.getState().reset()
  useProjectStore.setState({ projectId: 'p-order', currentStage: 'producer', reachedStage: 'producer' })
  db.save.mockImplementation(async (_projectId: string, patch: SavedDraft) => ({ data: patch, error: null }))
})

afterEach(() => {
  useProducerStore.getState().reset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('프로젝트별 초안 저장', () => {
  it('같은 프로젝트를 연이어 저장하면 먼저 요청한 저장부터 순서대로 완료한다', async () => {
    // 왜: 자동저장이 느린 동안 다시 저장해도 오래된 설정이 최신 설정을 덮으면 안 된다.
    let finishFirst!: (result: SaveResult) => void
    db.save.mockImplementationOnce(() => new Promise<SaveResult>(resolve => { finishFirst = resolve }))
    useProducerStore.getState().updateSettings({ dialogueLanguage: 'ko' })
    await vi.advanceTimersByTimeAsync(800)
    expect(db.save).toHaveBeenCalledOnce()

    useProducerStore.getState().updateSettings({ dialogueLanguage: 'en' })
    const second = useProducerStore.getState().saveDraftNow()
    try {
      await vi.advanceTimersByTimeAsync(800)
      expect(db.save).toHaveBeenCalledOnce()
    } finally {
      finishFirst({ data: db.save.mock.calls[0][1] as SavedDraft, error: null })
      await second
    }

    expect(await second).toBe(true)
    expect(db.save.mock.calls.map(([projectId, patch]) => [projectId, (patch as SavedDraft).producer_draft.settings.dialogueLanguage]))
      .toEqual([['p-order', 'ko'], ['p-order', 'en']])
  })

  it('이전 프로젝트의 저장이 늦어져도 새 프로젝트는 먼저 저장할 수 있다', async () => {
    // 왜: 프로젝트를 옮긴 사용자가 이전 프로젝트의 응답을 기다리느라 새 변경을 저장하지 못하면 안 된다.
    let finishPrevious!: (result: SaveResult) => void
    db.save.mockImplementationOnce(() => new Promise<SaveResult>(resolve => { finishPrevious = resolve }))
    useProjectStore.setState({ projectId: 'p-previous' })
    useProducerStore.getState().updateSettings({ dialogueLanguage: 'ja' })
    const previous = useProducerStore.getState().saveDraftNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(db.save).toHaveBeenCalledOnce()

    useProducerStore.getState().reset()
    useProjectStore.setState({ projectId: 'p-current' })
    useProducerStore.getState().updateSettings({ dialogueLanguage: 'ko' })
    try {
      await vi.advanceTimersByTimeAsync(800)
      expect(db.save.mock.calls.map(([projectId]) => projectId)).toEqual(['p-previous', 'p-current'])
      expect(await useProducerStore.getState().saveDraftNow()).toBe(true)
      expect(db.save.mock.calls.at(-1)?.[1]).toMatchObject({ producer_draft: { settings: { dialogueLanguage: 'ko' } } })
    } finally {
      finishPrevious({ data: db.save.mock.calls[0][1] as SavedDraft, error: null })
      await previous
      await vi.advanceTimersByTimeAsync(0)
    }
  })
})
