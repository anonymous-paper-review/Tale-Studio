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
  it('초안 저장 중 만들기가 실패하면 늦은 저장 성공이 실패 안내를 지우지 않는다', async () => {
    // 왜: 레퍼런스를 붙이는 저장과 만들기가 겹쳐도 만들기 실패 이유가 화면에 남아야 한다.
    let finish!: (result: SaveResult) => void
    db.save.mockImplementationOnce(() => new Promise<SaveResult>(resolve => { finish = resolve }))
    const saving = useProducerStore.getState().saveDraftNow()
    await vi.advanceTimersByTimeAsync(0)
    const failure = '올린 레퍼런스 그림을 붙이지 못했어요. 다시 시도해 주세요.'
    useProducerStore.setState({ error: failure })
    finish({ data: db.save.mock.calls[0][1] as SavedDraft, error: null })

    expect(await saving).toBe(true)
    expect(useProducerStore.getState().error).toBe(failure)
  })

  it('다른 작업의 실패 안내가 있으면 초안 저장 성공만으로 지우지 않는다', async () => {
    // 왜: 저장에 성공했다고 그림 만들기나 그림체 변경까지 성공한 것은 아니다.
    const failure = 'Could not attach the uploaded reference pictures. Please try again.'
    useProducerStore.setState({ error: failure })

    expect(await useProducerStore.getState().saveDraftNow()).toBe(true)
    expect(useProducerStore.getState().error).toBe(failure)
  })

  it('초안 저장 실패를 다시 저장해 해결하면 그 저장 실패 안내를 지운다', async () => {
    // 왜: 정상 경로 고정. 저장 문제를 해결한 뒤까지 같은 경고를 남기지 않는다.
    useProjectStore.setState({ projectLocale: 'en' })
    useProducerStore.setState({ error: 'Could not save your changes. Please try again.' })

    expect(await useProducerStore.getState().saveDraftNow()).toBe(true)
    expect(useProducerStore.getState().error).toBeNull()
  })

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
