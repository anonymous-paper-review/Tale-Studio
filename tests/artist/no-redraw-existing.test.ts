// 이미 그려진 배경은 자동 경로가 다시 요청해도 새로 그리지 않는다 — 다시 그리기 단추의 중복 과금 막기 (2026-10-27 디자이너 QA 1차)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import { resetActionGuard } from '@/lib/action-guard'
import { POST as generateWorld } from '@/app/api/artist/generate-world/route'
import type { SceneManifest } from '@/types/scene'

const mocks = vi.hoisted(() => ({ from: vi.fn(), submit: vi.fn(), reserveJob: vi.fn(), confirmReceipt: vi.fn(), rejectReservation: vi.fn(), gaveUp: vi.fn() }))
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
vi.mock('@/lib/generation-notify', () => ({ notifyGenerationComplete: vi.fn(), notifyGenerationFailed: vi.fn(), notifyGenerationGaveUp: mocks.gaveUp }))
vi.mock('@/lib/generation-jobs', () => ({
  reserveGenerationJob: mocks.reserveJob,
  confirmGenerationJobReceipt: mocks.confirmReceipt,
  rejectGenerationJobReservation: mocks.rejectReservation,
  hasQueuedWorldShotJob: async () => false,
  listFailedWorldShotJobs: async () => [],
  countFailedJobsForTarget: async () => 0,
  AUTO_GENERATION_GIVE_UP_THRESHOLD: 3,
}))

const DAY = 'https://example.test/roof-day.png'
const NIGHT = 'https://example.test/roof-night.png'
let rows: Record<string, Array<Record<string, unknown>>>

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

function manifest(): SceneManifest {
  return {
    characters: [],
    locations: [{ locationId: 'roof', name: 'Rooftop', visualDescription: 'sunlit rooftop', timeOfDay: 'day', lightingDirection: 'bright sunlight', lightingSources: ['noon sun'], styleDescription: 'sunny golden roof', props: ['antenna'], purpose: 'meeting' }],
    scenes: [{ sceneId: 'scene-1', location: 'roof', timeOfDay: 'day', mood: 'sunny', narrativeSummary: 'A meeting', originalTextQuote: '', charactersPresent: [], estimatedDurationSeconds: 30 }],
  }
}

const post = (body: Record<string, unknown>) => generateWorld(new Request('http://localhost/api/artist/generate-world', { method: 'POST', body: JSON.stringify(body) }))
const request = { projectId: 'project-1', locationId: 'roof', column: 'wide_shot', prompt: 'a rooftop' }

beforeEach(() => {
  vi.clearAllMocks()
  resetActionGuard()
  rows = {
    projects: [{ id: 'project-1', workspace_id: 'ws', design_tokens: null, style_anchor_key: null }],
    locations: [{ project_id: 'project-1', location_id: 'roof', name: '옥상', visual_description: 'sunlit rooftop', wide_shot: DAY }],
    location_appearances: [{ project_id: 'project-1', location_id: 'roof', appearance_key: 'night', label: '밤', narrative_time: 'present', visual_description: 'night roof', visual_description_native: '밤 옥상', wide_shot: NIGHT }],
  }
  mocks.from.mockImplementation(chain)
  mocks.submit.mockImplementation(async () => ({ request_id: 'request-1', model: 'fal-test', fal_key_id: 'key' }))
  mocks.reserveJob.mockImplementation(async (input) => ({ ...input, id: 'job-1', fal_key_id: 'key' }))
  mocks.confirmReceipt.mockResolvedValue(undefined)
  mocks.rejectReservation.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

describe('이미 그려진 배경', () => {
  it('이미 그려진 배경은 자동 경로가 다시 요청해도 새로 그리지 않는다', async () => {
    // 왜: 화면이 아직 모르는 사이 다 그려진 배경을 '안 나온 그림 다시 그리기'가 또 요청하면 같은 배경을 두 번 그리고 두 번 과금됐다(디자이너 QA 1차 #05 중복 과금 확인).
    const response = await post({ ...request, actor: 'auto' })

    await expect(response.json()).resolves.toMatchObject({ skipped: true, reason: 'exists' })
    expect(mocks.reserveJob).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('이미 그려진 배경의 다른 모습도 자동 경로는 다시 그리지 않는다', async () => {
    // 왜: 모습(밤 · 새벽)마다 그림이 따로 있다 — 그 모습의 그림이 있으면 자동으로 다시 그리지 않는다.
    const response = await post({ ...request, actor: 'auto', appearanceKey: 'night' })

    await expect(response.json()).resolves.toMatchObject({ skipped: true, reason: 'exists' })
    expect(mocks.reserveJob).not.toHaveBeenCalled()
  })

  it('사람이 누른 배경 다시 만들기는 그려진 그림이 있어도 새로 그린다', async () => {
    // 왜: 정상 경로 고정 — 마음에 안 드는 그림을 다시 만드는 건 사람이 고른 일이다.
    const response = await post({ ...request, actor: 'ui' })

    expect(response.status).toBe(200)
    expect(mocks.reserveJob).toHaveBeenCalledTimes(1)
  })

  it('자동 경로가 이미 그려진 배경을 요청하면 멈췄다는 안내 없이 조용히 끝낸다', async () => {
    // 왜: 이미 있는 그림을 건너뛴 것은 정상이다 — "자동 생성을 멈췄어요" 안내가 뜨면 고장으로 읽힌다.
    useProjectStore.setState({ projectId: 'project-1' })
    useArtistStore.setState({ sceneManifest: manifest(), worldAssets: [{ locationId: 'roof', name: '옥상', sceneId: 'scene-1', wideShot: null }], generatingLocations: [], error: null })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/artist/generate-world') return generateWorld(new Request(`http://localhost${url}`, init))
      if (url.startsWith('/api/artist/generation-status')) return Response.json({ failures: [], queuedMain: [], queuedWorld: [], worldFailures: [] })
      throw new Error(`Unexpected request: ${url}`)
    }))

    await useArtistStore.getState().generateWorldShot('roof', 'wideShot', undefined, 'auto')

    expect(mocks.gaveUp).not.toHaveBeenCalled()
    expect(mocks.reserveJob).not.toHaveBeenCalled()
  })
})
