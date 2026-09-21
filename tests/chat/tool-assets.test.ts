// Writer와 Artist의 원천 조회·편집은 실제 저장본과 승인을 확인하고 이미지 생성 없이 끝낸다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '@/types/database'
import type { PendingProposal } from '@/lib/pending-proposal'

type Row = Record<string, unknown>
type Write = { table: string; filters: Row; patch: Row }
const db = vi.hoisted(() => ({
  rows: {} as Record<string, Row[]>, from: vi.fn(), rpc: vi.fn(),
  writes: [] as Write[], reads: [] as Array<{ table: string; columns: string; filters: Row }>,
  failWrites: false,
}))
const api = vi.hoisted(() => ({ calls: [] as Array<{ path: string; method: string; body: Row }>, images: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: db.from }), createCatalogClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: db.from, rpc: db.rpc } }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async (_req: Request, projectId: string) => ({ ok: true, projectId, userId: 'owner', viaShare: false }) }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  appearanceI18nFields: async (_id: string, text: string) => ({ appearance: `English: ${text}`, appearance_native: text, i18n_provenance: {} }),
  locationI18nFields: async (_id: string, text: string) => ({ visual_description: `English: ${text}`, visual_description_native: text, i18n_provenance: {} }),
}))

import { createStudioToolResources } from '@/stores/chat-tool-bindings'
import { createChatToolExecutor } from '@/lib/chat-tools/executor'
import { useArtistStore } from '@/stores/artist-store'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { PATCH as characterPATCH } from '@/app/api/artist/character/route'
import { POST as appearancePOST } from '@/app/api/artist/appearance/route'
import { PATCH as locationPATCH } from '@/app/api/artist/location/route'

// 스키마에 없는 role을 허용하는 관대한 목으로 실제 SELECT 오류를 숨기지 않는다.
const propsColumns = [
  'appearance', 'appearance_native', 'created_at', 'description', 'id', 'image_url',
  'name', 'origin', 'project_id', 'prop_id', 'source_hash', 'updated_at',
] satisfies Array<keyof Database['public']['Tables']['props']['Row']>

function seed() {
  db.writes.length = 0
  db.reads.length = 0
  api.calls.length = 0
  db.failWrites = false
  db.rows = {
    characters: [
      { project_id: 'p', character_id: 'person-1', name: '옥화', role: 'supporting', description: '책을 좋아한다', entity_type: 'person' },
      { project_id: 'p', character_id: 'person-2', name: '하늘', role: 'protagonist', description: '친구', entity_type: 'person' },
      { project_id: 'other', character_id: 'person-1', name: '다른 프로젝트', role: 'supporting', entity_type: 'person' },
    ],
    character_appearances: [
      { project_id: 'p', character_id: 'person-1', appearance_key: 'past', is_default: false, appearance: 'young', appearance_native: '어린 모습' },
      { project_id: 'p', character_id: 'person-1', appearance_key: 'current', is_default: true, appearance: 'black hair', appearance_native: '검은 머리' },
      { project_id: 'p', character_id: 'person-2', appearance_key: 'current', is_default: true, appearance: 'brown hair', appearance_native: '갈색 머리' },
      { project_id: 'other', character_id: 'person-1', appearance_key: 'current', is_default: true, appearance: 'other', appearance_native: '다른 프로젝트 외형' },
    ],
    props: [{ project_id: 'p', prop_id: 'prop-1', name: '우산', description: '낡은 우산', appearance: 'blue umbrella', appearance_native: '파란 우산' }],
    locations: [
      { project_id: 'p', location_id: 'loc-1', name: '교실', visual_description: 'old classroom', visual_description_native: '오래된 교실' },
      { project_id: 'p', location_id: 'loc-2', name: '도서관', visual_description: 'library', visual_description_native: '조용한 도서관' },
      { project_id: 'other', location_id: 'loc-1', name: '다른 교실', visual_description_native: '다른 프로젝트 교실' },
    ],
  }
}

function installDb() {
  db.from.mockImplementation((table: string) => {
    const filters: Row = {}
    let columns = '*'
    let patch: Row | undefined
    const execute = async (single = false) => {
      if (table === 'props' && columns !== '*' && columns.split(',').some(key => !(propsColumns as string[]).includes(key))) {
        return { data: null, error: { message: 'column props.role does not exist' } }
      }
      const rows = (db.rows[table] ?? []).filter(row => Object.entries(filters).every(([key, value]) => row[key] === value))
      if (patch) {
        if (db.failWrites) return { data: null, error: { message: '저장 거절' } }
        db.writes.push({ table, filters: { ...filters }, patch: structuredClone(patch) })
        for (const row of rows) Object.assign(row, patch)
      } else db.reads.push({ table, columns, filters: { ...filters } })
      const result = rows.map(row => columns === '*' ? structuredClone(row) : Object.fromEntries(columns.split(',').map(key => [key, row[key]])))
      return { data: single ? result[0] ?? null : result, error: null }
    }
    const query = {
      select: (value: string) => { columns = value; return query },
      eq: (key: string, value: unknown) => { filters[key] = value; return query },
      update: (value: Row) => { patch = value; return query },
      maybeSingle: () => execute(true),
      then: (resolve: (result: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(resolve),
    }
    return query
  })
  db.rpc.mockImplementation(async (name: string, args: Row) => {
    if (name !== 'update_person_with_default_appearance') throw new Error(`Unexpected RPC: ${name}`)
    if (db.failWrites) return { data: null, error: { message: '저장 거절' } }
    const filters = { project_id: args.p_project_id, character_id: args.p_character_id }
    const patch = args.p_identity_patch as Row
    db.writes.push({ table: 'characters', filters, patch: structuredClone(patch) })
    for (const row of db.rows.characters) if (Object.entries(filters).every(([key, value]) => row[key] === value)) Object.assign(row, patch)
    return { data: null, error: null }
  })
}

type Approved = NonNullable<Parameters<typeof createStudioToolResources>[0]['approved']>
function fixture(stage: 'writer' | 'artist', approved?: Approved) {
  const proposals: PendingProposal[] = []
  const signal = new AbortController().signal
  const resources = createStudioToolResources({ stage, projectId: 'p', traceId: 'trace-assets', signal, isCurrent: () => true, offerProposal: proposal => proposals.push(proposal), approved })
  const execute = createChatToolExecutor({ resources, signal, isCurrent: () => true })
  let callId = 0
  return {
    resources, proposals,
    read: (resource: string, id?: string) => execute({ type: 'tool_use', id: `call-${++callId}`, name: 'read_project', input: { resource, ...(id ? { id } : {}) } }),
    edit: (resource: string, id: string, revision: string, patch: Row) => execute({ type: 'tool_use', id: `call-${++callId}`, name: 'edit_project', input: { resource, id, revision, patch } }),
  }
}

async function revision(f: ReturnType<typeof fixture>, resource: string, id: string) {
  const result = await f.read(resource, id)
  expect(result).toMatchObject({ status: 'ok' })
  return (result.records as Array<{ revision: string }>)[0].revision
}

async function pending(f: ReturnType<typeof fixture>, resource: string, id: string, patch: Row) {
  const before = await revision(f, resource, id)
  expect(await f.edit(resource, id, before, patch)).toMatchObject({ status: 'approval_required' })
  const proposal = f.proposals.at(-1)!
  expect(proposal).toMatchObject({ projectId: 'p', payload: { toolEdit: { resource, id, patch, before: expect.any(Object) } } })
  return proposal.payload.toolEdit as Approved
}

beforeEach(() => {
  vi.clearAllMocks()
  seed()
  installDb()
  useProjectStore.setState({ projectId: 'p', currentStage: 'artist', reachedStage: 'artist' })
  useArtistStore.setState({ characterAssets: [], worldAssets: [], sceneManifest: null })
  useWriterStore.setState({ sceneManifest: null, shots: [] })
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input)
    const body = JSON.parse(String(init?.body ?? '{}')) as Row
    const method = init?.method ?? 'GET'
    api.calls.push({ path, method, body })
    const request = new Request(`http://localhost${path}`, { ...init, method })
    if (path === '/api/artist/character' && method === 'PATCH') return characterPATCH(request)
    if (path === '/api/artist/appearance' && method === 'POST') return appearancePOST(request)
    if (path === '/api/artist/location' && method === 'PATCH') return locationPATCH(request)
    api.images(path)
    throw new Error(`Unexpected request: ${method} ${path}`)
  }))
})
afterEach(() => {
  expect(api.images).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('채팅 도구의 인물과 배경 원천', () => {
  it('Writer와 Artist에서 인물의 기본 모습과 소품과 배경을 조회해도 저장하거나 생성하지 않는다', async () => {
    // 왜: 소품에 없는 열을 조회하거나 다른 모습·프로젝트를 섞으면 현재 원천을 확인할 수 없다.
    for (const stage of ['writer', 'artist'] as const) {
      const f = fixture(stage)
      const people = await f.read('characters')
      expect(people).toMatchObject({ status: 'ok', records: [
        { id: 'person-1', values: { name: '옥화', appearance: '검은 머리' } },
        { id: 'person-2', values: { name: '하늘', appearance: '갈색 머리' } },
        { id: 'prop-1', values: { name: '우산', description: '낡은 우산', appearance: '파란 우산' } },
      ] })
      expect(await f.read('backgrounds')).toMatchObject({ status: 'ok', records: [
        { id: 'loc-1', values: { name: '교실', visualDescription: '오래된 교실' } },
        { id: 'loc-2', values: { name: '도서관', visualDescription: '조용한 도서관' } },
      ] })
    }
    expect(db.reads.every(read => read.filters.project_id === 'p')).toBe(true)
    expect(db.writes).toEqual([])
    expect(api.calls).toEqual([])
  })

  it('인물 외형과 배경 설명을 바꾸겠다고 제안해도 승인 전에는 저장하지 않는다', async () => {
    // 왜: 두 단계 어느 쪽에서 요청해도 원천 편집 승인 없이 DB를 바꾸면 안 된다.
    for (const stage of ['writer', 'artist'] as const) {
      const f = fixture(stage)
      await pending(f, 'characters', 'person-1', { appearance: '붉은 머리' })
      await pending(f, 'backgrounds', 'loc-1', { visualDescription: '밝은 교실' })
    }
    expect(db.writes).toEqual([])
    expect(api.calls).toEqual([])
  })

  it('외형 변경을 승인하면 선택한 인물의 기본 모습이나 소품만 저장하고 다시 확인한다', async () => {
    // 왜: 인물의 과거 모습·다른 인물·다른 프로젝트까지 외형이 바뀌면 안 된다.
    for (const id of ['person-1', 'prop-1']) {
      seed()
      const before = structuredClone(db.rows)
      const patch = { appearance: id === 'person-1' ? '붉은 머리' : '붉은 우산' }
      const approved = await pending(fixture('writer'), 'characters', id, patch)
      const f = fixture('writer', approved)
      expect(await f.edit('characters', id, await revision(f, 'characters', id), patch)).toMatchObject({ status: 'ok', saved: patch })
      expect(api.calls).toEqual([{ path: '/api/artist/appearance', method: 'POST', body: { projectId: 'p', characterId: id, ...patch } }])
      expect(db.writes).toHaveLength(1)
      expect(db.writes[0].filters).toEqual(id === 'person-1' ? { project_id: 'p', character_id: id, appearance_key: 'current' } : { project_id: 'p', prop_id: id })
      expect(db.rows.character_appearances.filter(row => !(id === 'person-1' && row.project_id === 'p' && row.character_id === id && row.is_default)))
        .toEqual(before.character_appearances.filter(row => !(id === 'person-1' && row.project_id === 'p' && row.character_id === id && row.is_default)))
      if (id === 'person-1') expect(db.rows.props).toEqual(before.props)
      expect(f.proposals).toEqual([])
    }
  })

  it('배경 변경을 승인하면 해당 프로젝트의 선택한 배경만 저장하고 다시 확인한다', async () => {
    // 왜: 같은 이름이나 식별자를 가진 다른 배경까지 덮어쓰지 않아야 한다.
    const old = structuredClone(db.rows.locations)
    const patch = { visualDescription: '햇빛이 들어오는 교실' }
    const approved = await pending(fixture('artist'), 'backgrounds', 'loc-1', patch)
    const f = fixture('artist', approved)
    expect(await f.edit('backgrounds', 'loc-1', await revision(f, 'backgrounds', 'loc-1'), patch)).toMatchObject({ status: 'ok', saved: patch })
    expect(db.writes).toEqual([{ table: 'locations', filters: { project_id: 'p', location_id: 'loc-1' }, patch: {
      visual_description: `English: ${patch.visualDescription}`, visual_description_native: patch.visualDescription, i18n_provenance: {}, user_edited: true,
    } }])
    expect(db.rows.locations.slice(1)).toEqual(old.slice(1))
    expect(api.calls).toEqual([{ path: '/api/artist/location', method: 'PATCH', body: { projectId: 'p', locationId: 'loc-1', ...patch } }])
  })

  it('원천 저장 API가 실패하면 저장 완료로 알리지 않고 원래 값을 유지한다', async () => {
    // 왜: 승인 뒤 서버가 거절했는데 도구의 성공 응답만 남으면 사용자에게 거짓 완료가 된다.
    for (const [resource, id, patch, status] of [
      ['characters', 'person-1', { appearance: '붉은 머리' }, 'failed'],
      ['backgrounds', 'loc-1', { visualDescription: '밝은 교실' }, 'unknown_result'],
    ] as const) {
      seed()
      const approved = await pending(fixture('artist'), resource, id, patch)
      const old = structuredClone(db.rows)
      const f = fixture('artist', approved)
      const rev = await revision(f, resource, id)
      db.failWrites = true
      expect(await f.edit(resource, id, rev, patch)).toMatchObject({ status })
      expect(db.rows).toEqual(old)
      expect(db.writes).toEqual([])
      expect(api.calls).toHaveLength(1)
    }
  })

  it('승인 뒤 원천이 바뀌었으면 이전 승인을 새 내용에 재사용하지 않는다', async () => {
    // 왜: 승인 화면에서 본 내용과 실행 직전 내용이 다르면 다시 검토할 기회가 있어야 한다.
    const patch = { appearance: '붉은 머리' }
    const approved = await pending(fixture('artist'), 'characters', 'person-1', patch)
    db.rows.character_appearances[1].appearance_native = '이미 다른 사람이 바꾼 모습'
    const f = fixture('artist', approved)
    expect(await f.edit('characters', 'person-1', await revision(f, 'characters', 'person-1'), patch)).toMatchObject({ status: 'approval_required' })
    expect(f.proposals).toHaveLength(1)
    expect(db.writes).toEqual([])
    expect(api.calls).toEqual([])
  })

  it('인물 저장의 일시 서버 오류만 복구 가능한 실패로 알린다', async () => {
    // 왜: 서버 과부하에는 복구 기회를 주되 권한이나 입력 거절을 자동 재시도 대상으로 삼지 않는다.
    for (const status of [429, 503, 403, 422]) {
      const f = fixture('artist')
      const rev = await revision(f, 'characters', 'person-1')
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: '저장 거절' }, { status })))
      expect(await f.edit('characters', 'person-1', rev, { name: '새 이름' })).toMatchObject({
        status: status === 403 ? 'forbidden' : 'failed', retryable: status === 429 || status >= 500,
      })
      expect(db.writes).toEqual([])
    }
  })

  it('인물 역할은 서버가 지원하는 세 값만 허용하고 소품 설명은 역할 없이 저장한다', async () => {
    // 왜: 서버가 조용히 무시하는 역할을 지원한다고 안내하거나 없는 소품 역할 열을 저장하면 안 된다.
    const roles = fixture('artist').resources.characters
    for (const role of ['protagonist', 'antagonist', 'supporting']) expect(roles.validate({ role })).toEqual({ role })
    expect(() => roles.validate({ role: 'minor' })).toThrow()
    const f = fixture('artist')
    const patch = { name: '노란 우산', description: '주인공이 아끼는 우산' }
    expect(await f.edit('characters', 'prop-1', await revision(f, 'characters', 'prop-1'), patch)).toMatchObject({ status: 'ok', saved: patch })
    expect(api.calls).toEqual([{ path: '/api/artist/character', method: 'PATCH', body: { projectId: 'p', characterId: 'prop-1', ...patch } }])
    expect(db.writes).toEqual([{ table: 'props', filters: { project_id: 'p', prop_id: 'prop-1' }, patch }])
  })
})
