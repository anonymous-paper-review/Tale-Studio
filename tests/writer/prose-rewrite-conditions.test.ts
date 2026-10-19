// 리뉴얼 1차: Writer [AI 다시 쓰기]의 조건(러닝타임 · 장르·분위기 · 소재)은 안을 적용할 때만 지금 산문의 조건이 된다 (2026-10-19)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  access: vi.fn(), run: vi.fn(), from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), trigger: vi.fn(), after: vi.fn(),
}))
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: mocks.after }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.access }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.run }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/writer/pipeline/steps', () => ({ triggerWriterStep: mocks.trigger }))

import { POST } from '@/app/api/writer/scene-gate/route'
import { newRewriteProposal } from '@/lib/producer/scene-story-rewrite'
import { proseConditionsOf, rewriteBasis } from '@/lib/writer/prose-conditions'

const version = '2026-10-19T02:00:00.000Z'
const scene = (id: string, text: string) => ({ scene_id: id, scene_actions: [text], location: 'hall', characters_in_scene: [], estimated_seconds: 12 })
const original = { scenes: [scene('s1', '민호가 동전을 찾는다.'), scene('s2', '자판기가 동전을 삼킨다.')], total_estimated_seconds: 24 }
const genre = { genre: '드라마', tone: [], targetEmotion: [], runtime_seconds: 60, depth_level: 'D2', format: 'horizontal_16:9' }
const run = (state: Record<string, unknown> = {}) => ({
  id: 'run-1', status: 'awaiting_confirmation', updated_at: version,
  state: {
    input: { story: '자판기 앞에서 벌어진 일', treatmentDraft: true, sceneGate: true, runtimeSeconds: 60, genre },
    genre, narrativeStructure: { structure_type: 'kishotenketsu', acts: [{ act_id: 'act_1' }] },
    characters: { characters: [], relationships: [], subtext_notes: [] }, world: { locations: [] },
    scenes: original, _sceneStoryVersion: 'story-1',
    ...state,
  },
})
const conditions = { runtimeSeconds: 300, genre: '코미디', seed: 'keep' as const }
const readyWithConditions = (seed: 'keep' | 'new') => {
  const proposal = newRewriteProposal({ id: 'p1', level: seed === 'new' ? 'rethink' : 'reword', feedback: 'conditions', baseScenes: original as never, createdAt: new Date().toISOString(), conditions: { ...conditions, seed } })
  return {
    ...proposal,
    status: 'ready' as const,
    variants: proposal.variants!.map((variant, i) => ({
      ...variant,
      status: 'ready' as const,
      scenes: { scenes: [scene('s1', `민호가 동전을 찾는다 ${i + 1}.`), scene('s2', '자판기가 동전을 삼킨다.')], total_estimated_seconds: 24 },
      narrativeStructure: { structure_type: '3-act', acts: [{ act_id: 'act_1' }, { act_id: 'act_2' }] },
    })),
  }
}
const post = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/writer/scene-gate', {
  method: 'POST', body: JSON.stringify({ projectId: 'p1', ...body }), headers: { 'Content-Type': 'application/json' },
}))
const saved = () => mocks.update.mock.calls.at(-1)![0]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.access.mockResolvedValue({ ok: true, projectId: 'p1' })
  mocks.run.mockResolvedValue(run())
  const query = { update: mocks.update, eq: mocks.eq, select: mocks.select }
  mocks.from.mockReturnValue(query)
  mocks.update.mockReturnValue(query)
  mocks.eq.mockReturnValue(query)
  mocks.select.mockResolvedValue({ data: [{ id: 'run-1' }], error: null })
})

describe('조건으로 다시 쓰기', () => {
  // 왜: 프로토타입 W3 — 조건은 [이 조건으로 다시 쓰기]로 세 안을 만들 뿐, 안을 적용하기 전에는 산문 조건이 그대로다.
  it('조건을 골라 다시 쓰면 세 가지 안을 만들고 지금 산문의 조건은 그대로 둔다', async () => {
    const response = await post({ action: 'rewrite', conditions })

    expect(response.status).toBe(200)
    const state = saved().state
    expect(state._sceneStoryProposal.conditions).toEqual(conditions)
    expect(state._sceneStoryProposal.level).toBe('reword')
    expect(state._sceneStoryProposal.variants).toHaveLength(3)
    expect(state.input.runtimeSeconds).toBe(60)
    expect(state.genre.genre).toBe('드라마')
    expect(state.scenes).toEqual(original)
  })

  // 왜: 프로토타입 소재 "새롭게 · 소재부터 새로" — 지금 이야기와 사건 · 결말이 다른 안을 쓴다.
  it('소재를 새롭게로 고르면 아이디어부터 다시 쓴다', async () => {
    await post({ action: 'rewrite', conditions: { ...conditions, seed: 'new' } })

    expect(saved().state._sceneStoryProposal.level).toBe('rethink')
  })

  // 왜: 조건을 바꿔 쓴 안을 고르면 그 안이 쓰인 조건이 산문 위 "지금 산문" 줄과 뒷단계 길이가 된다.
  it('조건을 바꿔 쓴 안을 적용하면 그 조건이 지금 산문의 조건이 된다', async () => {
    mocks.run.mockResolvedValue(run({ _sceneStoryProposal: readyWithConditions('keep') }))

    const response = await post({ action: 'apply', proposalId: 'p1', variantId: 'v2' })

    expect(response.status).toBe(200)
    const state = saved().state
    expect(state.scenes.scenes[0].scene_actions).toEqual(['민호가 동전을 찾는다 2.'])
    expect(state.input.runtimeSeconds).toBe(300)
    expect(state.input.genre).toMatchObject({ genre: '코미디', runtime_seconds: 300 })
    expect(state.genre).toMatchObject({ genre: '코미디', runtime_seconds: 300, depth_level: 'D3' })
    // 러닝타임을 바꿔 다시 잡은 이야기 구조도 그 안의 것으로 바뀐다.
    expect(state.narrativeStructure).toMatchObject({ structure_type: '3-act' })
    expect(proseConditionsOf(state)).toEqual({ runtimeSeconds: 300, genre: '코미디', seed: 'keep' })
  })

  // 왜: 적용 직전으로 되돌리면 산문뿐 아니라 그 산문을 쓴 조건도 돌아가야 "지금 산문" 줄이 맞는다.
  it('조건을 바꿔 쓴 안을 적용했다가 되돌리면 조건도 전으로 돌아간다', async () => {
    mocks.run.mockResolvedValue(run({ _sceneStoryProposal: readyWithConditions('new') }))
    const applied = await (await post({ action: 'apply', proposalId: 'p1', variantId: 'v1' })).json()
    const afterApply = saved()
    mocks.run.mockResolvedValue({ ...run(), state: afterApply.state, updated_at: afterApply.updated_at })

    const response = await post({ action: 'undo', undoId: applied.undo.id })

    expect(response.status).toBe(200)
    const state = saved().state
    expect(state.scenes).toEqual(original)
    expect(proseConditionsOf(state)).toEqual({ runtimeSeconds: 60, genre: '드라마', seed: 'keep' })
  })

  // 왜: 정상 경로 고정 — 조건 없이 다시 쓰던 예전 요청(정도만)도 그대로 받는다.
  it('조건 없이 정도만 보낸 다시 쓰기는 예전처럼 받는다', async () => {
    const response = await post({ action: 'rewrite', level: 'polish' })

    expect(response.status).toBe(200)
    expect(saved().state._sceneStoryProposal.level).toBe('polish')
    expect(saved().state._sceneStoryProposal.conditions).toBeUndefined()
  })

  // 왜: 정도도 조건도 없으면 무엇으로 다시 쓸지 모른다.
  it('정도도 조건도 없는 다시 쓰기 요청은 받지 않는다', async () => {
    const response = await post({ action: 'rewrite' })

    expect(response.status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

describe('다시 쓰기 바탕', () => {
  // 왜: 다시 쓰는 동안 안마다 같은 새 조건(길이 · 장르)으로 이야기를 잡아야 한다.
  it('새 조건으로 다시 쓰는 안은 그 길이 · 장르로 이야기를 잡는다', () => {
    const basis = rewriteBasis(run().state as never, conditions)

    expect(basis.input.runtimeSeconds).toBe(300)
    expect(basis.genre).toMatchObject({ genre: '코미디', runtime_seconds: 300, depth_level: 'D3' })
    expect(basis.runtimeChanged).toBe(true)
  })

  // 왜: 조건이 없으면 지금 산문의 조건 그대로 쓴다.
  it('조건이 없으면 지금 산문의 길이 · 장르 그대로 다시 쓴다', () => {
    const basis = rewriteBasis(run().state as never, undefined)

    expect(basis.input.runtimeSeconds).toBe(60)
    expect(basis.genre).toMatchObject({ genre: '드라마', runtime_seconds: 60 })
    expect(basis.runtimeChanged).toBe(false)
  })
})
