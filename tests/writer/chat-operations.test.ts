// 채팅에서 내레이션과 삽입 위치를 보존하고, 대상을 되묻는 동안에는 내용을 바꾸지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scene, Shot } from '@/types'

const { writes } = vi.hoisted(() => ({
  writes: [] as Array<{
    table: string
    values: Record<string, unknown>
    filters: Record<string, unknown>
  }>,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      insert: async (values: Record<string, unknown>) => {
        writes.push({ table, values, filters: {} })
        return { error: null }
      },
      update: (values: Record<string, unknown>) => {
        const write = { table, values, filters: {} as Record<string, unknown> }
        writes.push(write)
        const query = {
          eq: (key: string, value: unknown) => {
            write.filters[key] = value
            return query
          },
          then: (resolve: (value: { error: null }) => unknown) =>
            Promise.resolve({ error: null }).then(resolve),
        }
        return query
      },
    }),
  }),
}))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined) }))

import { validateWriterUpdates } from '@/lib/writer-chat-updates'
import { useWriterStore, type WriterChatUpdate } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'

const scene = (sceneId: string, sortOrder: number): Scene => ({
  sceneId, sortOrder, location: 'room', timeOfDay: 'day', mood: 'calm',
  narrativeSummary: sceneId, originalTextQuote: '', charactersPresent: ['char_a'],
  estimatedDurationSeconds: 10,
})
const shot = (shotId: string, sceneId: string, sortOrder: number): Shot => ({
  shotId, sceneId, sortOrder, shotType: 'MS', actionDescription: shotId,
  characters: ['char_a'], durationSeconds: 5, generationMethod: 'T2V', dialogueLines: [],
  camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
  lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
})

function seed() {
  writes.length = 0
  useWriterStore.setState({
    sceneManifest: {
      scenes: [scene('sc_01', 5), scene('sc_02', 15), scene('sc_03', 25)],
      characters: [], locations: [],
    },
    shots: [shot('sh_01_01', 'sc_01', 3), shot('sh_01_02', 'sc_01', 7), shot('sh_02_01', 'sc_02', 12)],
    error: null,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ started: true, pipeline_completed: true }),
  }))
  useProjectStore.setState({ projectId: 'writer-chat-test', currentStage: 'writer' })
  seed()
})

afterEach(async () => {
  await vi.runOnlyPendingTimersAsync()
  useWriterStore.getState().reset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Writer 채팅 조작 약속', () => {
  it('내레이션을 수정해도 화자 없는 대사가 유지된다', async () => {
    const oldNarration = { characterId: null, text: '밤이었다.', emotion: '', delivery: 'V.O.', durationHint: 2 }
    const dialogue = { characterId: 'char_a', text: '안녕.', emotion: 'calm', delivery: 'soft', durationHint: 1 }
    useWriterStore.setState({
      shots: [{ ...shot('sh_01_01', 'sc_01', 3), dialogueLines: [oldNarration, dialogue] }],
    })
    const next = [{ ...oldNarration, text: '새벽이었다.' }, dialogue]
    const dropped: string[] = []
    const updates = validateWriterUpdates([
      { type: 'updateShot', id: 'sh_01_01', patch: { dialogueLines: next } },
    ], new Set(['char_a']), dropped) as WriterChatUpdate[]
    const result = await useWriterStore.getState().applyChatUpdates(updates)
    expect(result.pendingDialogueShrinks).toEqual([])
    expect(useWriterStore.getState().shots[0].dialogueLines).toEqual([
      { characterId: null, text: '새벽이었다.', delivery: 'V.O.', durationHint: 2 }, dialogue,
    ])
    expect(dropped).toEqual([])
    await vi.runOnlyPendingTimersAsync()
    expect(writes.find((w) => w.table === 'shots')?.values.dialogue_lines).toEqual(
      useWriterStore.getState().shots[0].dialogueLines,
    )
    expect(validateWriterUpdates([
      { type: 'updateShot', id: 'sh_01_01', patch: { dialogueLines: [next[0]] } },
    ], new Set(['char_a']))).toHaveLength(1)
  })

  it('지정한 씬/샷 앞뒤에 추가하면 그 위치에 추가한다', async () => {
    for (const [field, anchor, expectedIndex] of [
      ['beforeSceneId', 'sc_01', 0], ['beforeSceneId', 'sc_02', 1],
      ['afterSceneId', 'sc_01', 1], ['afterSceneId', 'sc_03', 3], ['afterSceneId', null, 0],
      ['beforeShotId', 'sh_01_01', 0], ['beforeShotId', 'sh_01_02', 1],
      ['afterShotId', 'sh_01_01', 1], ['afterShotId', 'sh_01_02', 2], ['afterShotId', null, 0],
    ] as const) {
      seed()
      const isScene = field.includes('Scene')
      const updates = validateWriterUpdates([{
        type: isScene ? 'addScene' : 'addShot', sceneId: 'sc_01',
        [field]: anchor, narrativeSummary: '새 장면', actionDescription: '새 샷',
      }]) as WriterChatUpdate[]
      const result = await useWriterStore.getState().applyChatUpdates(updates)
      expect(result.applied, `${field}:${anchor}`).toBe(1)
      const items = isScene
        ? useWriterStore.getState().sceneManifest!.scenes
        : useWriterStore.getState().shots.filter((s) => s.sceneId === 'sc_01')
      const inserted = items[expectedIndex]
      expect('narrativeSummary' in inserted ? inserted.narrativeSummary : inserted.actionDescription,
        `${field}:${anchor}`).toBe(isScene ? '새 장면' : '새 샷')
      await vi.runOnlyPendingTimersAsync()
      const saved = writes.find((w) => w.table === (isScene ? 'scenes' : 'shots') && Object.keys(w.filters).length === 0)
      expect(saved?.values.sort_order).toBe(inserted.sortOrder)
      expect(saved?.values[isScene ? 'narrative_summary' : 'action_description']).toBe(isScene ? '새 장면' : '새 샷')
    }

    // 사라진 위치나 다른 씬의 샷을 지정해도 맨 뒤로 바꿔 넣지 않는다.
    for (const raw of [
      { type: 'addScene', beforeSceneId: 'missing' },
      { type: 'addShot', sceneId: 'sc_01', afterShotId: 'missing' },
      { type: 'addShot', sceneId: 'sc_01', beforeShotId: 'sh_02_01' },
    ]) {
      seed()
      const result = await useWriterStore.getState().applyChatUpdates(validateWriterUpdates([raw]) as WriterChatUpdate[])
      expect(result.applied).toBe(0)
      expect(result.skipped).toHaveLength(1)
      expect(writes).toEqual([])
    }

    seed()
    const result = await useWriterStore.getState().applyChatUpdates(validateWriterUpdates([
      { type: 'addScene', tempId: 'new-scene', beforeSceneId: 'sc_02' },
      { type: 'addShot', sceneId: 'new-scene', tempId: 'new-shot', actionDescription: '뒤 샷' },
      { type: 'addShot', sceneId: 'new-scene', beforeShotId: 'new-shot', actionDescription: '앞 샷' },
    ]) as WriterChatUpdate[])
    expect(result.applied).toBe(3)
    expect(useWriterStore.getState().shots.filter((s) => s.sceneId === 'sc_04').map((s) => s.actionDescription))
      .toEqual(['앞 샷', '뒤 샷'])
  })

  it('대상을 되묻는 응답은 내용을 동시에 바꾸지 않는다', async () => {
    const clarification = { type: 'clarify', question: '어느 샷인가요?', candidates: ['첫 샷', '둘째 샷'] }
    const mutation = { type: 'updateShot', id: 'sh_01_01', patch: { actionDescription: '바뀐 내용' } }
    for (const raw of [[mutation, clarification], [clarification, mutation]]) {
      expect(validateWriterUpdates(raw)).toEqual([clarification])
      const before = useWriterStore.getState().shots
      // 검증을 거치지 않은 호출도 질문과 수정을 함께 실행하지 않는다.
      const result = await useWriterStore.getState().applyChatUpdates(raw as WriterChatUpdate[])
      expect(result.applied).toBe(0)
      expect(useWriterStore.getState().shots).toEqual(before)
      await vi.runOnlyPendingTimersAsync()
      expect(writes).toEqual([])
    }
  })
})
