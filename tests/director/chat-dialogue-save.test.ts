// Director 채팅으로 고친 대사는 콘티 · Storyboard 와 같은 대사 자원으로 그 Writer 샷의 shots.dialogue_lines 에 저장되고 화면 대사에도 바로 보인다 (오너 2026-11-27 3차)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DialogueLine, Shot } from '@/types'

type Row = Record<string, unknown>
type Write = { table: string; filters: Row; patch: Row }
const db = vi.hoisted(() => ({ rows: {} as Record<string, Row[]>, from: vi.fn(), writes: [] as Write[] }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: db.from }), createCatalogClient: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined) }))

import { createChatToolExecutor } from '@/lib/chat-tools/executor'
import { createStudioToolResources } from '@/stores/chat-tool-bindings'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'

const projectId = 'p-director-dialogue'
const targetId = 'sh_01_01'
const lines: DialogueLine[] = [
  { characterId: 'char_a', text: '정말 가야 해?', emotion: 'worried', delivery: 'whisper', durationHint: 1.5 },
  { characterId: null, text: '비가 그친다.', emotion: 'calm', delivery: 'soft', durationHint: 2 },
]
const edited: DialogueLine[] = [{ ...lines[0]!, text: '가자.' }, structuredClone(lines[1]!)]
const fetchMock = vi.fn()

function shot(shotId: string, dialogueLines: DialogueLine[]): Shot {
  return { shotId, sceneId: 'sc_01', shotType: 'MS', actionDescription: '인물이 기다린다', characters: ['char_a'],
    durationSeconds: 6, generationMethod: 'T2V', dialogueLines: structuredClone(dialogueLines),
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
    lighting: { position: 'front', brightness: 50, colorTemp: 5000 } }
}

function installDb() {
  // 왜: 실제 저장 함수가 붙이는 프로젝트 · 샷 · 기존 대사 조건을 비교해야 다른 샷 · 다른 프로젝트에 저장하는 고장을 잡는다(콘티 승인 시험과 같은 흉내).
  db.from.mockImplementation((table: string) => {
    const filters: Row = {}
    let columns = '*'
    let patch: Row | undefined
    const execute = async (single = false) => {
      const rows = (db.rows[table] ?? []).filter(row => Object.entries(filters).every(([key, value]) => {
        if (typeof row[key] === 'object' && row[key] !== null && typeof value === 'string') return JSON.stringify(row[key]) === value
        return row[key] === value
      }))
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

const directorRequests = () => fetchMock.mock.calls.filter(([url]) => String(url) === '/api/director/chat')
function directorResources() {
  return createStudioToolResources({ stage: 'director', projectId, traceId: 'trace-director-dialogue', signal: new AbortController().signal, isCurrent: () => true,
    offerProposal: proposal => { useGlobalChatStore.getState().offerPendingProposal(proposal) },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useGlobalChatStore.getState().reset()
  useWriterStore.getState().reset()
  db.writes.length = 0
  db.rows = {
    characters: [{ project_id: projectId, character_id: 'char_a' }],
    shots: [
      { project_id: projectId, shot_id: targetId, scene_id: 'sc_01', dialogue_lines: structuredClone(lines), action_description: '인물이 기다린다' },
      { project_id: projectId, shot_id: 'sh_01_02', scene_id: 'sc_01', dialogue_lines: [], action_description: '다른 행동' },
      { project_id: 'other-project', shot_id: targetId, scene_id: 'sc_01', dialogue_lines: structuredClone(lines), action_description: '다른 프로젝트' },
    ],
  }
  installDb()
  useProjectStore.setState({ projectId, currentStage: 'director', reachedStage: 'director', projectLocale: 'ko', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'ko' })
  useWriterStore.setState({ sceneManifest: null, shots: [shot(targetId, lines), shot('sh_01_02', [])], error: null })
  useDirectorCanvasStore.setState({ projectId, nodes: [], edges: [], selectedNodeId: null, videoBatchBusy: false, realBatchBusy: false })
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  useGlobalChatStore.getState().reset()
  useWriterStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('같이 정한 것', () => {
  // 왜: 오너 3차 "대사 수정 기능을 채팅창에서도" — Director 채팅으로 고친 대사는 대사 탭 · 콘티와 같은 진실(그 Writer 샷의 dialogue_lines)에 저장된다.
  //   새로 만드는 영상부터 들어가고 이미 만든 Take 는 그대로라, 답이 그것을 알린다(모델 말에 맡기지 않고 화면이 붙인다).
  it('Director 채팅에서 대사를 고쳐 달라고 하면 그 Writer 샷의 대사가 저장되고 화면 대사에도 바로 보이며, 답이 새로 만드는 영상부터 들어간다고 알린다', async () => {
    let turn = 0
    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input)
      if (path === `/api/writer/status/${projectId}`) return Response.json({ started: true, pipeline_completed: true })
      if (path !== '/api/director/chat') throw new Error(`이 시험에서 모델 말고 다른 요청은 없다: ${path}`)
      turn += 1
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({ chatTools: true, projectId })
      if (turn === 1) return Response.json({ toolSupport: true, toolTurn: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'read-1', name: 'read_project', input: { resource: 'dialogue', id: targetId } }] } })
      if (turn === 2) return Response.json({ toolSupport: true, toolTurn: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'edit-1', name: 'edit_project', input: { resource: 'dialogue', id: targetId, revision: 'r1', patch: { dialogueLines: edited } } }] } })
      return Response.json({ reply: '샷 1 대사를 "가자."로 바꿨어요.', updates: [] })
    })

    await useGlobalChatStore.getState().sendMessage('샷 1 대사를 "가자."로 바꿔줘')

    expect(directorRequests()).toHaveLength(3)
    expect(db.writes).toEqual([{ table: 'shots', filters: { project_id: projectId, shot_id: targetId, dialogue_lines: JSON.stringify(lines) }, patch: { dialogue_lines: edited } }])
    expect(db.rows.shots[2]!.dialogue_lines).toEqual(lines)
    expect(useWriterStore.getState().shots[0]!.dialogueLines).toEqual(edited)
    const reply = useGlobalChatStore.getState().messages.filter((m) => m.role === 'model').at(-1)
    expect(reply).toMatchObject({ stage: 'director' })
    expect(reply!.content).toContain('새로 만드는 영상부터 고친 대사가 들어가요. 이미 만든 영상은 그대로예요.')
  })

  // 왜: 두 길로 나뉘지 않게(리드 3차) — Director 채팅의 대사 고침도 콘티 · Storyboard 와 같은 검사를 거친다. 등록되지 않은 말하는 사람은 받지 않는다.
  it('Director 채팅의 대사 고침은 콘티 · Storyboard 와 같은 검사를 거쳐 등록되지 않은 말하는 사람을 받지 않는다', async () => {
    const execute = createChatToolExecutor({ resources: directorResources(), signal: new AbortController().signal, isCurrent: () => true })
    const read = await execute({ type: 'tool_use', id: 'read-1', name: 'read_project', input: { resource: 'dialogue', id: targetId } })
    const revision = (read.records as Array<{ revision: string }>)[0]!.revision
    const result = await execute({ type: 'tool_use', id: 'edit-1', name: 'edit_project', input: { resource: 'dialogue', id: targetId, revision, patch: { dialogueLines: [{ ...lines[0]!, characterId: 'nobody' }, lines[1]] } } })
    expect(result).toMatchObject({ status: 'invalid_input' })
    expect(db.writes).toEqual([])
  })
})

describe('혼자 정한 것', () => {
  // 왜: 대사 줄을 빼는 고침은 콘티 채팅처럼 확인을 거친다 — 그 카드는 부탁한 Director 채팅에 떠야 한다(Storyboard 채팅에 뜨면 Director 에서 보이지 않는다).
  it('Director 채팅에서 대사 줄을 빼면 Director 채팅에 확인 카드가 뜨고 승인 전에는 저장하지 않는다', async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      if (String(input) === `/api/writer/status/${projectId}`) return Response.json({ started: true, pipeline_completed: true })
      throw new Error(`no request: ${String(input)}`)
    })
    const execute = createChatToolExecutor({ resources: directorResources(), signal: new AbortController().signal, isCurrent: () => true })
    const read = await execute({ type: 'tool_use', id: 'read-1', name: 'read_project', input: { resource: 'dialogue', id: targetId } })
    const revision = (read.records as Array<{ revision: string }>)[0]!.revision
    const result = await execute({ type: 'tool_use', id: 'shrink-1', name: 'edit_project', input: { resource: 'dialogue', id: targetId, revision, patch: { dialogueLines: [structuredClone(lines[0]!)] } } })
    expect(result).toMatchObject({ status: 'approval_required' })
    expect(useGlobalChatStore.getState().pendingProposal).toMatchObject({ stage: 'director', kind: 'writerShrinkDialogue' })
    expect(db.writes).toEqual([])
  })

  // 왜: Director 채팅이 고칠 수 있는 것은 대사뿐이다 — 대사 자원 말고 씬 · 샷 · 인물 · 설정 자원은 화면 도구에도 없다.
  it('Director 채팅의 화면 도구에는 대사 자원 하나만 있다', () => {
    expect(Object.keys(directorResources())).toEqual(['dialogue'])
  })
})
