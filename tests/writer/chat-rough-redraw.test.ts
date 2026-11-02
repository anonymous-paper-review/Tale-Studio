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
import { roughRedrawCandidates, roughVisibleState } from '@/lib/writer/chat-rough-redraw'
import type { Scene, SceneManifest, Shot } from '@/types'

const completed = { url: 'https://m/s.png', status: 'completed' as const, errorMessage: null, generatedAt: 1, frames: { start: 'https://m/s.png', direction: 'https://m/d.png', end: 'https://m/e.png' } }
function shot(shotId: string, rough: boolean, sceneId = 'sc_01', over: Partial<Shot> = {}): Shot {
  return {
    shotId, sceneId, actionDescription: '민호가 자판기 앞에 선다', shotType: 'MS', characters: ['min_ho'], durationSeconds: 5,
    generationMethod: 'T2V', dialogueLines: [{ characterId: 'min_ho', text: '아', emotion: '', delivery: '', durationHint: 1 }],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
    roughStoryboard: rough ? completed : null,
    ...over,
  }
}
function scene(sceneId: string, over: Partial<Scene> = {}): Scene {
  return { sceneId, narrativeSummary: '자판기', originalTextQuote: '', location: 'corridor', timeOfDay: '밤', mood: '피로', charactersPresent: ['min_ho'], estimatedDurationSeconds: 10, ...over }
}
const manifest = (scenes: Scene[]): SceneManifest => ({ scenes, characters: [], locations: [] })
const edit = (id: string, patch: Record<string, unknown>, status = 'ok', resource = 'shots') => ({
  call: { type: 'tool_use' as const, id: `e-${id}`, name: 'edit_project', input: { resource, id, revision: 'r', patch } },
  result: { status },
})

/** 모델이 도구로 한 대상을 고치고 답하는 한 턴. 도구는 화면 상태에 저장 결과를 반영한다(applySaved 와 같은 일). */
function modelEdits(resource: 'shots' | 'scenes', id: string, patch: Record<string, unknown>) {
  let calls = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url !== '/api/writer/chat') return Response.json({})
    calls += 1
    return Response.json(calls === 1
      ? { toolTurn: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'edit-1', name: 'edit_project', input: { resource, id, revision: 'r1', patch } }] } }
      : { reply: '바꿔서 저장했어요.' })
  }))
  mocks.execute.mockImplementation(async () => {
    if (resource === 'shots') useWriterStore.setState((s) => ({ shots: s.shots.map((x) => (x.shotId === id ? { ...x, ...patch } : x)) }))
    else useWriterStore.setState((s) => ({ sceneManifest: s.sceneManifest ? { ...s.sceneManifest, scenes: s.sceneManifest.scenes.map((x) => (x.sceneId === id ? { ...x, ...patch } : x)) } : null }))
    return { status: 'ok' }
  })
}

beforeEach(() => {
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ projectId: 'p-redraw', currentStage: 'writer', reachedStage: 'writer', projectLocale: 'ko', projectLocaleLocked: true })
  useWriterStore.setState({ sceneManifest: manifest([scene('sc_01'), scene('sc_02')]), shots: [shot('sh_01_02', true), shot('sh_01_03', false), shot('sh_01_04', true), shot('sh_02_05', true, 'sc_02')], error: null })
  useBoardUiStore.setState({ boardProjectId: 'p-redraw', roughRedrawRequest: null })
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
    const before = roughVisibleState(manifest([scene('sc_01')]), shots)
    const after = roughVisibleState(manifest([scene('sc_01')]), [
      shot('a', true, 'sc_01', { actionDescription: '더 어두운 복도', shotType: 'CU' }), shot('b', true, 'sc_01', { shotType: 'CU' }), shot('c', true, 'sc_01', { characters: [] }),
    ])
    expect(roughRedrawCandidates([
      edit('a', { actionDescription: '더 어두운 복도' }),
      edit('b', { shotType: 'CU' }),
      edit('c', { characters: [] }),
      edit('a', { shotType: 'CU' }),
    ], before, after)).toEqual(['a', 'b', 'c'])
  })

  // 왜: 대사 · 길이는 러프 그림에 보이지 않고(러프 라우트는 대사를 읽지 않는다), 저장되지 않은 고침(승인 대기 · 실패)이나 아직 러프가 없는 샷은 다시 그릴 그림이 없다.
  it('대사 · 길이만 바꾼 샷, 저장되지 않은 고침, 러프가 아직 없는 샷은 고르지 않는다', () => {
    const shots = [shot('a', true), shot('b', true), shot('c', false)]
    const before = roughVisibleState(manifest([scene('sc_01')]), shots)
    const after = roughVisibleState(manifest([scene('sc_01')]), [shot('a', true, 'sc_01', { dialogueLines: [], durationSeconds: 7 }), shot('b', true), shot('c', false, 'sc_01', { shotType: 'CU' })])
    expect(roughRedrawCandidates([
      edit('a', { dialogueLines: [] }),
      edit('a', { durationSeconds: 7 }, 'ok', 'dialogue'),
      edit('b', { shotType: 'CU' }, 'approval_required'),
      edit('b', { shotType: 'CU' }, 'failed'),
      edit('c', { shotType: 'CU' }),
    ], before, after)).toEqual([])
  })

  // 왜: 2026-11-01 리뷰 M3 — 도구는 같은 값을 다시 보내도 "저장됨"으로 답한다. 같은 샷 타입을 다시 보내거나, 대사를 고치며 스토리를 그대로 보내도
  //   돈 드는 다시 그리기를 물었다. 턴을 시작할 때와 끝날 때 값을 견줘 실제로 바뀐 것만 묻는다.
  it('채팅이 보낸 값이 저장된 값과 같아 그림에 보이는 내용이 실제로 안 바뀌면 [러프 다시 그리기]를 묻지 않는다', () => {
    const shots = [shot('a', true)]
    const state = roughVisibleState(manifest([scene('sc_01')]), shots)
    expect(roughRedrawCandidates([edit('a', { shotType: 'MS' })], state, state)).toEqual([])
    expect(roughRedrawCandidates([edit('a', { actionDescription: '민호가 자판기 앞에 선다', dialogueLines: [] })], state, state)).toEqual([])
  })

  // 왜: 러프 그림 프롬프트는 씬의 장소 · 시간대 · 분위기를 읽는다(rough-storyboard 라우트 · rough-storyboard.ts Setting/Mood 줄) — 씬을 고치면 그 씬 샷 그림이 낡는다(리드 결정 D1).
  it('채팅으로 씬의 장소 · 시간대 · 분위기를 실제로 바꾸면 그 씬에서 러프가 있는 샷들을 다시 그릴 후보로 고른다', () => {
    const shots = [shot('a', true), shot('b', true), shot('c', false), shot('d', true, 'sc_02')]
    const before = roughVisibleState(manifest([scene('sc_01'), scene('sc_02')]), shots)
    const after = roughVisibleState(manifest([scene('sc_01', { mood: '어둡고 긴장된' }), scene('sc_02')]), shots)
    expect(roughRedrawCandidates([edit('sc_01', { mood: '어둡고 긴장된' }, 'ok', 'scenes')], before, after)).toEqual(['a', 'b'])
  })

  // 왜: 씬 요약 · 등장인물 목록 · 원문 인용은 러프 프롬프트에 들어가지 않는다 — 그림은 그대로 맞다.
  it('씬의 요약이나 등장인물 목록만 바꾸면 [러프 다시 그리기]를 묻지 않는다', () => {
    const shots = [shot('a', true)]
    const before = roughVisibleState(manifest([scene('sc_01')]), shots)
    const after = roughVisibleState(manifest([scene('sc_01', { narrativeSummary: '새 요약', charactersPresent: [] })]), shots)
    expect(roughRedrawCandidates([edit('sc_01', { narrativeSummary: '새 요약', charactersPresent: [] }, 'ok', 'scenes')], before, after)).toEqual([])
  })
})

describe('채팅 고치기 뒤 [러프 다시 그리기] 제안', () => {
  // 왜: 2026-10-31 QA — "씬2 샷3 더 어둡게 바꿔줘"에 채팅은 "더 어둡게 바꿔 저장했어요"라고 답했지만 보드 그림은 그대로라 고치기가 죽은 것처럼 보였다.
  //   그림 생성은 사람이 누를 때만 한다(채팅 도구 계약, 오너 2026-11-02 "단추로 묻기") — 저절로 그리지 않고 단추로 묻는다.
  it('채팅으로 러프가 있는 샷의 샷 타입을 바꾸면 그림은 예전 그대로라고 알리고 [러프 다시 그리기] 단추를 준다', async () => {
    modelEdits('shots', 'sh_01_02', { shotType: 'CU' })
    await chat.getState().sendMessage('씬1 샷2를 클로즈업으로 바꿔줘')

    const suggestion = chat.getState().suggestion
    expect(suggestion?.stage).toBe('writer')
    expect(suggestion?.action).toEqual({ kind: 'roughRedraw', projectId: 'p-redraw', shotIds: ['sh_01_02'], label: '러프 다시 그리기' })
    expect(suggestion?.content).toContain('예전 그대로')
    expect(useBoardUiStore.getState().roughRedrawRequest).toBeNull()
  })

  // 왜: 대사만 고친 샷은 그림이 그대로 맞다 — 다시 그리자고 하면 쓸데없이 그림 비용을 쓰게 한다.
  it('채팅으로 대사만 바꾸면 다시 그리자고 하지 않는다', async () => {
    modelEdits('shots', 'sh_01_02', { dialogueLines: [{ characterId: 'min_ho', text: '아, 또야?', emotion: '', delivery: '', durationHint: 1 }] })
    await chat.getState().sendMessage('씬1 샷2 대사를 "아, 또야?"로 바꿔줘')

    expect(chat.getState().suggestion?.action?.kind).not.toBe('roughRedraw')
  })

  // 왜: 리뷰 M3 — 도구가 "저장됨"이라 답해도 값이 그대로면 묻지 않는다.
  it('채팅이 같은 샷 타입을 다시 보내 실제로 바뀐 것이 없으면 [러프 다시 그리기]를 묻지 않는다', async () => {
    modelEdits('shots', 'sh_01_02', { shotType: 'MS' })
    await chat.getState().sendMessage('씬1 샷2를 미디엄 샷으로 바꿔줘')

    expect(chat.getState().suggestion?.action?.kind).not.toBe('roughRedraw')
  })

  // 왜: 리뷰 B1 — 보드가 없는 화면에서 남은 제안 · 요청이 다음에 열리는 다른 프로젝트 보드에서 그려졌다. 그 프로젝트 보드가 열려 있을 때만 묻는다.
  it('그 프로젝트의 Storyboard 보드가 열려 있지 않으면 채팅이 [러프 다시 그리기]를 묻지 않는다', async () => {
    useBoardUiStore.setState({ boardProjectId: null })
    modelEdits('shots', 'sh_01_02', { shotType: 'CU' })
    await chat.getState().sendMessage('씬1 샷2를 클로즈업으로 바꿔줘')

    expect(chat.getState().suggestion?.action?.kind).not.toBe('roughRedraw')
  })

  // 왜: 리드 결정 D1 — 씬의 장소 · 시간대 · 분위기는 러프에 그려진다. 그 씬에서 러프가 있는 샷만, 몇 개인지 알리고 묻는다.
  it('채팅으로 씬 분위기를 바꾸면 그 씬에서 러프가 있는 샷 수를 알리고 [러프 다시 그리기]를 묻는다', async () => {
    modelEdits('scenes', 'sc_01', { mood: '어둡고 긴장된' })
    await chat.getState().sendMessage('씬1 분위기를 더 어둡고 긴장되게 바꿔줘')

    const suggestion = chat.getState().suggestion
    expect(suggestion?.action).toEqual({ kind: 'roughRedraw', projectId: 'p-redraw', shotIds: ['sh_01_02', 'sh_01_04'], label: '러프 다시 그리기' })
    expect(suggestion?.content).toContain('2개')
  })

  // 왜: 단추를 누르면 보드가 카드의 [다시 시도]와 같은 길로 그 샷들만 다시 그린다(잠금 표시 · 완료 뒤 카드 갱신).
  it('[러프 다시 그리기]를 누르면 보드가 고친 샷들만 다시 그린다', () => {
    useBoardUiStore.getState().requestRoughRedraw('p-redraw', ['sh_01_02'])
    expect(useBoardUiStore.getState().takeRoughRedraw('p-redraw')).toEqual(['sh_01_02'])
    expect(useBoardUiStore.getState().roughRedrawRequest).toBeNull()

    const chatPanel = readFileSync('src/components/layout/global-chat.tsx', 'utf8')
    expect(chatPanel).toMatch(/action\.kind === 'roughRedraw'[\s\S]{0,300}requestRoughRedraw\(action\.projectId, action\.shotIds\)/)
    const board = readFileSync('src/features/writer/rough-storyboard-view.tsx', 'utf8')
    expect(board).toContain('useBoardUiStore((s) => s.roughRedrawRequest)')
    expect(board).toMatch(/drawShots\(shotIds\)/)
  })
})
