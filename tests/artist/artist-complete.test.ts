// 리뉴얼 1차: Artist [완료하기]는 인물 · 배경 대표 그림이 다 있을 때만 받고 Storyboard 를 연다 — 씬 · 샷은 [만들기] 때부터 이어 만들고(2026-10-20), 10/19 배포 때 멈춘 실행은 이어 간다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { completionGaps } from '@/lib/artist/completion'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  getActiveRun: vi.fn(),
  trigger: vi.fn(),
  runUpdate: vi.fn(),
  projectUpdate: vi.fn(),
  rows: { characters: [] as unknown[], appearances: [] as unknown[], locations: [] as unknown[] },
}))

vi.mock('next/server', async (orig) => {
  const actual = await orig<typeof import('next/server')>()
  return { ...actual, after: (fn: () => unknown) => { void fn() } }
})
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.access }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.getActiveRun }))
vi.mock('@/lib/writer/pipeline/steps', () => ({ triggerWriterStep: mocks.trigger }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'writer_runs') {
        return {
          update: (row: Record<string, unknown>) => {
            const q = {
              eq: () => q,
              select: async () => mocks.runUpdate(row),
            }
            return q
          },
        }
      }
      if (table === 'projects') {
        return {
          update: (row: Record<string, unknown>) => ({
            eq: () => ({ in: async (_c: string, values: string[]) => mocks.projectUpdate(row, values) }),
          }),
        }
      }
      const data = table === 'characters' ? mocks.rows.characters : table === 'character_appearances' ? mocks.rows.appearances : mocks.rows.locations
      const q = { select: () => q, eq: () => q, then: (resolve: (v: unknown) => unknown) => resolve({ data, error: null }) }
      return q
    },
  },
}))

import { POST as completeArtist } from '@/app/api/writer/artist-complete/route'

const request = () => new NextRequest('http://localhost/api/writer/artist-complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectId: 'p1' }),
})

const ready = () => {
  mocks.rows.characters = [{ character_id: 'minho', name: '민호', entity_type: 'person' }]
  mocks.rows.appearances = [{ character_id: 'minho', is_default: true, sheet_url: 'https://img/minho.png' }]
  mocks.rows.locations = [{ location_id: 'hall', name: '회사 복도', wide_shot: 'https://img/hall.png' }]
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.access.mockResolvedValue({ ok: true, projectId: 'p1', userId: 'u1', viaShare: false })
  mocks.getActiveRun.mockResolvedValue({ id: 'run-1', status: 'awaiting_artist', state: { input: { artistGate: true } }, updated_at: '2026-10-19T00:00:00Z' })
  mocks.runUpdate.mockResolvedValue({ data: [{ id: 'run-1' }], error: null })
  mocks.projectUpdate.mockResolvedValue({ error: null })
  ready()
})

describe('Artist 완료하기', () => {
  // 왜: 프로토타입 "인물 · 배경 대표 그림이 하나라도 없으면 넘어갈 수 없다".
  it('대표 그림이 없는 인물 · 배경 이름을 알려 준다', () => {
    expect(completionGaps(
      [{ character_id: 'minho', name: '민호', entity_type: 'person' }, { character_id: 'cup', name: '컵', entity_type: 'object' }],
      [{ character_id: 'minho', is_default: true, sheet_url: null }],
      [{ location_id: 'hall', name: '회사 복도', wide_shot: null }],
    )).toEqual({ characters: ['민호'], locations: ['회사 복도'] })
  })

  // 왜: 화면 버튼이 꺼져 있어도 서버가 한 번 더 막는다 — 그림 없는 인물로 샷을 나누면 러프 · 영상이 비어 버린다.
  it('대표 그림이 없는 인물 · 배경이 있으면 완료하기를 받지 않는다', async () => {
    mocks.rows.appearances = []

    const response = await completeArtist(request())

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'artist_images_missing', missing: { characters: ['민호'] } })
    expect(mocks.runUpdate).not.toHaveBeenCalled()
  })

  // 왜: 10/19 배포 때 [만들기]로 이어 가 디자인 뒤에 멈춘 실행은 [완료하기]가 이어 씬 · 샷 나누기(08~15)를 돌리고 Storyboard 를 연다.
  it('멈춰 기다리던 실행(10/19 배포 때 만든 것)은 완료하기를 누르면 이어서 씬 · 샷을 나누고 Storyboard가 열린다', async () => {
    const response = await completeArtist(request())

    expect(response.status).toBe(200)
    expect(mocks.runUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'running', state: expect.objectContaining({ _artistCompleted: true }) }))
    expect(mocks.projectUpdate).toHaveBeenCalledWith({ current_stage: 'writer' }, ['entry', 'producer', 'artist'])
    expect(mocks.trigger).toHaveBeenCalledWith('http://localhost', 'p1')
  })

  // 왜: 2026-10-20부터 [만들기]가 씬 · 샷까지 이어 만든다 — 완료하기는 그 실행을 건드리지 않고(두 번 시작하지 않는다) Storyboard 만 연다.
  it('씬 · 샷을 나누는 중이거나 다 나눈 실행이면 실행은 그대로 두고 Storyboard 를 연다', async () => {
    for (const status of ['running', 'completed']) {
      vi.clearAllMocks()
      mocks.projectUpdate.mockResolvedValue({ error: null })
      mocks.getActiveRun.mockResolvedValue({ id: 'run-1', status, current_stage: 'decoupage', state: {}, updated_at: 'x' })

      const response = await completeArtist(request())

      expect(response.status, status).toBe(200)
      expect(mocks.runUpdate).not.toHaveBeenCalled()
      expect(mocks.trigger).not.toHaveBeenCalled()
      expect(mocks.projectUpdate).toHaveBeenCalledWith({ current_stage: 'writer' }, ['entry', 'producer', 'artist'])
    }
  })

  // 왜: 씬 · 샷 나누기가 멈췄어도 Artist 일(그림)은 끝났다 — Storyboard 에서 멈춘 이유와 [이어서 재시도]를 본다.
  it('씬 · 샷 나누기가 멈춘 실행이어도 완료하기를 받고 Storyboard 를 연다', async () => {
    mocks.getActiveRun.mockResolvedValue({ id: 'run-1', status: 'failed', current_stage: 'shotsAndDialogue', state: {}, updated_at: 'x' })

    const response = await completeArtist(request())

    expect(response.status).toBe(200)
    expect(mocks.runUpdate).not.toHaveBeenCalled()
    expect(mocks.projectUpdate).toHaveBeenCalledWith({ current_stage: 'writer' }, ['entry', 'producer', 'artist'])
  })

  // 왜: [만들기] 전(산문 초안이 그대로)이거나 실행이 없으면 넘길 씬 · 샷이 없다.
  it('만들기 전이거나 실행이 없으면 완료하기를 받지 않는다', async () => {
    for (const run of [{ id: 'run-1', status: 'awaiting_confirmation', current_stage: 'storyCheck', state: { input: { treatmentDraft: true } }, updated_at: 'x' }, null]) {
      vi.clearAllMocks()
      mocks.getActiveRun.mockResolvedValue(run)

      const response = await completeArtist(request())

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'artist_not_started' })
      expect(mocks.projectUpdate).not.toHaveBeenCalled()
    }
  })

  // 왜: 화면은 디자인이 끝나야 [완료하기]를 보이지만, 서버도 같은 규칙으로 막는다 — 오래된 화면이나 직접 부른 요청이
  //   디자인 중인 실행을 넘기면 인물 · 배경 행이 다 생기기 전에 Storyboard 가 열린다(검토 지적).
  it('인물 · 배경을 디자인하는 중인 실행이면 완료하기를 받지 않는다', async () => {
    for (const current_stage of ['visualFormat', 'v2Design']) {
      vi.clearAllMocks()
      mocks.getActiveRun.mockResolvedValue({ id: 'run-1', status: 'running', current_stage, state: {}, updated_at: 'x' })

      const response = await completeArtist(request())

      expect(response.status, current_stage).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'artist_design_unfinished' })
      expect(mocks.projectUpdate).not.toHaveBeenCalled()
    }
  })

  // 왜: 산문 초안(확정 전 · 만들기 전) 실행은 넘길 디자인이 없다.
  it('아직 산문 초안인 실행은 완료하기를 받지 않는다', async () => {
    mocks.getActiveRun.mockResolvedValue({ id: 'run-1', status: 'running', current_stage: 'scenes', state: { input: { treatmentDraft: true } }, updated_at: 'x' })

    const response = await completeArtist(request())

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'artist_not_started' })
  })

  // 왜: Storyboard 를 열지 못했는데 됐다고 하면 화면은 넘어가고, 새로고침하면 다시 잠긴다.
  it('Storyboard 를 열지 못하면 됐다고 하지 않는다', async () => {
    mocks.getActiveRun.mockResolvedValue({ id: 'run-1', status: 'completed', current_stage: 'persistShots', state: {}, updated_at: 'x' })
    mocks.projectUpdate.mockResolvedValue({ error: { message: 'db down' } })

    const response = await completeArtist(request())

    expect(response.status).toBe(500)
  })
})
