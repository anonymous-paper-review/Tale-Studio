// Writer 산문 미리 보기는 실행 기록에서 산문 화면이 쓰는 칸만 골라 읽고, 다른 표 읽기와 함께 보내 빨리 답한다 — 답은 예전과 같다 (2026-11-03 오너 QA 2번)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ run: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: vi.fn(async (_req: Request, projectId: string) => ({ ok: true, projectId })) }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.run }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import { GET } from '@/app/api/writer/preview/[projectId]/route'
import { PREVIEW_STATE_FIELDS } from '@/lib/writer/preview-fields'

const scene = { scene_id: 'scene_1', scene_actions: ['minho 가 자판기를 친다.'], location: 'hall', characters_in_scene: ['minho'] }
const scenes = { scenes: [scene], total_estimated_seconds: 12 }
/** 산문 화면이 쓰는 칸 + 쓰지 않는 큰 칸(샷 설계 · 렌더 지시 · 데쿠파주)을 다 가진 실행 기록. */
const fullState = () => ({
  input: { story: '자판기 이야기', treatmentDraft: true, runtimeSeconds: 15, changeLevel: 'polish', genre: { genre: '코미디', runtime_seconds: 15 } },
  genre: { genre: '코미디', runtime_seconds: 15 },
  _proseSeed: 'keep',
  _proseLocked: false,
  scenes,
  _sceneStoryVersion: 'story-2',
  _sceneStoryProposal: {
    id: 'p1', status: 'ready', feedback: '팀장을 더 얄밉게', createdAt: new Date().toISOString(),
    baseScenes: scenes, scenes: { scenes: [{ ...scene, scene_actions: ['minho 가 자판기를 세게 친다.'] }], total_estimated_seconds: 12 },
  },
  _sceneStoryUndo: { id: 'u1', label: 'v2', storyVersion: 'story-2' },
  characters: { characters: [{ id: 'minho', name: '민호', role: 'protagonist', appearance_description: '흰 셔츠', motivation: { want: '캔' } }] },
  dramaturgy: { world_inventory: [{ id: 'roof', name: '옥상' }] },
  world: { locations: [{ id: 'hall', name: '복도', description: '형광등' }] },
  worldVisual: { locations: [{ id: 'hall', name: '복도' }] },
  shotSequence: { shots: Array.from({ length: 40 }, (_, i) => ({ id: `shot_${i}`, prompt: '긴 샷 설명 '.repeat(40) })) },
  shotDesign: { shots: Array.from({ length: 40 }, (_, i) => ({ id: `shot_${i}`, camera: '카메라 '.repeat(40) })) },
  renderPrompts: { prompts: Array.from({ length: 40 }, () => '렌더 지시 '.repeat(40)) },
  decoupage: { scenes: [{ scene_id: 'scene_1', shots: [] }] },
})
const run = (state: Record<string, unknown>) => ({ id: 'run-1', status: 'awaiting_confirmation', updated_at: '2026-11-03T00:00:00.000Z', created_at: '2026-11-02T23:59:00.000Z', state })
const picked = (state: Record<string, unknown>) => Object.fromEntries(Object.entries(state).filter(([key]) => (PREVIEW_STATE_FIELDS as readonly string[]).includes(key)))

const TABLES: Record<string, unknown> = {
  projects: { locale: 'ko', locale_locked: true },
  characters: [{ character_id: 'minho', name: '민호', role: 'protagonist' }],
  character_appearances: [{ character_id: 'minho', appearance: 'white shirt', appearance_native: '흰 셔츠', portrait_url: null, sheet_url: null }],
  locations: [{ location_id: 'hall', name: '복도', visual_description: 'hallway', visual_description_native: '형광등 복도' }],
}
function installTables(fail: Record<string, boolean> = {}) {
  mocks.from.mockImplementation((table: string) => {
    const result = { data: TABLES[table] ?? [], error: null }
    const settle = () => (fail[table] ? Promise.reject(new Error(`${table} unreachable`)) : Promise.resolve(result))
    const query: Record<string, unknown> = { maybeSingle: vi.fn(settle), then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => settle().then(resolve, reject) }
    query.select = vi.fn(() => query)
    query.eq = vi.fn(() => query)
    return query
  })
}
const preview = async () => (await GET(new NextRequest('http://localhost/api/writer/preview/p1?locale=ko'), { params: Promise.resolve({ projectId: 'p1' }) }))

beforeEach(() => {
  vi.clearAllMocks()
  installTables()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('미리 보기가 읽는 실행 기록 칸', () => {
  // 왜: 완성된 프로젝트의 실행 기록은 샷 설계 · 렌더 지시가 90%를 넘는다(운영 3945d1e6 은 942KB 중 산문 화면이 쓰는 칸 23KB) — 그것까지 읽느라 Writer 탭이 오래 비었다.
  it('Writer 산문 미리 보기는 실행 기록에서 산문 화면이 쓰는 칸만 읽고 샷 설계 · 렌더 지시 같은 큰 칸은 읽지 않는다', async () => {
    mocks.run.mockResolvedValue(run(fullState()))

    expect((await preview()).status).toBe(200)

    expect(mocks.run).toHaveBeenCalledWith('p1', { stateFields: PREVIEW_STATE_FIELDS })
    for (const used of ['input', 'genre', '_proseSeed', '_proseLocked', 'scenes', '_sceneStoryVersion', '_sceneStoryProposal', '_sceneStoryUndo', 'characters', 'dramaturgy', 'world', 'worldVisual', 'v2Package']) {
      expect(PREVIEW_STATE_FIELDS).toContain(used)
    }
    for (const big of ['shotSequence', 'shotDesign', 'renderPrompts', 'decoupage', 'sceneStage', 'shotCheck']) {
      expect(PREVIEW_STATE_FIELDS).not.toContain(big)
    }
  })

  // 왜: 칸을 덜 읽는 것은 빨라지기만 해야 한다 — 산문 · 잠금 · 수정안 · 되돌리기 · 초안 카드 · 조건이 한 글자도 달라지면 안 된다.
  it('칸만 골라 읽어도 미리 보기 답은 예전과 같다(산문 · 잠금 · 수정안 · 다시 쓰기 · 초안 카드)', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-03T00:01:00.000Z'), toFake: ['Date'] })
    mocks.run.mockResolvedValue(run(fullState()))
    const whole = await (await preview()).json()
    mocks.run.mockResolvedValue(run(picked(fullState())))
    const narrow = await (await preview()).json()

    expect(narrow).toEqual(whole)
    expect(whole.scenes[0].beats).toEqual(['민호 가 자판기를 친다.'])
    expect(whole.sceneStoryProposal.after[0].beats).toEqual(['민호 가 자판기를 세게 친다.'])
    expect(whole.sceneStoryUndo).toEqual({ id: 'u1', label: 'v2' })
    expect(whole.treatmentCast.characters[0]).toMatchObject({ id: 'minho', name: '민호' })
    expect(whole.proseConditions).toEqual({ runtimeSeconds: 15, genre: '코미디', seed: 'keep' })
  })
})

describe('골라 읽는 칸 목록 지키기', () => {
  // 왜: 미리 보기가 실행 기록에서 새 칸을 읽게 되었는데 목록에 더하지 않으면, 그 칸은 늘 비어 조용히 틀린 화면이 된다.
  it('미리 보기 라우트가 실행 기록에서 읽는 칸은 모두 골라 읽는 칸 목록에 있고, 목록에 쓰지 않는 칸은 없다', () => {
    const route = readFileSync('src/app/api/writer/preview/[projectId]/route.ts', 'utf8')
    const read = new Set<string>()
    for (const match of route.matchAll(/\bstate\??\.(\w+)/g)) read.add(match[1])
    // state 를 통째로 넘기는 도우미가 있으면 그 도우미가 읽는 칸도 센다(예: 조건 줄 proseConditionsOf).
    for (const [, helper] of route.matchAll(/\b(\w+)\(state\b/g)) {
      const from = route.match(new RegExp(`import \\{[^}]*\\b${helper}\\b[^}]*\\} from '@/([^']+)'`))?.[1]
      if (!from) continue // 기본 함수(Boolean 등)는 칸을 읽지 않는다
      const source = readFileSync(`src/${from}.ts`, 'utf8')
      const body = source.slice(source.indexOf(`export function ${helper}(`)).split('\nexport ')[0]
      for (const match of body.matchAll(/\bstate\??\.(\w+)/g)) read.add(match[1])
    }

    expect([...read].sort()).toEqual([...PREVIEW_STATE_FIELDS].sort())
  })
})

describe('미리 보기의 다른 읽기', () => {
  // 왜: 프로젝트 언어 · 인물 · 모습 · 배경 읽기는 실행 기록과 상관없다 — 차례로 기다리면 함수 지역(iad1)에서 DB 왕복이 그만큼 쌓인다.
  it('프로젝트 언어 · 인물 · 모습 · 배경 읽기는 실행 기록 읽기를 기다리지 않고 함께 보낸다', async () => {
    let release: (value: unknown) => void = () => {}
    mocks.run.mockReturnValue(new Promise((resolve) => { release = resolve }))

    const pending = preview()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const asked = mocks.from.mock.calls.map(([table]) => table)
    release(run(fullState()))
    const response = await pending

    expect(asked).toEqual(expect.arrayContaining(['projects', 'characters', 'character_appearances', 'locations']))
    expect(response.status).toBe(200)
  })

  // 왜: 정상 경로 고정 — 배경 카드 · 언어는 덧붙이는 정보라 그 읽기가 끊겨도 산문은 지금처럼 나온다(예전에도 그 둘은 실패를 삼켰다).
  it('배경 · 프로젝트 언어 읽기가 끊겨도 미리 보기는 산문을 그대로 돌려준다', async () => {
    installTables({ locations: true, projects: true })
    mocks.run.mockResolvedValue(run(fullState()))

    const response = await preview()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.worlds).toEqual([])
    expect(body.scenes[0].beats).toEqual(['민호 가 자판기를 친다.'])
  })

  // 왜: 정상 경로 고정 — 실행 기록이 없는 프로젝트는 예전처럼 시작 전이라고만 답한다.
  it('실행 기록이 없으면 지금처럼 시작 전이라고 답한다', async () => {
    mocks.run.mockResolvedValue(null)

    const body = await (await preview()).json()

    expect(body).toMatchObject({ started: false, running: false, completed: false, failed: false, scenes: [] })
  })
})
