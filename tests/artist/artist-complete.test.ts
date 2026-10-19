// 리뉴얼 1차: Artist [완료하기]는 인물 · 배경 대표 그림이 다 있을 때만 받고, 멈춘 실행을 이어 Storyboard 를 연다 (2026-10-19)
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

  // 왜: [완료하기]가 멈춘 실행을 이어 씬 · 샷 나누기(08~15)를 돌리고 Storyboard 를 연다.
  it('완료하기를 누르면 멈춘 실행이 이어서 씬 · 샷을 나누고 Storyboard가 열린다', async () => {
    const response = await completeArtist(request())

    expect(response.status).toBe(200)
    expect(mocks.runUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'running', state: expect.objectContaining({ _artistCompleted: true }) }))
    expect(mocks.projectUpdate).toHaveBeenCalledWith({ current_stage: 'writer' }, ['entry', 'producer', 'artist'])
    expect(mocks.trigger).toHaveBeenCalledWith('http://localhost', 'p1')
  })

  // 왜: 두 번 누르거나 다른 화면에서 이미 이어 간 경우 새로 시작하지 않는다.
  it('완료하기를 기다리는 실행이 없으면 이어 가지 않고 알린다', async () => {
    mocks.getActiveRun.mockResolvedValue({ id: 'run-1', status: 'completed', state: {}, updated_at: 'x' })

    const response = await completeArtist(request())

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'artist_not_waiting' })
    expect(mocks.trigger).not.toHaveBeenCalled()
  })
})
