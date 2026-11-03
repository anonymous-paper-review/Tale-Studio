// Producer 시작 화면 자료는 주인 확인이 끝나기를 기다리지 않고 함께 읽기 시작하고, 주인이 아니면 읽은 것을 돌려주지 않으며 거절 답은 지금과 같다 (QA 2026-11-03 "Producer 탭 로딩이 너무 길다")
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

import { GET } from '@/app/api/produce/entry/route'

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

  it('주인이 아니면 함께 읽은 시작 화면 자료도 돌려주지 않는다', async () => {
    // 왜: 주인 확인과 자료 읽기를 함께 시작해도, 주인이 아닌 사람에게 초안(올린 대본 글)이 새면 안 된다.
    mocks.owns.mockResolvedValue(false)
    const forbidden = await GET(request(PID))
    expect(forbidden.status).toBe(403)
    expect(JSON.stringify(await forbidden.json())).not.toContain(IDEA)
    mocks.getUser.mockResolvedValue(null)
    const anonymous = await GET(request(PID))
    expect(anonymous.status).toBe(401)
    expect(JSON.stringify(await anonymous.json())).not.toContain(IDEA)
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

  it('프로젝트 번호 꼴이 이상하면 자료를 읽지 않고 거절한다', async () => {
    // 왜: 정상 경로 고정 — 함께 읽기를 앞당겨도, 확인하지 않은 값으로 데이터베이스를 읽지 않는다.
    const res = await GET(request('../other'))
    expect(res.status).toBe(400)
    expect(mocks.reads).toEqual([])
  })
})
