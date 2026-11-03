// Storyboard 의 연출 점검(Directing check)은 관리자 계정에게만 보낸다 (2026-11-03 오너 "Directing Check는 관리자 계정 아니면 안 보이게")
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUserById: vi.fn(),
  access: { ok: true, projectId: '', userId: null as string | null, viaShare: false },
  run: {} as Record<string, unknown>,
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from, auth: { admin: { getUserById: mocks.getUserById } } },
}))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: vi.fn(async (_req: Request, projectId: string) => ({ ...mocks.access, projectId })),
}))
vi.mock('@/lib/generation-jobs', () => ({ STALE_QUEUED_MS: 600_000 }))

import { GET } from '@/app/api/writer/status/[projectId]/route'

const EMAILS: Record<string, string> = {
  'user-admin': 'admin@tale.studio',
  'user-plain': 'someone@example.com',
  'user-promo': 'promotion@talestudio.art',
}

function query() {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    in: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: mocks.run, error: null })),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [], error: null })),
  }
  return builder
}

async function statusAs(userId: string | null, viaShare = false) {
  mocks.access = { ok: true, projectId: '', userId, viaShare }
  const id = '8b0c6a2e-1f4d-4c1a-9a51-0d1f2e3c4b5a'
  const response = await GET(new Request(`http://localhost/api/writer/status/${id}`) as NextRequest, {
    params: Promise.resolve({ projectId: id }),
  })
  expect(response.status).toBe(200)
  return response.json()
}

describe('Storyboard 연출 점검은 관리자 계정만 본다', () => {
  beforeEach(() => {
    mocks.from.mockReset().mockImplementation(query)
    mocks.getUserById.mockReset().mockImplementation(async (id: string) => ({
      data: { user: EMAILS[id] ? { id, email: EMAILS[id] } : null },
      error: null,
    }))
    mocks.run = {
      engine: 'v1', status: 'completed', current_stage: 'done', completed_units: 15, total_units: 15,
      error: null, created_at: '2026-11-03T00:00:00Z', updated_at: '2026-11-03T00:10:00Z', timings: {},
      shot_issues: [
        { category: 'cinematography', severity: 'WARNING', location: 'scene_2/shot_3', message: '반응 샷이 없어요', suggestion: '반응 샷을 더하세요' },
        { category: 'continuity', severity: 'CRITICAL', location: 'scene_1', message: '감정이 끊겨요' },
      ],
    }
  })

  // 왜: 오너(11/3) "Directing Check는 관리자 계정 아니면 안 보이게" — 보드 위 연출 점검 띠는 이 응답이 있을 때만 그려진다.
  it('관리자 계정이 아니면 Storyboard 연출 점검을 보내지 않는다', async () => {
    const body = await statusAs('user-plain')
    expect(body.pipeline_completed).toBe(true)
    expect(body).not.toHaveProperty('directing_issues')
    expect(body).not.toHaveProperty('directing_issue_count')
  })

  // 왜: 시연 계정(promotion@)은 할당량만 면제일 뿐 관리자가 아니다 — 고객에게 보이는 화면과 같아야 한다.
  it('시연 계정에도 연출 점검을 보내지 않는다', async () => {
    const body = await statusAs('user-promo')
    expect(body).not.toHaveProperty('directing_issues')
  })

  // 왜: 공유 링크로 보는 사람은 로그인한 관리자가 아니다.
  it('공유 링크로 보는 사람에게도 연출 점검을 보내지 않는다', async () => {
    const body = await statusAs(null, true)
    expect(body).not.toHaveProperty('directing_issues')
  })

  // 왜: 관리자 계정이 읽기에 실패하면 관리자가 아닌 것으로 본다 — 숨겨야 할 것이 새는 쪽보다 안전하다.
  it('계정 정보를 읽지 못하면 연출 점검을 보내지 않는다', async () => {
    mocks.getUserById.mockImplementation(async () => ({ data: null, error: { message: 'auth down' } }))
    const body = await statusAs('user-unreadable')
    expect(body).not.toHaveProperty('directing_issues')
  })

  // 왜: 정상 경로 고정 — 관리자는 영상으로 넘어가기 전에 연출 결함을 지금처럼 본다.
  it('관리자 계정이면 Storyboard 연출 점검을 지금처럼 보낸다', async () => {
    const body = await statusAs('user-admin')
    expect(body.directing_issue_count).toBe(2)
    expect(body.directing_issues).toEqual([
      { severity: 'WARNING', location: 'scene_2/shot_3', message: '반응 샷이 없어요', suggestion: '반응 샷을 더하세요' },
      { severity: 'CRITICAL', location: 'scene_1', message: '감정이 끊겨요', suggestion: null },
    ])
  })
})
