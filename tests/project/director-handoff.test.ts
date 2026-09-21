// Director로 넘기기 전 저장된 씬·샷·필수 인물 이미지를 확인하고, 이동 저장이 실패하면 완료라고 알리지 않는다.
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), user: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.user }))

type Row = Record<string, unknown>
let rows: Record<string, Row[]>
let stage: string
let updateError: null | { message: string }
let updateReturnsEmpty: boolean
let concurrentStage: string | null
let readFailure: string | null
const writes: Array<{ table: string; patch: Row; filters: Record<string, unknown> }> = []
const reads: string[] = []

beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.mockResolvedValue({ id: 'owner' })
  stage = 'writer'; updateError = null; updateReturnsEmpty = false; concurrentStage = null; readFailure = null
  writes.length = 0; reads.length = 0
  rows = {
    workspaces: [{ id: 'workspace', owner_id: 'owner' }],
    writer_runs: [{ id: 'run', status: 'completed', created_at: '2026-09-10T10:00:00Z' }],
    scenes: Array.from({ length: 6 }, (_, i) => ({ scene_id: `scene-${i}` })),
    shots: Array.from({ length: 47 }, (_, i) => ({ shot_id: `shot-${i}` })),
    characters: [
      { character_id: 'hero', name: '쿄타로', entity_type: 'person', appearance: '학생', view_main: null },
      { character_id: 'friend', name: '코마츠', entity_type: 'person', appearance: '학생', view_main: null },
    ],
    character_appearances: [
      { character_id: 'hero', is_default: true, sheet_url: 'https://image.test/hero.png' },
      { character_id: 'friend', is_default: true, sheet_url: 'https://image.test/friend.png' },
    ],
    locations: [{ location_id: 'roof', name: '옥상', wide_shot: null }],
  }
  mocks.from.mockImplementation((table: string) => {
    let patch: Row | null = null
    let head = false
    let order: { column: string; ascending: boolean } | null = null
    let limit: number | null = null
    const filters: Record<string, unknown> = {}
    const query: Record<string, unknown> = {}
    const result = async () => {
      if (patch) {
        writes.push({ table, patch, filters: { ...filters } })
        if (updateError) return { data: null, error: updateError }
        if (concurrentStage) stage = concurrentStage
        if (updateReturnsEmpty || (filters.current_stage && filters.current_stage !== stage)) return { data: null, error: null }
        stage = String(patch.current_stage)
        return { data: { id: 'project', current_stage: stage }, error: null }
      }
      reads.push(table)
      if (readFailure === table) return { data: null, count: null, error: { message: 'Database read failed' } }
      let data = table === 'projects' ? [{ id: 'project', workspace_id: 'workspace', current_stage: stage }] : [...(rows[table] ?? [])]
      if (order) {
        const { column, ascending } = order
        data.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1))
      }
      if (limit !== null) data = data.slice(0, limit)
      return { data: head ? null : data, count: data.length, error: null }
    }
    query.select = (_columns: string, options?: { head?: boolean }) => { head = !!options?.head; return query }
    query.eq = (key: string, value: unknown) => { filters[key] = value; return query }
    query.order = (column: string, options: { ascending: boolean }) => { order = { column, ascending: options.ascending }; return query }
    query.limit = (value: number) => { limit = value; return query }
    query.update = (value: Row) => { patch = value; return query }
    query.maybeSingle = async () => {
      const value = await result()
      return { ...value, data: Array.isArray(value.data) ? value.data[0] ?? null : value.data }
    }
    query.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => result().then(resolve, reject)
    return query
  })
})

async function request(action: string = 'check', extra: Row = {}) {
  const { POST } = await import('@/app/api/project/[id]/handoff/route')
  const response = await POST(new Request('http://local/api/project/project/handoff', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetStage: 'director', action, locale: 'ko', ...extra }),
  }), { params: Promise.resolve({ id: 'project' }) })
  return { status: response.status, body: await response.json() }
}

it('Writer에서 바로 물어도 저장된 6씬·47샷과 두 인물 이미지가 준비되어 있으면 쓰기 없이 준비 완료를 알린다.', async () => {
  const result = await request()
  expect(result.status).toBe(200)
  expect(result.body).toMatchObject({ ready: true, counts: { scenes: 6, shots: 47 }, blockers: [] })
  expect(result.body.path).toBeUndefined()
  expect(result.body.warnings).toEqual([expect.objectContaining({ stage: 'artist', action: expect.any(String) })])
  expect(writes).toEqual([])
})

it('필수 인물 이미지가 없으면 누가 준비되지 않았는지와 Artist에서 할 일을 알려주고 이동하지 않는다.', async () => {
  rows.character_appearances = rows.character_appearances.slice(0, 1)
  const result = await request('move')
  expect(result.status).toBe(409)
  expect(result.body).toMatchObject({ ready: false, blockers: [expect.objectContaining({ stage: 'artist', label: expect.stringContaining('코마츠'), action: expect.any(String) })] })
  expect(result.body.path).toBeUndefined()
  expect(writes).toEqual([])
})

it('예전 외형 설명이 비어 있어도 기본 모습에 설명이 있는 인물은 이미지가 없으면 Director로 넘기지 않는다.', async () => {
  rows.characters[1].appearance = null
  rows.character_appearances[1] = {
    character_id: 'friend', is_default: true, appearance: '교복을 입은 학생', sheet_url: null,
  }
  const result = await request('move')
  expect(result.status).toBe(409)
  expect(result.body).toMatchObject({
    ready: false,
    blockers: [expect.objectContaining({ code: 'artist:friend:mainImage', label: expect.stringContaining('코마츠') })],
  })
  expect(result.body.path).toBeUndefined()
  expect(writes).toEqual([])
})

it.each(['running', 'failed', 'awaiting_scene_review'])('Writer가 아직 완료되지 않은 상태(%s)면 예전 씬·샷이 있어도 넘기지 않는다.', async status => {
  rows.writer_runs[0].status = status
  const result = await request('move')
  expect(result.status).toBe(409)
  expect(result.body.blockers).toContainEqual(expect.objectContaining({ stage: 'writer', action: expect.any(String) }))
  expect(writes).toEqual([])
})

it('Writer 완료 기록이 없거나 저장된 샷이 없으면 필요한 작업을 알리고 넘기지 않는다.', async () => {
  rows.writer_runs = []
  rows.shots = []
  const result = await request('move')
  expect(result.status).toBe(409)
  expect(result.body.ready).toBe(false)
  expect(result.body.counts.shots).toBe(0)
  expect(writes).toEqual([])
})

it('옛 Writer 실행이 완료되어도 가장 최근 실행이 진행 중이면 넘기지 않는다.', async () => {
  rows.writer_runs.push({ id: 'new-run', status: 'running', created_at: '2026-09-10T11:00:00Z' })
  const result = await request('move')
  expect(result.status).toBe(409)
  expect(result.body.blockers).toContainEqual(expect.objectContaining({ code: 'writer:active' }))
  expect(writes).toEqual([])
})

it('Writer 초안 확인을 기다리는 중이면 기다리라는 말 대신 초안을 확인하고 확정할 일을 알려준다.', async () => {
  rows.writer_runs[0].status = 'awaiting_confirmation'
  const result = await request('move')
  expect(result.status).toBe(409)
  expect(result.body.blockers).toContainEqual(expect.objectContaining({
    code: 'writer:confirmation', action: '초안을 확인한 뒤 확정해 주세요.',
  }))
  expect(writes).toEqual([])
})

it('예전 대표 이미지가 저장된 프로젝트도 기존 Artist와 같은 기준으로 준비 완료를 판단한다.', async () => {
  rows.character_appearances = []
  rows.characters.forEach(character => { character.view_main = `https://image.test/${character.character_id}.png` })
  const result = await request()
  expect(result.status).toBe(200)
  expect(result.body.ready).toBe(true)
})

it('Director 이동 준비 확인은 저장된 대사의 언어를 바꾸거나 한국어를 강제하지 않는다.', async () => {
  rows.shots[0].dialogue_lines = [{ characterId: 'hero', text: 'こんにちは' }]
  const result = await request('check', { locale: 'en' })
  expect(result.status).toBe(200)
  expect(rows.shots[0].dialogue_lines).toEqual([{ characterId: 'hero', text: 'こんにちは' }])
  expect(writes).toEqual([])
})

it('준비된 프로젝트는 Director 단계 저장을 확인한 뒤 실제 이동 경로를 반환한다.', async () => {
  const result = await request('move')
  expect(result.status).toBe(200)
  expect(result.body).toMatchObject({ ready: true, path: '/studio/director' })
  expect(writes).toEqual([{ table: 'projects', patch: { current_stage: 'director' }, filters: { id: 'project', current_stage: 'writer' } }])
})

it('이미 Editor까지 간 프로젝트는 Director로 이동해도 저장된 도달 단계를 뒤로 낮추지 않는다.', async () => {
  stage = 'editor'
  const result = await request('move')
  expect(result.status).toBe(200)
  expect(result.body.path).toBe('/studio/director')
  expect(stage).toBe('editor')
  expect(writes).toEqual([])
})

it('단계 저장이 거절되면 이동 경로나 성공 결과를 돌려주지 않는다.', async () => {
  updateError = { message: 'Permission denied' }
  const result = await request('move')
  expect(result.status).toBe(503)
  expect(result.body.error.code).toBe('handoff_save_failed')
  expect(result.body.path).toBeUndefined()
  expect(result.body.ready).not.toBe(true)
})

it('저장된 행이 없고 단계도 그대로면 이동에 성공했다고 알리지 않는다.', async () => {
  updateReturnsEmpty = true
  const result = await request('move')
  expect(result.status).toBe(409)
  expect(result.body.error.code).toBe('handoff_conflict')
  expect(result.body.path).toBeUndefined()
})

it('동시에 Editor로 이동했다면 재조회로 이를 확인하고 Director로 낮춰 저장하지 않는다.', async () => {
  concurrentStage = 'editor'
  const result = await request('move')
  expect(result.status).toBe(200)
  expect(result.body.path).toBe('/studio/director')
  expect(stage).toBe('editor')
  expect(reads.filter(table => table === 'projects')).toHaveLength(2)
})

it('준비 상태 조회가 실패하면 빈 씬·샷 수를 만들지 않고 확인 실패로 응답한다.', async () => {
  readFailure = 'character_appearances'
  const result = await request('move')
  expect(result.status).toBe(503)
  expect(result.body.error.code).toBe('handoff_check_failed')
  expect(result.body.counts).toBeUndefined()
  expect(writes).toEqual([])
})

it('다른 사람의 프로젝트에는 준비 상태를 읽거나 이동을 저장하지 않는다.', async () => {
  mocks.user.mockResolvedValue({ id: 'stranger' })
  const result = await request('move')
  expect(result.status).toBe(403)
  expect(reads).not.toContain('writer_runs')
  expect(writes).toEqual([])
})

it('프로젝트 소유권 조회가 실패하면 권한 없음으로 단정하지 않고 확인 실패로 응답한다.', async () => {
  readFailure = 'workspaces'
  const result = await request('move')
  expect(result.status).toBe(503)
  expect(result.body.error.code).toBe('handoff_check_failed')
  expect(reads).not.toContain('writer_runs')
  expect(writes).toEqual([])
})

it('로그인하지 않은 공유 방문자는 Director 이동을 확인하거나 저장하지 않는다.', async () => {
  mocks.user.mockResolvedValue(null)
  const result = await request('move')
  expect(result.status).toBe(401)
  expect(reads).toEqual([])
  expect(writes).toEqual([])
})

it('정해지지 않은 대상 단계나 동작은 실행하지 않는다.', async () => {
  const result = await request('delete', { targetStage: 'editor' })
  expect(result.status).toBe(400)
  expect(reads).toEqual([])
  expect(writes).toEqual([])
})
