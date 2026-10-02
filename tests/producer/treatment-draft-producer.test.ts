// 트리트먼트 초안이 있는 새 프로젝트는 넘기기 전까지 Producer가 열려 있고, Writer로 넘길 때 확인 창을 거쳐 그 초안을 이어 간다 (2026-10-02 오너 · 시안 v04)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSettings } from '@/types'
import type { BackgroundSource, CastMember } from '@/lib/producer-gate'

const db = vi.hoisted(() => ({ writes: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        db.writes.push(patch)
        const done = { error: null, data: { producer_draft: patch.producer_draft ?? null } }
        return { eq: () => Object.assign(Promise.resolve(done), { select: () => ({ single: async () => done }) }) }
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { current_stage: 'producer' }, error: null }), limit: async () => ({ data: [], error: null }) }) }),
    }),
  }),
  createCatalogClient: vi.fn(),
}))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { resetActionGuard } from '@/lib/action-guard'

const settings: ProjectSettings = { playtime: 300, genre: '드라마', format: 'horizontal_16:9', tone: [], dialogueLanguage: 'ko' }
const jia: CastMember = { localId: 'treatment:jia', characterId: 'jia', name: '지아', entityType: 'person', appearance: '분홍 원피스', origin: 'treatment' }
const yard: BackgroundSource = { localId: 'treatment:yard', locationId: 'yard', name: '운동장', visualDescription: '흙바닥', purpose: '', origin: 'treatment' }

let status: Record<string, unknown>
let startResponse: () => Response
let fetchMock: ReturnType<typeof vi.fn>
const startBodies = () => fetchMock.mock.calls.filter(([url]) => String(url) === '/api/writer/start').map(([, init]) => JSON.parse(String((init as RequestInit).body)))

beforeEach(() => {
  resetActionGuard()
  db.writes.length = 0
  useLocaleStore.setState({ locale: 'ko' })
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'proj-1', currentStage: 'producer', reachedStage: 'producer', projectLocale: 'ko', treatmentDraft: true })
  useProducerStore.setState({ storyText: '두 아이가 다투고 화해하는 이야기', storyReady: true, styleAnchorKey: 'live_action', projectSettings: settings, cast: [jia], backgrounds: [yard] })
  status = { started: true, draft: true, pipeline_completed: false, pipeline_failed: false, current_status: 'awaiting_confirmation', current_stage: 'storyCheck', engine: 'v1' }
  startResponse = () => Response.json({ projectId: 'proj-1', runId: 'run-1', status: 'started', sceneGate: false, continued: true })
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('/api/writer/status/')) return Response.json(status)
    if (url === '/api/writer/start') return startResponse()
    return Response.json({})
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('넘기기 전의 트리트먼트 초안', () => {
  it('트리트먼트 초안만 있는 프로젝트를 열면 Producer는 잠기지 않는다', async () => {
    useProjectStore.setState({ treatmentDraft: false })
    await useProjectStore.getState().verifyWriterGate('proj-1')
    expect(useProjectStore.getState()).toMatchObject({ producerLocked: false, treatmentDraft: true, writerNeedsRerun: false })
  })

  it('트리트먼트를 만들지 못한 새 프로젝트는 Writer 다시 실행 안내를 띄우지 않는다', async () => {
    status = { ...status, pipeline_failed: true, current_status: 'failed', current_stage: 'scenes' }
    await useProjectStore.getState().verifyWriterGate('proj-1')
    expect(useProjectStore.getState()).toMatchObject({ producerLocked: false, writerNeedsRerun: false })
  })

  it('넘긴 뒤 시작된 Writer 실행은 지금처럼 Producer를 잠근다', async () => {
    status = { ...status, draft: false, current_status: 'running', current_stage: 'visualFormat' }
    await useProjectStore.getState().verifyWriterGate('proj-1')
    expect(useProjectStore.getState().producerLocked).toBe(true)
  })
})

describe('트리트먼트 초안에서 Writer로 넘기기', () => {
  it('넘기기 전 씬 확정 버튼은 Writer로 넘기기 확인 창을 연다', async () => {
    expect(await useGlobalChatStore.getState().confirmSceneGate()).toBeNull()
    expect(useGlobalChatStore.getState().handoffConfirm?.kind).toBe('producerLock')
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/writer/scene-gate')).toBe(false)
  })

  it('확인 창에서 넘기면 Producer 값을 실어 트리트먼트 초안을 이어 가고 Writer 화면으로 간다', async () => {
    useProducerStore.setState({ cast: [{ ...jia, userEdited: true }], backgrounds: [{ ...yard, userEdited: true }] })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm?.kind).toBe('producerLock')
    await useGlobalChatStore.getState().confirmProducerLock()
    const body = startBodies()[0]
    expect(body).toMatchObject({ projectId: 'proj-1', continueDraft: true, story: '두 아이가 다투고 화해하는 이야기' })
    expect(body.cast.characters[0]).toMatchObject({ character_id: 'jia', appearance: '분홍 원피스' })
    expect(body.backgrounds.locations[0]).toMatchObject({ location_id: 'yard' })
    expect(useProjectStore.getState()).toMatchObject({ producerLocked: true, treatmentDraft: false, currentStage: 'writer' })
  })

  it('트리트먼트를 다 쓰기 전에는 넘기지 않고 Producer를 잠그지 않는다', async () => {
    startResponse = () => Response.json({ code: 'writer_draft_missing', status: 'running' }, { status: 409 })
    expect(await useProducerStore.getState().saveAndHandoff()).toBe(false)
    expect(useProducerStore.getState().error).toContain('트리트먼트')
    expect(useProjectStore.getState().producerLocked).toBe(false)
    expect(startBodies()).toHaveLength(1)
  })

  it('트리트먼트를 쓴 뒤 러닝타임이 바뀌었으면 넘기지 않고 지금 값으로 다시 쓰기를 권한다', async () => {
    startResponse = () => Response.json({ code: 'treatment_draft_stale', changed: ['runtime'] }, { status: 409 })
    expect(await useProducerStore.getState().saveAndHandoff()).toBe(false)
    expect(useProducerStore.getState().error).toContain('러닝타임')
    expect(useProjectStore.getState().producerLocked).toBe(false)
  })

  it('바뀐 바탕을 알릴 때는 이름의 받침에 맞춰 조사를 붙인다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      startResponse = () => Response.json({ code: 'treatment_draft_stale', changed: ['runtime'] }, { status: 409 })
      await useProducerStore.getState().saveAndHandoff()
      expect(useProducerStore.getState().error).toContain('러닝타임이 바뀌었어요')
      // 연타 방어 창(1초)이 지난 뒤 다시 누른다.
      vi.setSystemTime(Date.now() + 2000)
      startResponse = () => Response.json({ code: 'treatment_draft_stale', changed: ['story'] }, { status: 409 })
      await useProducerStore.getState().saveAndHandoff()
      expect(useProducerStore.getState().error).toContain('이야기가 바뀌었어요')
    } finally {
      vi.useRealTimers()
    }
  })

  it('손대지 않은 트리트먼트 카드는 넘길 때 싣지 않는다', async () => {
    const { syncTreatmentCast } = await import('@/lib/producer/treatment-cast-sync')
    const synced = syncTreatmentCast(
      { cast: [], backgrounds: [], syncedVersion: null },
      { characters: [{ id: 'jia', name: '지아', role: 'protagonist', entityType: 'person', appearance: '분홍 원피스', want: '' }], locations: [{ id: 'yard', name: '운동장', description: '흙바닥' }] },
      'v1',
    )
    const suji: CastMember = { localId: 'mine', name: '수지', entityType: 'person', appearance: '단발', origin: 'producer', arc: { start_state: '방관', end_state: '중재', arc_type: 'positive_change' }, motivation: { want: '둘을 화해시키기' } }
    useProducerStore.setState({ cast: [...synced.cast, suji], backgrounds: synced.backgrounds })
    await useGlobalChatStore.getState().requestNextStep()
    await useGlobalChatStore.getState().confirmProducerLock()
    const body = startBodies()[0]
    expect(body.cast.characters.map((c: { name: string }) => c.name)).toEqual(['수지'])
    expect(body.backgrounds.locations).toEqual([])
  })

  it('지금 값으로 다시 쓰면 기다리던 초안을 내려놓고 새로 쓴다', async () => {
    startResponse = () => Response.json({ projectId: 'proj-1', runId: 'run-2', status: 'started', sceneGate: true, draft: true })
    expect(await useProducerStore.getState().restartTreatment()).toBe(true)
    expect(startBodies()[0]).toMatchObject({ treatmentDraft: true, restartDraft: true, story: '두 아이가 다투고 화해하는 이야기' })
  })

  it('세 가지 안이나 AI 수정안을 정하기 전에는 넘기지 않는다', async () => {
    startResponse = () => Response.json({ code: 'scene_story_proposal_pending', status: 'awaiting_confirmation' }, { status: 409 })
    expect(await useProducerStore.getState().saveAndHandoff()).toBe(false)
    expect(useProducerStore.getState().error).toContain('적용하거나 버려')
    expect(useProjectStore.getState().producerLocked).toBe(false)
  })

  it('트리트먼트 초안이 실패해 사라졌으면 처음부터 Writer를 시작한다', async () => {
    let calls = 0
    startResponse = () => (++calls === 1
      ? Response.json({ code: 'writer_draft_missing', status: 'failed' }, { status: 409 })
      : Response.json({ projectId: 'proj-1', runId: 'run-2', status: 'started', sceneGate: true }))
    expect(await useProducerStore.getState().saveAndHandoff()).toBe(true)
    expect(startBodies().map((b) => b.continueDraft === true)).toEqual([true, false])
    expect(useProjectStore.getState().producerLocked).toBe(true)
  })
})

describe('넘기기 안내와 Producer 채팅', () => {
  it('넘기기 전 트리트먼트 초안은 채팅에 확정 안내를 띄우지 않아 Producer 채팅이 그대로 쓰인다', async () => {
    // 왜: 닫을 수 없는 확정 안내가 떠 있으면 고쳐 달라는 말이 전부 트리트먼트 수정안으로 가고, 스타일 · 그림 쓰임새 질문이 뜨지 못했다(검토 지적).
    const { sceneGateOfferMode } = await import('@/lib/writer/scene-gate')
    expect(sceneGateOfferMode({ draftLive: true, current: { id: 'producer-choices:1' }, projectId: 'proj-1' })).toBe('skip')
    expect(sceneGateOfferMode({ draftLive: true, current: null, projectId: 'proj-1' })).toBe('skip')
  })

  it('넘기기 전 트리트먼트 초안에서 수정안이 남아 있어도 채팅으로 설정을 바꿔 달라고 하면 Producer가 받는다', async () => {
    useGlobalChatStore.setState({ sceneStoryProposalPending: { projectId: 'proj-1', id: 'p1' } })
    fetchMock.mockImplementation(async (url: string) => (url === '/api/produce/chat' ? Response.json({ reply: '러닝타임을 1분으로 바꿨어요.' }) : Response.json(status)))
    await useGlobalChatStore.getState().sendMessage('러닝타임을 1분으로 줄여줘')
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls).toContain('/api/produce/chat')
    expect(urls).not.toContain('/api/writer/scene-gate')
    const body = JSON.parse(String((fetchMock.mock.calls.find(([url]) => String(url) === '/api/produce/chat')![1] as RequestInit).body))
    expect(body.treatmentDraft).toBe(true)
  })

  it('다시 쓰기를 연 뒤 직접 적은 말은 트리트먼트 수정안으로 간다', async () => {
    fetchMock.mockImplementation(async () => Response.json({ ok: true, proposalId: 'p2' }))
    expect(useGlobalChatStore.getState().beginSceneStoryEdit('ai')).toBe(true)
    await useGlobalChatStore.getState().sendMessage('2번 씬을 더 짧게 해줘')
    const call = fetchMock.mock.calls.find(([url]) => String(url) === '/api/writer/scene-gate')!
    expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({ action: 'revise', feedback: '2번 씬을 더 짧게 해줘' })
  })

  it('아직 초안인 줄 모르고 확정을 누르면 Writer로 넘기기 확인 창을 연다', async () => {
    // 왜: 프로젝트를 막 연 직후에는 화면이 초안인 줄 모를 수 있다 — 서버가 넘기기를 거치라고 답하면 오류 대신 확인 창을 연다.
    useProjectStore.setState({ treatmentDraft: false })
    fetchMock.mockImplementation(async (url: string) => (url === '/api/writer/scene-gate'
      ? Response.json({ code: 'treatment_draft_handoff_required' }, { status: 409 })
      : Response.json(status)))
    expect(await useGlobalChatStore.getState().confirmSceneGate()).toBeNull()
    expect(useProjectStore.getState().treatmentDraft).toBe(true)
    expect(useGlobalChatStore.getState().handoffConfirm?.kind).toBe('producerLock')
  })

  it('넘긴 뒤의 확정 안내는 지금처럼 다른 안내보다 앞에 띄운다', async () => {
    const { sceneGateOfferMode } = await import('@/lib/writer/scene-gate')
    expect(sceneGateOfferMode({ draftLive: false, current: { id: 'producer-choices:1' }, projectId: 'proj-1' })).toBe('preempt')
  })
})
