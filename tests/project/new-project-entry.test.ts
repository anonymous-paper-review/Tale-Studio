// 리뉴얼 1차: 새 프로젝트는 Producer 시작 화면에서 시작하고, 채팅 · 대사 언어는 사이트 언어를 따른다 (2026-10-19)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  projectUpdate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}))
vi.mock('@/lib/supabase/workspace', () => ({
  ensureWorkspace: async () => ({ id: 'workspace-1', plan: 'free', owner_id: 'user-1' }),
}))
import { POST as createProject } from '@/app/api/project/new/route'

const userWith = (locale?: string) => ({
  id: 'user-1',
  email: 'creator@example.com',
  user_metadata: locale ? { locale } : {},
})

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/project/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: userWith('en') } })
  mocks.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => ({
    data: { status: 'ok', project: { id: args.p_project_id, current_stage: 'producer', locale: args.p_locale } },
    error: null,
  }))
  mocks.projectUpdate.mockResolvedValue({ error: null })
  mocks.from.mockImplementation((table: string) => {
    if (table !== 'projects') throw new Error(`unexpected table: ${table}`)
    return {
      update: (row: Record<string, unknown>) => ({
        eq: (field: string, value: unknown) => mocks.projectUpdate(row, field, value),
      }),
    }
  })
})

describe('새 프로젝트 시작 단계와 언어', () => {
  // 왜: 리뉴얼에서 새 프로젝트는 Producer(아이디어 · 조건) 화면에서 시작한다. 저장된 단계가 producer 면 Writer 로 읽힌다.
  it('새 흐름으로 만든 프로젝트는 Producer 시작 화면 단계에서 시작한다', async () => {
    const response = await createProject(request({ title: '새 작품', startAtEntry: true, uiLocale: 'ko' }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(mocks.projectUpdate).toHaveBeenCalledWith({ current_stage: 'entry' }, 'id', body.projectId)
    expect(body.project.current_stage).toBe('entry')
  })

  // 왜: 프로토타입 "채팅 언어 · 대사 언어를 고르는 칸이 없다. 사이트 언어를 따른다".
  it('새 흐름으로 만들면 채팅 · 대사 언어를 사이트 언어로 정하고 잠근다', async () => {
    await createProject(request({ title: '새 작품', startAtEntry: true, uiLocale: 'ko' }))

    expect(mocks.rpc).toHaveBeenCalledWith('create_project_slotted', expect.objectContaining({
      p_locale: 'ko',
      p_locale_locked: true,
    }))
  })

  // 왜: 정상 경로 고정 — 사이트 언어를 보내지 않는 기존 호출은 계정 언어를 쓰고 시작 단계를 바꾸지 않는다.
  it('사이트 언어를 보내지 않으면 지금처럼 계정 언어를 쓰고 단계를 바꾸지 않는다', async () => {
    await createProject(request({ title: '예전 방식' }))

    expect(mocks.rpc).toHaveBeenCalledWith('create_project_slotted', expect.objectContaining({
      p_locale: 'en',
      p_locale_locked: true,
    }))
    expect(mocks.projectUpdate).not.toHaveBeenCalled()
  })
})
