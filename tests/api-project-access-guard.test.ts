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

// 이번 회차(#access-audit 2026-08-15)에 가드가 붙은 14개 라우트 — 실제 requireProjectAccess 를
//   getUser/supabaseAdmin 목으로 통과시켜 "로그인만으로 남의 프로젝트 조작"이 막히는지 검증한다.
//   STRANGER 는 소유 workspace 가 없어 ownsProject 가 즉시 false 를 반환(위 installDbStub 참고) —
//   대상 프로젝트가 DB 목에 없어도 403 이 나오므로 아래 라우트별 fixture 는 최소 유효성 검증만 통과시키면 된다.
import { POST as generateSheetPOST } from '@/app/api/artist/generate-sheet/route'
import { POST as generateWorldPOST } from '@/app/api/artist/generate-world/route'
import { POST as roughStoryboardPOST } from '@/app/api/writer/rough-storyboard/route'
import { POST as generateStoryboardPOST } from '@/app/api/director/generate-storyboard/route'
import { POST as generateStoryboardBatchPOST } from '@/app/api/director/generate-storyboard-batch/route'
import { POST as generatePrevizVideoPOST } from '@/app/api/director/generate-previz-video/route'
import { GET as editorStateGET, PUT as editorStatePUT } from '@/app/api/editor/state/route'
import { PATCH as editorSpeedPATCH } from '@/app/api/editor/speed/route'
import { POST as sceneGatePOST } from '@/app/api/writer/scene-gate/route'
import { POST as dialoguePOST } from '@/app/api/writer/dialogue/route'
import { POST as shotConfigsPOST } from '@/app/api/writer/shot-configs/route'

/** z.string().uuid() 스키마를 쓰는 라우트(rough-storyboard/previz-video/dialogue/shot-configs)용 — 형태 유효. */
const ROUTE_PROJECT_ID = '11111111-1111-4111-8111-111111111111'

function postReq(path: string, body: unknown, headers?: HeadersInit): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function patchReq(path: string, body: unknown, headers?: HeadersInit): Request {
  return new Request(`http://localhost${path}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

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

// #access-audit 2026-08-15 확장 — 이번에 requireProjectAccess 가 새로 붙은 14개 라우트가
//   실제로 비소유자를 401/403 으로 거부하는지. 가드 자체의 세부 규칙(공유 티켓·만료 등)은
//   위 describe('requireProjectAccess')가 이미 커버 — 여기선 "라우트가 가드를 호출부에
//   배치했는가"만 확인한다. PROJECT 소유자는 OWNER, STRANGER 는 워크스페이스가 없어
//   ownsProject 가 즉시 false → 403(비로그인은 401). 다운스트림(fal/DB 조작)이 실행되지
//   않았다는 것도 mocks.from 호출 테이블로 교차 확인한다.
describe('라우트 소유권 가드 — 비소유자는 401/403', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ id: STRANGER })
  })

  it('POST /api/artist/generate-sheet — 403', async () => {
    const res = await generateSheetPOST(
      postReq('/api/artist/generate-sheet', {
        projectId: PROJECT,
        characterId: 'char-1',
        appearanceKey: 'current',
        view: 'main',
      }),
    )
    expect(res.status).toBe(403)
  })

  it('POST /api/artist/generate-world — 403', async () => {
    const res = await generateWorldPOST(
      postReq('/api/artist/generate-world', {
        projectId: PROJECT,
        locationId: 'loc-1',
        column: 'wide_shot',
        prompt: 'a wide shot',
      }),
    )
    expect(res.status).toBe(403)
  })

  it('POST /api/writer/rough-storyboard — 403', async () => {
    const res = await roughStoryboardPOST(
      postReq('/api/writer/rough-storyboard', { projectId: ROUTE_PROJECT_ID }),
    )
    expect(res.status).toBe(403)
  })

  it('POST /api/director/generate-storyboard — 403', async () => {
    const res = await generateStoryboardPOST(
      postReq('/api/director/generate-storyboard', {
        projectId: PROJECT,
        writerShotId: 'shot_1',
        prompt: 'a storyboard frame',
      }),
    )
    expect(res.status).toBe(403)
  })

  it('POST /api/director/generate-storyboard-batch — 403', async () => {
    const res = await generateStoryboardBatchPOST(
      postReq('/api/director/generate-storyboard-batch', { projectId: PROJECT }) as never,
    )
    expect(res.status).toBe(403)
  })

  it('POST /api/director/generate-previz-video — 403', async () => {
    const res = await generatePrevizVideoPOST(
      postReq('/api/director/generate-previz-video', {
        projectId: ROUTE_PROJECT_ID,
        writerShotId: 'shot_1',
      }),
    )
    expect(res.status).toBe(403)
  })

  it('GET /api/editor/state — 403', async () => {
    const res = await editorStateGET(req(`http://localhost/api/editor/state?projectId=${PROJECT}`))
    expect(res.status).toBe(403)
  })

  it('PUT /api/editor/state — 403', async () => {
    const res = await editorStatePUT(
      postReq('/api/editor/state', { projectId: PROJECT, state: { evil: true } }),
    )
    expect(res.status).toBe(403)
    // 소유권 확인 전에는 editor_states 테이블에 손대지 않는다.
    expect(mocks.from).not.toHaveBeenCalledWith('editor_states')
  })

  it('PATCH /api/editor/speed — 403', async () => {
    const res = await editorSpeedPATCH(
      patchReq('/api/editor/speed', { projectId: PROJECT, shotId: 'sh_01_01', speed: 1.5 }),
    )
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalledWith('shots')
  })

  it('POST /api/writer/scene-gate — 403 (revise 의 scenes/storyCheck 삭제 전에 끊긴다)', async () => {
    const res = await sceneGatePOST(
      postReq('/api/writer/scene-gate', {
        projectId: PROJECT,
        action: 'revise',
        feedback: '다시 써주세요',
      }) as never,
    )
    expect(res.status).toBe(403)
    // writer_runs 갱신(파괴적 삭제 경로)까지 못 갔다.
    expect(mocks.from).not.toHaveBeenCalledWith('writer_runs')
  })

  it('POST /api/writer/dialogue — 403', async () => {
    const res = await dialoguePOST(postReq('/api/writer/dialogue', { projectId: ROUTE_PROJECT_ID }))
    expect(res.status).toBe(403)
  })

  it('POST /api/writer/shot-configs — 403', async () => {
    const res = await shotConfigsPOST(
      postReq('/api/writer/shot-configs', { projectId: ROUTE_PROJECT_ID }),
    )
    expect(res.status).toBe(403)
  })

  it('비로그인은 401 (예: scene-gate)', async () => {
    mocks.getUser.mockResolvedValue(null)
    const res = await sceneGatePOST(
      postReq('/api/writer/scene-gate', { projectId: PROJECT, action: 'confirm' }) as never,
    )
    expect(res.status).toBe(401)
  })
})
