// Director 채팅의 "대사 고치기 부탁" 판정이 실제로 고쳐 달라는 말에만 걸리는지(지난 고침을 확인하는 말 · 고쳤는지 묻는 말 · 영상 부탁은 아님), 고치기 결과 없이 끝나도 모델 답과 updates(영상 만들기 등)를 버리지 않는지, 한 차례에 대사 저장과 승인 대기가 섞여도 "새로 만드는 영상부터" 한 줄이 영수증 아래에 붙는지 — 를 검사한다 (검토 rev-video-3 중간 1 · 낮음 2, 리드 2026-11-27)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DialogueLine, Shot } from '@/types'

type Row = Record<string, unknown>
type Write = { table: string; filters: Row; patch: Row }
const db = vi.hoisted(() => ({ rows: {} as Record<string, Row[]>, from: vi.fn(), writes: [] as Write[] }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: db.from }), createCatalogClient: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined) }))

import { runChatToolLoop } from '@/lib/chat-tools/loop'
import { requestsSupportedChatEdit } from '@/lib/chat-tools/receipt'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'

// 이 시험을 위해 지은 프로젝트 — 인물 하나, 대사가 있는 샷 둘(둘째는 내레이션 줄이 있다).
const projectId = 'p-director-request'
const lines: DialogueLine[] = [{ characterId: 'char_a', text: '정말 가야 해?', emotion: 'worried', delivery: 'whisper', durationHint: 1.5 }]
const second = [{ characterId: 'char_a', text: '가자.', delivery: 'soft' }, { characterId: null, text: '비가 그친다.', delivery: 'calm' }] as DialogueLine[]
const NOTE = '새로 만드는 영상부터 고친 대사가 들어가요. 이미 만든 영상은 그대로예요.'
const GENERIC = '요청한 변경의 실행을 확인하지 못했습니다'
const fetchMock = vi.fn()

function shot(shotId: string, dialogueLines: DialogueLine[]): Shot {
  return { shotId, sceneId: 'sc_01', shotType: 'MS', actionDescription: '인물이 기다린다', characters: ['char_a'],
    durationSeconds: 6, generationMethod: 'T2V', dialogueLines: structuredClone(dialogueLines),
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
    lighting: { position: 'front', brightness: 50, colorTemp: 5000 } }
}
function installDb() {
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
/** Director 채팅 모델 차례를 정해 둔다 — 차례마다 도구 호출 하나, 끝 차례는 답. 다른 요청은 빈 답. */
function directorTurns(turns: Array<Row | { reply: string }>) {
  let turn = 0
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const path = String(input)
    if (path === `/api/writer/status/${projectId}`) return Response.json({ started: true, pipeline_completed: true })
    if (path !== '/api/director/chat') return Response.json({})
    const next = turns[Math.min(turn, turns.length - 1)]!
    turn += 1
    if ('reply' in next) return Response.json({ toolSupport: true, reply: next.reply, updates: [] })
    return Response.json({ toolSupport: true, toolTurn: { stopReason: 'tool_use', content: [{ type: 'tool_use', ...next }] } })
  })
}
const lastModel = () => useGlobalChatStore.getState().messages.filter((m) => m.role === 'model').at(-1)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useGlobalChatStore.getState().reset()
  useWriterStore.getState().reset()
  db.writes.length = 0
  db.rows = {
    characters: [{ project_id: projectId, character_id: 'char_a' }],
    shots: [
      { project_id: projectId, shot_id: 'sh_01_01', scene_id: 'sc_01', dialogue_lines: structuredClone(lines), action_description: '인물이 기다린다' },
      { project_id: projectId, shot_id: 'sh_01_02', scene_id: 'sc_01', dialogue_lines: structuredClone(second), action_description: '비가 그친다' },
    ],
  }
  installDb()
  useProjectStore.setState({ projectId, currentStage: 'director', reachedStage: 'director', projectLocale: 'ko', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'ko' })
  useWriterStore.setState({ sceneManifest: null, shots: [shot('sh_01_01', lines), shot('sh_01_02', second)], error: null })
  useDirectorCanvasStore.setState({ projectId, nodes: [], edges: [], selectedNodeId: null, videoBatchBusy: false, realBatchBusy: false })
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  useGlobalChatStore.getState().reset()
  useWriterStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('Director 채팅 대사 고치기 부탁 — 검토 rev-video-3', () => {
  // 왜(중간 1): 이 판정에 걸리면 모델이 고치지 않은 차례에서 "실행을 확인하지 못했다"로 끝난다 — 지난 고침을 확인해 달라는 말 · 고쳤는지 묻는 말 ·
  //   고친 대사로 영상을 다시 만들어 달라는 말은 고쳐 달라는 부탁이 아니다(과거형 '바꾼' · '수정한', 질문의 change, 영상 부탁).
  //   (2026-11-27 이름 바꿈 · 검토 rev-flow-2-4 낮음 3 — "대사는 빼고 다른 것을 바꿔 달라는 말"을 더함. 옛 이름 'Director 채팅에서 지난 고침을 확인해 달라는 말 · 고쳤는지 묻는 말 · 고친 대사로 영상을 다시 만들어 달라는 말은 대사 고치기 부탁으로 세지 않는다')
  it('Director 채팅에서 지난 고침을 확인해 달라는 말 · 고쳤는지 묻는 말 · 고친 대사로 영상을 다시 만들어 달라는 말 · 대사는 빼고 다른 것을 바꿔 달라는 말은 대사 고치기 부탁으로 세지 않는다', () => {
    for (const message of ['샷 8 대사 바꾼 거 확인해 줘', 'Did you change the dialogue in Shot 3?', '대사 수정한 거 반영해서 샷 1 영상 다시 만들어 줘', 'Remake the video for Shot 2 with the new dialogue.', 'Update the video for Shot 2 with the new dialogue.', '대사는 빼고 카메라만 바꿔 줘']) {
      expect({ message, wait: requestsSupportedChatEdit('director', message) }).toEqual({ message, wait: false })
    }
  })

  // 왜(정상 경로 고정 · 검토 rev-flow-2-4 낮음 3): 판정을 좁혀도 정중한 부탁 · 물음표로 끝나는 부탁, 영상 · 테이크 속 대사를 고쳐 달라는 말, "변경 부탁해요" ·
  //   "Is it possible to change …?" 같은 말은 고쳐 달라는 말이다 — 고치기 결과를 기다린다. 줄을 빼고 새 줄을 넣어 달라는 말("빼고")도 고치기다.
  //   (2026-11-27 이름 바꿈 — 옛 이름 'Director 채팅에서 물음표로 끝나는 정중한 대사 고치기 부탁은 지금처럼 고치기 부탁으로 센다')
  it('Director 채팅에서 물음표로 끝나는 정중한 부탁 · 영상 · 테이크 속 대사를 고쳐 달라는 말 · 변경을 부탁하는 말은 고치기 부탁으로 센다', () => {
    for (const message of ['샷 3 대사를 "가자"로 바꿔 줄래?', 'Can you change the dialogue in Shot 3 to "Hi"?', '샷 2 내레이션 줄 빼 줄 수 있어?',
      "샷 3 영상에서 대사 '안녕'을 '잘 가'로 바꿔 줘", "Change the dialogue in the shot 3 video to 'bye'", '테이크 2 대사 고쳐 줘',
      "Is it possible to change shot 3's dialogue to 'bye'?", '샷 2 대사 변경 부탁해요', '샷 2 대사 한 줄 빼고 새 줄 넣어 줘']) {
      expect({ message, wait: requestsSupportedChatEdit('director', message) }).toEqual({ message, wait: true })
    }
  })

  // 왜(중간 1): Director 에서 더한 샷은 대사 행이 없어 고칠 수 없다 — 모델이 안내대로 "이 채팅에서 고칠 수 없어요"라고 답했는데 일반 문구로 바뀌면 그 설명이 지워진다.
  it('Director 에서 더한 샷의 대사를 고쳐 달라고 해 모델이 고치지 않고 까닭을 답하면, 확인 한 번 뒤 그 답을 그대로 보인다', async () => {
    directorTurns([{ reply: '샷 9 는 Director 에서 더한 샷이라 이 채팅에서 대사를 고칠 수 없어요.' }])
    await useGlobalChatStore.getState().sendMessage('샷 9 대사를 "가자"로 바꿔줘')
    expect(lastModel()!.content).toContain('샷 9 는 Director 에서 더한 샷이라 이 채팅에서 대사를 고칠 수 없어요.')
    expect(lastModel()!.content).not.toContain(GENERIC)
    expect(db.writes).toEqual([])
  })

  // 왜(중간 1): 고치기 결과 없이 끝난 차례의 updates(Director 는 영상 만들기 등)를 버리면 사람이 부탁한 영상이 소리 없이 안 만들어진다 — Director · Storyboard 에서는 모델 답 · updates 를 지킨다.
  //   다른 단계(콘티 · Producer · Artist)는 지금처럼 일반 문구다.
  it('고치기 결과 없이 끝나도 Director · Storyboard 채팅은 모델 답과 updates 를 버리지 않고, 다른 단계는 지금처럼 일반 문구로 바꾼다', async () => {
    const answer = { toolSupport: true, reply: '샷 1 영상을 다시 만들게요.', updates: [{ type: 'generateVideos', shotIds: ['sh_01_01'] }] }
    const request = vi.fn(async () => answer)
    const base = { request, execute: vi.fn(), signal: new AbortController().signal, isCurrent: () => true, requireEdit: true, locale: 'ko' as const }
    const kept = await runChatToolLoop({ ...base, keepAnswerOnNoEdit: true })
    expect(kept.stopped).toBe('no_edit')
    expect(kept.data.reply).toBe('샷 1 영상을 다시 만들게요.')
    expect(kept.data.updates).toEqual(answer.updates)
    const generic = await runChatToolLoop(base)
    expect(generic.data.reply).toContain(GENERIC)
    expect(generic.data.updates).toBeUndefined()
  })

  // 왜(낮음 2): 한 차례에 저장된 대사(샷 1)와 승인 기다리는 줄 빼기(샷 2)가 섞이면 답이 실행 결과로 바뀌며 "새로 만드는 영상부터" 줄이 빠졌다 —
  //   샷 2 를 승인하지 않으면 이미 저장된 샷 1 의 안내가 끝내 안 나온다. 영수증 아래에 그 줄을 붙인다.
  it('한 차례에 대사 저장과 승인 기다리는 줄 빼기가 섞여도 실행 결과 아래에 새로 만드는 영상부터 들어간다는 한 줄을 붙인다', async () => {
    directorTurns([
      { id: 'read-1', name: 'read_project', input: { resource: 'dialogue', id: 'sh_01_01' } },
      // 읽기마다 받는 revision(r1 · r2)으로 고친다 — 화면 실행기가 읽은 차례를 확인한다.
      { id: 'edit-1', name: 'edit_project', input: { resource: 'dialogue', id: 'sh_01_01', revision: 'r1', patch: { dialogueLines: [{ ...lines[0]!, text: '가자.' }] } } },
      { id: 'read-2', name: 'read_project', input: { resource: 'dialogue', id: 'sh_01_02' } },
      { id: 'edit-2', name: 'edit_project', input: { resource: 'dialogue', id: 'sh_01_02', revision: 'r2', patch: { dialogueLines: [structuredClone(second[0]!)] } } },
      { reply: '샷 1 대사를 바꾸고 샷 2 내레이션 줄은 승인을 기다려요.' },
    ])
    await useGlobalChatStore.getState().sendMessage('샷 1 대사 "가자."로 바꾸고 샷 2 내레이션 줄 빼줘')
    expect(db.writes).toHaveLength(1)
    const content = lastModel()!.content
    expect(content).toContain('승인 대기')
    expect(content).toContain(NOTE)
    expect(content.indexOf(NOTE)).toBeGreaterThan(content.indexOf('승인 대기'))
  })
})
