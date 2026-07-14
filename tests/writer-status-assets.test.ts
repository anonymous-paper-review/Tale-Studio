import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { STALE_QUEUED_MS } = vi.hoisted(() => ({ STALE_QUEUED_MS: 10 * 60 * 1000 }))
const NOW = new Date('2026-07-14T12:00:00.000Z')

const mocks = vi.hoisted(() => ({
  getRunStatusLight: vi.fn(),
  from: vi.fn(),
  db: {
    projects: [] as ProjectRow[],
    characters: [] as CharacterRow[],
    locations: [] as LocationRow[],
    candidates: [] as CandidateRow[],
    generationJobs: [] as GenerationJobRow[],
  },
}))

vi.mock('@/lib/writer/run-store', () => ({
  getRunStatusLight: mocks.getRunStatusLight,
  // 병합(#c4 ETA): 라우트가 cachedEta→estimateRunTotalMs 를 호출 → 테스트에선 "기록 없음"(null) stub.
  estimateRunTotalMs: vi.fn(async () => null),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/generation-jobs', () => ({ STALE_QUEUED_MS }))

import { GET } from '@/app/api/writer/status/[projectId]/route'

type WriterRunStatus = 'running' | 'completed' | 'failed'

interface ProjectRow {
  id: string
  design_tokens: Record<string, unknown> | null
}

interface CharacterRow {
  project_id: string
  character_id: string
  origin: 'producer' | 'writer'
  view_main: string | null
}

interface LocationRow {
  project_id: string
  location_id: string
  wide_shot: string | null
}

interface CandidateRow {
  project_id: string
  character_id: string
  view: string
}

interface GenerationJobRow {
  project_id: string
  kind: string
  status: string
  created_at: string
}

interface QueryFilter {
  op: 'eq' | 'not' | 'in' | 'is' | 'gte' | 'lt'
  column: string
  value: unknown
  operator?: string
}
interface StatusAssets {
  chars_ready: number
  chars_total: number
  worlds_ready: number
  worlds_total: number
  queued_count: number
  failed_count: number
  stalled: boolean
  images_ready: boolean
}

interface StatusBody {
  assets?: StatusAssets
  [key: string]: unknown
}


const PROJECT_ID = 'project-1'
const FRESH_CREATED_AT = new Date(NOW.getTime() - 1_000).toISOString()
const STALE_CREATED_AT = new Date(NOW.getTime() - STALE_QUEUED_MS - 1_000).toISOString()

describe('writer status assets block', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    mocks.getRunStatusLight.mockReset()
    mocks.getRunStatusLight.mockResolvedValue(runFixture())
    mocks.from.mockReset()
    mocks.from.mockImplementation((table: string) => queryFor(table))

    mocks.db.projects = [projectFixture({ design_tokens: { look: true } })]
    mocks.db.characters = []
    mocks.db.locations = []
    mocks.db.candidates = []
    mocks.db.generationJobs = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds opt-in assets with partial producer-character completion', async () => {
    mocks.db.characters = [
      characterFixture({ character_id: 'producer-ready', view_main: 'https://img/char.png' }),
      characterFixture({ character_id: 'producer-missing', view_main: null }),
      characterFixture({ character_id: 'writer-origin', origin: 'writer', view_main: null }),
    ]
    mocks.db.locations = [locationFixture({ wide_shot: 'https://img/world.png' })]
    mocks.db.generationJobs = [
      generationJobFixture({ kind: 'character_view', status: 'queued', created_at: FRESH_CREATED_AT }),
    ]

    const body = await statusBody('/api/writer/status/project-1?assets=1')

    expect(body.assets).toEqual({
      chars_ready: 1,
      chars_total: 2,
      worlds_ready: 1,
      worlds_total: 1,
      queued_count: 1,
      failed_count: 0,
      stalled: false,
      images_ready: false,
    })
  })

  it.each([
    {
      name: 'submit-failure no-job after design tokens persisted',
      runStatus: 'running' as WriterRunStatus,
      designTokens: { look: true },
      chars: [characterFixture({ character_id: 'missing-char', view_main: null })],
      locations: [locationFixture({ location_id: 'missing-world', wide_shot: null })],
    },
    {
      name: 'legacy completed project with zero jobs',
      runStatus: 'completed' as WriterRunStatus,
      designTokens: null,
      chars: [characterFixture({ character_id: 'legacy-char', view_main: null })],
      locations: [locationFixture({ location_id: 'legacy-world', wide_shot: null })],
    },
    {
      name: 'legacy partial project with no queued jobs',
      runStatus: 'completed' as WriterRunStatus,
      designTokens: null,
      chars: [
        characterFixture({ character_id: 'ready-char', view_main: 'https://img/char.png' }),
        characterFixture({ character_id: 'missing-char', view_main: null }),
      ],
      locations: [locationFixture({ location_id: 'ready-world', wide_shot: 'https://img/world.png' })],
    },
  ])('marks stalled for R3 dead-end: $name', async ({ runStatus, designTokens, chars, locations }) => {
    mocks.getRunStatusLight.mockResolvedValue(runFixture({ status: runStatus }))
    mocks.db.projects = [projectFixture({ design_tokens: designTokens })]
    mocks.db.characters = chars
    mocks.db.locations = locations

    const body = await statusBody('/api/writer/status/project-1?assets=1')
    const assets = expectAssets(body)

    expect(assets.queued_count).toBe(0)
    expect(assets.failed_count).toBe(0)
    expect(assets.images_ready).toBe(false)
    expect(assets.stalled).toBe(true)
  })

  it('counts stuck queued draft jobs as failed, not queued', async () => {
    mocks.db.characters = [characterFixture({ character_id: 'missing-char', view_main: null })]
    mocks.db.locations = [locationFixture({ wide_shot: 'https://img/world.png' })]
    mocks.db.generationJobs = [
      generationJobFixture({ kind: 'character_view', status: 'queued', created_at: STALE_CREATED_AT }),
    ]

    const body = await statusBody('/api/writer/status/project-1?assets=1')
    const assets = expectAssets(body)

    expect(assets.queued_count).toBe(0)
    expect(assets.failed_count).toBe(1)
    expect(assets.stalled).toBe(true)
  })

  it('grandfathers existing images and main candidates as ready', async () => {
    mocks.db.characters = [
      characterFixture({ character_id: 'view-main-ready', view_main: 'https://img/char.png' }),
      characterFixture({ character_id: 'candidate-ready', view_main: null }),
    ]
    mocks.db.candidates = [candidateFixture({ character_id: 'candidate-ready' })]
    mocks.db.locations = [locationFixture({ wide_shot: 'https://img/world.png' })]

    const body = await statusBody('/api/writer/status/project-1?assets=1')

    expect(body.assets).toEqual({
      chars_ready: 2,
      chars_total: 2,
      worlds_ready: 1,
      worlds_total: 1,
      queued_count: 0,
      failed_count: 0,
      stalled: false,
      images_ready: true,
    })
  })

  it('degrades asset query errors to zero assets without failing status', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.from.mockImplementation((table: string) =>
      table === 'characters' ? errorQuery('characters unavailable') : queryFor(table),
    )

    try {
      const body = await statusBody('/api/writer/status/project-1?assets=1')

      expect(body.assets).toEqual({
        chars_ready: 0,
        chars_total: 0,
        worlds_ready: 0,
        worlds_total: 0,
        queued_count: 0,
        failed_count: 0,
        stalled: false,
        images_ready: false,
      })
    } finally {
      warn.mockRestore()
    }
  })

  it('does not compute assets or query supabase without ?assets=1', async () => {
    const body = await statusBody('/api/writer/status/project-1')

    expect(body).not.toHaveProperty('assets')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})

async function statusBody(path: string): Promise<StatusBody> {
  const response = await GET(request(path), { params: Promise.resolve({ projectId: PROJECT_ID }) })
  expect(response.status).toBe(200)
  return (await response.json()) as StatusBody
}
function expectAssets(body: StatusBody): StatusAssets {
  expect(body.assets).toBeDefined()
  return body.assets as StatusAssets
}

function request(path: string): NextRequest {
  return new Request(`http://localhost${path}`) as NextRequest
}

function runFixture(overrides: Partial<{ status: WriterRunStatus }> = {}) {
  return {
    status: overrides.status ?? 'running',
    current_stage: 'v2Design',
    completed_units: 4,
    total_units: 8,
    error: null,
    updated_at: NOW.toISOString(),
    created_at: new Date(NOW.getTime() - 60_000).toISOString(),
    timings: null,
  }
}

function projectFixture(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: PROJECT_ID,
    design_tokens: { look: true },
    ...overrides,
  }
}

function characterFixture(overrides: Partial<CharacterRow> = {}): CharacterRow {
  return {
    project_id: PROJECT_ID,
    character_id: 'char-1',
    origin: 'producer',
    view_main: null,
    ...overrides,
  }
}

function locationFixture(overrides: Partial<LocationRow> = {}): LocationRow {
  return {
    project_id: PROJECT_ID,
    location_id: 'loc-1',
    wide_shot: null,
    ...overrides,
  }
}

function candidateFixture(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    project_id: PROJECT_ID,
    character_id: 'char-1',
    view: 'main',
    ...overrides,
  }
}

function generationJobFixture(overrides: Partial<GenerationJobRow> = {}): GenerationJobRow {
  return {
    project_id: PROJECT_ID,
    kind: 'character_view',
    status: 'queued',
    created_at: FRESH_CREATED_AT,
    ...overrides,
  }
}

function queryFor(table: string) {
  const filters: QueryFilter[] = []
  let wantsCount = false
  let head = false
  const query = {
    select: vi.fn((_columns?: string, options?: { count?: string; head?: boolean }) => {
      wantsCount = options?.count === 'exact'
      head = options?.head === true
      return query
    }),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push({ op: 'eq', column, value })
      return query
    }),
    not: vi.fn((column: string, operator: string, value: unknown) => {
      filters.push({ op: 'not', column, value, operator })
      return query
    }),
    in: vi.fn((column: string, value: unknown[]) => {
      filters.push({ op: 'in', column, value })
      return query
    }),
    is: vi.fn((column: string, value: unknown) => {
      filters.push({ op: 'is', column, value })
      return query
    }),
    gte: vi.fn((column: string, value: unknown) => {
      filters.push({ op: 'gte', column, value })
      return query
    }),
    lt: vi.fn((column: string, value: unknown) => {
      filters.push({ op: 'lt', column, value })
      return query
    }),
    maybeSingle: vi.fn(async () => ({ data: resolveRows(table, filters)[0] ?? null, error: null })),
    then: (
      resolve: (value: { data: unknown; count: number | null; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => {
      const rows = resolveRows(table, filters)
      return Promise.resolve({ data: head ? null : rows, count: wantsCount ? rows.length : null, error: null }).then(resolve, reject)
    },
  }
  return query
}
function errorQuery(message: string) {
  const error = { message }
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    not: vi.fn(() => query),
    in: vi.fn(() => query),
    is: vi.fn(() => query),
    gte: vi.fn(() => query),
    lt: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: null, error })),
    then: (
      resolve: (value: { data: null; count: null; error: { message: string } }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: null, count: null, error }).then(resolve, reject),
  }
  return query
}

function resolveRows(table: string, filters: QueryFilter[]): Array<Record<string, unknown>> {
  return rowsForTable(table).filter((row) => filters.every((filter) => matchesFilter(row, filter)))
}

function rowsForTable(table: string): Array<Record<string, unknown>> {
  if (table === 'projects') return mocks.db.projects as unknown as Array<Record<string, unknown>>
  if (table === 'characters') return mocks.db.characters as unknown as Array<Record<string, unknown>>
  if (table === 'locations') return mocks.db.locations as unknown as Array<Record<string, unknown>>
  if (table === 'character_image_candidates') return mocks.db.candidates as unknown as Array<Record<string, unknown>>
  if (table === 'generation_jobs') return mocks.db.generationJobs as unknown as Array<Record<string, unknown>>
  return []
}

function matchesFilter(row: Record<string, unknown>, filter: QueryFilter): boolean {
  const value = row[filter.column]
  switch (filter.op) {
    case 'eq':
      return value === filter.value
    case 'not':
      if (filter.operator === 'is' && filter.value === null) return value !== null && value !== undefined
      return value !== filter.value
    case 'in':
      return Array.isArray(filter.value) && filter.value.includes(value)
    case 'is':
      return filter.value === null ? value === null || value === undefined : value === filter.value
    case 'gte':
      return typeof value === 'string' && typeof filter.value === 'string' && value >= filter.value
    case 'lt':
      return typeof value === 'string' && typeof filter.value === 'string' && value < filter.value
  }
}
