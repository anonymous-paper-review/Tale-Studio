// 두 인물의 다른 시간대 모습을 함께 승인하면 첫 이미지 완료를 기다리지 않고 두 작업을 각각 접수한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), llm: vi.fn(), queue: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: async () => ({ id: 'owner', user_metadata: { locale: 'ko' } }) }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async () => ({ ok: true, userId: 'owner' }) }))
vi.mock('@/lib/llm', () => ({ llmChat: mocks.llm }))
vi.mock('@/lib/artist/chat-context', () => ({ buildArtistActivityContext: async () => '' }))
vi.mock('@/lib/chat-format', async (original) => ({
  ...await original<typeof import('@/lib/chat-format')>(),
  resolveChatLocale: async () => ({ locale: 'ko', switched: null }),
}))
vi.mock('@/lib/chat-trace-server', () => ({ persistChatTraceBestEffort: vi.fn(), chatTraceBelongsToProject: async () => true }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/generation-quota', () => ({ checkGenerationCapacity: async () => ({ ok: true }) }))
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: async () => 'https://assets.test/template.png' }))
vi.mock('@/lib/fal/keys', () => ({ pickFalKey: async () => ({ id: 'test-key', client: { queue: { submit: mocks.queue } } }), FalUnknownKeyError: class extends Error {} }))

import { POST as chat } from '@/app/api/artist/chat/route'
import { POST as createAppearance } from '@/app/api/artist/character-appearance/route'
import { POST as generateSheet } from '@/app/api/artist/generate-sheet/route'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { CharacterAsset } from '@/types/asset'

type Row = Record<string, unknown>
const pid = 'two-appearance-project'
const names = [{ id: 'kyotaro', name: '쿄타로' }, { id: 'komatsu', name: '코마츠' }]
const storage = new Map<string, string>()
let tables: Record<string, Row[]>
let providerCalls: Row[]
let pollWaiters: Map<string, (response: Response) => void>
let finishImmediately: boolean
let rejectCharacter: string | null
let activeRun: Promise<boolean> | null
let beforeAppearance: (() => Promise<void>) | null
let releaseAppearance: (() => void) | null

// DB 네트워크만 메모리 어댑터로 바꾼다. 라우트의 대상 검사·키 생성·중복 검사·잡 저장 함수는 실제로 실행한다.
function from(table: string) {
  const filters: Array<[string, unknown]> = []
  let inserted: Row | null = null
  let patch: Row | null = null
  const chain = {
    select: () => chain,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return chain },
    insert: (value: Row) => { inserted = value; return chain },
    update: (value: Row) => { patch = value; return chain },
    order: () => chain,
    limit: () => chain,
    single: async () => ({ data: result()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: result()[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: result(), error: null }).then(resolve),
  }
  function result() {
    const rows = tables[table] ?? (tables[table] = [])
    if (inserted) {
      const row = { id: `job-${rows.length + 1}`, ...inserted }
      rows.push(row)
      inserted = null
      return [row]
    }
    const matched = rows.filter(row => filters.every(([key, value]) => row[key] === value))
    if (patch) for (const row of matched) Object.assign(row, patch)
    return matched
  }
  return chain
}
function completion(jobId: string, failure?: string) {
  const row = tables.generation_jobs.find(job => job.id === jobId)!
  row.status = failure ? 'failed' : 'completed'
  const response = Response.json({ data: { status: row.status, resultUrl: failure ? null : `https://assets.test/${jobId}.webp`, error: failure ?? null } })
  return response
}
async function flush() {
  await new Promise(resolve => setTimeout(resolve, 0))
}
function finishAll() {
  finishImmediately = true
  for (const [id, resolve] of pollWaiters) resolve(completion(id))
  pollWaiters.clear()
}
function character({ id, name }: typeof names[number]): CharacterAsset {
  return { characterId: id, name, entityType: 'person', views: { main: null, back: null, sideLeft: null, sideRight: null }, viewCandidates: {}, appearances: [{ appearanceKey: 'default', label: '현재', isDefault: true, narrativeTime: 'present', appearance: `${name} current`, appearanceNative: null, sheetUrl: `https://assets.test/${id}.webp`, portraitUrl: `https://assets.test/${id}-face.webp`, viewCandidates: {} }] }
}
function answer(ids = names.map(n => n.id)) {
  mocks.llm.mockResolvedValue('새 모습을 확인하고 승인해 주세요.\n```json\n' + JSON.stringify({ updates: ids.map(id => ({ type: 'createAppearance', characterId: id, label: '잠옷', appearance: id === 'kyotaro' ? 'blue pajamas at night' : 'red pajamas at night', narrativeTime: 'future' })) }) + '\n```')
}
async function requestAndApprove() {
  await useGlobalChatStore.getState().sendMessage('쿄타로와 코마츠의 잠옷입은 모습도 추가해줘')
  const proposal = useGlobalChatStore.getState().pendingProposal!
  expect(proposal.items).toHaveLength(2)
  expect(proposal.target).toContain('쿄타로')
  expect(proposal.target).toContain('코마츠')
  expect(providerCalls).toHaveLength(0)
  activeRun = useGlobalChatStore.getState().approvePendingProposal(proposal.id)
  return proposal.id
}

beforeEach(() => {
  vi.clearAllMocks()
  storage.clear()
  providerCalls = []
  pollWaiters = new Map()
  finishImmediately = false
  rejectCharacter = null
  activeRun = null
  beforeAppearance = null
  releaseAppearance = null
  tables = {
    projects: [{ id: pid, workspace_id: 'workspace', design_tokens: {} }],
    workspaces: [{ id: 'workspace', owner_id: 'owner' }],
    characters: names.map(n => ({ project_id: pid, character_id: n.id, name: n.name, entity_type: 'person', role: 'supporting' })),
    character_appearances: names.map(n => ({ project_id: pid, character_id: n.id, appearance_key: 'default', is_default: true, appearance: 'current clothes', portrait_url: `https://assets.test/${n.id}-face.webp`, sheet_url: `https://assets.test/${n.id}.webp` })),
    generation_jobs: [], chat_traces: [],
  }
  mocks.from.mockImplementation(from)
  mocks.queue.mockImplementation(async (model: string, options: Row) => {
    const response = await fetch('https://provider.test/queue', { method: 'POST', body: JSON.stringify({ model, ...options }) })
    return response.json()
  })
  answer()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: pid, currentStage: 'artist', reachedStage: 'artist', projectLocale: 'ko', projectLocaleLocked: true })
  useArtistStore.setState({ characterAssets: names.map(character), worldAssets: [], generatingViews: [], viewFailures: {}, error: null })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === 'https://provider.test/queue') {
      providerCalls.push(JSON.parse(init!.body as string))
      return Response.json({ request_id: `provider-${providerCalls.length}` })
    }
    if (url === '/api/artist/chat') return chat(new Request(`http://localhost${url}`, init))
    if (url === '/api/artist/character-appearance') {
      await beforeAppearance?.()
      return createAppearance(new Request(`http://localhost${url}`, init))
    }
    if (url === '/api/artist/generate-sheet') {
      if (JSON.parse(init!.body as string).characterId === rejectCharacter) return Response.json({ error: 'Generation capacity reached' }, { status: 429 })
      return generateSheet(new Request(`http://localhost${url}`, init))
    }
    if (url.startsWith('/api/generation-jobs/')) {
      const jobId = url.split('/').at(-1)!
      if (finishImmediately) return completion(jobId)
      return new Promise<Response>(resolve => { pollWaiters.set(jobId, resolve) })
    }
    if (url.includes('/failures')) return Response.json({ failures: [] })
    throw new Error(`Unexpected HTTP request: ${url}`)
  }))
})
afterEach(async () => {
  releaseAppearance?.()
  finishAll()
  await activeRun
  await flush()
  useGlobalChatStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('채팅에서 두 모습이 실제 생성 접수까지 이어진다', () => {
  it('두 인물의 다른 시간대 모습을 함께 요청하고 승인하면 두 인물의 새 모습 이미지가 각각 큐에 등록된다', async () => {
    await requestAndApprove()
    await vi.waitFor(() => expect(tables.generation_jobs).toHaveLength(2), { timeout: 1000, interval: 10 })
    expect(tables.generation_jobs.map(job => job.status)).toEqual(['queued', 'queued'])
    expect(tables.generation_jobs.map(job => job.target)).toEqual(names.map(n => expect.objectContaining({ characterId: n.id, appearanceKey: 'appearance', view: 'main' })))
    expect(new Set(tables.generation_jobs.map(job => job.request_id)).size).toBe(2)
    expect(providerCalls).toHaveLength(2)
    const inputs = providerCalls.map(call => call.input as Row)
    expect(inputs[0].image_urls).toContain('https://assets.test/kyotaro-face.webp')
    expect(inputs[1].image_urls).toContain('https://assets.test/komatsu-face.webp')
    expect(inputs[0].prompt).toContain('blue pajamas at night')
    expect(inputs[1].prompt).toContain('red pajamas at night')
    expect(tables.character_appearances.filter(row => !row.is_default).map(row => row.narrative_time)).toEqual(['future', 'future'])
    finishAll()
    await expect(activeRun).resolves.toBe(true)
  })

  it('인물 순서를 뒤집어 요청해도 같은 모습 이름 때문에 다른 인물의 접수가 중복으로 사라지지 않는다', async () => {
    answer(['komatsu', 'kyotaro'])
    await requestAndApprove()
    await vi.waitFor(() => expect(tables.generation_jobs).toHaveLength(2))
    expect(tables.generation_jobs.map(job => (job.target as Row).characterId)).toEqual(['komatsu', 'kyotaro'])
    expect(tables.generation_jobs.map(job => (job.target as Row).appearanceKey)).toEqual(['appearance', 'appearance'])
    expect(providerCalls).toHaveLength(2)
  })

  it('두 번째 인물의 이미지가 먼저 완성되어도 완료 안내와 결과는 해당 인물에 붙는다', async () => {
    await requestAndApprove()
    await vi.waitFor(() => expect(pollWaiters.size).toBe(2))
    pollWaiters.get('job-2')!(completion('job-2'))
    pollWaiters.delete('job-2')
    await flush()
    const assets = useArtistStore.getState().characterAssets
    expect(assets[0].appearances.at(-1)?.sheetUrl).toBeNull()
    expect(assets[1].appearances.at(-1)?.sheetUrl).toBe('https://assets.test/job-2.webp')
    const messages = useGlobalChatStore.getState().messages.map(message => message.content)
    expect(messages.some(message => message.includes('코마츠') && message.includes('완료'))).toBe(true)
    expect(messages.some(message => message.includes('쿄타로') && message.includes('완료'))).toBe(false)
    expect(useGlobalChatStore.getState().deferredProposals[0].target).toContain('쿄타로')
    expect(useGlobalChatStore.getState().deferredProposals[0].target).not.toContain('코마츠')
    finishAll()
    await expect(activeRun).resolves.toBe(true)
    expect(useGlobalChatStore.getState().deferredProposals).toHaveLength(0)
  })

  it('첫 이미지 생성이 실패해도 두 번째 인물의 접수와 완성은 유지하고 실패한 인물만 남긴다', async () => {
    await requestAndApprove()
    await vi.waitFor(() => expect(pollWaiters.size).toBe(2))
    pollWaiters.get('job-1')!(completion('job-1', 'Image generation failed'))
    pollWaiters.delete('job-1')
    finishAll()
    await expect(activeRun).resolves.toBe(false)
    expect(providerCalls).toHaveLength(2)
    expect(useArtistStore.getState().characterAssets[1].appearances.at(-1)?.sheetUrl).toBe('https://assets.test/job-2.webp')
    const remaining = useGlobalChatStore.getState().deferredProposals[0]
    expect(remaining.target).toContain('쿄타로')
    expect(remaining.target).not.toContain('코마츠')
    expect(remaining.jobIds).toEqual(['job-1'])
  })

  it('첫 인물의 접수가 거절되어도 두 번째 인물을 접수하고 다시 시도할 때 새 모습 행을 중복으로 만들지 않는다', async () => {
    rejectCharacter = 'kyotaro'
    await requestAndApprove()
    await vi.waitFor(() => expect(pollWaiters.size).toBe(1))
    expect(tables.generation_jobs.map(job => (job.target as Row).characterId)).toEqual(['komatsu'])
    finishAll()
    await expect(activeRun).resolves.toBe(false)
    const remaining = useGlobalChatStore.getState().deferredProposals[0]
    expect(remaining.target).toContain('쿄타로')
    expect(remaining.kind).toBe('artistRegenerateCharacterView')
    rejectCharacter = null
    useGlobalChatStore.getState().restorePendingProposal(remaining.id)
    await expect(useGlobalChatStore.getState().approvePendingProposal(remaining.id)).resolves.toBe(true)
    expect(tables.character_appearances.filter(row => !row.is_default)).toHaveLength(2)
    expect(tables.generation_jobs.map(job => (job.target as Row).characterId)).toEqual(['komatsu', 'kyotaro'])
  })

  it('두 작업이 접수된 동안 승인을 다시 눌러도 새 모습과 유료 요청을 중복해서 만들지 않는다', async () => {
    const id = await requestAndApprove()
    await vi.waitFor(() => expect(pollWaiters.size).toBe(2))
    await expect(useGlobalChatStore.getState().approvePendingProposal(id)).resolves.toBe(false)
    expect(useGlobalChatStore.getState().restorePendingProposal(id)).toBe(false)
    expect(providerCalls).toHaveLength(2)
    expect(tables.character_appearances.filter(row => !row.is_default)).toHaveLength(2)
  })

  it('모델이 첫 인물의 제안만 보내면 두 인물을 완료했다고 하지 않고 빠진 이름을 알려준다', async () => {
    answer(['kyotaro'])
    await useGlobalChatStore.getState().sendMessage('쿄타로와 코마츠의 잠옷입은 모습도 추가해줘')
    const proposal = useGlobalChatStore.getState().pendingProposal!
    expect(proposal.target).toContain('쿄타로')
    expect(proposal.target).not.toContain('코마츠')
    expect(useGlobalChatStore.getState().messages.at(-1)?.content).toContain('코마츠: 미처리')
    activeRun = useGlobalChatStore.getState().approvePendingProposal(proposal.id)
    await vi.waitFor(() => expect(tables.generation_jobs).toHaveLength(1))
    expect(providerCalls).toHaveLength(1)
  })

  it('첫 모습 저장 중 남은 요청을 취소하면 두 번째 인물의 새 모습과 이미지 접수는 시작하지 않는다', async () => {
    beforeAppearance = () => new Promise<void>(resolve => { releaseAppearance = resolve })
    const id = await requestAndApprove()
    await vi.waitFor(() => expect(releaseAppearance).not.toBeNull())
    useGlobalChatStore.getState().cancelDeferredProposal(id)
    beforeAppearance = null
    releaseAppearance!()
    finishImmediately = true
    await expect(activeRun).resolves.toBe(false)
    expect(providerCalls).toHaveLength(1)
    expect(tables.character_appearances.filter(row => !row.is_default).map(row => row.character_id)).toEqual(['kyotaro'])
    expect(useGlobalChatStore.getState().deferredProposals).toHaveLength(0)
  })
})
