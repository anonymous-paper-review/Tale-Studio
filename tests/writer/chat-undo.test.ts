// 채팅이 고친 샷·씬을 표시하고, 마지막 한 묶음만 바꾸기 전 내용으로 되돌린다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scene, Shot } from '@/types'

const { writes } = vi.hoisted(() => ({
  writes: [] as Array<{
    table: string
    op: 'insert' | 'update' | 'delete'
    values: Record<string, unknown>
    filters: Record<string, unknown>
  }>,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      insert: async (values: Record<string, unknown>) => {
        writes.push({ table, op: 'insert', values, filters: {} })
        return { error: null }
      },
      update: (values: Record<string, unknown>) => {
        const write = { table, op: 'update' as const, values, filters: {} as Record<string, unknown> }
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
      delete: () => {
        const write = { table, op: 'delete' as const, values: {}, filters: {} as Record<string, unknown> }
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
      scenes: [scene('sc_01', 5), scene('sc_02', 15)],
      characters: [], locations: [],
    },
    shots: [shot('sh_01_01', 'sc_01', 3), shot('sh_01_02', 'sc_01', 7), shot('sh_02_01', 'sc_02', 12)],
    chatUndo: null,
    error: null,
  })
}

const apply = (updates: WriterChatUpdate[]) => useWriterStore.getState().applyChatUpdates(updates)

const shotOf = (shotId: string) => useWriterStore.getState().shots.find((s) => s.shotId === shotId)
const sceneOf = (sceneId: string) =>
  useWriterStore.getState().sceneManifest?.scenes.find((s) => s.sceneId === sceneId)

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ started: true, pipeline_completed: true }),
  }))
  useProjectStore.setState({ projectId: 'writer-chat-undo-test', currentStage: 'writer' })
  seed()
})

afterEach(async () => {
  await vi.runOnlyPendingTimersAsync()
  useWriterStore.getState().reset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Writer 채팅 변경 되돌리기', () => {
  it('채팅으로 샷이나 씬을 고치면 바뀐 카드가 표시된다', async () => {
    // 왜: 정상 경로 고정 — 에이전트가 무엇을 만졌는지 보드에서 바로 알아야 한다.
    await apply([
      { type: 'updateShot', id: 'sh_01_01', patch: { actionDescription: '바뀐 샷' } },
      { type: 'updateScene', id: 'sc_01', patch: { narrativeSummary: '바뀐 씬' } },
    ])

    const undo = useWriterStore.getState().chatUndo
    expect(undo?.changedIds).toEqual(['sh_01_01', 'sc_01'])
    expect(undo?.addedOrDeleted).toBe(0)
    expect(undo?.entries).toEqual([
      { kind: 'shot', id: 'sh_01_01', prev: { actionDescription: 'sh_01_01' } },
      { kind: 'scene', id: 'sc_01', prev: { narrativeSummary: 'sc_01' } },
    ])
    // 고치지 않은 샷은 표시 대상이 아니다.
    expect(undo?.changedIds).not.toContain('sh_01_02')
  })

  it('되돌리기를 누르면 바꾸기 전 내용으로 돌아간다', async () => {
    // 왜: 정상 경로 고정 — 채팅이 잘못 고친 샷·씬을 사람이 직접 복구할 수 있어야 한다.
    await apply([
      { type: 'updateShot', id: 'sh_01_01', patch: { actionDescription: '바뀐 샷', durationSeconds: 9 } },
      { type: 'updateScene', id: 'sc_01', patch: { narrativeSummary: '바뀐 씬' } },
    ])
    await useWriterStore.getState().undoChatBatch()

    expect(shotOf('sh_01_01')?.actionDescription).toBe('sh_01_01')
    expect(shotOf('sh_01_01')?.durationSeconds).toBe(5)
    expect(sceneOf('sc_01')?.narrativeSummary).toBe('sc_01')
    expect(useWriterStore.getState().chatUndo).toBeNull()
    // 되돌린 값은 화면에만 남지 않고 저장된다.
    await vi.runOnlyPendingTimersAsync()
    const savedShot = writes.filter((w) => w.table === 'shots' && w.op === 'update').at(-1)
    expect(savedShot?.values.action_description).toBe('sh_01_01')
    expect(savedShot?.values.duration_seconds).toBe(5)
    expect(writes.filter((w) => w.table === 'scenes' && w.op === 'update').at(-1)?.values.narrative_summary)
      .toBe('sc_01')

    // 도구 저장 경로(executeEdit)로 들어온 변경도 같은 띠로 되돌린다. 저장이 막힌 변경은 되돌릴 것이 없다.
    seed()
    const executeEdit = vi.fn(async (resource: 'scenes' | 'shots', id: string, patch: Record<string, unknown>) => {
      if (id === 'sh_01_02') return { status: 'blocked', message: '저장 대기 중' }
      useWriterStore.getState().updateShot(id, patch)
      return { status: 'ok' }
    })
    await useWriterStore.getState().applyChatUpdates([
      { type: 'updateShot', id: 'sh_01_01', patch: { actionDescription: '도구로 바꾼 샷' } },
      { type: 'updateShot', id: 'sh_01_02', patch: { actionDescription: '막힌 변경' } },
    ], { executeEdit })

    expect(shotOf('sh_01_01')?.actionDescription).toBe('도구로 바꾼 샷')
    expect(useWriterStore.getState().chatUndo?.changedIds).toEqual(['sh_01_01'])
    await useWriterStore.getState().undoChatBatch()
    expect(shotOf('sh_01_01')?.actionDescription).toBe('sh_01_01')
    expect(shotOf('sh_01_02')?.actionDescription).toBe('sh_01_02')
  })

  it('적용을 누르면 표시가 사라지고 내용은 그대로 남는다', async () => {
    // 왜: 정상 경로 고정 — 고친 내용이 마음에 들면 띠만 치우고 작업을 이어간다.
    await apply([{ type: 'updateShot', id: 'sh_01_01', patch: { actionDescription: '바뀐 샷' } }])
    useWriterStore.getState().acknowledgeChatBatch()

    expect(useWriterStore.getState().chatUndo).toBeNull()
    expect(shotOf('sh_01_01')?.actionDescription).toBe('바뀐 샷')
    // 적용한 뒤에는 되돌릴 대상이 없어 내용이 다시 바뀌지 않는다.
    await useWriterStore.getState().undoChatBatch()
    expect(shotOf('sh_01_01')?.actionDescription).toBe('바뀐 샷')
  })

  it('되돌리기는 마지막 채팅 한 번의 변경 묶음만 되돌린다', async () => {
    // 왜: 정상 경로 고정 — 여러 번 대화한 뒤 되돌려도 앞선 대화 결과까지 사라지면 안 된다.
    await apply([{ type: 'updateShot', id: 'sh_01_01', patch: { actionDescription: '첫 묶음' } }])
    await apply([{ type: 'updateShot', id: 'sh_01_02', patch: { actionDescription: '둘째 묶음' } }])
    await useWriterStore.getState().undoChatBatch()

    expect(shotOf('sh_01_02')?.actionDescription).toBe('sh_01_02')
    expect(shotOf('sh_01_01')?.actionDescription).toBe('첫 묶음')
  })

  it('새 채팅 변경이 오면 이전 묶음은 적용된 것으로 본다', async () => {
    // 왜: 정상 경로 고정 — 띠가 둘 이상 쌓이면 어느 변경을 되돌리는지 알 수 없다.
    await apply([{ type: 'updateShot', id: 'sh_01_01', patch: { actionDescription: '첫 묶음' } }])
    const first = useWriterStore.getState().chatUndo
    await apply([{ type: 'updateShot', id: 'sh_01_01', patch: { actionDescription: '둘째 묶음' } }])
    const second = useWriterStore.getState().chatUndo

    expect(second?.batchId).not.toBe(first?.batchId)
    expect(second?.entries).toEqual([
      { kind: 'shot', id: 'sh_01_01', prev: { actionDescription: '첫 묶음' } },
    ])
    await useWriterStore.getState().undoChatBatch()
    expect(shotOf('sh_01_01')?.actionDescription).toBe('첫 묶음')

    // 고칠 것이 없는 대화는 띠를 새로 열지도, 남은 띠를 치우지도 않는다.
    seed()
    await apply([{ type: 'updateShot', id: 'sh_01_01', patch: { actionDescription: '남은 묶음' } }])
    const kept = useWriterStore.getState().chatUndo
    await apply([{ type: 'updateShot', id: 'sh_missing', patch: { actionDescription: '없는 샷' } }])
    expect(useWriterStore.getState().chatUndo).toEqual(kept)
  })

  it('채팅이 샷이나 씬을 추가하거나 지운 것은 되돌리기 대상이 아니다', async () => {
    // 왜: 정상 경로 고정 — 지운 샷은 저장소에서 사라져 같은 자리로 되살릴 수 없다.
    await apply([
      { type: 'addShot', sceneId: 'sc_01', actionDescription: '새 샷' },
      { type: 'deleteShot', id: 'sh_01_02' },
      { type: 'addScene', narrativeSummary: '새 씬' },
      { type: 'deleteScene', id: 'sc_02' },
    ] as WriterChatUpdate[])

    const undo = useWriterStore.getState().chatUndo
    expect(undo?.addedOrDeleted).toBe(4)
    expect(undo?.entries).toEqual([])
    expect(undo?.changedIds).toEqual([])

    const shotsBefore = useWriterStore.getState().shots.map((s) => s.actionDescription)
    const scenesBefore = useWriterStore.getState().sceneManifest?.scenes.map((s) => s.sceneId)
    await useWriterStore.getState().undoChatBatch()
    expect(useWriterStore.getState().shots.map((s) => s.actionDescription)).toEqual(shotsBefore)
    expect(useWriterStore.getState().sceneManifest?.scenes.map((s) => s.sceneId)).toEqual(scenesBefore)
    expect(useWriterStore.getState().chatUndo).toBeNull()

    // 한 묶음에 고치기와 추가가 섞이면 고친 것만 되돌아간다.
    seed()
    await apply([
      { type: 'updateShot', id: 'sh_01_01', patch: { actionDescription: '바뀐 샷' } },
      { type: 'addShot', sceneId: 'sc_01', actionDescription: '섞인 새 샷' },
    ] as WriterChatUpdate[])
    expect(useWriterStore.getState().chatUndo?.addedOrDeleted).toBe(1)
    expect(useWriterStore.getState().chatUndo?.changedIds).toEqual(['sh_01_01'])
    await useWriterStore.getState().undoChatBatch()
    expect(shotOf('sh_01_01')?.actionDescription).toBe('sh_01_01')
    expect(useWriterStore.getState().shots.some((s) => s.actionDescription === '섞인 새 샷')).toBe(true)
  })
})
