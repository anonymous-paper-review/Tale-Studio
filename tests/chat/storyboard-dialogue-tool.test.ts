// Storyboard 채팅이 대사를 Director 채팅과 같은 대사 도구(edit_project 의 dialogue 자원)로만 고치는지 — 서버가 주는 도구 · 거절, 화면이 실행하는 호출, 저장 · 확인 카드 · 답 끝 한 줄 — 을 검사한다 (오너 2026-11-27 Q1 "대사 수정 기능을 채팅창에서도" · 리드 결정 "도구 하나로")
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DialogueLine, Shot } from '@/types'

type Row = Record<string, unknown>
type Write = { table: string; filters: Row; patch: Row }
const db = vi.hoisted(() => ({ rows: {} as Record<string, Row[]>, from: vi.fn(), writes: [] as Write[], images: vi.fn(async (_projectId: string, _updates: unknown[], _opts: unknown) => {}) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: db.from }), createCatalogClient: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined) }))
// 실사 그림 요청은 맡기기만 적는다(그림 생성 없음).
vi.mock('@/lib/storyboard/chat-images', () => ({ runStoryboardImageUpdates: db.images }))

import { createChatToolExecutor } from '@/lib/chat-tools/executor'
import { prepareChatTools, rejectedToolCallIds, type ToolTurn } from '@/lib/chat-tools/protocol'
import { createStudioToolResources } from '@/stores/chat-tool-bindings'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'

// 이 시험을 위해 지은 프로젝트 — 인물 하나, 대사 두 줄(칸이 다 찬 줄 · 내레이션)이 있는 샷 하나와 대사 없는 샷 하나.
const projectId = 'p-storyboard-dialogue'
const targetId = 'sh_01_01'
const lines: DialogueLine[] = [
  { characterId: 'char_a', text: '정말 가야 해?', emotion: 'worried', delivery: 'whisper', durationHint: 1.5 },
  { characterId: null, text: '비가 그친다.', emotion: 'calm', delivery: 'soft', durationHint: 2 },
]
const edited: DialogueLine[] = [{ ...lines[0]!, text: '가자.' }, structuredClone(lines[1]!)]
const NOTE = '새로 만드는 영상부터 고친 대사가 들어가요. 이미 만든 영상은 그대로예요.'
const fetchMock = vi.fn()

function shot(shotId: string, dialogueLines: DialogueLine[]): Shot {
  return { shotId, sceneId: 'sc_01', shotType: 'MS', actionDescription: '인물이 기다린다', characters: ['char_a'],
    durationSeconds: 6, generationMethod: 'T2V', dialogueLines: structuredClone(dialogueLines),
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
    lighting: { position: 'front', brightness: 50, colorTemp: 5000 } }
}

function installDb() {
  // 실제 저장 함수가 붙이는 프로젝트 · 샷 · 기존 대사 조건을 견준다(Director 채팅 시험과 같은 흉내) — 다른 샷 · 다른 프로젝트에 저장하는 고장을 잡는다.
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
      order: () => query,
      update: (value: Row) => { patch = value; return query },
      maybeSingle: () => execute(true),
      then: (resolve: (result: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(resolve),
    }
    return query
  })
}
const chatRequests = () => fetchMock.mock.calls.filter(([url]) => String(url) === '/api/writer/chat')
function storyboardResources() {
  return createStudioToolResources({ stage: 'writer', projectId, traceId: 'trace-storyboard-dialogue', signal: new AbortController().signal, isCurrent: () => true,
    offerProposal: proposal => { useGlobalChatStore.getState().offerPendingProposal(proposal) },
  })
}
/** 모델 차례를 정해 둔다 — 차례마다 도구 호출 하나, 끝 차례는 답. 실사 · 상태 같은 다른 요청은 빈 답. */
function replyTurns(turns: Array<Row | { reply: string; updates?: unknown[] }>) {
  let turn = 0
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const path = String(input)
    if (path === `/api/writer/status/${projectId}`) return Response.json({ started: true, pipeline_completed: true })
    if (path !== '/api/writer/chat') return Response.json({})
    const next = turns[Math.min(turn, turns.length - 1)]!
    turn += 1
    if ('reply' in next) return Response.json({ reply: next.reply, updates: next.updates ?? [] })
    return Response.json({ toolSupport: true, toolTurn: { stopReason: 'tool_use', content: [{ type: 'tool_use', ...next }] } })
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
  useProjectStore.setState({ projectId, currentStage: 'writer', reachedStage: 'writer', projectLocale: 'ko', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'ko' })
  useWriterStore.setState({ sceneManifest: null, shots: [shot(targetId, lines), shot('sh_01_02', [])], error: null })
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  useGlobalChatStore.getState().reset()
  useWriterStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('같이 정한 것', () => {
  // 왜(오너 Q1 "채팅창에서도" · 리드 "도구 하나로"): Storyboard 채팅도 Director 처럼 대사 도구로만 고친다 — 고치기 도구는 대사 자원만, 읽기는 문맥을 위해 지금 그대로.
  it('Storyboard 채팅에 주는 고치기 도구는 대사 자원만 고칠 수 있고, 읽기 도구는 지금처럼 씬 · 샷 · 대사 · 인물 · 배경을 읽는다', () => {
    const tools = prepareChatTools('writer', true, [], true, true, { edit: 'dialogue', resume: false })?.tools ?? []
    const resourcesOf = (name: string) => (tools.find((tool) => tool.name === name)?.input_schema as { properties: { resource: { enum: string[] } } } | undefined)?.properties.resource.enum
    expect(resourcesOf('edit_project')).toEqual(['dialogue'])
    expect(resourcesOf('read_project')).toEqual(['scenes', 'shots', 'dialogue', 'characters', 'backgrounds'])
    // 콘티는 지금처럼 모든 자원을 고친다.
    const conti = prepareChatTools('writer', true, [], true, true)?.tools ?? []
    expect((conti.find((tool) => tool.name === 'edit_project')?.input_schema as { properties: { resource: { enum: string[] } } }).properties.resource.enum).toEqual(['scenes', 'shots', 'dialogue', 'characters', 'backgrounds'])
  })

  // 왜(architecture §3 · 리드 "서버 거절"): 모델이 대사 말고 다른 자원을 고치는 호출을 내면 서버가 거절 목록에 담는다 — 화면은 그 호출을 실행하지 않는다.
  it('Storyboard 채팅 모델이 대사 말고 다른 자원(샷 · 씬 · 인물)을 고치는 도구 호출을 내면 서버가 그 호출을 거절 목록에 담고, 대사 고치기 호출은 넘긴다', () => {
    const tools = prepareChatTools('writer', true, [], true, true, { edit: 'dialogue', resume: false })!.tools
    const turn: ToolTurn = { stopReason: 'tool_use', content: [
      { type: 'tool_use', id: 'edit-dialogue', name: 'edit_project', input: { resource: 'dialogue', id: targetId, revision: 'r', patch: {} } },
      { type: 'tool_use', id: 'edit-shot', name: 'edit_project', input: { resource: 'shots', id: targetId, revision: 'r', patch: { actionDescription: 'x' } } },
      { type: 'tool_use', id: 'edit-scene', name: 'edit_project', input: { resource: 'scenes', id: 'sc_01', revision: 'r', patch: {} } },
      { type: 'tool_use', id: 'read-shot', name: 'read_project', input: { resource: 'shots' } },
    ] } as ToolTurn
    expect(rejectedToolCallIds(turn, tools)).toEqual(['edit-shot', 'edit-scene'])
  })

  // 왜(오너 Q1): Storyboard 채팅으로 고친 대사는 대사 탭 · 콘티 · Director 와 같은 진실(그 Writer 샷의 dialogue_lines)에 대사 칸만 저장된다.
  //   새로 만드는 영상부터 들어가고 이미 만든 Take 는 그대로라, 답이 그것을 알린다(모델 말에 맡기지 않고 화면이 붙인다 — Director 와 같은 한 줄).
  it('Storyboard 채팅에서 대사를 고쳐 달라고 하면 그 Writer 샷의 대사 칸만 저장되고 화면 대사에도 바로 보이며, 답이 새로 만드는 영상부터 들어간다고 알린다', async () => {
    replyTurns([
      { id: 'read-1', name: 'read_project', input: { resource: 'dialogue', id: targetId } },
      { id: 'edit-1', name: 'edit_project', input: { resource: 'dialogue', id: targetId, revision: 'r1', patch: { dialogueLines: edited } } },
      { reply: '샷 1 대사를 "가자."로 바꿨어요.' },
    ])
    await useGlobalChatStore.getState().sendMessage('샷 1 대사를 "가자."로 바꿔줘')

    expect(chatRequests()).toHaveLength(3)
    expect(db.writes).toEqual([{ table: 'shots', filters: { project_id: projectId, shot_id: targetId, dialogue_lines: JSON.stringify(lines) }, patch: { dialogue_lines: edited } }])
    expect(useWriterStore.getState().shots[0]!.dialogueLines).toEqual(edited)
    const reply = useGlobalChatStore.getState().messages.filter((m) => m.role === 'model').at(-1)
    expect(reply).toMatchObject({ stage: 'writer' })
    expect(reply!.content).toContain(NOTE)
  })

  // 왜(오너 N3 · Q1): 이야기 · 샷은 지금처럼 콘티에서 고친다 — 모델이 샷 글 고치기를 불러도 화면이 실행하지 않고, 대사만 고친다는 결과를 모델에 돌려준다.
  it('Storyboard 채팅에서 샷 이야기 · 씬을 고치는 도구 호출은 화면이 실행하지 않고, 대사만 고친다고 모델에 돌려준다', async () => {
    replyTurns([
      { id: 'edit-shot', name: 'edit_project', input: { resource: 'shots', id: targetId, revision: 'r1', patch: { actionDescription: '새 이야기' } } },
      { reply: '샷 이야기는 Writer 콘티에서 고칠 수 있어요.' },
    ])
    await useGlobalChatStore.getState().sendMessage('샷 1 이야기를 바꿔줘')
    expect(db.writes).toEqual([])
    const second = JSON.parse(String((chatRequests()[1]![1] as RequestInit).body)) as { toolMessages: Array<{ content: Array<{ type: string; content?: string; is_error?: boolean }> }> }
    const returned = second.toolMessages.at(-1)!.content.find((block) => block.type === 'tool_result')!
    expect(returned.is_error).toBe(true)
    expect(returned.content).toMatch(/dialogue/)
    expect(returned.content).toMatch(/rough storyboard/)
  })
})

describe('검토 rev-flow-2-4', () => {
  // 왜(중간 1 · 오너 Q1 "채팅 답은 새로 만드는 영상부터 들어가요를 알린다"): N3 가 지키려던 섞인 부탁("대사 바꾸고 그림도 다시 그려 줘")에서
  //   그림 요청이 있으면 끝 답을 다시 만드는 길이 그 한 줄을 빼먹었다. 대사 저장 · 그림 맡기기는 그대로 되고, 한 줄은 한 번만 붙는다.
  it('Storyboard 채팅에서 대사 고치기와 그림 다시 그리기를 한 번에 부탁해도 답 끝에 새로 만드는 영상부터 들어간다는 한 줄이 한 번 붙는다', async () => {
    replyTurns([
      { id: 'read-1', name: 'read_project', input: { resource: 'dialogue', id: targetId } },
      { id: 'edit-1', name: 'edit_project', input: { resource: 'dialogue', id: targetId, revision: 'r1', patch: { dialogueLines: edited } } },
      { reply: '샷 1 대사를 "가자."로 바꾸고 그림도 다시 그릴게요.', updates: [{ type: 'generateImage', id: targetId }] },
    ])
    await useGlobalChatStore.getState().sendMessage('샷 1 대사를 "가자."로 바꾸고 그림도 다시 그려 줘')
    await vi.waitFor(() => expect(useGlobalChatStore.getState().loading).toBe(false))
    expect(db.writes).toHaveLength(1)
    await vi.waitFor(() => expect(db.images).toHaveBeenCalledTimes(1))
    const content = useGlobalChatStore.getState().messages.filter((m) => m.role === 'model').at(-1)!.content
    expect(content).toContain(NOTE)
    expect(content.split(NOTE)).toHaveLength(2)
  })
})

describe('혼자 정한 것', () => {
  // 왜(콘티와 같은 확인): 대사 줄을 빼는 고침은 승인 뒤에 저장된다 — 그 카드는 부탁한 Storyboard 채팅에 뜨고, 승인한 뒤에도 새 영상부터 들어간다는 말이 붙는다(Director 와 같다).
  it('Storyboard 채팅에서 대사 줄을 빼면 Storyboard 채팅에 확인 카드가 뜨고, 승인하면 그 샷에만 저장하고 새로 만드는 영상부터 들어간다고 알린다', async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      if (String(input) === `/api/writer/status/${projectId}`) return Response.json({ started: true, pipeline_completed: true })
      return Response.json({})
    })
    const execute = createChatToolExecutor({ resources: storyboardResources(), signal: new AbortController().signal, isCurrent: () => true })
    const read = await execute({ type: 'tool_use', id: 'read-1', name: 'read_project', input: { resource: 'dialogue', id: targetId } })
    const revision = (read.records as Array<{ revision: string }>)[0]!.revision
    const kept = [structuredClone(lines[0]!)]
    const result = await execute({ type: 'tool_use', id: 'shrink-1', name: 'edit_project', input: { resource: 'dialogue', id: targetId, revision, patch: { dialogueLines: kept } } })
    expect(result).toMatchObject({ status: 'approval_required' })
    const proposal = useGlobalChatStore.getState().pendingProposal!
    expect(proposal).toMatchObject({ stage: 'writer', kind: 'writerShrinkDialogue' })
    expect(db.writes).toEqual([])
    expect(await useGlobalChatStore.getState().approvePendingProposal(proposal.id)).toBe(true)
    expect(db.writes).toEqual([{ table: 'shots', filters: { project_id: projectId, shot_id: targetId, dialogue_lines: JSON.stringify(lines) }, patch: { dialogue_lines: kept } }])
    const last = useGlobalChatStore.getState().messages.at(-1)
    expect(last).toMatchObject({ stage: 'writer', role: 'model' })
    expect(last!.content).toContain(NOTE)
  })
})
