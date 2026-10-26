// 시리즈 정보 조회가 주인에게만, 이어받은 인물 · 배경의 이번 화 쓰임과 앞 화 산문을 알려 준다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  from: vi.fn(),
  getActiveRun: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.getActiveRun }))

import { GET } from '@/app/api/project/[id]/series/route'

const PROJECT = 'p2'
const PREV = 'p1'
const USER = 'owner-1'
const WORKSPACE = 'ws-1'

/** 앞 화에서 복사해 온 기록 — 인물 둘(민호는 이번 화에 나오고 팀장은 안 나온다) · 배경 하나. */
const SERIES = {
  version: 1,
  prevProjectId: PREV,
  prevTitle: '자판기의 반란',
  copiedAt: '2026-10-26T00:00:00.000Z',
  characters: [
    { characterId: 'minho', name: '민호', role: 'protagonist', appearance: '20대 회사원', personality: ['소심함'], sheetUrl: 'https://img/minho.png', portraitUrl: null, styleId: 'anime' },
    { characterId: 'lead', name: '팀장', role: 'supporting', appearance: '40대', personality: [], sheetUrl: 'https://img/lead.png', portraitUrl: null, styleId: 'anime' },
  ],
  locations: [{ locationId: 'hall', name: '회사 복도', description: '형광등', wideShotUrl: 'https://img/hall.png', styleId: 'anime' }],
  voices: [{ character_id: 'minho', name: '민호', speech_style: '존댓말', formality: '높임', sentence_length: '짧음', verbal_tics: [], emotional_expression: '', taboo: '', example_lines: [] }],
  styleId: 'anime',
  format: 'landscape',
  dialogueLanguage: 'ko',
  continuesLastScene: true,
  copyFailures: ['소장'],
}

let db: Record<string, Array<Record<string, unknown>>>

/** supabase-js 체인 최소 스텁 — eq · in 걸개를 실제로 걸러 라우트가 어느 행을 읽는지 가린다. */
function queryFor(table: string) {
  const filters: Array<[string, unknown]> = []
  const orders: Array<[string, boolean]> = []
  let max: number | null = null
  const rows = () => {
    let out = (db[table] ?? []).filter((row) =>
      filters.every(([column, value]) => (Array.isArray(value) ? value.includes(row[column]) : row[column] === value)),
    )
    for (const [column, ascending] of [...orders].reverse()) {
      out = [...out].sort((a, b) => {
        const x = a[column] as string | number
        const y = b[column] as string | number
        return (x === y ? 0 : x < y ? -1 : 1) * (ascending ? 1 : -1)
      })
    }
    return max === null ? out : out.slice(0, max)
  }
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'not', 'is', 'gte', 'update']) q[name] = () => q
  q.eq = (column: string, value: unknown) => {
    filters.push([column, value])
    return q
  }
  q.in = (column: string, values: unknown[]) => {
    filters.push([column, values])
    return q
  }
  q.order = (column: string, opts?: { ascending?: boolean }) => {
    orders.push([column, opts?.ascending !== false])
    return q
  }
  q.limit = (n: number) => {
    max = n
    return q
  }
  q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null })
  q.single = q.maybeSingle
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve)
  return q
}

const request = (query = '') =>
  GET(new Request(`http://localhost/api/project/${PROJECT}/series${query}`), { params: Promise.resolve({ id: PROJECT }) })

beforeEach(() => {
  vi.clearAllMocks()
  db = {
    projects: [
      { id: PROJECT, workspace_id: WORKSPACE, series: SERIES, reference_project_id: PREV, style_anchor_key: 'real', custom_style_anchor: null },
      { id: PREV, workspace_id: WORKSPACE, series: null, reference_project_id: null, style_anchor_key: 'anime', custom_style_anchor: null },
    ],
    scenes: [],
  }
  mocks.from.mockImplementation(queryFor)
  mocks.getUser.mockResolvedValue({ id: USER })
  mocks.userOwnsProject.mockResolvedValue(true)
  // 이번 화 산문은 민호와 복도만 쓴다. 앞 화 산문은 앞 화 실행 기록에서 매번 다시 읽는다.
  mocks.getActiveRun.mockImplementation(async (projectId: string) =>
    projectId === PROJECT
      ? { state: { scenes: { scenes: [{ characters_in_scene: ['minho'], location: 'hall' }] } } }
      : {
          state: {
            scenes: { scenes: [{ scene_actions: ['minho가 hall에서 동전을 넣는다.'] }] },
            characters: { characters: [{ id: 'minho', name: '민호' }] },
            world: { locations: [{ id: 'hall', name: '복도' }] },
          },
        },
  )
})

describe('시리즈 정보 조회', () => {
  it('시리즈 정보는 프로젝트 주인에게만 보여 준다', async () => {
    // 왜: 로그인만으로 남의 화에서 이어받은 인물 · 그림 주소를 읽을 수 있으면 안 된다.
    mocks.userOwnsProject.mockResolvedValue(false)
    expect((await request()).status).toBe(403)

    mocks.getUser.mockResolvedValue(null)
    expect((await request()).status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('시리즈 정보는 이어받은 인물 · 배경마다 이번 화에 나오는지와 그림을 어떻게 쓰는지 알려 준다', async () => {
    // 왜: 정상 경로 고정 — 시작 화면 · Writer · Artist 가 이 한 곳에서 이어받은 것을 읽는다.
    const response = await request()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')

    const { view } = (await response.json()) as { view: Record<string, unknown> }
    expect(view).toMatchObject({
      prevTitle: '자판기의 반란',
      prevProjectId: PREV,
      prevDeleted: false,
      styleId: 'anime',
      currentStyleId: 'real',
      hasVoices: true,
      continuesLastScene: true,
      copyFailures: ['소장'],
    })
    // 이번 화 산문에 나오는 민호 · 복도는 그림체가 달라 다시 그리고, 안 나오는 팀장은 그림을 보관한다.
    expect(view.characters).toEqual([
      { id: 'minho', name: '민호', imageUrl: 'https://img/minho.png', styleId: 'anime', appearing: true, use: 'redraw' },
      { id: 'lead', name: '팀장', imageUrl: 'https://img/lead.png', styleId: 'anime', appearing: false, use: 'reuse' },
    ])
    expect(view.locations).toEqual([
      { id: 'hall', name: '회사 복도', imageUrl: 'https://img/hall.png', styleId: 'anime', appearing: true, use: 'redraw' },
    ])
  })

  it('시리즈 정보는 산문 보기를 요청할 때만 앞 화 산문을 함께 준다', async () => {
    // 왜: 앞 화 산문은 8000자까지 되는 큰 글이라 화면이 띠만 그릴 때는 보내지 않는다.
    const plain = (await (await request()).json()) as { view: Record<string, unknown> }
    expect('prose' in plain.view).toBe(false)

    const withProse = (await (await request('?prose=1')).json()) as { view: { prose?: string | null } }
    expect(withProse.view.prose).toBe('민호가 복도에서 동전을 넣는다.')
  })

  it('시리즈가 아닌 프로젝트는 시리즈 정보가 비어 있다', async () => {
    // 왜: 다음 화가 아닌 보통 프로젝트에서는 화면이 아무 띠도 그리지 않는다.
    db.projects[0].series = null
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ view: null })
  })
})
