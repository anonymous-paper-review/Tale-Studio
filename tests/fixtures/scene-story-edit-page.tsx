'use client'

// 로컬 검수 전용: 실제 Producer·Writer·채팅을 고정 응답으로 열고 외부 저장·생성 요청을 차단한다.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { NavigationPromisesContext, PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime'
import { GlobalChat } from '@/components/layout/global-chat'
import { Button } from '@/components/ui/button'
import { ProducerReadinessBoard } from '@/features/producer/readiness-board'
import { WriterWorkspace } from '@/features/writer/writer-workspace'
import { EMPTY_LIFECYCLE_STATUS } from '@/lib/lifecycle'
import { evaluateProducerGate, type BackgroundSource, type CastMember } from '@/lib/producer-gate'
import type { SceneStoryProposalView } from '@/lib/producer/scene-story-proposal'
import { markStageSeen } from '@/lib/stage-seen'
import { restartWriterStatus, type WriterStatus } from '@/lib/writer/use-writer-status'
import type { WriterPreview } from '@/lib/writer/use-writer-preview'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useWriterUiStore } from '@/stores/writer-ui-store'
import type { ProjectSettings, Scene } from '@/types'

const PROJECT_ID = 'local-scene-story-edit-fixture'
type View = 'producer' | 'writer'
type Failure = 500 | 409 | null
type SceneEdit = { sceneId: string; beats: string[] }
type FixtureRequest = { url: string; method: string; body: unknown }
type ProposalScene = SceneStoryProposalView['before'][number]

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const proposalScenes = (scenes: WriterPreview['scenes']): ProposalScene[] => scenes.map(({ sceneId, index, beats }) => ({ sceneId, index, beats: [...beats] }))
const storyVersion = (scenes: WriterPreview['scenes']) => JSON.stringify(proposalScenes(scenes))

function proposalStale(proposal: SceneStoryProposalView, scenes: WriterPreview['scenes']): boolean {
  const current = proposalScenes(scenes)
  if (!equal(proposal.before.map((scene) => scene.sceneId), current.map((scene) => scene.sceneId))) return true
  if (proposal.status !== 'ready') return !equal(proposal.before, current)
  if (!equal(proposal.before.map((scene) => scene.sceneId), proposal.after.map((scene) => scene.sceneId))) return !equal(proposal.before, current)
  return proposal.before.some((before, index) => !equal(before, proposal.after[index]) && !equal(before, current[index]))
}

const SCENES = [
  {
    sceneId: 'scene_1', index: 0, shotStories: [],
    beats: [
      '늦은 밤, 방산기업의 말단 임원 조승우는 분쟁 지역에서 돌아온 화물의 선적 기록을 검토한다. 창밖으로 비가 쏟아지고 텅 빈 사무실에는 서류를 넘기는 소리만 남아 있다. 서로 적대하는 두 나라에 같은 무기가 전달됐다는 사실을 발견한 순간, 평범한 회사원으로 살아온 그의 일상이 흔들리기 시작한다.',
      '조승우는 오래된 출장 수첩을 펼쳐 기록과 날짜를 대조한다. 몇 달 전 현장에서 만났던 동료의 마지막 메시지에는 자신이 지금 보고 있는 선적 번호가 남아 있다. 그는 모니터를 끄려다가 다시 손을 멈추고, 증거가 담긴 문서를 작은 저장 장치에 옮긴다.',
    ],
  },
  {
    sceneId: 'scene_2', index: 1, shotStories: [],
    beats: [
      '다음 날 조승우는 과거 기업 비리를 추적했던 검사 정수림을 찾아간다. 작은 사무실의 벽에는 끝내 해결하지 못한 사건의 자료가 빼곡하다. 정수림은 서류를 펼쳐 보지도 않은 채 이미 수없이 들어 본 이야기라며 그를 돌려보내려 한다. 조승우는 동료가 남긴 수첩을 책상 위에 놓고, 그날 출장에서 무슨 일이 있었는지 차분히 설명한다.',
      '정수림은 문 앞까지 따라 나와 잠시 망설인다. 비에 젖은 수첩의 이름을 알아본 그녀는 말없이 서류를 받아 든다. 두 사람은 서로를 믿을 수 있을지 확신하지 못한 채, 다음 날 새벽 같은 장소에서 다시 만나기로 한다.',
    ],
  },
  {
    sceneId: 'scene_3', index: 2, shotStories: [],
    beats: [
      '법정에서 정수림은 기업의 거래 기록과 조승우의 증언을 하나씩 연결한다. 상대 변호인은 증거의 신빙성을 공격하고, 방청석을 채운 기자들은 침묵 속에서 다음 말을 기다린다. 조승우는 손에 쥔 수첩을 내려다본 뒤 자신이 직접 목격한 사건을 이야기한다. 그의 목소리는 처음에는 떨리지만 마지막 문장에 이르러 또렷해진다.',
      '재판이 끝나고 두 사람은 법원 앞 계단에 나란히 선다. 거리의 전광판에는 판결 소식이 잠깐 지나가고 곧 다른 지역의 전쟁 뉴스가 이어진다. 정수림은 아무 말 없이 조승우에게 수첩을 돌려준다. 조승우는 그것을 받아 주머니에 넣고, 평소와 다름없이 흐르는 사람들 사이로 걸어간다.',
    ],
  },
] satisfies WriterPreview['scenes']

const CAST: CastMember[] = [
  { localId: 'cast_1', characterId: 'cho', name: '조승우', entityType: 'person', appearance: '마흔 살, 짙은 회색 정장과 낡은 가죽 가방을 든 회사원.', role: 'protagonist', origin: 'producer', arc: { start_state: '회사만 믿는 평범한 임원', end_state: '진실을 증언하는 내부 고발자', arc_type: 'positive' }, motivation: { want: '동료의 죽음에 얽힌 진실을 밝힌다' } },
  { localId: 'cast_2', characterId: 'jung', name: '정수림', entityType: 'person', appearance: '단정한 검은 재킷, 날카로운 눈빛과 차분한 말투의 검사.', role: 'supporting', origin: 'producer', arc: { start_state: '실패 이후 냉소적으로 변한 검사', end_state: '다시 법정에 서는 검사', arc_type: 'positive' }, motivation: { want: '자신이 놓친 정의를 되찾는다' } },
]
const BACKGROUNDS: BackgroundSource[] = [
  { localId: 'background_1', locationId: 'office', name: '방산기업 사무실', visualDescription: '비 내리는 도시를 내려다보는 어두운 사무실. 책상에는 선적 서류가 쌓여 있다.', purpose: '숨겨진 거래의 첫 단서를 발견한다.', origin: 'producer' },
  { localId: 'background_2', locationId: 'court', name: '법정', visualDescription: '높은 창으로 차가운 빛이 들어오는 오래된 법정. 양쪽 방청석은 사람들로 가득하다.', purpose: '기업의 거래와 증언을 세상에 공개한다.', origin: 'producer' },
]
const SETTINGS: ProjectSettings = { playtime: 180, genre: '드라마', subGenre: '법정 스릴러', format: 'horizontal_16:9', dialogueLanguage: 'ko', tone: ['차분한', '긴장감 있는'] }

function createPreview(): WriterPreview {
  return {
    engine: 'v1', started: true, running: false, completed: false, failed: false, updatedAt: new Date().toISOString(),
    scenes: structuredClone(SCENES), storyVersion: storyVersion(SCENES), sceneStoryProposal: null,
    roster: [...CAST.map((person) => ({ slug: person.characterId!, name: person.name })), ...BACKGROUNDS.map((background) => ({ slug: background.locationId!, name: background.name }))],
    characters: CAST.map((person) => ({ id: person.characterId!, name: person.name, role: person.role!, description: person.appearance, portraitUrl: null, templateUrl: null })),
    worlds: BACKGROUNDS.map((background) => ({ id: background.locationId!, name: background.name, description: background.visualDescription })),
  }
}
function createStatus(): WriterStatus {
  return { projectId: PROJECT_ID, engine: 'v1', started: true, pipeline_completed: false, pipeline_failed: false, current_stage: 'storyCheck', current_status: 'awaiting_confirmation', completed_units: 4, total_units: 15, progress_percent: 27, last_timestamp: new Date().toISOString(), error: null, available: { scenes: true } }
}

export default function SceneStoryEditFixture() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [path, setPath] = useState('/studio/producer')
  const navigateRef = useRef<(href: string) => void>(() => {})

  useEffect(() => {
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) return
    const originalFetch = window.fetch
    const state = {
      status: createStatus(), preview: createPreview(), requests: [] as FixtureRequest[],
      saveFailure: null as Failure, reviseFailure: null as Failure, applyFailure: null as Failure,
      holdSave: false, holdRevise: false, holdApply: false,
      releaseSave: (() => {}) as () => void, releaseRevise: (() => {}) as () => void, releaseApply: (() => {}) as () => void,
      feedback: '', revision: 0, proposalSequence: 0, epoch: 0,
    }
    const advanceVersion = () => {
      state.revision += 1
      state.preview.updatedAt = new Date(Date.now() + state.revision).toISOString()
      state.status.last_timestamp = state.preview.updatedAt
      state.preview.storyVersion = storyVersion(state.preview.scenes)
      if (state.preview.sceneStoryProposal) state.preview.sceneStoryProposal.stale = proposalStale(state.preview.sceneStoryProposal, state.preview.scenes)
    }
    const syncWriterScenes = () => {
      const scenes: Scene[] = state.preview.scenes.map((scene, index) => ({ sceneId: scene.sceneId, sortOrder: index + 1, location: index === 2 ? '법정' : '방산기업 사무실', timeOfDay: index ? 'day' : 'night', mood: 'tense', narrativeSummary: scene.beats.join('\n'), originalTextQuote: '', charactersPresent: CAST.map((person) => person.characterId!), estimatedDurationSeconds: 60 }))
      useWriterStore.setState({ sceneManifest: { scenes, characters: [], locations: [] }, shots: [], error: null, loadProject: async () => {} })
    }
    const go = (view: View) => {
      if (useGlobalChatStore.getState().sceneStoryEdit?.busy) return
      useGlobalChatStore.getState().endSceneStoryEdit()
      state.status = view === 'writer'
        ? { ...state.status, pipeline_completed: true, current_stage: 'done', current_status: 'completed', progress_percent: 100 }
        : { ...createStatus(), last_timestamp: state.preview.updatedAt ?? null }
      state.preview.completed = view === 'writer'
      useProjectStore.setState({ currentStage: view, writerActive: false, writerComplete: view === 'writer' })
      setPath(`/studio/${view}`)
      restartWriterStatus(PROJECT_ID)
    }
    navigateRef.current = (href) => {
      if (href.startsWith('/studio/writer')) go('writer')
      else if (href.startsWith('/studio/producer')) go('producer')
    }

    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href)
      // Next 개발 자산만 실제 서버를 쓴다. API와 외부 주소는 전부 아래 고정 응답으로 닫는다.
      if (url.origin === location.origin && !url.pathname.startsWith('/api/') && !url.pathname.includes('/rest/') && !url.pathname.includes('/auth/')) return originalFetch(input, init)
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      let body: unknown = null
      try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : input instanceof Request ? await input.clone().json() : null } catch {}
      state.requests.push({ url: url.pathname, method, body })
      if (url.pathname.startsWith('/api/writer/status/')) return Response.json(state.status)
      if (url.pathname.startsWith('/api/writer/preview/')) return Response.json(state.preview)
      if (url.pathname === '/api/writer/scene-gate' && method === 'POST') {
        const requestEpoch = state.epoch
        const request = body as { action?: string; expectedUpdatedAt?: string; expectedStoryVersion?: string; proposalId?: string; scenes?: SceneEdit[]; feedback?: string }
        if (request.action === 'save') {
          if (state.holdSave) await new Promise<void>((resolve) => { state.releaseSave = resolve })
          if (requestEpoch !== state.epoch) return Response.json({ error: 'The fixture was reset' }, { status: 409 })
          const changed = request.expectedStoryVersion
            ? request.expectedStoryVersion !== state.preview.storyVersion
            : request.expectedUpdatedAt !== state.preview.updatedAt
          const failure = state.saveFailure ?? (changed ? 409 : null)
          if (failure) return Response.json({ error: failure === 409 ? 'scene_story_changed' : 'fixture_save_failed', ...(failure === 409 ? { code: 'scene_story_changed' } : {}) }, { status: failure })
          for (const edit of request.scenes ?? []) {
            const scene = state.preview.scenes.find((item) => item.sceneId === edit.sceneId)
            if (scene) scene.beats = [...edit.beats]
          }
          advanceVersion()
          syncWriterScenes()
          return Response.json({ ok: true, updatedAt: state.preview.updatedAt })
        }
        if (request.action === 'revise') {
          if (state.reviseFailure) return Response.json({ error: 'fixture_revise_failed' }, { status: state.reviseFailure })
          if (state.preview.sceneStoryProposal && state.preview.sceneStoryProposal.status !== 'failed') return Response.json({ error: 'Resolve the current proposal first', code: 'scene_story_proposal_pending' }, { status: 409 })
          state.feedback = request.feedback ?? ''
          state.proposalSequence += 1
          const proposal: SceneStoryProposalView = {
            id: `fixture-proposal-${state.proposalSequence}`, status: 'generating', feedback: state.feedback,
            createdAt: new Date().toISOString(), before: proposalScenes(state.preview.scenes), after: [], stale: false,
          }
          state.preview.sceneStoryProposal = proposal
          advanceVersion()
          if (state.holdRevise) await new Promise<void>((resolve) => { state.releaseRevise = resolve })
          if (requestEpoch !== state.epoch) return Response.json({ error: 'The fixture was reset' }, { status: 409 })
          return Response.json({ ok: true, action: 'revise', proposalId: proposal.id, updatedAt: state.preview.updatedAt })
        }
        if (request.action === 'apply' || request.action === 'discard') {
          if (request.action === 'apply' && state.holdApply) await new Promise<void>((resolve) => { state.releaseApply = resolve })
          if (requestEpoch !== state.epoch) return Response.json({ error: 'The fixture was reset' }, { status: 409 })
          const proposal = state.preview.sceneStoryProposal
          if (!proposal || proposal.id !== request.proposalId) return Response.json({ error: 'The proposal is no longer available', code: 'scene_story_proposal_changed' }, { status: 409 })
          if (request.action === 'apply') {
            const failure = state.applyFailure ?? (proposal.status !== 'ready' || proposalStale(proposal, state.preview.scenes) ? 409 : null)
            if (failure) return Response.json({ error: failure === 409 ? 'scene_story_changed' : 'fixture_apply_failed', ...(failure === 409 ? { code: 'scene_story_changed' } : {}) }, { status: failure })
            state.preview.scenes = proposal.after.map((next, index) => {
              const original = proposal.before[index]
              const current = state.preview.scenes.find((scene) => scene.sceneId === next.sceneId)
              return original && equal(original, next) && current ? current : { ...next, beats: [...next.beats], shotStories: [] }
            })
          }
          state.preview.sceneStoryProposal = null
          advanceVersion()
          syncWriterScenes()
          return Response.json({ ok: true, action: request.action, updatedAt: state.preview.updatedAt })
        }
        if (request.action === 'confirm') {
          if (state.preview.sceneStoryProposal) return Response.json({ error: 'Resolve the current proposal first', code: 'scene_story_proposal_pending' }, { status: 409 })
          advanceVersion()
          state.status = { ...state.status, current_stage: 'characters', current_status: 'running' }
          return Response.json({ ok: true, updatedAt: state.preview.updatedAt })
        }
      }
      if (url.pathname === '/api/generation/active') return Response.json({ data: { jobs: [], batches: [], completions: [] } })
      if (url.pathname === '/api/writer/engine') return Response.json({ enabled: false })
      if (url.pathname === '/api/billing/take-balance') return Response.json({ balance: 100, mode: 'shadow' })
      if (url.pathname.endsWith('/messages')) return Response.json({ messages: [] })
      if (url.pathname.includes('/auth/')) return Response.json({ user: null })
      if (url.pathname.includes('/rest/')) return new Response(method === 'HEAD' ? null : '[]', { headers: { 'content-type': 'application/json', 'content-range': '0-0/0' } })
      return Response.json({ error: '외부 호출을 차단한 로컬 검수 화면입니다.' }, { status: 403 })
    }

    const reset = () => {
      state.epoch += 1
      state.status = createStatus(); state.preview = createPreview(); state.requests = []
      state.saveFailure = null; state.reviseFailure = null; state.applyFailure = null
      state.releaseSave(); state.releaseRevise(); state.releaseApply()
      state.holdSave = false; state.holdRevise = false; state.holdApply = false; state.feedback = ''
      useLocaleStore.getState().setLocaleForDisplay('ko')
      useProjectStore.setState({ projectId: PROJECT_ID, projectTitle: '쓴 승리', currentStage: 'producer', reachedStage: 'editor', producerLocked: true, writerActive: false, writerComplete: false, artistImagesReady: true, initLoading: false, projectLocale: 'ko', projectLocaleLocked: true, lifecycleStatus: structuredClone(EMPTY_LIFECYCLE_STATUS), canNavigateTo: () => true })
      useProducerStore.setState({ storyText: SCENES.flatMap((scene) => scene.beats).join('\n\n'), storyReady: true, preserveScript: false, cast: structuredClone(CAST), backgrounds: structuredClone(BACKGROUNDS), projectSettings: { ...SETTINGS }, styleAnchorKey: 'live-action', styleAnchors: [{ key: 'live-action', label: '실사', medium: 'live_action', imageUrl: null, previewUrl: null, subtitle: null }], customStyleAnchor: null, syncing: false, error: null, loadStyleAnchors: async () => {} })
      useGlobalChatStore.getState().reset()
      useGlobalChatStore.setState({ messages: [], loading: false, loadMessages: async () => {}, messagesLoadedProjectId: PROJECT_ID })
      useWriterUiStore.setState({ activeTab: 'storyboard', v2Available: false })
      useChatUiStore.getState().setCollapsed(false)
      syncWriterScenes()
      markStageSeen(PROJECT_ID, 'producer', 1); markStageSeen(PROJECT_ID, 'writer', 1)
      setPath('/studio/producer')
      restartWriterStatus(PROJECT_ID)
    }
    const refreshPreview = () => {
      useGlobalChatStore.getState().refreshSceneStory()
      restartWriterStatus(PROJECT_ID)
    }
    const completeRevisionWithEdits = (edits: SceneEdit[], proposalId = state.preview.sceneStoryProposal?.id) => {
      const proposal = state.preview.sceneStoryProposal
      if (!proposal || proposal.id !== proposalId || proposal.status !== 'generating') return false
      proposal.after = proposal.before.map((before) => ({ ...before, beats: [...(edits.find((edit) => edit.sceneId === before.sceneId)?.beats ?? before.beats)] }))
      proposal.status = 'ready'
      advanceVersion()
      refreshPreview()
      return true
    }
    Object.assign(window, { __sceneStoryFixture: {
      state, chat: useGlobalChatStore, project: useProjectStore, producer: useProducerStore, writer: useWriterStore,
      reset, go,
      setSaveFailure: (status: Failure) => { state.saveFailure = status },
      setReviseFailure: (status: Failure) => { state.reviseFailure = status },
      setApplyFailure: (status: Failure) => { state.applyFailure = status },
      completeRevisionWithEdits,
      completeRevision: (text?: string, proposalId = state.preview.sceneStoryProposal?.id, sceneIndex = 0) => {
        const scene = state.preview.sceneStoryProposal?.before[sceneIndex]
        if (!scene) return false
        const beats = text ? text.split('\n').filter(Boolean) : ['조승우는 불 꺼진 사무실에 홀로 남아 선적 기록을 다시 펼친다. ' + scene.beats[0], ...scene.beats.slice(1)]
        return completeRevisionWithEdits([{ sceneId: scene.sceneId, beats }], proposalId)
      },
      failRevision: (error = 'fixture_generation_failed', proposalId = state.preview.sceneStoryProposal?.id) => {
        const proposal = state.preview.sceneStoryProposal
        if (!proposal || proposal.id !== proposalId || proposal.status !== 'generating') return false
        proposal.status = 'failed'
        proposal.error = error
        advanceVersion()
        refreshPreview()
        return true
      },
    } })
    reset()
    queueMicrotask(() => setReady(true))
    return () => { window.fetch = originalFetch }
  }, [])

  const navigate = (href: string) => navigateRef.current(href)
  return ready ? (
    <AppRouterContext.Provider value={{ ...router, push: navigate, replace: navigate, prefetch: async () => {} }}>
      <NavigationPromisesContext.Provider value={null}>
        <PathnameContext.Provider value={path}>
          <main className="flex h-screen flex-col bg-background text-foreground">
            <nav className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2" aria-label="로컬 검수 화면 전환">
              <span className="mr-auto text-xs text-muted-foreground">씬 스토리 편집 검수 · 고정 응답</span>
              <Button size="sm" variant="outline" onClick={() => navigate('/studio/producer')}>Producer 보기</Button>
              <Button size="sm" variant="outline" onClick={() => navigate('/studio/writer')}>Writer 보기</Button>
            </nav>
            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">{path === '/studio/producer' ? <ProducerFixtureBoard /> : <WriterWorkspace />}</div>
              <aside className="flex w-[360px] shrink-0 flex-col border-l border-border"><GlobalChat /></aside>
            </div>
          </main>
        </PathnameContext.Provider>
      </NavigationPromisesContext.Provider>
    </AppRouterContext.Provider>
  ) : <p>로컬 검수 화면 준비 중</p>
}

function ProducerFixtureBoard() {
  const producer = useProducerStore()
  return <ProducerReadinessBoard gate={evaluateProducerGate({ settings: producer.projectSettings, storyReady: producer.storyReady, cast: producer.cast, backgrounds: producer.backgrounds, styleAnchorKey: producer.styleAnchorKey, locale: 'ko' })} />
}
