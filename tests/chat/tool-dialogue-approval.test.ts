// 채팅의 대사 축소는 승인 뒤 지정한 샷에만 저장하고 취소하면 원래 대사를 유지한다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DialogueLine, Shot } from '@/types'

type Row = Record<string, unknown>
type Write = { table: string; filters: Row; patch: Row }
const db = vi.hoisted(() => ({
  rows: {} as Record<string, Row[]>, from: vi.fn(), writes: [] as Write[],
  events: [] as Array<{ kind: 'read' | 'write'; table: string }>,
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: db.from }), createCatalogClient: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined) }))

import { createChatToolExecutor } from '@/lib/chat-tools/executor'
import { createStudioToolResources } from '@/stores/chat-tool-bindings'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'

const projectId = 'p-dialogue-approval'
const targetId = 'sh_01_01'
const originalLines: DialogueLine[] = [
  { characterId: null, text: '그날의 이야기가 시작된다.', emotion: 'calm', delivery: 'soft', durationHint: 2.5 },
  { characterId: 'char_a', text: '정말 가야 해?', emotion: 'worried', delivery: 'whisper', durationHint: 1.5 },
  { characterId: 'char_a', text: '기다려 줄게.', emotion: 'hopeful', delivery: 'normal', durationHint: 2 },
]
const reducedLines: DialogueLine[] = [structuredClone(originalLines[0])]
const otherLines: DialogueLine[] = [{ characterId: 'char_a', text: '다른 샷의 대사', emotion: 'happy', delivery: 'loud', durationHint: 3 }]
const fetchMock = vi.fn(async (input: string | URL | Request) => {
  const path = String(input)
  if (path === `/api/writer/status/${projectId}`) return Response.json({ started: true, pipeline_completed: true })
  throw new Error(`이 테스트에서 모델·이미지·영상 요청은 허용하지 않습니다: ${path}`)
})

function shot(shotId: string, dialogueLines: DialogueLine[]): Shot {
  return { shotId, sceneId: 'sc_01', shotType: 'MS', actionDescription: '인물이 기다린다', characters: ['char_a'],
    durationSeconds: 6, generationMethod: 'T2V', dialogueLines: structuredClone(dialogueLines),
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
    lighting: { position: 'front', brightness: 50, colorTemp: 5000 } }
}

function installDb() {
  // 왜: 실제 저장 함수가 붙이는 프로젝트·샷·기존 대사 조건을 모두 비교해야 잘못된 대상 저장을 잡는다.
  // DB만 메모리로 대신하고, 도구 조회·수정·승인 실행·저장 후 재조회와 Writer 표시 갱신은 실제 코드를 쓴다.
  db.from.mockImplementation((table: string) => {
    const filters: Row = {}
    let columns = '*'
    let patch: Row | undefined
    const execute = async (single = false) => {
      const rows = (db.rows[table] ?? []).filter(row => Object.entries(filters).every(([key, value]) => {
        if (typeof row[key] === 'object' && row[key] !== null && typeof value === 'string') return JSON.stringify(row[key]) === value
        return row[key] === value
      }))
      db.events.push({ kind: patch ? 'write' : 'read', table })
      if (patch) {
        db.writes.push({ table, filters: { ...filters }, patch: structuredClone(patch) })
        for (const row of rows) Object.assign(row, structuredClone(patch))
      }
      const result = rows.map(row => columns === '*' ? structuredClone(row) : Object.fromEntries(columns.split(',').map(key => [key, structuredClone(row[key])])))
      return { data: single ? result[0] ?? null : result, error: null }
    }
    const query = {
      select: (value: string) => { columns = value; return query },
      eq: (key: string, value: unknown) => { filters[key] = value; return query },
      is: (key: string, value: unknown) => { filters[key] = value; return query },
      update: (value: Row) => { patch = value; return query },
      maybeSingle: () => execute(true),
      then: (resolve: (result: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(resolve),
    }
    return query
  })
}

async function proposeDialogueShrink() {
  const signal = new AbortController().signal
  const resources = createStudioToolResources({ stage: 'writer', projectId, traceId: 'trace-dialogue-approval', signal, isCurrent: () => true,
    offerProposal: proposal => { useGlobalChatStore.getState().offerPendingProposal(proposal) },
  })
  const execute = createChatToolExecutor({ resources, signal, isCurrent: () => true })
  const read = await execute({ type: 'tool_use', id: 'read-dialogue', name: 'read_project', input: { resource: 'dialogue', id: targetId } })
  expect(read).toMatchObject({ status: 'ok', records: [{ id: targetId, values: { dialogueLines: originalLines, sceneId: 'sc_01' } }] })
  const revision = (read.records as Array<{ revision: string }>)[0].revision
  const result = await execute({ type: 'tool_use', id: 'shrink-dialogue', name: 'edit_project',
    input: { resource: 'dialogue', id: targetId, revision, patch: { dialogueLines: reducedLines } },
  })
  expect(result).toMatchObject({ status: 'approval_required' })
  const proposal = useGlobalChatStore.getState().pendingProposal!
  expect(proposal).toMatchObject({ projectId, stage: 'writer', kind: 'writerShrinkDialogue', payload: { toolEdit: {
    resource: 'dialogue', id: targetId, patch: { dialogueLines: reducedLines }, before: { dialogueLines: originalLines, sceneId: 'sc_01' },
  } } })
  return proposal
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useGlobalChatStore.getState().reset()
  useWriterStore.getState().reset()
  db.writes.length = 0
  db.events.length = 0
  // 왜: 같은 프로젝트의 다른 샷과 다른 프로젝트의 같은 샷 번호가 있어야 저장 범위를 검증할 수 있다.
  db.rows = {
    characters: [{ project_id: projectId, character_id: 'char_a' }],
    shots: [
      { project_id: projectId, shot_id: targetId, scene_id: 'sc_01', dialogue_lines: structuredClone(originalLines), action_description: '인물이 기다린다' },
      { project_id: projectId, shot_id: 'sh_01_02', scene_id: 'sc_01', dialogue_lines: structuredClone(otherLines), action_description: '다른 행동' },
      { project_id: 'other-project', shot_id: targetId, scene_id: 'sc_01', dialogue_lines: structuredClone(otherLines), action_description: '다른 프로젝트 행동' },
    ],
  }
  installDb()
  useProjectStore.setState({ projectId, currentStage: 'writer', reachedStage: 'writer', projectLocale: 'ko', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'ko' })
  useWriterStore.setState({ sceneManifest: null, shots: [shot(targetId, originalLines), shot('sh_01_02', otherLines)], error: null })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  // 왜: 승인은 대사 저장만 허용하며 모델 응답이나 이미지 생성으로 성공을 대신해서는 안 된다.
  expect(fetchMock.mock.calls.every(([url]) => String(url) === `/api/writer/status/${projectId}`)).toBe(true)
  useGlobalChatStore.getState().reset()
  useWriterStore.getState().reset()
  vi.unstubAllGlobals()
})

it('대사를 줄이는 변경은 승인 전에는 저장하지 않는다', async () => {
  // 왜: 모델이 대사 축소를 요청해도 사용자가 승인하기 전에는 내레이션이나 인물 대사를 지우면 안 된다.
  const before = structuredClone(db.rows)
  const displayed = structuredClone(useWriterStore.getState().shots)
  await proposeDialogueShrink()

  expect(db.writes).toEqual([])
  expect(db.rows).toEqual(before)
  expect(useWriterStore.getState().shots).toEqual(displayed)
})

it('대사 축소를 승인하면 지정한 샷에만 저장한다', async () => {
  // 왜: 승인 카드의 정확한 대사와 화자 없음·감정·전달·길이 정보는 보존하고 다른 샷이나 프로젝트는 바꾸면 안 된다.
  const before = structuredClone(db.rows.shots)
  const otherDisplayed = structuredClone(useWriterStore.getState().shots[1])
  const proposal = await proposeDialogueShrink()
  expect(await useGlobalChatStore.getState().approvePendingProposal(proposal.id)).toBe(true)

  expect(db.writes).toEqual([{ table: 'shots', filters: { project_id: projectId, shot_id: targetId, dialogue_lines: JSON.stringify(originalLines) }, patch: { dialogue_lines: reducedLines } }])
  expect(db.rows.shots[0]).toEqual({ ...before[0], dialogue_lines: reducedLines })
  expect(db.rows.shots.slice(1)).toEqual(before.slice(1))
  expect(useWriterStore.getState().shots[0].dialogueLines).toEqual(reducedLines)
  expect(useWriterStore.getState().shots[1]).toEqual(otherDisplayed)
  expect(db.events.slice(db.events.findIndex(event => event.kind === 'write') + 1)).toContainEqual({ kind: 'read', table: 'shots' })
  expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
  expect(useGlobalChatStore.getState().deferredProposals).toEqual([])
  expect(useGlobalChatStore.getState().messages.at(-1)).toMatchObject({ stage: 'writer', role: 'model', content: expect.stringContaining('저장을 확인') })
})

it('대사 축소를 취소하면 원래 대사를 유지한다', async () => {
  // 왜: 현재 대화에서 취소하면 승인 카드를 닫고 모델 재호출이나 지연 저장 없이 원래 대사 전체를 남겨야 한다.
  const before = structuredClone(db.rows)
  const displayed = structuredClone(useWriterStore.getState().shots)
  await proposeDialogueShrink()
  const readsBeforeCancel = db.events.length
  fetchMock.mockClear()

  await useGlobalChatStore.getState().sendMessage('취소해줘')

  expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
  expect(useGlobalChatStore.getState().deferredProposals).toEqual([])
  expect(db.writes).toEqual([])
  expect(db.events).toHaveLength(readsBeforeCancel)
  expect(db.rows).toEqual(before)
  expect(useWriterStore.getState().shots).toEqual(displayed)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(useGlobalChatStore.getState().messages.at(-1)).toMatchObject({ stage: 'writer', role: 'model', content: expect.stringContaining('취소') })
})
