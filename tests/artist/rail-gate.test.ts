// 레일 Artist 칸 표시가 쓰는 그림 준비 판정이 Artist [완료하기]와 같은 기준으로 그린 그림을 세고, [이미지 만들기] 전을 멈춘 것으로 보지 않는지 검사한다 (오너 2026-11-27 N7)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  tables: {} as Record<string, Array<Record<string, unknown>>>,
}))
vi.mock('@/lib/writer/run-store', () => ({ getRunStatusLight: mocks.run, estimateRunTotalMs: vi.fn(async () => null) }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: vi.fn(async (_req: Request, projectId: string) => ({ ok: true as const, projectId, userId: 'u', viaShare: false })) }))
vi.mock('@/lib/generation-jobs', () => ({ STALE_QUEUED_MS: 10 * 60 * 1000 }))
// 표마다 걸러 돌려주는 작은 흉내 — 이 시험이 쓰는 걸러내기(eq · in · is · not is null · gte · lt)만.
vi.mock('@/lib/supabase/admin', () => {
  const from = (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = []
    let head = false
    const q: Record<string, unknown> = {}
    q.select = (_cols?: string, opts?: { head?: boolean }) => { head = opts?.head === true; return q }
    q.eq = (col: string, value: unknown) => { filters.push((row) => row[col] === value); return q }
    q.in = (col: string, values: unknown[]) => { filters.push((row) => values.includes(row[col])); return q }
    q.is = (col: string, value: unknown) => { filters.push((row) => (value === null ? row[col] == null : row[col] === value)); return q }
    q.not = (col: string, _op: string, _value: unknown) => { filters.push((row) => row[col] != null); return q }
    q.gte = (col: string, value: string) => { filters.push((row) => String(row[col]) >= value); return q }
    q.lt = (col: string, value: string) => { filters.push((row) => String(row[col]) < value); return q }
    q.limit = () => q
    q.order = () => q
    const rows = () => (mocks.tables[table] ?? []).filter((row) => filters.every((f) => f(row)))
    q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null })
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: head ? null : rows(), count: rows().length, error: null }).then(resolve)
    return q
  }
  return { supabaseAdmin: { from } }
})

import { GET } from '@/app/api/writer/status/[projectId]/route'

const P = 'project-gate'
const OLD = new Date(Date.now() - 60 * 60 * 1000).toISOString()
async function assets() {
  const res = await GET(new Request(`http://localhost/api/writer/status/${P}?assets=1`) as unknown as NextRequest, { params: Promise.resolve({ projectId: P }) })
  return ((await res.json()) as { assets: { chars_ready: number; images_ready: boolean; stalled: boolean; failed_count: number } }).assets
}
const NEWER = new Date(Date.now() - 30 * 60 * 1000).toISOString()

beforeEach(() => {
  mocks.run.mockReset().mockResolvedValue({ status: 'completed', completed_units: 1, total_units: 1, current_stage: null, timings: {}, engine: 'v2' })
  mocks.tables = {
    projects: [{ id: P, design_tokens: { look: true } }],
    characters: [{ project_id: P, character_id: 'mina', origin: 'producer', view_main: null }],
    character_appearances: [],
    character_image_candidates: [],
    locations: [{ project_id: P, location_id: 'bus', wide_shot: 'https://img/bus.png' }],
    generation_jobs: [],
    shots: [],
  }
})

describe('레일 Artist 칸의 그림 준비 판정', () => {
  // 왜(오너 N7 · 2026-11-27 실측 — 시험 복사본의 올린 인물 그림): 대표 모습 시트(올린 그림 포함)가 있는데 예전 칸(대표 그림)이 비어 있어
  //   "오래 걸림"으로 잡혔다 — 레일 표시가 보이게 되면 다 그린 프로젝트에 늘 거짓 경보가 뜬다. 초안 그리기 · [완료하기]가 그린 것으로 보는 기준과 같게 센다.
  it('대표 모습에 시트가 있는 인물은 올린 그림이어도 그린 것으로 센다 — Artist [완료하기]와 같은 기준', async () => {
    mocks.tables.character_appearances = [{ project_id: P, character_id: 'mina', is_default: true, sheet_url: 'https://img/upload.jpg' }]
    const got = await assets()
    expect(got.chars_ready).toBe(1)
    expect(got.images_ready).toBe(true)
    expect(got.stalled).toBe(false)
  })

  // 왜(오너 N7 · m1126 O1 콘티를 Artist 앞에): 새 흐름은 씬 · 샷을 먼저 나누고 Artist [이미지 만들기]를 누를 때 그린다 —
  //   누르기 전(그림 작업이 한 번도 없음)은 기다리는 중이 아니라 아직 시작하지 않은 것이다. 멈춤으로 보면 "평소보다 오래 걸려요"가 뜬다.
  it('씬 · 샷이 먼저 나뉘었고 Artist 그림 작업이 한 번도 없으면 그림이 없어도 멈춘 것으로 보지 않는다 — [이미지 만들기] 전', async () => {
    mocks.tables.shots = [{ project_id: P, shot_id: 'sh_01_01' }]
    const got = await assets()
    expect(got.images_ready).toBe(false)
    expect(got.stalled).toBe(false)
  })

  // 왜(정상 경로 고정 — #stale-gate): [이미지 만들기]로 그림을 맡긴 뒤 그리는 작업이 없는데 그림이 빠져 있으면 정말 멈춘 것이다.
  it('[이미지 만들기] 뒤 그리는 작업이 없는데 그림이 빠져 있으면 지금처럼 멈춘 것으로 본다', async () => {
    mocks.tables.shots = [{ project_id: P, shot_id: 'sh_01_01' }]
    mocks.tables.generation_jobs = [{ project_id: P, kind: 'world_shot', status: 'completed', created_at: OLD }]
    const got = await assets()
    expect(got.images_ready).toBe(false)
    expect(got.stalled).toBe(true)
  })
  // 왜(검토 rev-flow 리드 3): 실패 수가 지난 실패까지 세서, 다시 그려 그림이 생긴 대상도 "생성 실패"로 레일 점을 띄웠다.
  it('같은 대상을 다시 그려 그림이 생겼으면 그 대상의 지난 실패는 실패로 세지 않는다', async () => {
    mocks.tables.character_appearances = [{ project_id: P, character_id: 'mina', is_default: true, sheet_url: 'https://img/mina.png' }]
    mocks.tables.generation_jobs = [
      { project_id: P, kind: 'world_shot', status: 'failed', created_at: OLD, target: { locationId: 'bus', column: 'wide_shot' } },
      { project_id: P, kind: 'world_shot', status: 'completed', created_at: NEWER, target: { locationId: 'bus', column: 'wide_shot' } },
      { project_id: P, kind: 'character_view', status: 'failed', created_at: OLD, target: { characterId: 'mina', appearanceKey: 'current', view: 'main' } },
    ]
    const got = await assets()
    expect(got.failed_count).toBe(0)
    expect(got.images_ready).toBe(true)
  })

  // 왜(검토 rev-flow 리드 3): 대상마다 가장 최근 작업이 실패이고 그 그림이 지금 없을 때만 "다시 그려야 할 실패"다.
  it('대상마다 가장 최근 작업이 실패이고 그 그림이 지금 없을 때만 실패로 센다', async () => {
    mocks.tables.locations = [
      { project_id: P, location_id: 'bus', wide_shot: null },
      { project_id: P, location_id: 'room', wide_shot: 'https://img/room.png' },
    ]
    mocks.tables.generation_jobs = [
      { project_id: P, kind: 'world_shot', status: 'completed', created_at: OLD, target: { locationId: 'bus', column: 'wide_shot' } },
      { project_id: P, kind: 'world_shot', status: 'failed', created_at: NEWER, target: { locationId: 'bus', column: 'wide_shot' } },
      { project_id: P, kind: 'world_shot', status: 'failed', created_at: NEWER, target: { locationId: 'room', column: 'wide_shot' } },
    ]
    const got = await assets()
    expect(got.failed_count).toBe(1)
    expect(got.images_ready).toBe(false)
  })
})
