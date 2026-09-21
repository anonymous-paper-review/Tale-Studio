// Artist 채팅으로 특정 모습의 설명·이름·시점·기본 지정·후보 복원을 UI와 같은 API로 저장하고 다시 읽어 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingProposal } from '@/lib/pending-proposal'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({ rows: {} as Record<string, Row[]>, from: vi.fn(), reads: [] as Array<{ table: string; filters: Row }> }))
const api = vi.hoisted(() => ({ calls: [] as Array<{ path: string; method: string; body: Row }>, fail: false, images: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: db.from }), createCatalogClient: vi.fn() }))

import { createStudioToolResources } from '@/stores/chat-tool-bindings'
import { createChatToolExecutor } from '@/lib/chat-tools/executor'
import { toolResourcesForStage } from '@/lib/chat-tools/protocol'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'

function seed() {
  api.calls.length = 0; api.fail = false; db.reads.length = 0
  db.rows = {
    characters: [{ project_id: 'p', character_id: 'char_doyun', name: '도윤', entity_type: 'person' }],
    character_appearances: [
      { id: 'ap-current', project_id: 'p', character_id: 'char_doyun', appearance_key: 'current', label: '현재', is_default: true, narrative_time: 'present', appearance: 'yellow raincoat', appearance_native: '노란 우비', sheet_url: 'https://owned/current.png' },
      { id: 'ap-young', project_id: 'p', character_id: 'char_doyun', appearance_key: 'young', label: '젊은 시절', is_default: false, narrative_time: 'past', appearance: 'young', appearance_native: '젊은 남성', sheet_url: 'https://owned/young.png' },
      { id: 'ap-other', project_id: 'other', character_id: 'char_doyun', appearance_key: 'young', label: '다른 프로젝트', is_default: false, narrative_time: null, appearance: 'x', appearance_native: 'x', sheet_url: null },
    ],
    character_image_candidates: [
      { id: 'cand-1', project_id: 'p', character_id: 'char_doyun', appearance_key: 'young', view: 'main', is_selected: false, url: 'https://owned/y1.png', generated_at: '2026-09-10T00:00:00Z' },
      { id: 'cand-2', project_id: 'p', character_id: 'char_doyun', appearance_key: 'young', view: 'main', is_selected: true, url: 'https://owned/young.png', generated_at: '2026-09-11T00:00:00Z' },
      { id: 'cand-back', project_id: 'p', character_id: 'char_doyun', appearance_key: 'young', view: 'back', is_selected: true, url: 'https://owned/back.png', generated_at: '2026-09-11T00:00:00Z' },
    ],
    locations: [{ project_id: 'p', location_id: 'loc_alley', name: '빗속 골목', visual_description: 'rainy alley', visual_description_native: '비 오는 골목', wide_shot: 'https://owned/alley.png' }],
    location_appearances: [
      { id: 'la-past', project_id: 'p', location_id: 'loc_alley', appearance_key: 'past', label: '과거 모습', narrative_time: 'past', visual_description: 'old alley', visual_description_native: '옛 골목', wide_shot: 'https://owned/alley-past.png' },
    ],
    location_image_candidates: [
      { id: 'lc-1', project_id: 'p', location_id: 'loc_alley', variant_key: null, view: 'wide_shot', is_selected: true, url: 'https://owned/alley.png', generated_at: '2026-09-11T00:00:00Z' },
      { id: 'lc-0', project_id: 'p', location_id: 'loc_alley', variant_key: null, view: 'wide_shot', is_selected: false, url: 'https://owned/alley0.png', generated_at: '2026-09-10T00:00:00Z' },
      { id: 'lc-past', project_id: 'p', location_id: 'loc_alley', variant_key: 'past', view: 'wide_shot', is_selected: true, url: 'https://owned/alley-past.png', generated_at: '2026-09-11T00:00:00Z' },
    ],
  }
}
function installDb() {
  db.from.mockImplementation((table: string) => {
    const filters: Row = {}
    let columns = '*'
    const execute = async () => {
      db.reads.push({ table, filters: { ...filters } })
      const rows = (db.rows[table] ?? []).filter(row => Object.entries(filters).every(([key, value]) => row[key] === value))
      return { data: rows.map(row => columns === '*' ? structuredClone(row) : Object.fromEntries(columns.split(',').map(key => [key, row[key]]))), error: null }
    }
    const query = {
      select: (value: string) => { columns = value; return query },
      eq: (key: string, value: unknown) => { filters[key] = value; return query },
      then: (resolve: (result: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(resolve),
    }
    return query
  })
}
/** UI 팝업이 부르는 API를 흉내 낸다. 성공하면 저장소 행을 바꿔 readSaved 재확인이 실제 값으로 이뤄진다. */
function installApi() {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input); const method = init?.method ?? 'GET'
    const body = JSON.parse(String(init?.body ?? '{}')) as Row
    api.calls.push({ path, method, body })
    if (api.fail) return Response.json({ error: '저장 거절' }, { status: 500 })
    const find = (table: string, f: Row) => (db.rows[table] ?? []).find(row => Object.entries(f).every(([k, v]) => row[k] === v))
    if (path === '/api/artist/character-appearance' && method === 'PATCH') {
      const row = find('character_appearances', { project_id: body.projectId, character_id: body.characterId, appearance_key: body.appearanceKey })
      if (!row) return Response.json({ error: 'not found' }, { status: 404 })
      if (body.appearance !== undefined) { row.appearance = `English: ${body.appearance}`; row.appearance_native = body.appearance }
      if (body.label !== undefined) row.label = body.label
      if (body.narrativeTime !== undefined) row.narrative_time = body.narrativeTime
      if (body.isDefault === true) for (const r of db.rows.character_appearances) if (r.project_id === body.projectId && r.character_id === body.characterId) r.is_default = r === row
      return Response.json({ appearance: row.appearance, appearanceNative: row.appearance_native, label: row.label, narrativeTime: row.narrative_time })
    }
    if (path === '/api/artist/location-appearance' && method === 'PATCH') {
      const row = find('location_appearances', { project_id: body.projectId, location_id: body.locationId, appearance_key: body.appearanceKey })
      if (!row) return Response.json({ error: 'not found' }, { status: 404 })
      if (body.visualDescription !== undefined) { row.visual_description = `English: ${body.visualDescription}`; row.visual_description_native = body.visualDescription }
      if (body.label !== undefined) row.label = body.label
      if (body.narrativeTime !== undefined) row.narrative_time = body.narrativeTime
      return Response.json({ label: row.label, narrativeTime: row.narrative_time, visualDescription: row.visual_description, visualDescriptionNative: row.visual_description_native })
    }
    if (path === '/api/artist/select-candidate' && method === 'POST') {
      const target = find('character_image_candidates', { id: body.candidateId, project_id: body.projectId, character_id: body.characterId, appearance_key: body.appearanceKey, view: body.view })
      if (!target) return Response.json({ error: 'candidate not in slot' }, { status: 404 })
      for (const r of db.rows.character_image_candidates) if (r.project_id === body.projectId && r.character_id === body.characterId && r.appearance_key === body.appearanceKey && r.view === body.view) r.is_selected = r === target
      find('character_appearances', { project_id: body.projectId, character_id: body.characterId, appearance_key: body.appearanceKey })!.sheet_url = target.url
      return Response.json({ url: target.url })
    }
    if (path === '/api/artist/select-location-candidate' && method === 'POST') {
      const variant = body.appearanceKey && body.appearanceKey !== 'default' ? body.appearanceKey : null
      const target = find('location_image_candidates', { id: body.candidateId, project_id: body.projectId, location_id: body.locationId, variant_key: variant })
      if (!target) return Response.json({ error: 'candidate not in slot' }, { status: 404 })
      for (const r of db.rows.location_image_candidates) if (r.project_id === body.projectId && r.location_id === body.locationId && r.variant_key === variant) r.is_selected = r === target
      if (variant) find('location_appearances', { project_id: body.projectId, location_id: body.locationId, appearance_key: variant })!.wide_shot = target.url
      else find('locations', { project_id: body.projectId, location_id: body.locationId })!.wide_shot = target.url
      return Response.json({ url: target.url })
    }
    api.images(path)
    throw new Error(`Unexpected request: ${method} ${path}`)
  }))
}
type Approved = NonNullable<Parameters<typeof createStudioToolResources>[0]['approved']>
function fixture(approved?: Approved) {
  const proposals: PendingProposal[] = []
  const signal = new AbortController().signal
  const resources = createStudioToolResources({ stage: 'artist', projectId: 'p', traceId: 't', signal, isCurrent: () => true, offerProposal: p => proposals.push(p), approved })
  const execute = createChatToolExecutor({ resources, signal, isCurrent: () => true })
  let n = 0
  return {
    resources, proposals,
    read: (resource: string, id?: string) => execute({ type: 'tool_use', id: `c${++n}`, name: 'read_project', input: { resource, ...(id ? { id } : {}) } }),
    edit: (resource: string, id: string, revision: string, patch: Row) => execute({ type: 'tool_use', id: `c${++n}`, name: 'edit_project', input: { resource, id, revision, patch } }),
  }
}
async function revision(f: ReturnType<typeof fixture>, resource: string, id: string) {
  const result = await f.read(resource, id)
  expect(result).toMatchObject({ status: 'ok' })
  return (result.records as Array<{ revision: string }>)[0].revision
}

beforeEach(() => {
  vi.clearAllMocks(); seed(); installDb(); installApi()
  useProjectStore.setState({ projectId: 'p', currentStage: 'artist', reachedStage: 'artist' })
  useArtistStore.setState({ characterAssets: [{ characterId: 'char_doyun', name: '도윤', entityType: 'person', views: {}, viewCandidates: {}, appearances: [
    { appearanceKey: 'current', label: '현재', isDefault: true, narrativeTime: 'present', sheetUrl: 'https://owned/current.png', portraitUrl: null, appearance: 'yellow raincoat', appearanceNative: '노란 우비', viewCandidates: {} },
    { appearanceKey: 'young', label: '젊은 시절', isDefault: false, narrativeTime: 'past', sheetUrl: 'https://owned/young.png', portraitUrl: null, appearance: 'young', appearanceNative: '젊은 남성', viewCandidates: {} },
  ] } as never], worldAssets: [{ locationId: 'loc_alley', name: '빗속 골목', sceneId: 's', wideShot: 'https://owned/alley.png', appearances: [{ appearanceKey: 'past', label: '과거 모습', narrativeTime: 'past', visualDescription: 'old alley', visualDescriptionNative: '옛 골목', wideShot: 'https://owned/alley-past.png', candidates: [] }] } as never] })
})
afterEach(() => { expect(api.images).not.toHaveBeenCalled(); vi.unstubAllGlobals() })

describe('Artist 채팅의 모습 관리', () => {
  it('Artist 채팅에만 모습 리소스가 열리고, 모든 모습의 설명·이름·시점·기본 여부·후보 목록을 저장소에서 읽는다', async () => {
    // 왜: 기본 모습만 읽던 characters 리소스로는 비기본 모습을 지정할 수 없었다.
    expect(toolResourcesForStage('artist')).toEqual(expect.arrayContaining(['appearances', 'background_appearances']))
    expect(toolResourcesForStage('writer')).not.toContain('appearances')
    const f = fixture()
    expect(await f.read('appearances')).toMatchObject({ status: 'ok', records: [
      { id: 'char_doyun/current', values: { characterId: 'char_doyun', appearanceKey: 'current', label: '현재', narrativeTime: 'present', isDefault: true, appearance: '노란 우비', hasImage: true, selectedCandidateId: null, candidateIds: [] } },
      { id: 'char_doyun/young', values: { characterId: 'char_doyun', appearanceKey: 'young', label: '젊은 시절', narrativeTime: 'past', isDefault: false, appearance: '젊은 남성', hasImage: true, selectedCandidateId: 'cand-2', candidateIds: ['cand-2', 'cand-1'] } },
    ] })
    expect(await f.read('background_appearances')).toMatchObject({ status: 'ok', records: [
      { id: 'loc_alley/default', values: { locationId: 'loc_alley', appearanceKey: 'default', isDefault: true, visualDescription: '비 오는 골목', hasImage: true, selectedCandidateId: 'lc-1', candidateIds: ['lc-1', 'lc-0'] } },
      { id: 'loc_alley/past', values: { locationId: 'loc_alley', appearanceKey: 'past', label: '과거 모습', narrativeTime: 'past', isDefault: false, visualDescription: '옛 골목', hasImage: true, selectedCandidateId: 'lc-past', candidateIds: ['lc-past'] } },
    ] })
    const young = (await f.read('appearances', 'char_doyun/young')).records as Array<{ values: Row }>
    expect(JSON.stringify(young)).not.toContain('https://')
    expect(db.reads.every(r => r.filters.project_id === 'p')).toBe(true)
    expect(api.calls).toEqual([])
  })

  it('기본이 아닌 모습의 설명은 승인 없이 그 모습 행만 저장하고 다시 읽어 확인한다', async () => {
    // 왜: UI 팝업에서 선택한 모습 설명을 편집하는 것과 같은 저장이다. 기본 모습·다른 프로젝트는 건드리지 않는다.
    const f = fixture()
    const patch = { appearance: '젊은 남성, 붉은 코트' }
    expect(await f.edit('appearances', 'char_doyun/young', await revision(f, 'appearances', 'char_doyun/young'), patch)).toMatchObject({ status: 'ok', saved: patch })
    expect(api.calls).toEqual([{ path: '/api/artist/character-appearance', method: 'PATCH', body: { projectId: 'p', characterId: 'char_doyun', appearanceKey: 'young', appearance: patch.appearance } }])
    expect(db.rows.character_appearances[0].appearance_native).toBe('노란 우비')
    expect(db.rows.character_appearances[2].appearance_native).toBe('x')
    expect(useArtistStore.getState().characterAssets[0].appearances[1].appearanceNative).toBe(patch.appearance)
    expect(f.proposals).toEqual([])
  })

  it('기본 모습의 설명은 원천이라 승인 카드를 거치고, 승인 뒤에만 저장한다', async () => {
    // 왜: 기본 모습은 Producer 원천과 같아 기존 characters.appearance와 같은 승인 규칙을 유지한다.
    const f = fixture()
    const patch = { appearance: '서른 살 남성, 파란 우비' }
    const rev = await revision(f, 'appearances', 'char_doyun/current')
    expect(await f.edit('appearances', 'char_doyun/current', rev, patch)).toMatchObject({ status: 'approval_required' })
    expect(api.calls).toEqual([])
    const approved = f.proposals.at(-1)!.payload.toolEdit as Approved
    const g = fixture(approved)
    expect(await g.edit('appearances', 'char_doyun/current', await revision(g, 'appearances', 'char_doyun/current'), patch)).toMatchObject({ status: 'ok', saved: patch })
    expect(api.calls.at(-1)).toMatchObject({ path: '/api/artist/character-appearance', body: { appearanceKey: 'current', appearance: patch.appearance } })
    expect(useArtistStore.getState().characterAssets[0].appearances[0].appearanceNative).toBe(patch.appearance)
  })

  it('모습 이름·시점을 바꾸고 기본 모습으로 지정하면 UI 팝업과 같은 API로 저장한다', async () => {
    // 왜: 09-09 조사에서 이 세 동작은 채팅 명령이 없었다.
    const f = fixture()
    const rename = { label: '어린 시절', narrativeTime: 'past' }
    expect(await f.edit('appearances', 'char_doyun/young', await revision(f, 'appearances', 'char_doyun/young'), rename)).toMatchObject({ status: 'ok', saved: rename })
    expect(api.calls.at(-1)).toMatchObject({ path: '/api/artist/character-appearance', method: 'PATCH', body: { characterId: 'char_doyun', appearanceKey: 'young', label: '어린 시절', narrativeTime: 'past' } })
    expect(useArtistStore.getState().characterAssets[0].appearances[1].label).toBe('어린 시절')
    expect(await f.edit('appearances', 'char_doyun/young', await revision(f, 'appearances', 'char_doyun/young'), { isDefault: true })).toMatchObject({ status: 'ok', saved: { isDefault: true } })
    expect(api.calls.at(-1)).toMatchObject({ body: { appearanceKey: 'young', isDefault: true } })
    expect(db.rows.character_appearances.map(r => [r.appearance_key, r.is_default])).toEqual([['current', false], ['young', true], ['young', false]])
    expect(useArtistStore.getState().characterAssets[0].appearances.map(a => a.isDefault)).toEqual([false, true])
    expect(f.resources.appearances.validate({ isDefault: true })).toEqual({ isDefault: true })
    expect(() => f.resources.appearances.validate({ isDefault: false })).toThrow()
    expect(() => f.resources.appearances.validate({ narrativeTime: 'yesterday' })).toThrow()
    expect(() => f.resources.appearances.validate({ appearance: '', label: 'x' })).toThrow()
  })

  it('이전 후보를 선택본으로 되돌리면 새로 그리지 않고 그 슬롯의 후보만 바꾼다', async () => {
    // 왜: 후보 History 되돌리기는 UI에만 있었다. 목록 밖 후보는 거절한다.
    const f = fixture()
    expect(await f.edit('appearances', 'char_doyun/young', await revision(f, 'appearances', 'char_doyun/young'), { selectedCandidateId: 'cand-1' })).toMatchObject({ status: 'ok', saved: { selectedCandidateId: 'cand-1' } })
    expect(api.calls.at(-1)).toEqual({ path: '/api/artist/select-candidate', method: 'POST', body: { projectId: 'p', characterId: 'char_doyun', appearanceKey: 'young', view: 'main', candidateId: 'cand-1' } })
    expect(db.rows.character_image_candidates.map(r => [r.id, r.is_selected])).toEqual([['cand-1', true], ['cand-2', false], ['cand-back', true]])
    expect(useArtistStore.getState().characterAssets[0].appearances[1].sheetUrl).toBe('https://owned/y1.png')
    expect(await f.edit('appearances', 'char_doyun/young', await revision(f, 'appearances', 'char_doyun/young'), { selectedCandidateId: 'cand-back' })).toMatchObject({ status: 'invalid_input' })
    expect(api.calls.filter(c => c.path === '/api/artist/select-candidate')).toHaveLength(1)
    expect(await f.edit('background_appearances', 'loc_alley/default', await revision(f, 'background_appearances', 'loc_alley/default'), { selectedCandidateId: 'lc-0' })).toMatchObject({ status: 'ok', saved: { selectedCandidateId: 'lc-0' } })
    expect(api.calls.at(-1)).toMatchObject({ path: '/api/artist/select-location-candidate', method: 'POST', body: { projectId: 'p', locationId: 'loc_alley', candidateId: 'lc-0' } })
    expect(useArtistStore.getState().worldAssets[0].wideShot).toBe('https://owned/alley0.png')
  })

  it('배경의 변형 모습 설명·이름은 바로 저장하고, 기본 배경 설명은 승인 카드를 거친다', async () => {
    // 왜: 기본 배경은 locations 원천(승인), 변형은 location_appearances 행(UI 팝업 직접 편집)이다.
    const f = fixture()
    const patch = { visualDescription: '눈 덮인 옛 골목', label: '겨울' }
    expect(await f.edit('background_appearances', 'loc_alley/past', await revision(f, 'background_appearances', 'loc_alley/past'), patch)).toMatchObject({ status: 'ok', saved: patch })
    expect(api.calls.at(-1)).toMatchObject({ path: '/api/artist/location-appearance', method: 'PATCH', body: { locationId: 'loc_alley', appearanceKey: 'past', visualDescription: patch.visualDescription, label: '겨울' } })
    expect(useArtistStore.getState().worldAssets[0].appearances?.[0]).toMatchObject({ label: '겨울', visualDescriptionNative: patch.visualDescription })
    expect(await f.edit('background_appearances', 'loc_alley/default', await revision(f, 'background_appearances', 'loc_alley/default'), { visualDescription: '햇빛 드는 골목' })).toMatchObject({ status: 'approval_required' })
    expect(f.proposals.at(-1)!.payload.toolEdit).toMatchObject({ resource: 'background_appearances', id: 'loc_alley/default' })
    expect(() => f.resources.background_appearances.validate({ label: '기본' })).not.toThrow()
    expect(await f.edit('background_appearances', 'loc_alley/default', await revision(f, 'background_appearances', 'loc_alley/default'), { label: '기본' })).toMatchObject({ status: 'invalid_input' })
  })

  it('서버가 거절하면 저장 완료로 알리지 않고 저장소 값을 유지한다', async () => {
    // 왜: 승인 없는 직접 저장 경로일수록 실패를 성공으로 포장하면 안 된다.
    const f = fixture()
    const rev = await revision(f, 'appearances', 'char_doyun/young')
    api.fail = true
    expect(await f.edit('appearances', 'char_doyun/young', rev, { label: '새 이름' })).toMatchObject({ status: 'failed', retryable: true })
    expect(db.rows.character_appearances[1].label).toBe('젊은 시절')
  })
})
