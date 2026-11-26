// 소품 지난 그림을 [채택]하면 그 칸(소품 × 모습)의 지금 그림이 그 그림으로 바뀌고, 다른 칸 · 다른 작품 스타일 판 그림은 고르지 않는다 (오너 2026-11-26 A4 · 리드 승인 소품 기록 표)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { memorySupabase, mediaUrlOf } from '../fixtures/_memory-supabase'

const state = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('../fixtures/_memory-supabase').memorySupabase>,
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: new Proxy({}, { get: (_target, key) => (state.db.client as unknown as Record<string | symbol, unknown>)[key] }),
}))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: vi.fn(async (_req: Request, projectId: string) => ({ ok: true, projectId, userId: 'owner-1', viaShare: false })) }))

import { POST as selectPropCandidate } from '@/app/api/artist/select-prop-candidate/route'

const P = 'p1'
const WS = 'ws1'
const url = (name: string) => mediaUrlOf(`${WS}/${P}/props/${name}.png`)
const post = (body: unknown) => new NextRequest('http://localhost/api/artist/select-prop-candidate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const candidate = (id: string, propId: string, appearanceKey: string, hour: number, selected = false) => ({
  id, project_id: P, prop_id: propId, appearance_key: appearanceKey, url: url(id), source_hash: `hash-${id}`, appearance_hash: null,
  job_id: null, is_selected: selected, pinned: false, generated_at: `2026-11-26T0${hour}:00:00.000Z`,
})

function seed(versions: Array<Record<string, unknown>> = []) {
  return memorySupabase({
    projects: [{ id: P, workspace_id: WS, style_anchor_key: 'real', custom_style_anchor: null }],
    props: [
      { project_id: P, prop_id: 'sword', name: '칼', image_url: url('sword-b'), source_hash: 'hash-sword-b' },
      { project_id: P, prop_id: 'cup', name: '잔', image_url: url('cup-a'), source_hash: 'hash-cup-a' },
    ],
    prop_appearances: [{ project_id: P, prop_id: 'sword', appearance_key: 'broken', label: '부러진 칼', image_url: url('broken-b'), source_hash: 'hash-broken-b' }],
    prop_image_candidates: [
      candidate('sword-a', 'sword', 'default', 1),
      candidate('sword-b', 'sword', 'default', 2, true),
      candidate('broken-a', 'sword', 'broken', 1),
      candidate('broken-b', 'sword', 'broken', 2, true),
      candidate('cup-a', 'cup', 'default', 1, true),
    ],
    artist_versions: versions,
  }, {
    prop_image_candidates: [{ columns: ['project_id', 'prop_id', 'appearance_key'], where: (row) => row.is_selected === true }],
  })
}

beforeEach(() => {
  state.db = seed()
})

const selected = () => state.db.rows('prop_image_candidates').filter((row) => row.is_selected).map((row) => row.id).sort()
const prop = (id: string) => state.db.rows('props').find((row) => row.prop_id === id)!

describe('소품 지난 그림 [채택]', () => {
  it('소품 기록에서 예전 그림을 채택하면 그 칸의 지금 그림이 그 그림으로 옮고, 소품 그림과 그림 지문도 그 그림 것으로 바뀐다', async () => {
    // 왜: 오너 A4 "과거 클릭 후 상세페이지로 들어가면 '채택' → 최종 버전으로 지정됨". 지문을 그대로 두면 예전 생김새로 그린 그림에
    //   "설명 바뀜" · "그림체 바뀜" 표시가 붙지 않는다 — 소품 카드는 그림 지문(props.source_hash)으로 가린다.
    const res = await selectPropCandidate(post({ projectId: P, propId: 'sword', appearanceKey: 'default', candidateId: 'sword-a' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, url: url('sword-a') })
    expect(selected()).toEqual(['broken-b', 'cup-a', 'sword-a'])
    expect(prop('sword')).toMatchObject({ image_url: url('sword-a'), source_hash: 'hash-sword-a' })
  })

  it('다른 모습의 소품 그림을 채택하면 그 모습 그림만 바뀌고 기본 모습의 지금 그림은 그대로다', async () => {
    // 왜: 소품의 지금 그림은 모습마다 하나다(소품 기록 표 색인) — 배경과 달리 다른 모습의 지금 표시를 내리지 않는다.
    const res = await selectPropCandidate(post({ projectId: P, propId: 'sword', appearanceKey: 'broken', candidateId: 'broken-a' }))
    expect(res.status).toBe(200)
    expect(selected()).toEqual(['broken-a', 'cup-a', 'sword-b'])
    expect(state.db.rows('prop_appearances')[0]).toMatchObject({ image_url: url('broken-a'), source_hash: 'hash-broken-a' })
    expect(prop('sword')).toMatchObject({ image_url: url('sword-b'), source_hash: 'hash-sword-b' })
  })

  it('다른 소품이나 다른 모습 칸의 그림은 고를 수 없고 아무것도 바꾸지 않는다', async () => {
    // 왜: 화면이 칸을 잘못 보내도 다른 소품 · 다른 모습 그림이 이 칸의 지금 그림이 되면 안 된다(인물 · 배경 고르기와 같은 칸 확인).
    expect((await selectPropCandidate(post({ projectId: P, propId: 'cup', appearanceKey: 'default', candidateId: 'sword-a' }))).status).toBe(404)
    expect((await selectPropCandidate(post({ projectId: P, propId: 'sword', appearanceKey: 'broken', candidateId: 'sword-a' }))).status).toBe(404)
    expect((await selectPropCandidate(post({ projectId: P, propId: 'sword', candidateId: 'sword-a' }))).status).toBe(400)
    expect(selected()).toEqual(['broken-b', 'cup-a', 'sword-b'])
    expect(prop('sword').image_url).toBe(url('sword-b'))
  })

  it('지금 작품 스타일과 다른 판에서 그린 소품 그림은 채택하지 않는다', async () => {
    // 왜: 작품 스타일은 하나다(10/28 오너) — 다른 스타일 그림을 소품 하나만 되돌리면 작품 안에 스타일이 섞인다(인물 · 배경과 같은 거절).
    state.db = seed([
      { id: 'v1', project_id: P, n: 1, style_anchor_key: 'watercolor', custom_style_anchor: null, is_current: false, active: [{ from: null, to: '2026-11-26T01:30:00.000Z' }] },
      { id: 'v2', project_id: P, n: 2, style_anchor_key: 'real', custom_style_anchor: null, is_current: true, active: [{ from: '2026-11-26T01:30:00.000Z', to: null }] },
    ])
    const res = await selectPropCandidate(post({ projectId: P, propId: 'sword', appearanceKey: 'default', candidateId: 'sword-a' }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('other_style')
    expect(selected()).toEqual(['broken-b', 'cup-a', 'sword-b'])
  })
})
