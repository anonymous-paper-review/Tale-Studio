// 초안 생성 묶음도 전체 생성 자리가 한 칸 남으면 그 한 칸 안에서만 새 작업을 접수한다 — 동시성 진단용 가설, 제품 정책 확정 아님
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFileSync } from 'node:fs'

// 일반 스위트에서는 실행하지 않는다. 격리된 main 스냅샷에서 아래 출력 경로를 명시한 경우만 실행한다.
const audit = vi.hoisted(() => {
  const enabled = Boolean(process.env.CONCURRENCY_DRAFT_OUTPUT)
  const fakeEnvironment: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.invalid',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fake-concurrency-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'fake-concurrency-service',
    FAL_KEY: 'fake-concurrency-fal',
    FAL_KEYS: JSON.stringify([{ id: 'fake', key: 'fake-concurrency-fal', maxInflight: 68 }]),
  }
  const originalEnvironment = Object.fromEntries(Object.keys(fakeEnvironment).map((key) => [key, process.env[key]]))
  const originalFetch = globalThis.fetch
  const state = {
    limit: 68,
    queued: 0,
    initialQueued: 0,
    capacityReads: 0,
    networkAttempts: 0,
    providerRequests: [] as Array<{ requestId: string; model: string }>,
    jobs: [] as Array<Record<string, unknown>>,
    rows: {} as Record<string, Array<Record<string, unknown>>>,
    restoreEnvironment: () => {
      if (!enabled) return
      globalThis.fetch = originalFetch
      for (const [key, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    },
  }
  if (enabled) {
    Object.assign(process.env, fakeEnvironment)
    globalThis.fetch = async () => {
      state.networkAttempts += 1
      throw new Error('Concurrency draft audit forbids all external network requests')
    }
  }
  return state
})

// fal·DB·스토리지 경계는 전부 로컬이다. 제품의 trigger / world submit / quota 본체는 실제 함수를 호출한다.
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => queryFor(table),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'audit@example.invalid' } }, error: null }) } },
  },
}))
vi.mock('@/lib/admin', () => ({ isAdminEmail: () => false }))
vi.mock('@/lib/fal/keys', () => ({ totalMaxInflight: () => audit.limit }))
vi.mock('@/lib/generation-jobs', () => ({
  countQueuedJobsByUser: async () => audit.jobs.length,
  countQueuedJobsGlobal: async () => {
    audit.capacityReads += 1
    return audit.queued
  },
  hasQueuedCharacterViewJob: async () => false,
  hasQueuedWorldShotJob: async () => false,
  createGenerationJob: async (input: Record<string, unknown>) => {
    const job = { id: `fake-job-${audit.jobs.length + 1}`, ...input }
    audit.jobs.push(job)
    audit.queued += 1
    return job
  },
}))
vi.mock('@/lib/writer/llm/fal', () => ({
  falImageSubmit: async (input: { model: string }) => {
    const requestId = `fake-provider-${audit.providerRequests.length + 1}`
    audit.providerRequests.push({ requestId, model: input.model })
    return { request_id: requestId, model: input.model, fal_key_id: 'fake' }
  },
}))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => undefined }))
vi.mock('@/lib/storage/template-asset', () => ({ templateAssetUrl: async () => null }))
vi.mock('@/lib/style-anchor', () => ({ resolveStyleAnchor: async () => null }))
vi.mock('@/lib/writer/debug-events', () => ({ recordWriterObservabilityEvent: async () => undefined }))

import { triggerAssetDrafts } from '@/lib/artist/draft-trigger'

const PROJECT_ID = 'concurrency-draft-project'
const WORKSPACE_ID = 'concurrency-draft-workspace'
const observations: Array<Record<string, unknown>> = []

function queryFor(table: string) {
  if (!(table in audit.rows)) throw new Error(`Unexpected database table in draft audit: ${table}`)
  const filters: Array<{ key: string; value: unknown; isNull: boolean }> = []
  let rowLimit = Number.POSITIVE_INFINITY
  const rows = () => audit.rows[table].filter((row) => filters.every(({ key, value, isNull }) =>
    isNull ? row[key] == null : row[key] === value,
  )).slice(0, rowLimit)
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push({ key, value, isNull: false }); return query },
    is: (key: string, value: unknown) => { filters.push({ key, value, isNull: value === null }); return query },
    limit: (limit: number) => { rowLimit = limit; return query },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
  }
  return query
}

beforeEach(() => {
  audit.queued = 0
  audit.initialQueued = 0
  audit.capacityReads = 0
  audit.networkAttempts = 0
  audit.providerRequests = []
  audit.jobs = []
  // 기존 tests/artist/draft-trigger.test.ts의 row fixture와 동일한 빈 인물/배경 조건.
  audit.rows = {
    projects: [{ id: PROJECT_ID, workspace_id: WORKSPACE_ID, style_anchor_key: null, design_tokens: {
      l1: { art_style: 'ink storybook', shape_language: 'clear silhouettes' },
      palette: { primary: 'cobalt', secondary: 'ochre', accent: 'red' },
    } }],
    workspaces: [{ id: WORKSPACE_ID, owner_id: 'concurrency-draft-user' }],
    characters: [1, 2].map((id) => ({
      project_id: PROJECT_ID, character_id: `character-${id}`, name: `인물 ${id}`, role: 'supporting',
      costume: null, entity_type: 'person', origin: 'producer',
    })),
    character_appearances: [1, 2].map((id) => ({
      project_id: PROJECT_ID, character_id: `character-${id}`, appearance_key: 'current', is_default: true,
      appearance: 'silver-haired courier', costume: null, sheet_url: null, portrait_url: null,
    })),
    character_image_candidates: [],
    locations: [1, 2].map((id) => ({
      project_id: PROJECT_ID, location_id: `location-${id}`, name: `Harbor ${id}`,
      visual_description: 'misty harbor with black water', style_description: 'painted harbor',
      lighting_direction: 'moonlit backlight', lighting_sources: ['moon'], time_of_day: 'night',
      purpose: 'departure', props: ['dock ropes'], wide_shot: null,
    })),
  }
})

describe.skipIf(!process.env.CONCURRENCY_DRAFT_OUTPUT)('실제 main 초안 묶음의 전체 생성 자리 초과 진단', () => {
  it.each([68, 80])('전체 %i칸에서 한 칸만 남으면 인물·배경 초안도 그 한 칸 안에서 접수한다', async (limit) => {
    audit.limit = limit
    audit.initialQueued = limit - 1
    audit.queued = audit.initialQueued

    const result = await triggerAssetDrafts(PROJECT_ID)
    const accepted = audit.providerRequests.length
    observations.push({
      globalLimit: limit,
      initialQueued: audit.initialQueued,
      requestedCharacters: 2,
      requestedWorlds: 2,
      capacityReads: audit.capacityReads,
      mockProviderAccepted: accepted,
      recordedJobs: audit.jobs.length,
      simulatedFinalQueued: audit.queued,
      overConfiguredLimitBy: Math.max(0, audit.queued - limit),
      networkAttempts: audit.networkAttempts,
      result,
      targets: audit.jobs.map((job) => ({ kind: job.kind, target: job.target })),
    })

    // 테스트 계약은 실행 전에 고정: 네트워크 0회, 정상 경로가 접수한 만큼 기록, 전체 상한 미초과.
    // 마지막 단언의 실패가 이번 진단 결과다. 정책/기대값/제품 코드를 바꿔 통과시키지 않는다.
    expect(audit.networkAttempts).toBe(0)
    expect(result.characters.failed + result.worlds.failed).toBe(0)
    expect(accepted).toBeGreaterThan(0)
    expect(audit.jobs.length).toBe(accepted)
    expect(audit.queued, `한 칸만 남았지만 ${accepted}건 접수: ${audit.initialQueued} → ${audit.queued} / ${limit}`).toBeLessThanOrEqual(limit)
  })
})

afterAll(() => {
  try {
    const output = process.env.CONCURRENCY_DRAFT_OUTPUT
    if (!output) return
    writeFileSync(output, `${JSON.stringify({
      basis: 'origin/main 867cda835195315e6a73cb4f8d262ef736302ff9',
      executedAt: new Date().toISOString(),
      method: 'Actual triggerAssetDrafts, triggerCharacterDrafts, triggerWorldDrafts, submitWorldShotJob, checkGenerationCapacity; mocked in-memory DB/provider boundaries; no external generation',
      limitation: 'Final queued is an in-memory application-job count; it is not a live fal running-request measurement. This tests one multi-submit request, not SQL concurrency.',
      observations,
    }, null, 2)}\n`)
  } finally {
    audit.restoreEnvironment()
  }
})
