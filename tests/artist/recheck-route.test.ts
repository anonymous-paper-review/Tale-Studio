// 산문 재점검 반영은 산문을 확정한 뒤 [만들기]를 누르기 전에만, 프로젝트 주인만 하고, 산문에 없는 말 · 목록에서 빼기는 받지 않는다 (2026-10-27 오너)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  demo: vi.fn(),
  run: vi.fn(),
  project: vi.fn(),
  runUpdate: vi.fn(),
  projectUpdate: vi.fn(),
}))

vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.access }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: mocks.demo }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.run }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'projects') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => mocks.project() }) }),
          update: (row: Record<string, unknown>) => ({ eq: async () => mocks.projectUpdate(row) }),
        }
      }
      return {
        update: (row: Record<string, unknown>) => {
          const filters: Array<[string, unknown]> = []
          const q = {
            eq: (column: string, value: unknown) => {
              filters.push([column, value])
              return q
            },
            select: async () => mocks.runUpdate(row, filters),
          }
          return q
        },
      }
    },
  },
}))

import { POST } from '@/app/api/writer/breakdown-recheck/route'

// 이 시험을 위해 새로 지은 산문 — 실제 작품이 아니다.
const version = '2026-10-27T01:00:00.000Z'
const scenes = {
  scenes: [
    { scene_id: 's1', location: 'hallway', characters_in_scene: ['char'], scene_actions: ['민호가 자판기 앞에서 동전을 찾는다.'], estimated_seconds: 12 },
    { scene_id: 's2', location: 'hallway', characters_in_scene: ['char'], scene_actions: ['경비원이 민호를 부른다.'], estimated_seconds: 12 },
  ],
  total_estimated_seconds: 24,
}
const breakdownRun = (state: Record<string, unknown> = {}, row: Record<string, unknown> = {}) => ({
  id: 'run-1',
  status: 'awaiting_confirmation',
  updated_at: version,
  state: {
    input: { story: '자판기 앞에서 벌어진 일', treatmentDraft: true, sceneGate: true },
    _proseLocked: true,
    characters: { characters: [{ id: 'char', name: '민호', role: 'protagonist', personality: [], arc: { start_state: '', end_state: '', arc_type: '' }, appearance_description: '', motivation: { want: '', need: '' } }], relationships: [], subtext_notes: [] },
    world: { locations: [{ id: 'hallway', name: '회사 복도', description: '' }] },
    scenes,
    ...state,
  },
  ...row,
})
const draft = {
  version: 1,
  savedAt: 1,
  storyText: '자판기 앞에서 벌어진 일',
  storyReady: true,
  settings: { playtime: 60, genre: '코미디', format: 'vertical_9:16', tone: [], dialogueLanguage: 'ko' },
  cast: [{ localId: 'treatment:char', characterId: 'char', name: '민호', entityType: 'person', appearance: '', origin: 'treatment' }],
  backgrounds: [{ localId: 'treatment:hallway', locationId: 'hallway', name: '회사 복도', visualDescription: '', purpose: '', origin: 'treatment' }],
  treatmentSyncedVersion: 'v1',
}
const post = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/writer/breakdown-recheck', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectId: 'p1', ...body }),
}))
const addGuard = { ops: [{ op: 'add', kind: 'person', name: '경비원' }] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.demo.mockReturnValue(null)
  mocks.access.mockResolvedValue({ ok: true, projectId: 'p1', userId: 'u1', viaShare: false })
  mocks.run.mockResolvedValue(breakdownRun())
  mocks.project.mockReturnValue({ data: { producer_draft: draft }, error: null })
  mocks.runUpdate.mockResolvedValue({ data: [{ id: 'run-1' }], error: null })
  mocks.projectUpdate.mockReturnValue({ error: null })
})

describe('재점검 반영 요청', () => {
  it('산문을 확정했고 [만들기] 전이면 실행 기록과 목록을 함께 고치고 새 목록을 돌려준다', async () => {
    // 왜: 정상 경로 고정. 실행 기록만 고치면 목록이, 목록만 고치면 [만들기]가 어긋난다 — 한 요청에서 둘 다 고친다.
    const response = await post(addGuard)

    expect(response.status).toBe(200)
    const body = await response.json()
    const guard = body.cast.find((c: { name: string }) => c.name === '경비원')
    expect(guard).toMatchObject({ entityType: 'person', origin: 'treatment' })
    expect(body.newIds).toEqual([guard.localId])
    const [runRow, filters] = mocks.runUpdate.mock.calls[0]
    expect(runRow.status).toBe('awaiting_confirmation')
    expect(runRow.state.characters.characters.map((c: { name: string }) => c.name)).toEqual(['민호', '경비원'])
    expect(runRow.state.scenes.scenes[1].characters_in_scene).toEqual(['char', guard.characterId])
    // 읽은 뒤 다른 곳에서 바뀌었으면 덮어쓰지 않는다 — 읽은 시각 · 상태와 같을 때만 쓴다.
    expect(filters).toEqual(expect.arrayContaining([['id', 'run-1'], ['status', 'awaiting_confirmation'], ['updated_at', version]]))
    expect(mocks.projectUpdate).toHaveBeenCalledWith({ producer_draft: expect.objectContaining({ cast: body.cast, backgrounds: body.backgrounds, settings: draft.settings }) })
  })

  it('[만들기]를 이미 눌렀으면 반영하지 않는다', async () => {
    // 왜: [만들기] 뒤에는 디자인 · 그림이 실행 기록을 읽으며 돈다 — 그 사이에 인물을 바꾸면 그림과 목록이 어긋난다.
    for (const run of [breakdownRun({}, { status: 'running' }), breakdownRun({ input: { story: 'x', sceneGate: true } }), null]) {
      mocks.run.mockResolvedValueOnce(run)
      const response = await post(addGuard)
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'breakdown_closed' })
    }
    expect(mocks.runUpdate).not.toHaveBeenCalled()
    expect(mocks.projectUpdate).not.toHaveBeenCalled()
  })

  it('산문을 확정하기 전이면 반영하지 않는다', async () => {
    // 왜: 확정 전에는 산문이 다시 쓰일 수 있다 — 지금 산문에 맞춘 표시가 새 산문과 어긋난다.
    mocks.run.mockResolvedValue(breakdownRun({ _proseLocked: false }))

    const response = await post(addGuard)

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'prose_not_locked' })
    expect(mocks.runUpdate).not.toHaveBeenCalled()
  })

  it('산문에 없는 말을 넣으라는 요청은 받지 않는다', async () => {
    // 왜: 화면을 거치지 않은 요청도 서버가 산문으로 한 번 더 본다 — 산문에 없는 인물은 산문을 다시 써야 한다(프로토타입).
    const response = await post({ ops: [{ op: 'add', kind: 'person', name: '사장님' }] })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'word_not_in_prose' })
    expect(mocks.runUpdate).not.toHaveBeenCalled()
    expect(mocks.projectUpdate).not.toHaveBeenCalled()
  })

  it('목록에서 빼라는 요청은 받지 않는다', async () => {
    // 왜: 오너 결정 3(2026-10-27) — 재점검은 넣기 · 이름 고치기 · 합치기만 한다.
    const response = await post({ ops: [{ op: 'drop', key: 'treatment:char' }] })

    expect(response.status).toBe(400)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.runUpdate).not.toHaveBeenCalled()
  })

  it('목록에 없는 줄을 고치라고 하면 목록이 바뀌었다고 알린다', async () => {
    // 왜: 다른 창에서 먼저 반영해 그 줄이 합쳐졌으면, 옛 목록으로 고친 것을 덮어쓰지 않고 다시 열게 한다.
    const response = await post({ ops: [{ op: 'rename', key: 'treatment:gone', name: '김 대리' }] })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'list_changed' })
    expect(mocks.runUpdate).not.toHaveBeenCalled()
  })

  it('그 사이 실행 기록이 바뀌면 새 기록으로 다시 계산하고, 계속 바뀌면 다시 열어 달라고 한다', async () => {
    // 왜: 두 창에서 동시에 반영해도 한쪽이 다른 쪽의 결과를 지우지 않는다(산문 확정과 같은 방식).
    mocks.runUpdate.mockResolvedValueOnce({ data: [], error: null })
    const retried = await post(addGuard)
    expect(retried.status).toBe(200)
    expect(mocks.run).toHaveBeenCalledTimes(2)

    vi.clearAllMocks()
    mocks.demo.mockReturnValue(null)
    mocks.access.mockResolvedValue({ ok: true, projectId: 'p1', userId: 'u1', viaShare: false })
    mocks.run.mockResolvedValue(breakdownRun())
    mocks.project.mockReturnValue({ data: { producer_draft: draft }, error: null })
    mocks.runUpdate.mockResolvedValue({ data: [], error: null })
    const gaveUp = await post(addGuard)
    expect(gaveUp.status).toBe(409)
    expect(await gaveUp.json()).toMatchObject({ code: 'list_changed' })
    expect(mocks.projectUpdate).not.toHaveBeenCalled()
  })

  it('목록을 저장하지 못하면 고친 실행 기록을 되돌린다', async () => {
    // 왜: 실행 기록만 바뀌고 목록이 옛것으로 남으면 [만들기]가 화면에 없는 인물을 그린다.
    mocks.projectUpdate.mockReturnValue({ error: { message: 'boom' } })

    const response = await post(addGuard)

    expect(response.status).toBe(500)
    expect(mocks.runUpdate).toHaveBeenCalledTimes(2)
    const [restored, filters] = mocks.runUpdate.mock.calls[1]
    expect(restored.state).toEqual(breakdownRun().state)
    expect(filters).toContainEqual(['updated_at', mocks.runUpdate.mock.calls[0][0].updated_at])
  })

  it('보관 줄을 함께 받으면 그 줄은 비교 대상에서 빼고 목록에는 그대로 남긴다', async () => {
    // 왜: 재점검 창은 이번 화 줄만 보인다 — 서버가 보관 줄까지 비교하면 창에서 되던 넣기를 "이미 있다"며 통째로 거절했다(2026-10-27 검토 지적).
    const keptGuard = { localId: 'series:char_7', characterId: 'char_7', name: '경비원', entityType: 'person', appearance: '회색 제복', origin: 'producer' }
    mocks.project.mockReturnValue({ data: { producer_draft: { ...draft, cast: [...draft.cast, keptGuard] } }, error: null })

    const response = await post({ ...addGuard, kept: ['series:char_7'] })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.cast).toEqual([draft.cast[0], keptGuard])
    expect(body.newIds).toEqual([])
    const [runRow] = mocks.runUpdate.mock.calls[0]
    expect(runRow.state.scenes.scenes[1].characters_in_scene).toEqual(['char', 'char_7'])
  })

  it('목록 저장과 실행 기록 되돌리기가 모두 실패하면 그 사실을 남긴다', async () => {
    // 왜: 되돌리기 결과를 보지 않으면 실행 기록에만 인물이 남은 줄 모른다 — 다음 넣기가 그 인물을 다시 쓰게 했지만(재점검 보관 시험) 기록은 남겨야 한다.
    mocks.projectUpdate.mockReturnValue({ error: { message: 'boom' } })
    mocks.runUpdate.mockResolvedValueOnce({ data: [{ id: 'run-1' }], error: null }).mockResolvedValueOnce({ data: [], error: null })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await post(addGuard)

    expect(response.status).toBe(500)
    expect(logged.mock.calls.some((call) => String(call[0]).includes('rollback failed'))).toBe(true)
    logged.mockRestore()
  })

  it('프로젝트 주인이 아니거나 공유 데모로 들어왔으면 반영하지 않는다', async () => {
    // 왜: 남의 프로젝트 번호로 인물 · 배경 목록을 바꾸거나, 읽기 전용 데모에서 목록을 바꾸면 안 된다.
    mocks.access.mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await post(addGuard)).status).toBe(403)

    mocks.demo.mockReturnValueOnce(Response.json({ error: 'Demo mode is read-only' }, { status: 403 }))
    expect((await post(addGuard)).status).toBe(403)

    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.runUpdate).not.toHaveBeenCalled()
    expect(mocks.projectUpdate).not.toHaveBeenCalled()
  })
})
