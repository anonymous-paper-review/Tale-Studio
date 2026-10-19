// 리뉴얼 1차: Writer [브레이크다운하기]는 산문을 잠그고 Artist 를 연다 — 확정한 산문은 서버도 고치지 않는다 (2026-10-19)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  run: vi.fn(),
  runUpdate: vi.fn(),
  projectUpdate: vi.fn(),
  trigger: vi.fn(),
  after: vi.fn(),
}))

vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: mocks.after }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.access }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.run }))
vi.mock('@/lib/writer/pipeline/steps', () => ({ triggerWriterStep: mocks.trigger }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'projects') {
        return {
          update: (row: Record<string, unknown>) => ({
            eq: () => ({ in: async (_column: string, values: string[]) => mocks.projectUpdate(row, values) }),
          }),
        }
      }
      return {
        update: (row: Record<string, unknown>) => {
          const q = { eq: () => q, select: async () => mocks.runUpdate(row) }
          return q
        },
      }
    },
  },
}))

import { POST as confirmProse } from '@/app/api/writer/prose-confirm/route'
import { POST as sceneGate } from '@/app/api/writer/scene-gate/route'

const version = '2026-10-19T01:00:00.000Z'
const scenes = { scenes: [{ scene_id: 's1', scene_actions: ['민호가 자판기 앞에서 동전을 찾는다.'], location: 'hall', characters_in_scene: [], estimated_seconds: 12 }], total_estimated_seconds: 12 }
const draftRun = (state: Record<string, unknown> = {}) => ({
  id: 'run-1',
  status: 'awaiting_confirmation',
  updated_at: version,
  state: { input: { story: '자판기 앞에서 벌어진 일', treatmentDraft: true, sceneGate: true }, scenes, ...state },
})
const post = (body: Record<string, unknown> = {}) => confirmProse(new NextRequest('http://localhost/api/writer/prose-confirm', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectId: 'p1', ...body }),
}))
const gate = (body: Record<string, unknown>) => sceneGate(new NextRequest('http://localhost/api/writer/scene-gate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectId: 'p1', ...body }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.access.mockResolvedValue({ ok: true, projectId: 'p1', userId: 'u1', viaShare: false })
  mocks.run.mockResolvedValue(draftRun())
  mocks.runUpdate.mockResolvedValue({ data: [{ id: 'run-1' }], error: null })
  mocks.projectUpdate.mockResolvedValue({ error: null })
})

describe('산문 확정', () => {
  // 왜: 프로토타입 W6 "예, 확정하기" — 확정하면 산문이 잠기고 Artist 가 열린다. 인물 · 배경 디자인은 Artist [만들기]에서 시작한다.
  it('산문을 확정하면 산문이 잠기고 Artist 단계가 열린다', async () => {
    const response = await post()

    expect(response.status).toBe(200)
    expect(mocks.runUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'awaiting_confirmation',
      state: expect.objectContaining({ _proseLocked: true, scenes }),
    }))
    expect(mocks.projectUpdate).toHaveBeenCalledWith({ current_stage: 'artist' }, ['entry', 'producer'])
    // 확정은 잠그기만 한다 — 실행을 이어 가지 않는다(이어 가는 건 Artist [만들기]).
    expect(mocks.trigger).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })

  // 왜: 고르지 않은 수정안이 남은 채 잠그면 그 수정안을 영영 적용하거나 버릴 수 없다.
  it('정하지 않은 AI 수정안이 있으면 산문을 확정하지 않는다', async () => {
    mocks.run.mockResolvedValue(draftRun({ _sceneStoryProposal: { id: 'p', status: 'ready', feedback: 'x', createdAt: version, baseScenes: scenes } }))

    const response = await post()

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'scene_story_proposal_pending' })
    expect(mocks.runUpdate).not.toHaveBeenCalled()
    expect(mocks.projectUpdate).not.toHaveBeenCalled()
  })

  // 왜: 초안을 쓰는 중이거나 실패해 산문이 없으면 잠글 것이 없다.
  it('다 쓴 산문이 없으면 확정하지 않는다', async () => {
    mocks.run.mockResolvedValue({ ...draftRun(), status: 'running' })

    const response = await post()

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'prose_missing' })
    expect(mocks.projectUpdate).not.toHaveBeenCalled()
  })

  // 왜: 두 번 누르거나 다른 탭에서 이미 확정했어도 오류 없이 Artist 로 간다.
  it('이미 확정한 산문을 다시 확정하면 잠금을 그대로 두고 Artist 를 연다', async () => {
    mocks.run.mockResolvedValue(draftRun({ _proseLocked: true }))

    const response = await post()

    expect(response.status).toBe(200)
    expect(mocks.runUpdate).not.toHaveBeenCalled()
    expect(mocks.projectUpdate).toHaveBeenCalledWith({ current_stage: 'artist' }, ['entry', 'producer'])
  })

  // 왜: 프로토타입 "브레이크다운하면 잠겨요" — 화면 버튼이 꺼져 있어도 서버가 한 번 더 막는다.
  it.each([
    ['save', { expectedStoryVersion: version, scenes: [{ sceneId: 's1', beats: ['고친 문장'] }] }],
    ['rewrite', { level: 'reword' }],
    ['revise', { feedback: '더 짧게' }],
    ['apply', { proposalId: 'p' }],
    ['undo', { undoId: 'u' }],
  ])('확정한 산문은 고치는 요청(%s)을 받지 않는다', async (action, extra) => {
    mocks.run.mockResolvedValue(draftRun({ _proseLocked: true }))

    const response = await gate({ action, ...extra })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'prose_locked' })
    expect(mocks.runUpdate).not.toHaveBeenCalled()
  })
})
