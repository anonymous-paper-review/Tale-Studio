// Writer 본 실행 전 씬 스토리 확인·수정·확정을 Producer 화면에서 하고, 확정하면 Writer 화면으로 넘어간다 (2026-10-01 오너)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSettings } from '@/types'
import type { BackgroundSource } from '@/lib/producer-gate'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { current_stage: 'artist' }, error: null }) }) }),
    }),
  }),
}))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
const statusRestart = vi.hoisted(() => vi.fn())
vi.mock('@/lib/writer/use-writer-status', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: statusRestart }))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { resetActionGuard } from '@/lib/action-guard'
import { sceneGatePhase, sceneGateSuggestion } from '@/lib/writer/scene-gate'

const settings: ProjectSettings = {
  playtime: 30, genre: 'SF 스릴러', subGenre: '사이버펑크', format: 'horizontal_16:9', tone: ['dark'], targetEmotion: [], dialogueLanguage: 'ko',
}
const background: BackgroundSource = {
  localId: 'loc-1', locationId: 'neon_market', name: '네온 시장', visualDescription: '비에 젖은 네온 골목', purpose: '정보 거래 거점', origin: 'producer', userEdited: false, stale: false,
}
let fetchMock: ReturnType<typeof vi.fn>
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url)

beforeEach(() => {
  resetActionGuard()
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer', projectLocale: 'ko' })
  useProducerStore.setState({ storyText: '스토리', storyReady: true, styleAnchorKey: 'style_a', projectSettings: settings, cast: [], backgrounds: [background] })
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('/api/writer/status/')) return Response.json({ started: false })
    if (url === '/api/writer/start') return Response.json({ projectId: 'proj-1', runId: 'run-1', status: 'started', sceneGate: true })
    if (url === '/api/writer/scene-gate') return Response.json({ ok: true, action: 'confirm' })
    return Response.json({})
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('넘긴 뒤 씬 스토리 확정까지는 Producer 화면에 머문다', () => {
  it('Writer가 씬 스토리 확정 단계로 시작하면 Writer 화면으로 넘어가지 않고 Producer 화면에 머문다', async () => {
    await useGlobalChatStore.getState().sendMessage('Writer로 넘겨주세요', undefined, { consentedHandoff: true })
    expect(calls('/api/writer/start')).toHaveLength(1)
    expect(useProjectStore.getState().currentStage).toBe('producer')
    expect(useProjectStore.getState().producerLocked).toBe(true)
    await new Promise((r) => setTimeout(r, 1200))
    expect(useGlobalChatStore.getState().pendingNavigatePath).toBeNull()
    expect(useGlobalChatStore.getState().messages.at(-1)?.content).toContain('씬 스토리')
  })

  it('확정 단계가 없는 Writer 시작은 종전처럼 Writer 화면으로 넘어간다', async () => {
    fetchMock.mockImplementation(async (url: string) => (url === '/api/writer/start' ? Response.json({ projectId: 'proj-1', runId: 'run-1', status: 'started' }) : url.startsWith('/api/writer/status/') ? Response.json({ started: false }) : Response.json({})))
    await useGlobalChatStore.getState().sendMessage('Writer로 넘겨주세요', undefined, { consentedHandoff: true })
    expect(useProjectStore.getState().currentStage).toBe('writer')
    await vi.waitFor(() => expect(useGlobalChatStore.getState().pendingNavigatePath).toBe('/studio/writer'), { timeout: 2500 })
  })
})

describe('씬 스토리 확정', () => {
  it('씬 스토리를 확정하면 나머지 생성을 이어 가고 Writer 화면으로 넘어간다', async () => {
    useProjectStore.setState({ producerLocked: true, reachedStage: 'artist' })
    useGlobalChatStore.getState().offerSuggestion(sceneGateSuggestion('proj-1', '확인해 주세요', '이대로 확정'), { preempt: true })
    const ok = await useGlobalChatStore.getState().confirmSceneGate()
    expect(ok).toBe(true)
    const body = JSON.parse(String((calls('/api/writer/scene-gate')[0][1] as RequestInit).body))
    expect(body).toEqual({ projectId: 'proj-1', action: 'confirm' })
    expect(useGlobalChatStore.getState().suggestion).toBeNull()
    expect(useGlobalChatStore.getState().pendingNavigatePath).toBe('/studio/writer')
  })

  it('씬 스토리 확정에 실패하면 Producer에 머물고 다시 확정할 수 있다', async () => {
    useProjectStore.setState({ producerLocked: true, reachedStage: 'artist' })
    fetchMock.mockImplementation(async () => Response.json({ error: 'No awaiting run' }, { status: 409 }))
    const ok = await useGlobalChatStore.getState().confirmSceneGate()
    expect(ok).toBe(false)
    expect(useGlobalChatStore.getState().pendingNavigatePath).toBeNull()
    expect(useProjectStore.getState().currentStage).toBe('producer')
  })

  it('씬 스토리 확정 안내는 Writer 화면이 아니라 Producer 화면에 띄운다', () => {
    const suggestion = sceneGateSuggestion('proj-1', '확인해 주세요', '이대로 확정')
    expect(suggestion).toMatchObject({ id: 'scene-gate:proj-1', stage: 'producer', dismissible: false, action: { kind: 'confirmScenes', label: '이대로 확정' } })
  })
})

describe('씬 스토리 단계 읽기', () => {
  const status = (patch: Record<string, unknown>) => ({ started: true, pipeline_completed: false, pipeline_failed: false, current_status: 'running', current_stage: 'scenes', engine: 'v1' as const, ...patch })

  it('Writer를 시작하지 않았으면 시작 전으로 본다', () => {
    expect(sceneGatePhase(null)).toBe('before')
    expect(sceneGatePhase(status({ started: false }))).toBe('before')
  })

  it('Writer가 씬 스토리를 쓰는 동안에는 쓰는 중으로 본다', () => {
    for (const stage of [null, 'dramaturgy', 'narrativeStructure', 'scenes', 'storyCheck']) {
      expect(sceneGatePhase(status({ current_stage: stage }))).toBe('writing')
    }
  })

  it('확정을 기다리면 확정 단계로 본다', () => {
    expect(sceneGatePhase(status({ current_status: 'awaiting_confirmation', current_stage: 'storyCheck' }))).toBe('gate')
  })

  it('확정 뒤 다음 작업이 돌면 이어서 진행 중으로 보고, 끝나거나 멈추면 그 상태로 본다', () => {
    expect(sceneGatePhase(status({ current_stage: 'visualFormat' }))).toBe('continuing')
    expect(sceneGatePhase(status({ current_stage: 'shotsAndDialogue' }))).toBe('continuing')
    expect(sceneGatePhase(status({ pipeline_completed: true, current_status: 'completed' }))).toBe('done')
    expect(sceneGatePhase(status({ pipeline_failed: true, current_status: 'failed' }))).toBe('failed')
  })

  it('확정 단계가 없는 V2 실행은 씬 스토리를 쓰는 중에도 이어서 진행 중으로 본다', () => {
    expect(sceneGatePhase(status({ engine: 'v2', current_stage: 'scenes' }))).toBe('continuing')
  })
})

describe('씬 스토리 확정 단계 다듬기 (검토 지적)', () => {
  it('다시 실행을 승인해도 씬 스토리 확정 단계로 시작하면 Producer 화면에 머문다', async () => {
    // 왜: Writer 가 실패해 다시 실행하면 확정 단계가 Producer 에 있는데도 Writer 화면으로 보냈다.
    let starts = 0
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/writer/start') {
        starts += 1
        return starts === 1
          ? Response.json({ code: 'writer_rerun_confirmation_required' }, { status: 409 })
          : Response.json({ projectId: 'proj-1', runId: 'run-2', status: 'started', sceneGate: true })
      }
      return Response.json({})
    })
    await useProducerStore.getState().saveAndHandoff()
    const card = useGlobalChatStore.getState().pendingProposal
    expect(card?.kind).toBe('producerWriterRerunRequest')
    expect(await useGlobalChatStore.getState().approvePendingProposal(card?.id)).toBe(true)
    await new Promise((r) => setTimeout(r, 1200))
    expect(useGlobalChatStore.getState().pendingNavigatePath).toBeNull()
    expect(useProjectStore.getState().currentStage).toBe('producer')
  })

  it('씬 스토리 수정을 요청하면 수정안을 먼저 처리한 뒤 확정할 수 있다', async () => {
    // 왜: AI 수정안이 원문을 덮어쓰지 않으므로, 버리거나 적용하기 전에는 이전 원문을 확정하지 않는다.
    useProjectStore.setState({ producerLocked: true, reachedStage: 'artist' })
    statusRestart.mockClear()
    const chat = useGlobalChatStore.getState()
    expect(await chat.reviseSceneGate('S2를 줄여줘')).toBe(true)
    expect(JSON.parse(String((calls('/api/writer/scene-gate')[0][1] as RequestInit).body))).toEqual({ projectId: 'proj-1', action: 'revise', feedback: 'S2를 줄여줘' })
    expect(useGlobalChatStore.getState().sceneStoryRefresh).toBe(1)
    expect(statusRestart).not.toHaveBeenCalled()
    expect(await chat.confirmSceneGate()).toBeNull()
    expect(await chat.resolveSceneStoryProposal('discard', 'proposal-1')).toBe(true)
    expect(useGlobalChatStore.getState().sceneStoryRefresh).toBe(2)
    statusRestart.mockClear()
    expect(await chat.confirmSceneGate()).toBe(true)
    expect(statusRestart).toHaveBeenCalledWith('proj-1')
  })

  it('확정을 두 번 눌러도 한 번만 보낸다', async () => {
    // 왜: Enter 와 버튼을 연달아 누르면 두 번째 확정이 409 로 돌아와 성공 직후 오류 안내가 떴다.
    useProjectStore.setState({ producerLocked: true, reachedStage: 'artist' })
    const [first, second] = await Promise.all([useGlobalChatStore.getState().confirmSceneGate(), useGlobalChatStore.getState().confirmSceneGate()])
    expect(first).toBe(true)
    expect(second).toBeNull()
    expect(calls('/api/writer/scene-gate')).toHaveLength(1)
  })

  it('확정 대기 중에 Producer 채팅으로 질문해도 확정 안내는 그대로 남는다', async () => {
    // 왜: 질문 하나에 확정 안내가 내려가, 그 사이 보낸 수정 요청이 잠긴 Producer 채팅으로 가서 거절됐다.
    useProjectStore.setState({ producerLocked: true, reachedStage: 'artist' })
    useGlobalChatStore.getState().offerSuggestion(sceneGateSuggestion('proj-1', '확인해 주세요', '이대로 확정'), { preempt: true })
    fetchMock.mockImplementation(async () => Response.json({ reply: '지금 씬 초안을 확인할 차례예요.' }))
    await useGlobalChatStore.getState().sendMessage('진행 상황 알려줘')
    expect(useGlobalChatStore.getState().suggestion?.id).toBe('scene-gate:proj-1')
  })
})
