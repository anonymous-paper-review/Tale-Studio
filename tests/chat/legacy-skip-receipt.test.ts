// 채팅이 "지웠어요 · 더했어요"라고 답해도 실제로 못 한 것이 있으면 그 답 대신 실행 결과에 까닭을 보이고, 못 한 까닭을 모두 알리는지 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ workflow: vi.fn(), execute: vi.fn(), warning: vi.fn() }))
vi.mock('@/stores/chat-workflow-bindings', () => ({ createStudioWorkflow: () => mocks.workflow, workflowPermission: () => true }))
vi.mock('@/stores/chat-tool-bindings', () => ({ createStudioToolResources: () => ({}) }))
vi.mock('@/lib/chat-tools/executor', async (original) => ({ ...(await original<object>()), createChatToolExecutor: () => mocks.execute }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('sonner', () => ({ toast: { warning: mocks.warning, success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { translate } from '@/lib/i18n/translate'
import type { Scene, Shot } from '@/types'

function shot(shotId: string, sceneId: string): Shot {
  return {
    shotId, sceneId, actionDescription: shotId, shotType: 'MS', characters: [], durationSeconds: 5, generationMethod: 'T2V', dialogueLines: [],
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5000 },
  }
}
function scene(sceneId: string): Scene {
  return { sceneId, narrativeSummary: '', originalTextQuote: '', location: 'corridor', timeOfDay: '밤', mood: '', charactersPresent: [], estimatedDurationSeconds: 10 }
}
/** 모델 답 한 번 — 글은 "했어요"라고 하고 JSON 고침 목록을 붙인다(도구 없이 답만). */
function modelReplies(reply: string, updates: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url === '/api/writer/chat' ? { reply, updates } : {})))
}
const lastModelMessage = () => chat.getState().messages.filter((m) => m.role === 'model').at(-1)?.content ?? ''

beforeEach(() => {
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ projectId: 'p-skip', currentStage: 'writer', reachedStage: 'writer', projectLocale: 'ko', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'ko' })
  // 씬 1 = sh_01_01(Shot 1), 씬 2 = sh_02_02 · sh_02_03 · sh_02_04(Shot 2~4). "씬2 샷2"는 보드 Shot 2(sh_02_02)와 씬 2 의 둘째(sh_02_03)로 읽힌다.
  useWriterStore.setState({
    sceneManifest: { scenes: [scene('sc_01'), scene('sc_02')], characters: [], locations: [] },
    shots: [shot('sh_01_01', 'sc_01'), shot('sh_02_02', 'sc_02'), shot('sh_02_03', 'sc_02'), shot('sh_02_04', 'sc_02')],
    error: null,
  })
  mocks.workflow.mockReset().mockResolvedValue({ status: 'ok' })
  mocks.execute.mockReset().mockResolvedValue({ status: 'ok' })
  mocks.warning.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  chat.getState().reset()
})

describe('못 한 지우기 · 더하기는 답 대신 실행 결과로', () => {
  // 왜: 2026-11-02 리뷰 4차 후속 — 못 한 고치기(씬 · 샷 칸)만 실행 결과에 남아 "했어요" 답을 바꿨다. 못 한 지우기 · 더하기는 경고 알림에만
  //   잠깐 뜨고, 채팅에는 "지웠어요"가 그대로 남아 지우지 않은 샷을 지운 것처럼 말했다.
  it('채팅이 지웠다고 답해도 실제로 못 지운 샷이 있으면 그 답 대신 실행 결과에 못 지운 까닭을 보인다', async () => {
    modelReplies('Shot 9를 지웠어요.', [{ type: 'deleteShot', id: 'Shot 9' }])
    await chat.getState().sendMessage('샷 9 지워줘')
    expect(useWriterStore.getState().shots).toHaveLength(4)
    expect(lastModelMessage()).not.toContain('지웠어요')
    expect(lastModelMessage()).toContain('실행 결과')
    expect(lastModelMessage()).toContain("샷 'Shot 9' 를 찾지 못했어요")
  })

  // 왜: 더하기도 같다 — 끼울 자리를 못 찾아 더하지 못했는데 "더했어요"가 남았다.
  it('채팅이 더했다고 답해도 실제로 못 더한 샷이 있으면 그 답 대신 실행 결과에 까닭을 보인다', async () => {
    modelReplies('Shot 9 뒤에 새 샷을 더했어요.', [{ type: 'addShot', sceneId: 'sc_02', afterShotId: 'Shot 9', shotType: 'CU', actionDescription: '새 컷', characters: [], durationSeconds: 3, tempId: 'H1' }])
    await chat.getState().sendMessage('샷 9 뒤에 클로즈업 하나 더해줘')
    expect(useWriterStore.getState().shots).toHaveLength(4)
    expect(lastModelMessage()).not.toContain('더했어요')
    expect(lastModelMessage()).toContain('새 샷')
  })

  // 왜: 2026-11-02 리뷰 4차 후속 — 알림은 첫 까닭만 보여, 여럿을 못 했을 때 "어느 샷인지 알려 주세요" 물음이 다른 까닭 뒤에 묻혔다.
  it('못 한 것이 여럿이면 알림에 까닭을 모두 보이고, "어느 샷인지" 물음도 채팅에 남는다', async () => {
    modelReplies('둘 다 처리했어요.', [{ type: 'deleteShot', id: 'Shot 9' }, { type: 'updateShot', id: '씬2 샷2', patch: { shotType: 'CU' } }])
    await chat.getState().sendMessage('샷 9 지우고 씬2 샷2는 클로즈업으로')
    const toast = String(mocks.warning.mock.calls.at(-1)?.[0] ?? '')
    expect(toast).toContain("샷 'Shot 9' 를 찾지 못했어요")
    expect(toast).toContain('어느 샷인지 알려 주세요')
    expect(lastModelMessage()).toContain('어느 샷인지 알려 주세요')
    expect(lastModelMessage()).not.toContain('처리했어요')
  })
})

describe('실행 결과는 고침 하나하나를 제 줄로', () => {
  const addShot = (anchor: Record<string, unknown>) => ({ type: 'addShot', sceneId: 'sc_02', shotType: 'CU', actionDescription: '새 컷', characters: [], durationSeconds: 3, ...anchor })

  // 왜: 2026-11-02 리뷰 4차 후속 L1 — 임시 id 가 없는 더하기가 못 되면 답의 모든 더하기(된 것까지)에 실패를 붙였고, 결과는 한 "새 샷" 줄로
  //   합쳐져 마지막 까닭만 남았다. 고침은 답 안의 차례(번호)로 짝짓는다.
  it('더하기 여럿 가운데 하나만 못 하면 못 한 그 더하기만 실행 결과에 제 까닭과 함께 남는다', async () => {
    modelReplies('둘 다 더했어요.', [addShot({}), addShot({ afterShotId: 'Shot 9' })])
    await chat.getState().sendMessage('씬 2 에 샷 둘 더해줘')
    expect(useWriterStore.getState().shots).toHaveLength(5)
    const message = lastModelMessage()
    expect(message).toContain("새 샷 2: 입력 수정 필요 (추가할 위치 'Shot 9'")
    expect(message).not.toContain('새 샷 1')
    expect(message).toContain('적용: 샷 1개 더함')
  })

  // 왜: 같은 까닭으로 못 한 더하기 둘이 한 줄로 합쳐져 첫 까닭이 사라졌다 — 줄도 둘, 까닭도 하나하나.
  it('더하기 둘을 다 못 하면 실행 결과에 줄도 둘이고 까닭도 하나하나 붙는다', async () => {
    modelReplies('둘 다 더했어요.', [addShot({ afterShotId: 'Shot 9' }), addShot({ beforeShotId: 'Shot 8' })])
    await chat.getState().sendMessage('씬 2 에 샷 둘 더해줘')
    const message = lastModelMessage()
    expect(message).toContain("새 샷 1: 입력 수정 필요 (추가할 위치 'Shot 9'")
    expect(message).toContain("새 샷 2: 입력 수정 필요 (추가할 위치 'Shot 8'")
  })

  // 왜: 리뷰 4차 후속 L2 — 답을 실행 결과로 바꾸면 못 한 것만 적혀, 실제로 지우고 더한 것은 말하지 않았다. 된 것은 한 줄로 센다.
  it('답을 실행 결과로 바꿀 때 실제로 지우고 더한 것도 한 줄로 알린다', async () => {
    modelReplies('모두 처리했어요.', [{ type: 'deleteShot', id: 'Shot 2' }, addShot({}), { type: 'deleteShot', id: 'Shot 9' }])
    await chat.getState().sendMessage('샷 2 와 샷 9 를 지우고 씬 2 에 샷 하나 더해줘')
    const message = lastModelMessage()
    expect(message).not.toContain('처리했어요')
    expect(message).toContain('적용: 샷 1개 지움 · 샷 1개 더함')
    expect(message).toContain("샷 'Shot 9' 를 찾지 못했어요")
    expect(translate('en', 'Applied: {items}', { items: [translate('en', 'Deleted {count} shots', { count: 2 }), translate('en', 'Added 1 shot')].join(' · ') })).toBe('Applied: Deleted 2 shots · Added 1 shot')
  })
})
