// 로그인한 사람이나 허가받은 공유 링크만 프로젝트를 열 수 있게 한다 (2026-08-11 보안 감사)
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
import {
  PATCH as artistCharacterPATCH,
  POST as artistCharacterPOST,
} from '@/app/api/artist/character/route'
import { POST as artistAppearancePOST } from '@/app/api/artist/appearance/route'

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
  it('로그인하지 않은 사람은 프로젝트에 접근할 수 없다고 알린다', async () => {
    mocks.getUser.mockResolvedValue(null)

    const result = await requireProjectAccess(req(), PROJECT)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(401)
  })

  it('소유자에게는 요청한 프로젝트를 열어 준다', async () => {
    mocks.getUser.mockResolvedValue({ id: OWNER })

    const result = await requireProjectAccess(req(), PROJECT)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.projectId).toBe(PROJECT)
    expect(result.viaShare).toBe(false)
  })

  it('다른 사람의 프로젝트에는 접근하지 못하게 한다', async () => {
    mocks.getUser.mockResolvedValue({ id: STRANGER })

    const result = await requireProjectAccess(req(), PROJECT)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(403)
  })

  it('작업 공간이 없는 사람도 프로젝트에 접근하지 못하게 한다', async () => {
    mocks.getUser.mockResolvedValue({ id: STRANGER })
    mocks.db.workspaces = []

    const result = await requireProjectAccess(req(), PROJECT)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(403)
  })

  it('잘못된 프로젝트 주소는 조회하지 않고 요청을 거부한다', async () => {
    mocks.getUser.mockResolvedValue({ id: OWNER })

    const result = await requireProjectAccess(req(), '../../etc/passwd')

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(400)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('프로젝트 주소가 없으면 요청을 거부한다', async () => {
    mocks.getUser.mockResolvedValue({ id: OWNER })

    const result = await requireProjectAccess(req(), undefined)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.response.status).toBe(400)
  })

  describe('공유 링크로 프로젝트를 여는 경우', () => {
    beforeEach(() => {
      mocks.getUser.mockResolvedValue(null)
      mocks.db.shares = [
        { token: TOKEN, project_id: PROJECT, expires_at: null, revoked_at: null },
      ]
    })

    it('공유 링크를 허용하지 않으면 로그인하지 않은 사람은 접근하지 못한다', async () => {
      const result = await requireProjectAccess(req(), PROJECT, {
        allowShare: false,
      })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('unreachable')
      expect(result.response.status).toBe(401)
    })

    it('유효한 공유 링크를 사용하면 로그인하지 않아도 프로젝트를 연다', async () => {
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

    it('주소에 붙인 유효한 공유 링크도 프로젝트를 연다', async () => {
      const result = await requireProjectAccess(
        req(`http://localhost/api/writer/preview/${PROJECT}?share=${TOKEN}`),
        PROJECT,
        { allowShare: true },
      )

      expect(result.ok).toBe(true)
    })

    it('취소된 공유 링크는 사용할 수 없다', async () => {
      mocks.db.shares[0].revoked_at = '2026-08-01T00:00:00.000Z'

      const result = await requireProjectAccess(
        req(undefined, { cookie: `demo_share=${TOKEN}` }),
        PROJECT,
        { allowShare: true },
      )

      expect(result.ok).toBe(false)
    })

    it('기한이 지난 공유 링크는 사용할 수 없다', async () => {
      mocks.db.shares[0].expires_at = '2020-01-01T00:00:00.000Z'

      const result = await requireProjectAccess(
        req(undefined, { cookie: `demo_share=${TOKEN}` }),
        PROJECT,
        { allowShare: true },
      )

      expect(result.ok).toBe(false)
    })

    it('다른 프로젝트의 공유 링크로는 이 프로젝트를 열 수 없다', async () => {
      const result = await requireProjectAccess(
        req(
          `http://localhost/api/writer/preview/${OTHER_PROJECT}?share=${TOKEN}`,
        ),
        OTHER_PROJECT,
        { allowShare: true },
      )

      expect(result.ok).toBe(false)
    })

    it('형식이 잘못된 공유 링크는 확인하지 않고 바로 거부한다', async () => {
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
describe('프로젝트를 소유하지 않은 사람의 접근 차단', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ id: STRANGER })
  })

  it('다른 사람의 인물 그림을 만들 수 없다', async () => {
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

  it('다른 사람의 배경 그림을 만들 수 없다', async () => {
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

  it('다른 사람의 인물 정보를 저장하거나 바꾸지 않는다', async () => {
    const res = await artistCharacterPOST(
      postReq('/api/artist/character', {
        projectId: PROJECT,
        characterId: 'char-1',
        name: 'Not mine',
        entity_type: 'person',
      }),
    )
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalledWith('characters')
    expect(mocks.from).not.toHaveBeenCalledWith('props')
  })

  it('다른 사람의 인물 정보를 찾거나 바꾸지 않는다', async () => {
    const res = await artistCharacterPATCH(
      patchReq('/api/artist/character', {
        projectId: PROJECT,
        characterId: 'char-1',
        appearance: 'Not mine',
      }),
    )
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalledWith('characters')
    expect(mocks.from).not.toHaveBeenCalledWith('props')
  })

  it('다른 사람의 인물 모습을 저장하거나 바꾸지 않는다', async () => {
    const res = await artistAppearancePOST(
      postReq('/api/artist/appearance', {
        projectId: PROJECT,
        characterId: 'char-1',
        appearance: 'Not mine',
      }),
    )
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalledWith('character_appearances')
    expect(mocks.from).not.toHaveBeenCalledWith('props')
  })

  it('다른 사람의 스토리보드 초안을 만들 수 없다', async () => {
    const res = await roughStoryboardPOST(
      postReq('/api/writer/rough-storyboard', { projectId: ROUTE_PROJECT_ID }),
    )
    expect(res.status).toBe(403)
  })

  it('다른 사람의 스토리보드를 만들 수 없다', async () => {
    const res = await generateStoryboardPOST(
      postReq('/api/director/generate-storyboard', {
        projectId: PROJECT,
        writerShotId: 'shot_1',
        prompt: 'a storyboard frame',
      }),
    )
    expect(res.status).toBe(403)
  })

  it('다른 사람의 스토리보드를 한꺼번에 만들 수 없다', async () => {
    const res = await generateStoryboardBatchPOST(
      postReq('/api/director/generate-storyboard-batch', { projectId: PROJECT }) as never,
    )
    expect(res.status).toBe(403)
  })

  it('다른 사람의 미리보기 영상을 만들 수 없다', async () => {
    const res = await generatePrevizVideoPOST(
      postReq('/api/director/generate-previz-video', {
        projectId: ROUTE_PROJECT_ID,
        writerShotId: 'shot_1',
      }),
    )
    expect(res.status).toBe(403)
  })

  it('다른 사람의 편집 상태를 볼 수 없다', async () => {
    const res = await editorStateGET(req(`http://localhost/api/editor/state?projectId=${PROJECT}`))
    expect(res.status).toBe(403)
  })

  it('다른 사람의 편집 상태를 바꿀 수 없다', async () => {
    const res = await editorStatePUT(
      postReq('/api/editor/state', { projectId: PROJECT, state: { evil: true } }),
    )
    expect(res.status).toBe(403)
    // 소유권 확인 전에는 editor_states 테이블에 손대지 않는다.
    expect(mocks.from).not.toHaveBeenCalledWith('editor_states')
  })

  it('다른 사람 영상의 재생 속도를 바꿀 수 없다', async () => {
    const res = await editorSpeedPATCH(
      patchReq('/api/editor/speed', { projectId: PROJECT, shotId: 'sh_01_01', speed: 1.5 }),
    )
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalledWith('shots')
  })

  it('다른 사람 이야기의 장면을 고칠 수 없다', async () => {
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

  it('다른 사람 이야기의 대사를 만들 수 없다', async () => {
    const res = await dialoguePOST(postReq('/api/writer/dialogue', { projectId: ROUTE_PROJECT_ID }))
    expect(res.status).toBe(403)
  })

  it('다른 사람 이야기의 촬영 구성을 만들 수 없다', async () => {
    const res = await shotConfigsPOST(
      postReq('/api/writer/shot-configs', { projectId: ROUTE_PROJECT_ID }),
    )
    expect(res.status).toBe(403)
  })

  it('로그인하지 않은 사람은 이야기 장면을 바꿀 수 없다', async () => {
    mocks.getUser.mockResolvedValue(null)
    const res = await sceneGatePOST(
      postReq('/api/writer/scene-gate', { projectId: PROJECT, action: 'confirm' }) as never,
    )
    expect(res.status).toBe(401)
  })
})
