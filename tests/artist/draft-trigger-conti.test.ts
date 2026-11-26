// 산문을 확정해 콘티에서 씬 · 샷을 나누는 동안(저장 단계 conti)에는 인물 · 배경 그림 초안을 그리지 않고, Artist 가 열린 프로젝트는 지금처럼 그리는지 검사한다 (오너 2026-11-26 O1)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  project: { design_tokens: { palette: [] }, workspace_id: null as string | null, custom_style_anchor: null, current_stage: 'conti' } as Record<string, unknown>,
  tables: [] as string[],
  events: [] as Array<{ kind: string; detail: Record<string, unknown> }>,
}))

/** 어떤 줄을 이어 불러도 같은 묶음을 돌려주고, 기다리면 빈 결과가 나오는 가짜 질의. projects 한 줄 읽기만 프로젝트 행을 준다. */
function query(table: string): unknown {
  const empty = { data: [], error: null, count: 0 }
  const q: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'neq', 'in', 'is', 'not', 'order', 'limit', 'gte', 'lte', 'filter', 'match', 'or', 'contains']) q[name] = () => q
  q.maybeSingle = async () => ({ data: table === 'projects' ? mocks.project : null, error: null })
  q.single = q.maybeSingle
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(empty).then(resolve)
  return q
}

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (table: string) => { mocks.tables.push(table); return query(table) } } }))
vi.mock('@/lib/writer/debug-events', () => ({
  recordWriterObservabilityEvent: vi.fn(async (_projectId: string, kind: string, detail: Record<string, unknown>) => { mocks.events.push({ kind, detail }) }),
}))

import { triggerAssetDrafts } from '@/lib/artist/draft-trigger'

const zero = { submitted: 0, skipped: 0, failed: 0 }

beforeEach(() => {
  mocks.project = { design_tokens: { palette: [] }, workspace_id: null, custom_style_anchor: null, current_stage: 'conti' }
  mocks.tables.length = 0
  mocks.events.length = 0
})

describe('콘티 동안의 Artist 그림 초안', () => {
  // 왜(혼자 정한 것): O1 "Artist [만들기]는 그림만" — 산문을 확정하면 디자인 · 씬 · 샷 나누기가 바로 돌지만, 인물 · 배경 그림은 Artist [만들기]가 그린다.
  //   그때 그리면 사용자가 Artist 에서 그림체를 바꾸기 전에 그림이 먼저 생긴다.
  it('저장 단계가 콘티인 프로젝트는 인물 · 배경 그림 초안을 그리지 않고 Artist 를 기다린다고 남긴다', async () => {
    const result = await triggerAssetDrafts('p-conti')
    expect(result).toEqual({ characters: zero, worlds: zero })
    expect(mocks.tables).toEqual(['projects'])
    expect(mocks.events.map((e) => e.kind)).toContain('asset_trigger_deferred')
    expect(mocks.events.find((e) => e.kind === 'asset_trigger_deferred')?.detail).toMatchObject({ reason: 'before_artist' })
  })

  // 왜: 정상 경로 고정 — Artist 가 열린 프로젝트(예전 흐름 [만들기] · Artist 의 다시 그리기)는 지금처럼 그림 초안으로 간다.
  it('저장 단계가 Artist 인 프로젝트는 지금처럼 인물 · 배경 그림 초안으로 간다', async () => {
    mocks.project = { ...mocks.project, current_stage: 'artist' }
    await triggerAssetDrafts('p-artist')
    expect(mocks.tables.filter((t) => t !== 'projects').length).toBeGreaterThan(0)
    expect(mocks.events.some((e) => e.detail.reason === 'before_artist')).toBe(false)
  })
})
