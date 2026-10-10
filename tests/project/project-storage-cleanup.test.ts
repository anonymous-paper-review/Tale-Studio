// 프로젝트를 지우면 데이터베이스 행과 함께 그 프로젝트의 보관함 파일(그림·영상·업로드 원본)도 사라진다
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 개인정보 처리방침 §1: "Kept while the project exists; deleted when you delete the project".
//   종전 DELETE /api/project/[id] 는 delete_project_deep 으로 DB 만 지우고 보관함 파일을 남겼다.
//   파일이 어디 쌓이는지는 업로드 경로가 정하므로, 그 경로 규칙 자체를 여기서 고정한다.

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('@/lib/storage/media', () => ({ mediaList: mocks.list, mediaRemove: mocks.remove }))

import { deleteProjectDeep, projectStoragePrefixes } from '@/lib/project/delete-project'
import { storageKeySegment } from '@/lib/storage/key-segment'

const WORKSPACE = '00000000-0000-4000-8000-00000000aaaa'
const PROJECT = '11111111-2222-4333-8444-555555555555'
const OTHER_PROJECT = '99999999-8888-4777-8666-555555555555'
const USER = 'user-1'

/** 보관함 대신 쓰는 가짜 객체 목록. list 는 폴더를 id:null 로 돌려준다(실제 SDK 사양). */
let storage: Set<string>

function listing(prefix: string) {
  const entries = new Map<string, boolean>()
  for (const path of storage) {
    if (!path.startsWith(`${prefix}/`)) continue
    const rest = path.slice(prefix.length + 1)
    const slash = rest.indexOf('/')
    if (slash === -1) entries.set(rest, true)
    else entries.set(rest.slice(0, slash), false)
  }
  return [...entries].map(([name, isFile]) => ({ name, id: isFile ? `id-${name}` : null }))
}

function rows(table: string, data: unknown) {
  const result = { data, error: null }
  const chain = {
    select: () => chain,
    insert: (values: unknown) => {
      inserted.push({ table, values })
      return Promise.resolve({ data: null, error: null })
    },
    eq: () => chain,
    maybeSingle: async () => result,
    delete: () => ({
      eq: async (column: string, value: unknown) => {
        deleted.push({ table, column, value })
        return { data: null, error: null }
      },
    }),
  }
  return chain
}

let inserted: { table: string; values: unknown }[]
let deleted: { table: string; column: string; value: unknown }[]

beforeEach(() => {
  vi.clearAllMocks()
  inserted = []
  deleted = []
  storage = new Set([
    `${WORKSPACE}/${PROJECT}/shots/sh_01_previz.mp4`,
    `${WORKSPACE}/${PROJECT}/characters/${storageKeySegment('char-1')}/front.png`,
    `${WORKSPACE}/${PROJECT}/uploads/up-1/original.png`,
    `${storageKeySegment(WORKSPACE)}/${storageKeySegment(PROJECT)}/editor/title/t1.png`,
    `${WORKSPACE}/${OTHER_PROJECT}/shots/sh_01_previz.mp4`,
    `${storageKeySegment(WORKSPACE)}/${storageKeySegment(OTHER_PROJECT)}/editor/title/t1.png`,
  ])
  mocks.from.mockImplementation((table: string) => {
    if (table === 'projects') return rows(table, { id: PROJECT, workspace_id: WORKSPACE })
    if (table === 'workspaces') return rows(table, { owner_id: USER })
    if (table === 'server_errors') return rows(table, null)
    if (table === 'llm_calls' || table === 'scene_character_appearance_overrides') return rows(table, null)
    throw new Error(`Unexpected table: ${table}`)
  })
  mocks.rpc.mockResolvedValue({ data: 'ok', error: null })
  mocks.list.mockImplementation(async (prefix: string) => ({ data: listing(prefix), error: null }))
  mocks.remove.mockImplementation(async (paths: string[]) => {
    for (const path of paths) storage.delete(path)
    return { data: paths.map((name) => ({ name })), error: null }
  })
})

describe('프로젝트를 지울 때 보관함 파일까지 지운다', () => {
  // 왜: 개인정보 처리방침은 프로젝트를 지우면 그 자료를 지운다고 약속한다. 정상 경로 고정.
  it('프로젝트를 지우면 그 프로젝트 폴더의 파일을 모두 지운다', async () => {
    const result = await deleteProjectDeep({ projectId: PROJECT, userId: USER })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect([...storage].some((path) => path.includes(PROJECT))).toBe(false)
    expect(result.removedPaths).toHaveLength(4)
    expect(result.leftoverPaths).toEqual([])
  })

  // 왜: 경로 규칙을 잘못 읽으면 지우라고 한 적 없는 다른 프로젝트의 결과물이 함께 사라진다.
  it('다른 프로젝트 폴더의 파일은 지우지 않는다', async () => {
    await deleteProjectDeep({ projectId: PROJECT, userId: USER })

    expect([...storage].sort()).toEqual([
      `${WORKSPACE}/${OTHER_PROJECT}/shots/sh_01_previz.mp4`,
      `${storageKeySegment(WORKSPACE)}/${storageKeySegment(OTHER_PROJECT)}/editor/title/t1.png`,
    ].sort())
  })

  // 왜: 업로드 경로가 두 규칙(원본 id · 해시 id)으로 갈려 있어 한쪽만 지우면 파일이 조용히 남는다.
  it('프로젝트 파일이 쌓이는 폴더는 원본 id 와 해시 id 두 가지다', () => {
    const prefixes = projectStoragePrefixes(WORKSPACE, PROJECT)
    const samples = [
      `${WORKSPACE}/${PROJECT}/videos/clip-1/job-1.jpg`,
      `${WORKSPACE}/${PROJECT}/uploads/up-1/original.png`,
      `${WORKSPACE}/${PROJECT}/rough-blockouts/1-abc.png`,
      `${storageKeySegment(WORKSPACE)}/${storageKeySegment(PROJECT)}/editor/title/t1.png`,
    ]

    for (const sample of samples) {
      expect(prefixes.some((prefix) => sample.startsWith(`${prefix}/`))).toBe(true)
    }
    expect(prefixes.some((prefix) => `${WORKSPACE}/${OTHER_PROJECT}/shots/a.png`.startsWith(`${prefix}/`))).toBe(false)
    // 공용 자산(템플릿·스타일 앵커)은 특정 프로젝트의 것이 아니라 포함되지 않는다.
    expect(prefixes.some((prefix) => 'templates/style-anchor-abc.png'.startsWith(`${prefix}/`))).toBe(false)
  })

  // 왜: 인물·영상 파일은 폴더 안에 또 폴더로 쌓인다. 한 겹만 훑으면 깊은 파일이 남는다.
  it('하위 폴더 안쪽의 파일도 지운다', async () => {
    const deep = `${WORKSPACE}/${PROJECT}/characters/${storageKeySegment('char-1')}/front.png`
    expect(storage.has(deep)).toBe(true)

    const result = await deleteProjectDeep({ projectId: PROJECT, userId: USER })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.removedPaths).toContain(deep)
    expect(storage.has(deep)).toBe(false)
  })

  // 왜: 보관함이 일부 경로를 거절할 때(권한·일시 오류) 그 경로를 잃으면 나중에 치울 수 없다.
  it('파일 일부를 지우지 못하면 데이터베이스는 지우고 남은 경로를 기록한다', async () => {
    const stuck = `${WORKSPACE}/${PROJECT}/uploads/up-1/original.png`
    mocks.remove.mockImplementation(async (paths: string[]) => {
      if (paths.includes(stuck)) return { data: null, error: { message: 'permission denied' } }
      for (const path of paths) storage.delete(path)
      return { data: paths.map((name) => ({ name })), error: null }
    })

    const result = await deleteProjectDeep({ projectId: PROJECT, userId: USER })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.leftoverPaths).toContain(stuck)
    expect(mocks.rpc).toHaveBeenCalledWith('delete_project_deep', { p_project_id: PROJECT, p_user_id: USER })
    const record = inserted.find((row) => row.table === 'server_errors')
    expect(JSON.stringify(record?.values)).toContain(stuck)
  })

  // 왜: 없는 id 로 들어온 요청이 파일부터 지우면 되돌릴 수 없는 손실이 난다.
  it('없는 프로젝트를 지우려 하면 파일을 건드리지 않는다', async () => {
    mocks.from.mockImplementation((table: string) =>
      table === 'projects' ? rows(table, null) : rows(table, { owner_id: USER }))

    const result = await deleteProjectDeep({ projectId: PROJECT, userId: USER })

    expect(result.status).toBe('not_found')
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  // 왜: 소유권을 확인하기 전에 파일을 지우면 남의 결과물이 사라지고 복구할 수 없다.
  it('남의 프로젝트를 지우려 하면 파일을 건드리지 않는다', async () => {
    mocks.from.mockImplementation((table: string) =>
      table === 'projects'
        ? rows(table, { id: PROJECT, workspace_id: WORKSPACE })
        : rows(table, { owner_id: 'someone-else' }))

    const result = await deleteProjectDeep({ projectId: PROJECT, userId: USER })

    expect(result.status).toBe('forbidden')
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(deleted).toEqual([])
  })

  // 왜: 운영 DB(2026-10-11 조회)에서 llm_calls · scene_character_appearance_overrides 는 projects 외래키 cascade 가 없다.
  //   delete_project_deep 만 부르면 작가 AI 에 보낸 이야기 원문과 응답이 project_id 와 함께 남는다.
  it('프로젝트를 지우면 글 AI 입출력 기록과 씬별 인물 모습 설정도 지운다', async () => {
    const result = await deleteProjectDeep({ projectId: PROJECT, userId: USER })

    expect(result.status).toBe('ok')
    expect(deleted).toEqual(expect.arrayContaining([
      { table: 'llm_calls', column: 'project_id', value: PROJECT },
      { table: 'scene_character_appearance_overrides', column: 'project_id', value: PROJECT },
    ]))
  })
})
