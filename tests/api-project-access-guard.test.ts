// requireProjectAccess — 프로젝트 종속 API 라우트의 접근 가드 (2026-08-11 보안 감사).
//
// 감사 배경: middleware matcher 가 `api/` 를 제외해 API 는 미들웨어 인증을 안 받는다.
//   실측으로 /api/writer/preview/{projectId} 가 쿠키 없이 200 + 스토리 전문을 반환했다.
//   이 테스트는 그 회귀를 잠근다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  db: {
    /** owner_id → workspace id 목록 */
    workspaces: [] as Array<{ id: string; owner_id: string }>,
    projects: [] as Array<{ id: string; workspace_id: string }>,
    shares: [] as Array<{
      token: string
      project_id: string
      expires_at: string | null
      revoked_at: string | null
    }>,
  },
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import { requireProjectAccess } from '@/lib/api/guard'

const OWNER = 'user-owner'
const STRANGER = 'user-stranger'
const PROJECT = 'proj-1'
const OTHER_PROJECT = 'proj-2'
const TOKEN = 'a'.repeat(64)

/** supabaseAdmin.from(...) 체인의 최소 스텁 — 가드가 실제로 쓰는 메서드만 구현한다. */
function installDbStub() {
  mocks.from.mockImplementation((table: string) => {
    if (table === 'workspaces') {
      return {
        select: () => ({
          eq: (_col: string, ownerId: string) => ({
            data: mocks.db.workspaces.filter((w) => w.owner_id === ownerId),
          }),
        }),
      }
    }
    if (table === 'projects') {
      return {
        select: () => ({
          eq: (_col: string, projectId: string) => ({
            in: (_c: string, workspaceIds: string[]) => ({
              maybeSingle: () => ({
                data:
                  mocks.db.projects.find(
                    (p) => p.id === projectId && workspaceIds.includes(p.workspace_id),
                  ) ?? null,
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'project_shares') {
      return {
        select: () => ({
          eq: (_col: string, token: string) => ({
            maybeSingle: () => ({
              data: mocks.db.shares.find((s) => s.token === token) ?? null,
            }),
          }),
        }),
      }
    }
    throw new Error(`unexpected table: ${table}`)
  })
}

function req(url = `http://localhost/api/writer/preview/${PROJECT}`, headers?: HeadersInit) {
  return new Request(url, { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.workspaces = [{ id: 'ws-1', owner_id: OWNER }]
  mocks.db.projects = [
    { id: PROJECT, workspace_id: 'ws-1' },
    { id: OTHER_PROJECT, workspace_id: 'ws-other' },
  ]
  mocks.db.shares = []
  installDbStub()
})

describe('requireProjectAccess', () => {
  it('비로그인은 401 — 감사 이전엔 이게 200 이었다', async () => {
    mocks.getUser.mockResolvedValue(null)

    const result = await requireProjectAccess(req(), PROJECT)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(401)
  })

  it('소유자는 통과하고 검증된 projectId 를 돌려준다', async () => {
    mocks.getUser.mockResolvedValue({ id: OWNER })

    const result = await requireProjectAccess(req(), PROJECT)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.projectId).toBe(PROJECT)
    expect(result.viaShare).toBe(false)
  })

  it('로그인했지만 남의 프로젝트면 403 (IDOR 차단)', async () => {
    mocks.getUser.mockResolvedValue({ id: STRANGER })

    const result = await requireProjectAccess(req(), PROJECT)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(403)
  })

  it('워크스페이스가 하나도 없는 유저도 403', async () => {
    mocks.getUser.mockResolvedValue({ id: STRANGER })
    mocks.db.workspaces = []

    const result = await requireProjectAccess(req(), PROJECT)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(403)
  })

  it('형태가 틀린 projectId 는 400 (DB 조회 전에 끊는다)', async () => {
    mocks.getUser.mockResolvedValue({ id: OWNER })

    const result = await requireProjectAccess(req(), '../../etc/passwd')

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(400)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('projectId 가 없으면 400', async () => {
    mocks.getUser.mockResolvedValue({ id: OWNER })

    const result = await requireProjectAccess(req(), undefined)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(400)
  })

  describe('공유 티켓 (allowShare)', () => {
    beforeEach(() => {
      mocks.getUser.mockResolvedValue(null)
      mocks.db.shares = [
        { token: TOKEN, project_id: PROJECT, expires_at: null, revoked_at: null },
      ]
    })

    it('allowShare 없이는 유효한 티켓이어도 401 — 쓰기 라우트 보호', async () => {
      const result = await requireProjectAccess(req(), PROJECT, {
        allowShare: false,
      })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('unreachable')
      expect(result.response.status).toBe(401)
    })

    it('쿠키의 유효한 티켓은 통과(viaShare)', async () => {
      const result = await requireProjectAccess(
        req(undefined, { cookie: `demo_share=${TOKEN}` }),
        PROJECT,
        { allowShare: true },
      )

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.viaShare).toBe(true)
      expect(result.userId).toBeNull()
    })

    it('?share= 쿼리의 유효한 티켓도 통과 (쿠키 차단 브라우저 경로)', async () => {
      const result = await requireProjectAccess(
        req(`http://localhost/api/writer/preview/${PROJECT}?share=${TOKEN}`),
        PROJECT,
        { allowShare: true },
      )

      expect(result.ok).toBe(true)
    })

    it('revoke 된 티켓은 거부', async () => {
      mocks.db.shares[0].revoked_at = '2026-08-01T00:00:00.000Z'

      const result = await requireProjectAccess(
        req(undefined, { cookie: `demo_share=${TOKEN}` }),
        PROJECT,
        { allowShare: true },
      )

      expect(result.ok).toBe(false)
    })

    it('만료된 티켓은 거부', async () => {
      mocks.db.shares[0].expires_at = '2020-01-01T00:00:00.000Z'

      const result = await requireProjectAccess(
        req(undefined, { cookie: `demo_share=${TOKEN}` }),
        PROJECT,
        { allowShare: true },
      )

      expect(result.ok).toBe(false)
    })

    it('다른 프로젝트의 티켓으로는 이 프로젝트를 못 연다', async () => {
      const result = await requireProjectAccess(
        req(
          `http://localhost/api/writer/preview/${OTHER_PROJECT}?share=${TOKEN}`,
        ),
        OTHER_PROJECT,
        { allowShare: true },
      )

      expect(result.ok).toBe(false)
    })

    it('형태가 틀린 티켓은 DB 조회조차 하지 않는다', async () => {
      const result = await requireProjectAccess(
        req(undefined, { cookie: 'demo_share=not-a-token' }),
        PROJECT,
        { allowShare: true },
      )

      expect(result.ok).toBe(false)
      expect(mocks.from).not.toHaveBeenCalledWith('project_shares')
    })
  })
})
