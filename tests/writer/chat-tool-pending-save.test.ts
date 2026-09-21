// 겹친 화면 저장을 모두 추적하고 채팅 도구나 다른 프로젝트가 미저장 편집을 덮지 못하게 한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DialogueLine, Scene, Shot } from '@/types'

type Write = { table: string; values: Record<string, unknown>; filters: Record<string, unknown> }
const db = vi.hoisted(() => ({ writes: [] as Write[], waits: [] as Promise<void>[], savedRows: new Map<string, Record<string, unknown>>() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: (table: string) => ({ update: (values: Record<string, unknown>) => {
    const write: Write = { table, values, filters: {} }
    const execute = async () => {
      db.writes.push(write)
      await (db.waits.shift() ?? Promise.resolve())
      const key = `${table}:${write.filters.project_id}:${write.filters.shot_id ?? write.filters.scene_id}`
      db.savedRows.set(key, { ...db.savedRows.get(key), ...structuredClone(values) })
      return { data: { ...values }, error: null }
    }
    const query = {
      eq: (key: string, value: unknown) => { write.filters[key] = value; return query },
      is: (key: string, value: unknown) => { write.filters[key] = value; return query },
      select: () => query,
      maybeSingle: () => execute(),
      then: (resolve: (value: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(resolve),
    }
    return query
  } }) }),
}))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined) }))

import { hasPendingWriterEdit, useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { saveWriterToolPatch } from '@/lib/chat-tools/writer-save'

const sceneId = 'sc_01'
const shotId = 'sh_01_01'
const releases: Array<() => void> = []
function holdSave() {
  let release!: () => void
  db.waits.push(new Promise<void>(resolve => { release = resolve }))
  releases.push(release)
  return release
}
function seed(text = '원래 내용') {
  const scene: Scene = { sceneId, narrativeSummary: text, originalTextQuote: '', location: 'room', timeOfDay: 'day', mood: 'calm', charactersPresent: [], estimatedDurationSeconds: 5 }
  const shot: Shot = {
    shotId, sceneId, actionDescription: text, shotType: 'MS', characters: [], durationSeconds: 5,
    generationMethod: 'T2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
    lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
  }
  useWriterStore.setState({ sceneManifest: { scenes: [scene], characters: [], locations: [] }, shots: [shot], error: null })
}

beforeEach(() => {
  vi.useFakeTimers()
  db.writes.length = 0
  db.waits.length = 0
  db.savedRows.clear()
  releases.length = 0
  useWriterStore.getState().reset()
  useProjectStore.setState({ projectId: 'p-first', currentStage: 'writer' })
  seed()
})
afterEach(async () => {
  for (const release of releases) release()
  await vi.runAllTimersAsync()
  useWriterStore.getState().reset()
  vi.useRealTimers()
})

describe.each([
  { label: '장면', resource: 'scenes' as const, id: sceneId, field: 'narrativeSummary', dbField: 'narrative_summary',
    edit: (value: string) => useWriterStore.getState().updateScene(sceneId, { narrativeSummary: value }),
    value: () => useWriterStore.getState().sceneManifest?.scenes[0].narrativeSummary },
  { label: '샷', resource: 'shots' as const, id: shotId, field: 'actionDescription', dbField: 'action_description',
    edit: (value: string) => useWriterStore.getState().updateShot(shotId, { actionDescription: value }),
    value: () => useWriterStore.getState().shots[0].actionDescription },
])('$label의 겹친 저장', target => {
  it('앞선 저장이 끝나도 다음 화면 편집이 대기 중이면 채팅 도구로 덮어쓰지 않는다', async () => {
    // 왜: 오래 걸린 저장 하나가 끝났다는 이유로 새 예약 저장까지 끝난 것으로 오인하면 안 된다.
    const releaseFirst = holdSave()
    target.edit('먼저 편집한 내용')
    await vi.advanceTimersByTimeAsync(500)
    expect(db.writes).toHaveLength(1)
    target.edit('나중에 편집한 내용')
    releaseFirst()
    await vi.advanceTimersByTimeAsync(0)

    expect(hasPendingWriterEdit(target.resource, target.id)).toBe(true)
    const applySaved = vi.fn()
    expect(await saveWriterToolPatch({
      projectId: 'p-first', resource: target.resource, id: target.id,
      patch: { [target.field]: '채팅이 제안한 내용' }, before: { [target.field]: '먼저 편집한 내용' },
      isCurrent: () => true, hasPendingEdit: () => hasPendingWriterEdit(target.resource, target.id), applySaved,
    })).toMatchObject({ status: 'stale_state' })
    expect(applySaved).not.toHaveBeenCalled()
    expect(db.writes).toHaveLength(1)
    expect(target.value()).toBe('나중에 편집한 내용')

    await vi.advanceTimersByTimeAsync(500)
    expect(db.writes).toHaveLength(2)
    expect(db.writes[1].values[target.dbField]).toBe('나중에 편집한 내용')
    expect(hasPendingWriterEdit(target.resource, target.id)).toBe(false)
  })

  it('겹친 저장 중 하나라도 응답을 기다리는 동안에는 아직 저장 중으로 판단한다', async () => {
    // 왜: 연이어 요청한 저장 중 앞선 것만 끝났는데 뒤의 저장까지 끝났다고 판단하면 안 된다.
    const releaseFirst = holdSave()
    const releaseSecond = holdSave()
    target.edit('첫 번째 요청')
    await vi.advanceTimersByTimeAsync(500)
    target.edit('두 번째 요청')
    await vi.advanceTimersByTimeAsync(500)
    expect(db.writes).toHaveLength(1)
    expect(hasPendingWriterEdit(target.resource, target.id)).toBe(true)

    releaseFirst()
    await vi.advanceTimersByTimeAsync(0)
    expect(db.writes.map(write => write.values[target.dbField])).toEqual(['첫 번째 요청', '두 번째 요청'])
    expect(hasPendingWriterEdit(target.resource, target.id)).toBe(true)
    releaseSecond()
    await vi.advanceTimersByTimeAsync(0)
    expect(db.writes).toHaveLength(2)
    expect(hasPendingWriterEdit(target.resource, target.id)).toBe(false)
  })

  it('프로젝트를 바꾸면 이전 예약 저장이 같은 번호의 새 대상을 저장하지 않는다', async () => {
    // 왜: 프로젝트마다 장면·샷 번호가 같아도 이전 타이머가 새 프로젝트 내용을 읽고 쓰면 안 된다.
    target.edit('이전 프로젝트 편집')
    useWriterStore.getState().reset()
    useProjectStore.setState({ projectId: 'p-second' })
    seed('새 프로젝트 내용')
    await vi.advanceTimersByTimeAsync(500)

    expect(db.writes.filter(write => write.filters.project_id === 'p-second')).toEqual([])
    for (const write of db.writes) {
      expect(write.filters.project_id).toBe('p-first')
      expect(write.values[target.dbField]).toBe('이전 프로젝트 편집')
    }
    expect(target.value()).toBe('새 프로젝트 내용')
    expect(hasPendingWriterEdit(target.resource, target.id)).toBe(false)
  })
})

describe.each(['예약 대기', '응답 대기'] as const)('이전 화면 저장이 %s 중인 대사 완료', pending => {
  it('대사 완료 저장 뒤 이전 화면 저장이 대사를 되돌리지 않고 화면 편집도 보존한다', async () => {
    // 왜: 저장 완료 뒤 Director로 넘어가더라도 이전 화면 저장이 번역을 지우거나 화면 편집을 잃게 하면 안 된다.
    const originalLines: DialogueLine[] = [{ characterId: null, text: 'Old words', emotion: 'calm', delivery: 'soft', durationHint: 2 }]
    const translatedLines: DialogueLine[] = [{ ...originalLines[0], text: '새 한국어 대사' }]
    useWriterStore.setState(state => ({ shots: state.shots.map(shot => ({ ...shot, dialogueLines: originalLines })) }))
    const releaseFirst = pending === '응답 대기' ? holdSave() : undefined
    useWriterStore.getState().updateShot(shotId, { actionDescription: '사용자가 편집한 행동' })
    if (releaseFirst) await vi.advanceTimersByTimeAsync(500)

    const saveTranslation = useWriterStore.getState().saveDialogueTranslation('p-first', useWriterStore.getState().shots[0], translatedLines)
    await vi.advanceTimersByTimeAsync(0)
    releaseFirst?.()
    await vi.advanceTimersByTimeAsync(500)
    await saveTranslation
    await vi.runAllTimersAsync()

    expect(db.savedRows.get(`shots:p-first:${shotId}`)).toMatchObject({
      action_description: '사용자가 편집한 행동',
      dialogue_lines: translatedLines,
    })
    expect(useWriterStore.getState().shots[0]).toMatchObject({
      actionDescription: '사용자가 편집한 행동',
      dialogueLines: translatedLines,
    })
    expect(hasPendingWriterEdit('shots', shotId)).toBe(false)
  })
})
