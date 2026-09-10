// 배경의 새 모습은 자기 설명으로 생성하고, 자기 탭에 진행 상태와 저장된 이미지를 표시한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useArtistStore, worldFailureKey } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import { resetActionGuard } from '@/lib/action-guard'
import { POST as generateWorld } from '@/app/api/artist/generate-world/route'
import type { SceneManifest } from '@/types/scene'
import type { WorldAsset } from '@/types/asset'
import type { GenerationJobReceipt } from '@/lib/generation-jobs-client'

const mocks = vi.hoisted(() => ({ from: vi.fn(), submit: vi.fn(), createJob: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: mocks.from }) }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/demo/context', () => ({ isDemoSession: () => false }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true, userId: 'owner' }) }))
vi.mock('@/lib/generation-quota', () => ({ checkGenerationCapacity: async () => ({ ok: true }) }))
vi.mock('@/lib/chat-trace-server', () => ({ chatTraceBelongsToProject: async () => true }))
vi.mock('@/lib/style-anchor', () => ({ resolveStyleAnchor: async () => null, applyStyleAnchor: (_: unknown, value: unknown) => value }))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => 'https://example.test/webhook' }))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: mocks.submit }))
vi.mock('@/lib/generation-notify', () => ({ notifyGenerationComplete: vi.fn(), notifyGenerationFailed: vi.fn(), notifyGenerationGaveUp: vi.fn() }))
vi.mock('@/lib/generation-jobs', () => ({
  createGenerationJob: mocks.createJob,
  hasQueuedWorldShotJob: async () => false,
  listFailedWorldShotJobs: async () => [],
  countFailedJobsForTarget: async () => 0,
  AUTO_GENERATION_GIVE_UP_THRESHOLD: 3,
}))

const DAY = 'https://example.test/roof-day.png'
const NIGHT = 'https://example.test/roof-night.png'
const DAWN = 'https://example.test/roof-dawn.png'
const NIGHT_DESCRIPTION = 'The same rooftop at night, lit only by cool moonlight.'
const TRACE = '12345678-1234-4234-8234-123456789012'
const initial = useArtistStore.getState()
let rows: Record<string, Array<Record<string, unknown>>>
let requests: Array<Record<string, unknown>>
let jobs: Array<{ id: string; actor: string; target: Record<string, unknown>; inputSnapshot: { prompt: string; reference_image_urls: string[] } }>
let pendingResults: Map<string, (response: Response) => void>
let holdResults: boolean
let status: Record<string, unknown>

function manifest(): SceneManifest {
  return {
    characters: [],
    locations: [{ locationId: 'roof', name: 'Rooftop', visualDescription: 'sunlit rooftop', timeOfDay: 'day', lightingDirection: 'bright sunlight', lightingSources: ['noon sun'], styleDescription: 'sunny golden roof', props: ['antenna'], purpose: 'sunny midday meeting' }],
    scenes: [{ sceneId: 'scene-1', location: 'roof', timeOfDay: 'day', mood: 'sunny', narrativeSummary: 'A meeting in bright daylight', originalTextQuote: '', charactersPresent: [], estimatedDurationSeconds: 30 }],
  }
}

function world(): WorldAsset {
  return {
    locationId: 'roof', name: '옥상', sceneId: 'scene-1', wideShot: DAY,
    visualDescription: 'sunlit rooftop', visualDescriptionNative: '햇빛이 드는 옥상', candidates: [],
    appearances: [{ appearanceKey: 'night', label: '밤', narrativeTime: 'present', visualDescription: NIGHT_DESCRIPTION, visualDescriptionNative: '달빛만 비치는 밤의 옥상', wideShot: null, candidates: [] }],
  }
}

function chain(table: string) {
  let single = false
  let mutation = false
  const filters: Array<[string, unknown]> = []
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.order = () => q
  q.update = () => { mutation = true; return q }
  q.eq = (key: string, value: unknown) => { filters.push([key, value]); return q }
  q.maybeSingle = q.single = () => { single = true; return q }
  q.then = (resolve: (value: unknown) => unknown) => {
    const matches = (rows[table] ?? []).filter((row) => filters.every(([key, value]) => !(key in row) || row[key] === value))
    return Promise.resolve({ data: mutation ? null : single ? matches[0] ?? null : matches, error: null }).then(resolve)
  }
  return q
}

function completion(url: string) {
  return Response.json({ data: { status: 'completed', resultUrl: url, error: null } })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetActionGuard()
  useArtistStore.setState({ ...initial, sceneManifest: manifest(), worldAssets: [world()], generatingLocations: [], error: null })
  useProjectStore.setState({ projectId: 'project-1' })
  rows = {
    projects: [{ id: 'project-1', workspace_id: 'ws', design_tokens: null, style_anchor_key: null }],
    locations: [{ project_id: 'project-1', location_id: 'roof', name: '옥상', visual_description: 'sunlit rooftop', wide_shot: DAY }],
    location_appearances: [{ project_id: 'project-1', location_id: 'roof', appearance_key: 'night', label: '밤', narrative_time: 'present', visual_description: NIGHT_DESCRIPTION, visual_description_native: '달빛만 비치는 밤의 옥상', wide_shot: NIGHT }],
  }
  requests = []
  jobs = []
  pendingResults = new Map()
  holdResults = false
  status = { failures: [], queuedMain: [], queuedWorld: [], worldFailures: [] }
  mocks.from.mockImplementation(chain)
  mocks.submit.mockImplementation(async () => ({ request_id: `request-${jobs.length + 1}`, model: 'fal-test', fal_key_id: 'key' }))
  mocks.createJob.mockImplementation(async (input) => {
    const job = { ...input, id: `job-${jobs.length + 1}` }
    jobs.push(job)
    return job
  })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/artist/location-appearance') {
      return Response.json({ appearanceKey: 'night', label: '밤', narrativeTime: 'present', visualDescription: NIGHT_DESCRIPTION, visualDescriptionNative: '달빛만 비치는 밤의 옥상' })
    }
    if (url === '/api/artist/generate-world') {
      requests.push(JSON.parse(String(init?.body)))
      return generateWorld(new Request(`http://localhost${url}`, init))
    }
    if (url.startsWith('/api/artist/generation-status')) return Response.json(status)
    if (url.startsWith('/api/generation-jobs/')) {
      const id = url.split('/').at(-1)!
      if (holdResults) return new Promise<Response>((resolve) => pendingResults.set(id, resolve))
      return completion(NIGHT)
    }
    throw new Error(`Unexpected request: ${url}`)
  }))
})

afterEach(async () => {
  for (const resolve of pendingResults.values()) resolve(completion(NIGHT))
  await new Promise((resolve) => setTimeout(resolve, 0))
  useArtistStore.setState(initial)
  vi.unstubAllGlobals()
})

describe('MVP-22~24 배경 모습 생성과 표시', () => {
  it('같은 모습의 같은 조건으로 생성하면 채팅과 UI가 같은 대상과 생성 입력을 사용한다', async () => {
    useArtistStore.setState({ worldAssets: [{ ...world(), appearances: [] }] })
    await useArtistStore.getState().createLocationAppearance('roof', '밤', '달빛만 비치는 밤의 옥상', 'present', { generate: true, actor: 'chat', model: 'gpt-image-2' })
    const afterChat = useArtistStore.getState().worldAssets[0]
    useArtistStore.setState({ sceneManifest: manifest(), worldAssets: [world()] })
    await useArtistStore.getState().generateWorldShot('roof', 'wideShot', undefined, 'ui', 'gpt-image-2', { appearanceKey: 'night' })
    const afterUi = useArtistStore.getState().worldAssets[0]

    expect(jobs).toHaveLength(2)
    expect(jobs[0].actor).toBe('chat')
    expect(jobs[1].actor).toBe('ui')
    expect(jobs[0].target).toEqual(jobs[1].target)
    expect(jobs[0].target).toMatchObject({ locationId: 'roof', appearanceKey: 'night', column: 'wide_shot' })
    expect(jobs[0].inputSnapshot).toEqual(jobs[1].inputSnapshot)
    expect(jobs[0].inputSnapshot.reference_image_urls).toEqual([DAY])
    expect(afterChat.appearances?.[0].wideShot).toBe(NIGHT)
    expect(afterUi.appearances?.[0].wideShot).toBe(NIGHT)
    expect(afterChat.wideShot).toBe(DAY)
    expect(afterUi.wideShot).toBe(DAY)
  })

  it('새 모습에서 지정한 시간대와 조명은 기존 모습의 같은 조건보다 우선해 생성 입력에 반영된다', async () => {
    await useArtistStore.getState().generateWorldShot('roof', 'wideShot', undefined, 'chat', 'gpt-image-2', { appearanceKey: 'night' })
    expect(jobs).toHaveLength(1)
    expect(jobs[0].inputSnapshot.prompt).toContain(NIGHT_DESCRIPTION)
    expect(jobs[0].inputSnapshot.prompt).not.toMatch(/during day|sunlight|noon sun|sunny|daylight|sunlit/i)
    expect(jobs[0].inputSnapshot.prompt).toContain('antenna')
    expect(jobs[0].inputSnapshot.reference_image_urls).toEqual([DAY])
  })

  it('새 모습의 탭에서는 그 모습의 생성 상태와 저장된 이미지를 보여준다', async () => {
    holdResults = true
    useArtistStore.setState({ worldAssets: [{ ...world(), appearances: [] }] })
    const run = useArtistStore.getState().createLocationAppearance('roof', '밤', NIGHT_DESCRIPTION, 'present', { generate: true, actor: 'chat' })
    await vi.waitFor(() => expect(pendingResults.size).toBe(1))
    const state = useArtistStore.getState()
    expect(state.selectedLocationAppearances.roof).toBe('night')
    expect(state.generatingLocations).toContain(worldFailureKey('roof', 'night'))
    expect(state.generatingLocations).not.toContain(worldFailureKey('roof'))
    expect(state.worldAssets[0].appearances?.[0].wideShot).toBeNull()
    pendingResults.get('job-1')!(completion(NIGHT))
    await run
    expect(useArtistStore.getState().worldAssets[0].appearances?.[0].wideShot).toBe(NIGHT)
    expect(useArtistStore.getState().generatingLocations).toEqual([])
  })

  it('다른 모습이 먼저 완성되어도 각 모습의 이미지와 생성 상태가 섞이지 않는다', async () => {
    holdResults = true
    const roof = world()
    roof.appearances!.push({ ...roof.appearances![0], appearanceKey: 'dawn', label: '새벽', visualDescription: 'rooftop at dawn' })
    rows.location_appearances.push({ ...rows.location_appearances[0], appearance_key: 'dawn' })
    useArtistStore.setState({ worldAssets: [roof] })
    const night = useArtistStore.getState().generateWorldShot('roof', 'wideShot', undefined, 'ui', undefined, { appearanceKey: 'night' })
    const dawn = useArtistStore.getState().generateWorldShot('roof', 'wideShot', undefined, 'ui', undefined, { appearanceKey: 'dawn' })
    await vi.waitFor(() => expect(pendingResults.size).toBe(2))
    pendingResults.get('job-2')!(completion(DAWN))
    await dawn
    expect(useArtistStore.getState().generatingLocations).toEqual([worldFailureKey('roof', 'night')])
    expect(useArtistStore.getState().worldAssets[0].appearances?.[0].wideShot).toBeNull()
    expect(useArtistStore.getState().worldAssets[0].appearances?.[1].wideShot).toBe(DAWN)
    pendingResults.get('job-1')!(completion(NIGHT))
    await night
    expect(useArtistStore.getState().worldAssets[0].appearances?.map((item) => item.wideShot)).toEqual([NIGHT, DAWN])
    expect(useArtistStore.getState().worldAssets[0].wideShot).toBe(DAY)
  })

  it('새로고침해도 선택한 모습과 그 모습의 저장된 이미지가 다시 열린다', async () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
    useArtistStore.getState().selectLocationAppearance('roof', 'night')
    useArtistStore.getState().reset()
    await useArtistStore.getState().loadData()
    expect(useArtistStore.getState().selectedLocationAppearances.roof).toBe('night')
    expect(useArtistStore.getState().worldAssets[0].appearances?.[0].wideShot).toBe(NIGHT)
    expect(useArtistStore.getState().worldAssets[0].wideShot).toBe(DAY)
  })

  it('새로고침 중 진행 중인 모습은 기존 작업을 이어 확인하고 완료 이미지를 보여준다', async () => {
    holdResults = true
    rows.location_appearances[0].wide_shot = null
    status.queuedWorld = [{ jobId: 'resumed-world', locationId: 'roof', appearanceKey: 'night' }]
    await useArtistStore.getState().loadData()
    await vi.waitFor(() => expect(pendingResults.has('resumed-world')).toBe(true))
    expect(useArtistStore.getState().generatingLocations).toEqual([worldFailureKey('roof', 'night')])
    pendingResults.get('resumed-world')!(completion(NIGHT))
    await vi.waitFor(() => expect(useArtistStore.getState().worldAssets[0].appearances?.[0].wideShot).toBe(NIGHT))
    expect(jobs).toHaveLength(0)
    expect(useArtistStore.getState().generatingLocations).toEqual([])
  })

  it('새 모습이 저장되고 생성되면 모습 이름과 작업 접수·완료 기록을 함께 전달한다', async () => {
    const receipts: GenerationJobReceipt[] = []
    const onCreated = vi.fn()
    useArtistStore.setState({ worldAssets: [{ ...world(), appearances: [] }] })
    const key = await useArtistStore.getState().createLocationAppearance('roof', '밤', NIGHT_DESCRIPTION, 'present', {
      generate: true, actor: 'chat', traceId: TRACE, onCreated, onJob: (receipt) => receipts.push(receipt),
    })
    expect(key).toBe('night')
    expect(onCreated).toHaveBeenCalledExactlyOnceWith('night')
    expect(requests[0].traceId).toBe(TRACE)
    expect(receipts).toEqual([expect.objectContaining({ jobId: 'job-1', status: 'queued' }), expect.objectContaining({ jobId: 'job-1', status: 'completed', resultUrl: NIGHT })])
  })

  it('밤 모습 생성이 실패하면 기본 이미지를 바꾸지 않고 밤 모습에 실패와 작업 번호를 남긴다', async () => {
    holdResults = true
    const receipts: GenerationJobReceipt[] = []
    const run = useArtistStore.getState().generateWorldShot('roof', 'wideShot', undefined, 'chat', undefined, { appearanceKey: 'night', onJob: (receipt) => receipts.push(receipt) })
    await vi.waitFor(() => expect(pendingResults.has('job-1')).toBe(true))
    pendingResults.get('job-1')!(Response.json({ data: { status: 'failed', resultUrl: null, error: 'Provider failed' } }))
    await run
    expect(receipts).toEqual([expect.objectContaining({ jobId: 'job-1', status: 'queued' }), expect.objectContaining({ jobId: 'job-1', status: 'failed' })])
    expect(useArtistStore.getState().worldAssets[0].wideShot).toBe(DAY)
    expect(useArtistStore.getState().worldAssets[0].appearances?.[0].wideShot).toBeNull()
    expect(useArtistStore.getState().worldFailures['roof:night'].error).toContain('Provider failed')
    expect(useArtistStore.getState().worldFailures.roof).toBeUndefined()
    expect(useArtistStore.getState().generatingLocations).toEqual([])
  })

  it('모습 저장 중 프로젝트를 바꾸면 새 프로젝트에 그 모습이나 이미지 작업을 넣지 않는다', async () => {
    let saved!: (response: Response) => void
    const fetchOriginal = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url === '/api/artist/location-appearance'
      ? new Promise<Response>((resolve) => { saved = resolve })
      : fetchOriginal(url, init)))
    useArtistStore.setState({ worldAssets: [{ ...world(), appearances: [] }] })
    const run = useArtistStore.getState().createLocationAppearance('roof', '밤', NIGHT_DESCRIPTION, 'present', { generate: true, actor: 'chat' })
    useProjectStore.setState({ projectId: 'project-2' })
    useArtistStore.setState({ sceneManifest: manifest(), worldAssets: [{ ...world(), appearances: [] }] })
    saved(Response.json({ appearanceKey: 'night', label: '밤', visualDescription: NIGHT_DESCRIPTION }))
    await run
    expect(jobs).toHaveLength(0)
    expect(useArtistStore.getState().worldAssets[0].appearances).toEqual([])
  })
})
