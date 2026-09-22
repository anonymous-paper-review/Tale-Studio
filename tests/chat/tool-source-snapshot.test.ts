// Artist 원천 승인에 읽은 DB 스냅샷을 보존하고 저장 요청까지 전달한다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createStudioToolResources } from '@/stores/chat-tool-bindings'
import { createChatToolExecutor } from '@/lib/chat-tools/executor'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'

type Row = Record<string, unknown>
type ToolEdit = { resource: string; id: string; patch: Row; before: Row; sourceSnapshot?: Row }
type Approved = NonNullable<Parameters<typeof createStudioToolResources>[0]['approved']>

type Fixture = {
  rows: Record<string, Row[]>
  apiCalls: Array<{ path: string; method: string; body: Row }>
}
type ResourceFixture = Fixture & {
  resources: ReturnType<typeof createStudioToolResources>
  execute: ReturnType<typeof createChatToolExecutor>
  proposals: Array<{ payload: Record<string, unknown> }>
}

const db = vi.hoisted(() => ({
  rows: {} as Record<string, Row[]>,
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: db.from }),
  createCatalogClient: vi.fn(),
}))

function installDb() {
  db.from.mockImplementation((table: string) => {
    const filters: Row = {}
    let columns = '*'
    const execute = async (single = false) => {
      const rows = (db.rows[table] ?? []).filter(row => Object.entries(filters).every(([key, value]) => row[key] === value))
      const data = rows.map(row => columns === '*'
        ? structuredClone(row)
        : Object.fromEntries(columns.split(',').map(column => [column, row[column]])))
      return { data: single ? data[0] ?? null : data, error: null }
    }
    const query = {
      select: (value: string) => { columns = value; return query },
      eq: (key: string, value: unknown) => { filters[key] = value; return query },
      is: (key: string, value: unknown) => { filters[key] = value; return query },
      maybeSingle: () => execute(true),
      then: (resolve: (result: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(resolve),
    }
    return query
  })
}

function findRow(table: string, filters: Row) {
  return (db.rows[table] ?? []).find(row => Object.entries(filters).every(([key, value]) => row[key] === value))
}

function installApi(fixture: Fixture) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input)
    const method = String(init?.method ?? 'GET')
    const body = JSON.parse(String(init?.body ?? '{}')) as Row
    fixture.apiCalls.push({ path, method, body })
    if (path === '/api/artist/appearance' && method === 'POST') {
      const prop = findRow('props', { project_id: body.projectId, prop_id: body.characterId })
      const appearance = findRow('character_appearances', { project_id: body.projectId, character_id: body.characterId, is_default: true })
      const row = prop ?? appearance
      if (!row) return Response.json({ error: 'not found' }, { status: 404 })
      row.appearance = `English: ${String(body.appearance)}`
      row.appearance_native = body.appearance
      return Response.json({ appearance: row.appearance, appearanceNative: row.appearance_native })
    }
    if (path === '/api/artist/character-appearance' && method === 'PATCH') {
      const row = findRow('character_appearances', { project_id: body.projectId, character_id: body.characterId, appearance_key: body.appearanceKey })
      if (!row) return Response.json({ error: 'not found' }, { status: 404 })
      row.appearance = `English: ${String(body.appearance)}`
      row.appearance_native = body.appearance
      return Response.json({ appearance: row.appearance, appearanceNative: row.appearance_native })
    }
    if (path === '/api/artist/location' && method === 'PATCH') {
      const row = findRow('locations', { project_id: body.projectId, location_id: body.locationId })
      if (!row) return Response.json({ error: 'not found' }, { status: 404 })
      row.visual_description = `English: ${String(body.visualDescription)}`
      row.visual_description_native = body.visualDescription
      return Response.json({ visualDescription: row.visual_description, visualDescriptionNative: row.visual_description_native })
    }
    throw new Error(`이 테스트에서 허용하지 않은 네트워크 요청: ${method} ${path}`)
  }))
}

function seed(kind: 'character' | 'prop' | 'appearance' | 'background' | 'backgroundAppearance') {
  db.rows = {
    characters: kind === 'character' || kind === 'appearance'
      ? [{ project_id: 'p-source-snapshot', character_id: 'character-1', name: '옥화', role: 'supporting', description: '책을 좋아한다', entity_type: 'person' }]
      : [],
    character_appearances: kind === 'character' || kind === 'appearance'
      ? [{ project_id: 'p-source-snapshot', character_id: 'character-1', appearance_key: 'current', label: '현재', is_default: true, appearance: 'black hair', appearance_native: '검은 머리', updated_at: 'appearance-v1' }]
      : [],
    props: kind === 'prop'
      ? [{ project_id: 'p-source-snapshot', prop_id: 'prop-1', name: '우산', description: '낡은 우산', appearance: 'blue umbrella', appearance_native: '파란 우산', updated_at: 'prop-v1' }]
      : [],
    locations: kind === 'background' || kind === 'backgroundAppearance'
      ? [{ project_id: 'p-source-snapshot', location_id: 'location-1', name: '교실', visual_description: 'dark classroom', visual_description_native: '어두운 교실', updated_at: 'location-v1' }]
      : [],
    character_image_candidates: [],
    location_appearances: [],
    location_image_candidates: [],
  }
}

function fixture(kind: Parameters<typeof seed>[0], approved?: ToolEdit): ResourceFixture {
  seed(kind)
  installDb()
  const result: Fixture = { rows: db.rows, apiCalls: [] }
  const proposals: Array<{ payload: Record<string, unknown> }> = []
  const options = {
    stage: 'artist' as const,
    projectId: 'p-source-snapshot',
    traceId: 'trace-source-snapshot',
    signal: new AbortController().signal,
    isCurrent: () => true,
    offerProposal: (proposal: { payload: Record<string, unknown> }) => {
      proposals.push(proposal)
    },
    ...(approved ? { approved: approved as Approved } : {}),
  }
  const resources = createStudioToolResources(options)
  const execute = createChatToolExecutor({ resources, signal: options.signal, isCurrent: options.isCurrent })
  return Object.assign(result, { resources, execute, proposals })
}

async function readRevision(
  f: ReturnType<typeof fixture>,
  resource: string,
  id: string,
) {
  const result = await f.execute({ type: 'tool_use', id: `read-${resource}`, name: 'read_project', input: { resource, id } })
  expect(result).toMatchObject({ status: 'ok' })
  const record = (result.records as Array<{ id: string; revision: string }>).find(item => item.id === id)
  expect(record).toBeDefined()
  return record!.revision
}

beforeEach(() => {
  vi.clearAllMocks()
  useProjectStore.setState({ projectId: 'p-source-snapshot', currentStage: 'artist', reachedStage: 'artist', projectLocale: 'ko' })
  useArtistStore.setState({ characterAssets: [], worldAssets: [], sceneManifest: null })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

it('네 가지 Artist 원천 승인 리소스는 원시 DB 스냅샷을 카드와 API 본문에 그대로 전달한다', async () => {
  // 왜: 화면에 번역된 값만 남기면 확인 뒤 원천 행이 바뀌었는지 검사할 수 없고 옛 승인이 새 수정을 덮을 수 있다.
  const cases = [
    {
      kind: 'character' as const, resource: 'characters', id: 'character-1', patch: { appearance: '붉은 머리' },
      sourceSnapshot: { table: 'character_appearances', values: { appearance_key: 'current', is_default: true, appearance: 'black hair', appearance_native: '검은 머리', updated_at: 'appearance-v1' } },
      path: '/api/artist/appearance', method: 'POST',
    },
    {
      kind: 'prop' as const, resource: 'characters', id: 'prop-1', patch: { appearance: '붉은 우산' },
      sourceSnapshot: { table: 'props', values: { appearance: 'blue umbrella', appearance_native: '파란 우산', updated_at: 'prop-v1' } },
      path: '/api/artist/appearance', method: 'POST',
    },
    {
      kind: 'appearance' as const, resource: 'appearances', id: 'character-1/current', patch: { appearance: '서른 살 남성' },
      sourceSnapshot: { table: 'character_appearances', values: { appearance_key: 'current', is_default: true, appearance: 'black hair', appearance_native: '검은 머리', updated_at: 'appearance-v1' } },
      path: '/api/artist/character-appearance', method: 'PATCH',
    },
    {
      kind: 'background' as const, resource: 'backgrounds', id: 'location-1', patch: { visualDescription: '밝은 교실' },
      sourceSnapshot: { table: 'locations', values: { visual_description: 'dark classroom', visual_description_native: '어두운 교실', updated_at: 'location-v1' } },
      path: '/api/artist/location', method: 'PATCH',
    },
    {
      kind: 'backgroundAppearance' as const, resource: 'background_appearances', id: 'location-1/default', patch: { visualDescription: '밝은 교실' },
      sourceSnapshot: { table: 'locations', values: { visual_description: 'dark classroom', visual_description_native: '어두운 교실', updated_at: 'location-v1' } },
      path: '/api/artist/location', method: 'PATCH',
    },
  ]

  for (const testCase of cases) {
    const pending = fixture(testCase.kind)
    const revision = await readRevision(pending, testCase.resource, testCase.id)
    const read = await pending.execute({ type: 'tool_use', id: `edit-${testCase.resource}`, name: 'edit_project', input: {
      resource: testCase.resource, id: testCase.id, revision, patch: testCase.patch,
    } })
    expect(read).toMatchObject({ status: 'approval_required' })
    const proposal = pending.proposals.at(-1)!
    const toolEdit = proposal.payload.toolEdit as ToolEdit
    expect(toolEdit).toMatchObject({ resource: testCase.resource, id: testCase.id, patch: testCase.patch, sourceSnapshot: testCase.sourceSnapshot })

    const approved = fixture(testCase.kind, toolEdit)
    const approvedRevision = await readRevision(approved, testCase.resource, testCase.id)
    installApi(approved)
    const saved = await approved.execute({ type: 'tool_use', id: `approved-${testCase.resource}`, name: 'edit_project', input: {
      resource: testCase.resource, id: testCase.id, revision: approvedRevision, patch: testCase.patch,
    } })

    expect(saved).toMatchObject({ status: 'ok' })
    expect(approved.apiCalls).toContainEqual({
      path: testCase.path,
      method: testCase.method,
      body: expect.objectContaining({ projectId: 'p-source-snapshot', ...testCase.patch, sourceSnapshot: testCase.sourceSnapshot }),
    })
  }
})

it('현재 표시값이 같아도 원천 스냅샷의 updated_at이 바뀌면 수정하지 않는다', async () => {
  // 왜: 원천 값이 A에서 B를 거쳐 다시 A가 되어도 updated_at이 다르면 예전 승인으로 저장하면 안 된다.
  const f = fixture('background')
  const revision = await readRevision(f, 'backgrounds', 'location-1')
  db.rows.locations[0].updated_at = 'location-v2'

  const result = await f.execute({ type: 'tool_use', id: 'stale-edit', name: 'edit_project', input: {
    resource: 'backgrounds', id: 'location-1', revision, patch: { visualDescription: '밝은 교실' },
  } })

  expect(result).toMatchObject({ status: 'stale_state' })
  expect(f.proposals).toEqual([])
  expect(f.apiCalls).toEqual([])
})

it('필수 원천 필드가 누락되면 승인 조건 없이 편집하지 않고 조회 실패로 알린다', async () => {
  const f = fixture('background')
  delete db.rows.locations[0].updated_at
  const result = await f.execute({
    type: 'tool_use', id: 'incomplete-source', name: 'read_project',
    input: { resource: 'backgrounds', id: 'location-1' },
  })
  expect(result).toMatchObject({ status: 'read_failed' })
  expect(f.proposals).toEqual([])
  expect(f.apiCalls).toEqual([])
})
