// Storyboard 채팅으로 러프가 있는 샷의 그림에 보이는 내용을 고치면, 그림은 예전 그대로라고 알리고 [러프 다시 그리기]를 주는지 검사한다
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ workflow: vi.fn(), execute: vi.fn() }))
vi.mock('@/stores/chat-workflow-bindings', () => ({ createStudioWorkflow: () => mocks.workflow, workflowPermission: () => true }))
vi.mock('@/stores/chat-tool-bindings', () => ({ createStudioToolResources: () => ({}) }))
vi.mock('@/lib/chat-tools/executor', async (original) => ({ ...(await original<object>()), createChatToolExecutor: () => mocks.execute }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useBoardUiStore } from '@/features/writer/board-ui-store'
import { shotsToRedrawAfterChat } from '@/lib/writer/chat-rough-redraw'
import type { Shot } from '@/types'

const completed = { url: 'https://m/s.png', status: 'completed' as const, errorMessage: null, generatedAt: 1, frames: { start: 'https://m/s.png', direction: 'https://m/d.png', end: 'https://m/e.png' } }
function shot(shotId: string, rough: boolean): Shot {
  return {
    shotId, sceneId: 'sc_01', actionDescription: '민호가 자판기 앞에 선다', shotType: 'MS', characters: ['min_ho'], durationSeconds: 5,
    generationMethod: 'T2V', dialogueLines: [{ characterId: 'min_ho', text: '아', emotion: '', delivery: '', durationHint: 1 }],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
    roughStoryboard: rough ? completed : null,
  }
}
const edit = (id: string, patch: Record<string, unknown>, status = 'ok', resource = 'shots') => ({
  call: { type: 'tool_use' as const, id: `e-${id}`, name: 'edit_project', input: { resource, id, revision: 'r', patch } },
  result: { status },
})

/** 모델이 도구로 샷 하나를 고치고 답하는 한 턴. */
function modelEdits(id: string, patch: Record<string, unknown>) {
  let calls = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url !== '/api/writer/chat') return Response.json({})
    calls += 1
    return Response.json(calls === 1
      ? { toolTurn: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'edit-1', name: 'edit_project', input: { resource: 'shots', id, revision: 'r1', patch } }] } }
      : { reply: '바꿔서 저장했어요.' })
  }))
}

beforeEach(() => {
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ projectId: 'p-redraw', currentStage: 'writer', reachedStage: 'writer', projectLocale: 'ko', projectLocaleLocked: true })
  useWriterStore.setState({ sceneManifest: { scenes: [], characters: [], locations: [] }, shots: [shot('sh_01_02', true), shot('sh_01_03', false)], error: null })
  useBoardUiStore.setState({ roughRedrawRequest: null })
  mocks.workflow.mockReset().mockResolvedValue({ status: 'ok' })
  mocks.execute.mockReset().mockResolvedValue({ status: 'ok' })
})
afterEach(() => {
  vi.unstubAllGlobals()
  chat.getState().reset()
})

describe('채팅 고치기 뒤 러프 다시 그리기 후보', () => {
  // 왜: 채팅 고치기는 글만 저장한다(그림 생성 없음). 러프는 스토리 · 샷 타입 · 등장인물로 그리므로 이 셋이 바뀐 샷만 그림이 낡는다.
  it('채팅으로 러프가 있는 샷의 스토리 · 샷 타입 · 등장인물을 바꾸면 그 샷을 다시 그릴 후보로 고른다', () => {
    const shots = [shot('a', true), shot('b', true), shot('c', true)]
    expect(shotsToRedrawAfterChat([
      edit('a', { actionDescription: '더 어두운 복도' }),
      edit('b', { shotType: 'CU' }),
      edit('c', { characters: [] }),
      edit('a', { shotType: 'CU' }),
    ], shots)).toEqual(['a', 'b', 'c'])
  })

  // 왜: 대사 · 길이는 러프 그림에 보이지 않고, 저장되지 않은 고침(승인 대기 · 실패)이나 아직 러프가 없는 샷은 다시 그릴 그림이 없다.
  it('대사 · 길이만 바꾼 샷, 저장되지 않은 고침, 러프가 아직 없는 샷, 씬 고침은 고르지 않는다', () => {
    const shots = [shot('a', true), shot('b', true), shot('c', false)]
    expect(shotsToRedrawAfterChat([
      edit('a', { dialogueLines: [] }),
      edit('a', { durationSeconds: 7 }, 'ok', 'dialogue'),
      edit('b', { shotType: 'CU' }, 'approval_required'),
      edit('b', { shotType: 'CU' }, 'failed'),
      edit('c', { shotType: 'CU' }),
      edit('sc_01', { mood: 'dark' }, 'ok', 'scenes'),
    ], shots)).toEqual([])
  })
})

describe('채팅 고치기 뒤 [러프 다시 그리기] 제안', () => {
  // 왜: 2026-10-31 QA — "씬2 샷3 더 어둡게 바꿔줘"에 채팅은 "더 어둡게 바꿔 저장했어요"라고 답했지만 보드 그림은 그대로라 고치기가 죽은 것처럼 보였다.
  //   그림 생성은 사람이 누를 때만 한다(채팅 도구 계약) — 저절로 그리지 않고 단추로 묻는다.
  it('채팅으로 러프가 있는 샷의 샷 타입을 바꾸면 그림은 예전 그대로라고 알리고 [러프 다시 그리기] 단추를 준다', async () => {
    modelEdits('sh_01_02', { shotType: 'CU' })
    await chat.getState().sendMessage('씬1 샷2를 클로즈업으로 바꿔줘')

    const suggestion = chat.getState().suggestion
    expect(suggestion?.stage).toBe('writer')
    expect(suggestion?.action).toEqual({ kind: 'roughRedraw', shotIds: ['sh_01_02'], label: '러프 다시 그리기' })
    expect(suggestion?.content).toContain('예전 그대로')
    expect(useBoardUiStore.getState().roughRedrawRequest).toBeNull()
  })

  // 왜: 대사만 고친 샷은 그림이 그대로 맞다 — 다시 그리자고 하면 쓸데없이 그림 비용을 쓰게 한다.
  it('채팅으로 대사만 바꾸면 다시 그리자고 하지 않는다', async () => {
    modelEdits('sh_01_02', { dialogueLines: [{ characterId: 'min_ho', text: '아, 또야?', emotion: '', delivery: '', durationHint: 1 }] })
    await chat.getState().sendMessage('씬1 샷2 대사를 "아, 또야?"로 바꿔줘')

    expect(chat.getState().suggestion?.action?.kind).not.toBe('roughRedraw')
  })

  // 왜: 단추를 누르면 보드가 카드의 [다시 시도]와 같은 길로 그 샷들만 다시 그린다(잠금 표시 · 완료 뒤 카드 갱신).
  it('[러프 다시 그리기]를 누르면 보드가 고친 샷들만 다시 그린다', () => {
    useBoardUiStore.getState().requestRoughRedraw(['sh_01_02'])
    const request = useBoardUiStore.getState().roughRedrawRequest
    expect(request?.shotIds).toEqual(['sh_01_02'])
    useBoardUiStore.getState().consumeRoughRedraw(request!.id)
    expect(useBoardUiStore.getState().roughRedrawRequest).toBeNull()

    const chatPanel = readFileSync('src/components/layout/global-chat.tsx', 'utf8')
    expect(chatPanel).toMatch(/action\.kind === 'roughRedraw'[\s\S]{0,200}requestRoughRedraw\(action\.shotIds\)/)
    const board = readFileSync('src/features/writer/rough-storyboard-view.tsx', 'utf8')
    expect(board).toContain('useBoardUiStore((s) => s.roughRedrawRequest)')
    expect(board).toMatch(/drawShots\(roughRedrawRequest\.shotIds\)/)
  })
})
