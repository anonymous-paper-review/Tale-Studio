// Producer 시작 화면 자료는 주인 확인이 끝나기를 기다리지 않고 함께 읽기 시작하고, 주인이 아니면 읽은 것을 돌려주지 않으며 거절 답은 지금과 같다 (QA 2026-11-03 "Producer 탭 로딩이 너무 길다")
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  owns: vi.fn(),
  runStatus: vi.fn(),
  reads: [] as string[],
  row: null as Record<string, unknown> | null,
  /** true 면 자료 읽기가 끝나지 않는다 — 거절 답이 그 읽기를 기다리는지 본다. */
  hang: false,
}))
const never = () => new Promise<never>(() => {})

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/writer/run-store', () => ({
  getRunStatusLight: (projectId: string) => {
    mocks.reads.push(`writer_runs:${projectId}`)
    return mocks.hang ? never() : mocks.runStatus(projectId)
  },
}))
// supabaseAdmin 흉내 — 무엇을 언제 읽었는지만 적는다.
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: (columns: string) => {
        mocks.reads.push(`${table}:${columns}`)
        const q = {
          eq: () => q,
          maybeSingle: () => (mocks.hang ? never() : Promise.resolve({ data: mocks.row, error: null })),
        }
        return q
      },
    }),
  },
}))

import { GET, PATCH } from '@/app/api/produce/entry/route'

const PID = 'project-1'
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const IDEA = '등대지기가 보내지 못한 편지를 바다에 띄우는 이야기.'

function request(projectId: string) {
  return new NextRequest(`http://localhost/api/produce/entry?projectId=${encodeURIComponent(projectId)}`)
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.reads.length = 0
  mocks.hang = false
  mocks.row = { title: '등대의 편지', locale: 'en', current_stage: 'editor', entry_draft: { version: 1, idea: IDEA, startedAt: '2026-11-01T00:00:00.000Z' }, story_text: IDEA, settings: null, series: null }
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.owns.mockResolvedValue(true)
  mocks.runStatus.mockResolvedValue(null)
})

describe('시작 화면 자료 읽기', () => {
  it('시작 화면 자료는 프로젝트 주인 확인이 끝나기를 기다리지 않고 함께 읽기 시작한다', async () => {
    // 왜: 로그인 확인 → 주인 확인 → 자료 → Writer 진행을 차례로 하면 데이터베이스 왕복이 다섯 번 쌓여 Producer 탭이 늦게 뜬다(QA 11/3).
    let allow!: (owned: boolean) => void
    mocks.owns.mockReturnValue(new Promise<boolean>((resolve) => (allow = resolve)))
    const pending = GET(request(PID))
    await tick()
    await tick()
    expect(mocks.reads.some((r) => r.startsWith('projects:') && r.includes('entry_draft'))).toBe(true)
    expect(mocks.reads).toContain(`writer_runs:${PID}`)
    allow(true)
    const res = await pending
    expect(res.status).toBe(200)
    expect((await res.json()).draft).toMatchObject({ idea: IDEA })
  })

  it('주인이 아니면 응답은 이전과 같은 거절이고, 함께 읽은 자료는 어디에도 실리지 않는다', async () => {
    // 왜: 주인 확인과 자료 읽기를 함께 시작해도, 주인이 아닌 사람에게 초안(올린 대본 글) · 제목이 본문에도 머리(header)에도 새면 안 된다(리드 11/3).
    //   "이전과 같은 거절" = 함께 읽기 전 라우트의 답 그대로 — 로그인했지만 주인이 아니면 403 {"error":"Forbidden"}, 로그인 안 했으면 401 {"error":"Unauthorized"}.
    const leaked = (res: Response, body: string) =>
      [body, ...[...res.headers.entries()].map(([name, value]) => `${name}: ${value}`)].some((text) => text.includes(IDEA) || text.includes('등대의 편지'))

    mocks.owns.mockResolvedValue(false)
    const forbidden = await GET(request(PID))
    const forbiddenBody = await forbidden.text()
    expect(forbidden.status).toBe(403)
    expect(forbiddenBody).toBe('{"error":"Forbidden"}')
    expect(leaked(forbidden, forbiddenBody)).toBe(false)

    mocks.getUser.mockResolvedValue(null)
    const anonymous = await GET(request(PID))
    const anonymousBody = await anonymous.text()
    expect(anonymous.status).toBe(401)
    expect(anonymousBody).toBe('{"error":"Unauthorized"}')
    expect(leaked(anonymous, anonymousBody)).toBe(false)
  })

  it('주인이 아니면 남의 프로젝트가 있든 없든 지금과 같은 거절 답을 함께 읽기를 기다리지 않고 돌려주어, 그 프로젝트가 있는지 알 수 없다', async () => {
    // 왜: 함께 읽기를 시작해도 거절 답의 모양 · 걸린 시간 · 오류 글은 함께 읽기 전과 같아야 한다(리드 11/3) — 다르면 남의 프로젝트가 있는지 응답으로 알 수 있다.
    //   자료 읽기를 끝나지 않게 붙잡아 둔다: 거절 답이 그 읽기를 기다리면 이 시험은 시간 안에 끝나지 않는다.
    mocks.hang = true
    mocks.owns.mockResolvedValue(false)
    const existing = await GET(request(PID))
    mocks.row = null
    const missing = await GET(request('project-missing'))
    for (const res of [existing, missing]) {
      expect(res.status).toBe(403)
      expect(res.headers.get('content-type')).toContain('application/json')
    }
    expect(await existing.text()).toBe('{"error":"Forbidden"}')
    expect(await missing.text()).toBe('{"error":"Forbidden"}')

    mocks.getUser.mockResolvedValue(null)
    const anonymousExisting = await GET(request(PID))
    const anonymousMissing = await GET(request('project-missing'))
    expect([anonymousExisting.status, anonymousMissing.status]).toEqual([401, 401])
    expect(await anonymousExisting.text()).toBe('{"error":"Unauthorized"}')
    expect(await anonymousMissing.text()).toBe('{"error":"Unauthorized"}')
  })

  it('로그인하지 않은 요청은 프로젝트 자료를 읽지 않고 거절한다', async () => {
    // 왜: 로그인 확인을 먼저 해도 걸리는 시간은 같다(주인 확인 왕복 두 번 동안 자료 읽기가 끝난다) — 익명 요청은 데이터베이스를 건드리지 않는다(검토 11/3).
    mocks.getUser.mockResolvedValue(null)
    const res = await GET(request(PID))
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('{"error":"Unauthorized"}')
    expect(mocks.reads).toEqual([])
    expect(mocks.owns).not.toHaveBeenCalled()
  })

  it('시작 화면 GET 과 PATCH 는 같은 로그인 · 번호 · 주인 확인을 거쳐 같은 거절을 돌려준다', async () => {
    // 왜: 확인 규칙이 GET 에만 옮겨 적혀 있으면, 나중에 규칙이 더해질 때 GET 만 빠진다(2차 검토 11/4). 규칙은 entry-access 한 곳에 둔다.
    const patch = (projectId: string) =>
      new NextRequest('http://localhost/api/produce/entry', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, patch: { idea: IDEA } }) })
    const both = async (projectId: string) => {
      const [read, write] = [await GET(request(projectId)), await PATCH(patch(projectId))]
      return [`${read.status} ${await read.text()}`, `${write.status} ${await write.text()}`]
    }
    mocks.getUser.mockResolvedValue(null)
    expect(await both(PID)).toEqual(['401 {"error":"Unauthorized"}', '401 {"error":"Unauthorized"}'])
    mocks.getUser.mockResolvedValue({ id: 'user-1' })
    expect(await both('../other')).toEqual(Array(2).fill('400 {"error":"Invalid request: projectId is required"}'))
    mocks.owns.mockResolvedValue(false)
    expect(await both(PID)).toEqual(['403 {"error":"Forbidden"}', '403 {"error":"Forbidden"}'])
    const route = readFileSync(path.join(process.cwd(), 'src/app/api/produce/entry/route.ts'), 'utf8')
    expect(route).not.toMatch(/\bgetUser\(|\buserOwnsProject\(/)
  })

  it('프로젝트 번호 꼴이 이상하면 자료를 읽지 않고 거절한다', async () => {
    // 왜: 정상 경로 고정 — 함께 읽기를 앞당겨도, 확인하지 않은 값으로 데이터베이스를 읽지 않는다.
    const res = await GET(request('../other'))
    expect(res.status).toBe(400)
    expect(mocks.reads).toEqual([])
  })
})
