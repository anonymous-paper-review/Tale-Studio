// 콘티 채팅에서 대사를 줄이는 고침의 승인 카드가 콘티 채팅에 뜨고, Storyboard 에서 낸 카드는 지금처럼 Storyboard 카드인지 검사한다 (오너 2026-11-26 O1, 리드 구조 C)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DialogueLine, Shot } from '@/types'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({ rows: {} as Record<string, Row[]>, from: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: db.from }), createCatalogClient: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn().mockResolvedValue(undefined) }))

import { createChatToolExecutor } from '@/lib/chat-tools/executor'
import { createStudioToolResources } from '@/stores/chat-tool-bindings'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'

const projectId = 'p-conti-approval'
const lines: DialogueLine[] = [
  { characterId: null, text: '그날의 이야기가 시작된다.', emotion: 'calm', delivery: 'soft', durationHint: 2.5 },
  { characterId: 'char_a', text: '정말 가야 해?', emotion: 'worried', delivery: 'whisper', durationHint: 1.5 },
]
function shot(shotId: string): Shot {
  return { shotId, sceneId: 'sc_01', shotType: 'MS', actionDescription: '인물이 기다린다', characters: ['char_a'], durationSeconds: 6, generationMethod: 'T2V',
    dialogueLines: structuredClone(lines), camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 } }
}

/** DB 는 메모리 표로 대신한다 — 도구 읽기 · 승인 요청은 실제 코드. */
function installDb() {
  db.from.mockImplementation((table: string) => {
    const filters: Row = {}
    let columns = '*'
    const execute = async (single = false) => {
      const rows = (db.rows[table] ?? []).filter(row => Object.entries(filters).every(([key, value]) => row[key] === value))
      const result = rows.map(row => columns === '*' ? structuredClone(row) : Object.fromEntries(columns.split(',').map(key => [key, structuredClone(row[key])])))
      return { data: single ? result[0] ?? null : result, error: null }
    }
    const query = {
      select: (value: string) => { columns = value; return query },
      eq: (key: string, value: unknown) => { filters[key] = value; return query },
      is: (key: string, value: unknown) => { filters[key] = value; return query },
      update: () => { throw new Error('승인 전에는 저장하지 않는다') },
      maybeSingle: () => execute(true),
      then: (resolve: (result: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(resolve),
    }
    return query
  })
}

async function proposeShrinkFrom(stage: 'conti' | 'writer') {
  useProjectStore.setState({ currentStage: stage, reachedStage: stage })
  const signal = new AbortController().signal
  const resources = createStudioToolResources({ stage, projectId, traceId: `trace-${stage}`, signal, isCurrent: () => true,
    offerProposal: proposal => { useGlobalChatStore.getState().offerPendingProposal(proposal) },
  })
  const execute = createChatToolExecutor({ resources, signal, isCurrent: () => true })
  const read = await execute({ type: 'tool_use', id: 'read', name: 'read_project', input: { resource: 'dialogue', id: 'sh_01_01' } })
  const revision = (read.records as Array<{ revision: string }>)[0].revision
  const result = await execute({ type: 'tool_use', id: 'shrink', name: 'edit_project', input: { resource: 'dialogue', id: 'sh_01_01', revision, patch: { dialogueLines: [structuredClone(lines[0])] } } })
  expect(result).toMatchObject({ status: 'approval_required' })
  return useGlobalChatStore.getState().pendingProposal
}

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useWriterStore.getState().reset()
  db.rows = {
    characters: [{ project_id: projectId, character_id: 'char_a' }],
    shots: [{ project_id: projectId, shot_id: 'sh_01_01', scene_id: 'sc_01', dialogue_lines: structuredClone(lines), action_description: '인물이 기다린다' }],
  }
  installDb()
  useProjectStore.setState({ projectId, projectLocale: 'ko', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'ko' })
  useWriterStore.setState({ sceneManifest: null, shots: [shot('sh_01_01')], error: null })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ started: true, pipeline_completed: true })))
})
afterEach(() => {
  useGlobalChatStore.getState().reset()
  useWriterStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('콘티 채팅의 승인 카드', () => {
  // 왜(혼자 정한 것): 카드는 낸 단계의 채팅 카드다 — 콘티에서 낸 카드가 Storyboard 카드로 뜨면 색 · 이름이 다른 단계로 보이고, 콘티에서 "응"으로 승인되지 않는다.
  it('콘티 채팅에서 대사를 줄이는 고침은 콘티 채팅의 승인 카드로 뜬다', async () => {
    expect(await proposeShrinkFrom('conti')).toMatchObject({ projectId, stage: 'conti', kind: 'writerShrinkDialogue' })
  })

  // 왜: 정상 경로 고정 — Storyboard 채팅에서 낸 카드는 지금처럼 Storyboard 카드다.
  it('Storyboard 채팅에서 대사를 줄이는 고침은 지금처럼 Storyboard 채팅의 승인 카드로 뜬다', async () => {
    expect(await proposeShrinkFrom('writer')).toMatchObject({ projectId, stage: 'writer', kind: 'writerShrinkDialogue' })
  })
})
