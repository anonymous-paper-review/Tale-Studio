// 전체 대사 수정은 실제 저장이 끝난 뒤 남은 씬을 이어 처리하고, 모두 끝나야 다음 단계로 넘긴다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scene, Shot } from '@/types'

const { writes, saveFailures, missingRows, saveWaits, handoff } = vi.hoisted(() => ({
  writes: [] as Array<{ id: string; lines: unknown }>, saveFailures: new Set<string>(), missingRows: new Set<string>(), saveWaits: new Map<string, Promise<void>>(),
  handoff: vi.fn().mockResolvedValue('/studio/director'),
}))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/stage-nav', () => ({ handoffToStage: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  from: () => ({ update: (data: Record<string, unknown>) => {
    const filters: Record<string, string> = {}
    const query = { eq: (key: string, value: string) => { filters[key] = value; return query }, select: () => query, maybeSingle: () => query,
      then: (resolve: (result: { error: { message: string } | null; data: { shot_id: string } | null }) => unknown) => {
        writes.push({ id: filters.shot_id, lines: data.dialogue_lines })
        return (saveWaits.get(filters.shot_id) ?? Promise.resolve()).then(() => ({ error: saveFailures.has(filters.shot_id) ? { message: '저장 실패' } : null, data: missingRows.has(filters.shot_id) ? null : { shot_id: filters.shot_id } })).then(resolve)
      },
    }
    return query
  } }),
}) }))

import { useWriterStore } from '@/stores/writer-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { EMPTY_LIFECYCLE_STATUS } from '@/lib/lifecycle'
import { saveChatMessage } from '@/lib/chat-persistence'

const scene = (n: number): Scene => ({ sceneId: `sc_${n}`, sortOrder: n, location: 'room', timeOfDay: 'day', mood: 'calm', narrativeSummary: `장면 ${n}`, originalTextQuote: '', charactersPresent: ['char_a'], estimatedDurationSeconds: 5 })
const shot = (n: number): Shot => ({ shotId: `shot_${n}`, sceneId: `sc_${n}`, sortOrder: n, shotType: 'MS', actionDescription: '대화', characters: ['char_a'], durationSeconds: 5, generationMethod: 'T2V', dialogueLines: [{ characterId: 'char_a', text: n === 6 ? '이미 한국어예요.' : 'こんにちは。', emotion: 'calm', delivery: 'soft', durationHint: 1 }], camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 } })
const update = (n: number) => ({ type: 'updateShot', id: `shot_${n}`, patch: { dialogueLines: [{ characterId: 'char_a', text: `안녕하세요 ${n}.`, emotion: 'calm', delivery: 'soft', durationHint: 1 }] } })
let requests: Record<string, unknown>[]
function respond(batches: unknown[][]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/writer/status/')) return Response.json({ started: true, pipeline_completed: true })
    if (url === '/api/project/dialogue-handoff/handoff') {
      const gate = useProjectStore.getState().lifecycleStatus.director
      if (gate?.ready === false) return Response.json({ ready: false, blockers: gate.blockers.map(blocker => ({ label: blocker.label, action: 'Artist에서 인물 이미지를 준비해 주세요.' })) }, { status: 409 })
      // 실제 서버 이동 요청과 완료 판정을 대신하는 응답 fixture다.
      handoff(JSON.parse(String(init?.body)).targetStage)
      return Response.json({ ready: true, blockers: [], counts: { scenes: 6, shots: 47 }, path: '/studio/director' })
    }
    if (url === '/api/writer/chat') {
      requests.push(JSON.parse(String(init?.body)))
      return Response.json({ reply: '우선 1~3씬부터 처리할게요.', updates: batches[requests.length - 1] ?? [] })
    }
    throw new Error(`Unexpected request ${url}`)
  }))
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  writes.length = 0; saveFailures.clear(); missingRows.clear(); saveWaits.clear(); requests = []
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'dialogue-handoff', currentStage: 'writer', reachedStage: 'director', projectLocale: 'ko', projectLocaleLocked: true, lifecycleStatus: structuredClone(EMPTY_LIFECYCLE_STATUS) })
  useWriterStore.setState({ sceneManifest: { scenes: [1,2,3,4,5,6].map(scene), characters: [], locations: [] }, shots: [1,2,3,4,5,6].map(shot), error: null })
  useGlobalChatStore.setState({ messages: [
    { id: 'request-director', stage: 'writer', role: 'user', content: 'Director로 넘겨주세요' },
    { id: 'ask-language', stage: 'writer', role: 'model', content: '한국어와 일본어가 섞여 있어요. 전체 한국어로 맞출까요?' },
  ] })
})
afterEach(() => { vi.clearAllTimers(); useGlobalChatStore.getState().reset(); useWriterStore.getState().reset(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('대사 전체 수정 완료에 따른 이어가기', () => {
  it('전체 한국어로 맞추고 넘겨 달라고 하면 일부 씬 저장 뒤 남은 씬을 자동 처리하고 모두 저장된 뒤 Director로 넘긴다', async () => {
    respond([[update(1), update(2), update(3)], [update(4)], [update(5)]])
    await useGlobalChatStore.getState().sendMessage('전체 한국어로 맞추고 넘겨줘')
    expect(writes.map(write => write.id)).toEqual(['shot_1','shot_2','shot_3','shot_4','shot_5'])
    expect(requests).toHaveLength(3)
    expect(handoff).toHaveBeenCalledExactlyOnceWith('director')
    expect(useGlobalChatStore.getState().messages.map(message => message.content).join('\n')).toContain('모든 대사')
    expect(useWriterStore.getState().shots[5].dialogueLines[0].text).toBe('이미 한국어예요.')
  })

  it('대사 저장이 실패하면 남은 대상을 알리고 다음 단계로 넘기지 않는다', async () => {
    saveFailures.add('shot_2')
    respond([[update(1), update(2), update(3)], [update(4)], [update(5)]])
    await useGlobalChatStore.getState().sendMessage('전체 한국어로 맞추고 넘겨줘')
    expect(handoff).not.toHaveBeenCalled()
    const report = useGlobalChatStore.getState().messages.map(message => message.content).join('\n')
    expect(report).toContain('저장 실패')
    expect(report).toMatch(/남은|완료하지 못/)
  })

  it('모델이 앞으로 하겠다는 말만 해도 남은 씬을 실제로 다시 요청하고 끝내지 못한 이유를 알린다', async () => {
    respond([[], [], [], [], [], []])
    await useGlobalChatStore.getState().sendMessage('전체 한국어로 맞추고 넘겨줘')
    expect(requests).toHaveLength(6)
    expect(handoff).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
    expect(useGlobalChatStore.getState().messages.at(-1)?.content).toMatch(/완료하지 못|남은/)
  })

  it('대사 통일 응답에 샷 삭제가 섞여 있어도 요청한 대사 이외의 작업은 실행하지 않는다', async () => {
    respond([[update(1), update(2), update(3), { type: 'deleteShot', id: 'shot_6' }], [update(4)], [update(5)]])
    await useGlobalChatStore.getState().sendMessage('전체 한국어로 맞추고 넘겨줘')
    expect(useWriterStore.getState().shots).toHaveLength(6)
    expect(handoff).toHaveBeenCalledOnce()
  })
})


it('앞선 씬의 저장 응답이 오기 전에는 다음 씬을 요청하거나 넘기지 않는다', async () => {
  let release!: () => void
  saveWaits.set('shot_3', new Promise<void>(resolve => { release = resolve }))
  respond([[update(1), update(2), update(3)], [update(4)], [update(5)]])
  const send = useGlobalChatStore.getState().sendMessage('전체 한국어로 맞추고 넘겨줘')
  await vi.waitFor(() => expect(writes).toHaveLength(3))
  expect(requests).toHaveLength(1)
  expect(handoff).not.toHaveBeenCalled()
  release()
  await send
  expect(requests).toHaveLength(3)
  expect(handoff).toHaveBeenCalledOnce()
})

it('대사 통일 중 중단하면 저장을 마친 부분을 유지하고 나머지는 실행하거나 넘기지 않는다', async () => {
  let release!: () => void
  saveWaits.set('shot_1', new Promise<void>(resolve => { release = resolve }))
  respond([[update(1), update(2), update(3)], [update(4)], [update(5)]])
  const send = useGlobalChatStore.getState().sendMessage('전체 한국어로 맞추고 넘겨줘')
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  useGlobalChatStore.getState().stopGeneration()
  release()
  await send
  expect(writes).toHaveLength(1)
  expect(handoff).not.toHaveBeenCalled()
  expect(useWriterStore.getState().shots[0].dialogueLines[0].text).toBe('안녕하세요 1.')
  expect(useWriterStore.getState().shots[1].dialogueLines[0].text).toBe('こんにちは。')
})

it('번역 응답에서 말투 정보가 빠져도 원래 화자와 말투를 보존한다', async () => {
  const updates = [1,2,3,4,5].map(n => ({ type: 'updateShot', id: `shot_${n}`, patch: { dialogueLines: [{ characterId: 'char_a', text: `안녕하세요 ${n}.` }] } }))
  respond([updates])
  await useGlobalChatStore.getState().sendMessage('전체 한국어로 맞추고 Director로 넘겨줘')
  expect(writes).toHaveLength(5)
  expect(writes[0].lines).toEqual([{ characterId: 'char_a', text: '안녕하세요 1.', emotion: 'calm', delivery: 'soft', durationHint: 1 }])
  expect(handoff).toHaveBeenCalledOnce()
})

it('언어만 통일하라고 했으면 다음 단계로 넘기지 않는다', async () => {
  respond([[update(1), update(2), update(3)]])
  await useGlobalChatStore.getState().sendMessage('전체 한국어로 맞춰줘')
  expect(handoff).not.toHaveBeenCalled()
  expect(requests).toHaveLength(1)
})

it('남은 한 씬도 여러 번 나뉘어 돌아오면 저장한 샷을 빼고 나머지를 계속 처리한다', async () => {
  useWriterStore.setState({ sceneManifest: { scenes: [scene(1)], characters: [], locations: [] }, shots: [1,2,3].map(n => ({ ...shot(n), sceneId: 'sc_1' })) })
  respond([[update(1)], [update(2)], [update(3)]])
  await useGlobalChatStore.getState().sendMessage('전체 한국어로 맞추고 넘겨줘')
  expect(writes.map(write => write.id)).toEqual(['shot_1','shot_2','shot_3'])
  expect(requests).toHaveLength(3)
  expect(handoff).toHaveBeenCalledOnce()
})


it('모든 대사를 저장했어도 Director 준비 조건이 부족하면 완료 내역을 남기고 이동을 보류한다', async () => {
  useProjectStore.setState({ lifecycleStatus: { ...structuredClone(EMPTY_LIFECYCLE_STATUS), director: { ready: false, blockers: [{ field: 'missing-image', label: '인물 이미지가 필요해요.' }], warnings: [] } } })
  respond([[update(1),update(2),update(3),update(4),update(5)]])
  await useGlobalChatStore.getState().sendMessage('전체 한국어로 맞추고 넘겨줘')
  expect(writes).toHaveLength(5)
  expect(handoff).not.toHaveBeenCalled()
  expect(useGlobalChatStore.getState().messages.at(-1)?.content).toContain('인물 이미지가 필요해요.')
})


it('저장할 샷이 도중에 사라졌으면 응답이 성공이어도 전체 저장 완료로 판단하지 않는다', async () => {
  missingRows.add('shot_2')
  respond([[update(1),update(2),update(3),update(4),update(5)]])
  await useGlobalChatStore.getState().sendMessage('전체 한국어로 맞추고 넘겨줘')
  expect(handoff).not.toHaveBeenCalled()
  expect(useGlobalChatStore.getState().messages.at(-1)?.content).toMatch(/완료하지 못|남은/)
})


it('47샷의 대사를 처리해도 같은 요청의 진행 안내는 한 줄만 갱신하고 마지막 기록만 저장한다', async () => {
  const shots = Array.from({ length: 47 }, (_, index) => {
    const n = index + 1
    return { ...shot(n), sceneId: `sc_${Math.ceil(n / 8)}`, dialogueLines: [{ ...shot(n).dialogueLines[0], text: n <= 40 ? 'こんにちは。' : '이미 한국어예요.' }] }
  })
  useWriterStore.setState({ shots })
  let release!: () => void
  saveWaits.set('shot_24', new Promise<void>(resolve => { release = resolve }))
  respond([
    Array.from({ length: 24 }, (_, index) => update(index + 1)),
    Array.from({ length: 8 }, (_, index) => update(index + 25)),
    Array.from({ length: 8 }, (_, index) => update(index + 33)),
  ])
  const send = useGlobalChatStore.getState().sendMessage('전체 한국어로 맞추고 넘겨줘')
  await vi.waitFor(() => expect(writes).toHaveLength(24))
  const progressBefore = useGlobalChatStore.getState().messages.filter(message => /^대사 \d+\/\d+개 샷/.test(message.content))
  release()
  await send
  const progressAfter = useGlobalChatStore.getState().messages.filter(message => /^대사 \d+\/\d+개 샷/.test(message.content))
  expect(progressBefore).toHaveLength(1)
  expect(progressAfter).toHaveLength(1)
  expect(progressAfter[0].id).toBe(progressBefore[0].id)
  expect(progressAfter[0].content).toBe('대사 40/40개 샷을 저장했어요.')
  expect(vi.mocked(saveChatMessage).mock.calls.filter(call => /^대사 \d+\/\d+개 샷/.test(call[3]))).toHaveLength(1)
  expect(writes).toHaveLength(40)
  expect(handoff).toHaveBeenCalledOnce()
})

it('Director 이동 질문 뒤 대사 통일과 이동을 요청하면 저장 후 서버의 현재 조건을 확인한다', async () => {
  useGlobalChatStore.setState({ messages: [{ id: 'question', stage: 'writer', role: 'user', content: '디렉터러 넘길수잇어?' }] })
  respond([[update(1), update(2), update(3), update(4), update(5)]])
  await useGlobalChatStore.getState().sendMessage('전체 한국어로 맞추고 넘겨줘')
  expect(writes).toHaveLength(5)
  expect(handoff).toHaveBeenCalledExactlyOnceWith('director')
  expect(useGlobalChatStore.getState().messages.some(message => message.content.includes('⇄'))).toBe(false)
  expect(useGlobalChatStore.getState().directorHandoff?.phase).toBe('navigating')
})
