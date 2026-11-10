// 15초 이하 옛 초안을 구조를 둔 채 다시 쓰면 들고 온 구조를 앞뒤 두 막으로 합쳐 씬을 쓰고, 그 구조를 안에 실어 둔다(검토 a 2026-11-10)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  run: vi.fn(), scenes: vi.fn(), dramaturgy: vi.fn(), structure: vi.fn(),
  from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), flush: vi.fn(), init: vi.fn(),
}))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.run }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/writer/pipeline/stages/s3_scenes', async (original) => ({
  ...(await original<typeof import('@/lib/writer/pipeline/stages/s3_scenes')>()),
  runScenes: mocks.scenes,
}))
vi.mock('@/lib/writer/pipeline/stages/s0_dramaturgy', () => ({ runDramaturgySafe: mocks.dramaturgy }))
vi.mock('@/lib/writer/pipeline/stages/s1_structure', () => ({ runNarrativeStructure: mocks.structure }))
vi.mock('@/lib/writer/pipeline', () => ({ resolveModels: () => ({ S: { provider: 'gemini' } }) }))
vi.mock('@/lib/writer/logger', () => ({ PipelineLogger: class { init = mocks.init; flushRawLlm = mocks.flush } }))

import { generateSceneStoryRewrite } from '@/lib/writer/scene-story-rewrite'
import { newRewriteProposal } from '@/lib/producer/scene-story-rewrite'

// 이 시험을 위해 지은 옛 15초 초안 — 이 규칙 전에 기승전결 4막 · 4씬으로 쓰였다(11/10 점검 C01).
const FOUR_ACTS = {
  structure_type: 'kishōtenketsu', pov: '3rd_limited', theme: '횡재', central_dramatic_question: '민호는 캔을 다 가질까?', turning_point_position: 0.5,
  acts: [
    { act_id: 'ki', purpose: '도입', proportion: 0.25 },
    { act_id: 'sho', purpose: '전개', proportion: 0.25 },
    { act_id: 'ten', purpose: '전환', proportion: 0.25 },
    { act_id: 'ketsu', purpose: '여운', proportion: 0.25 },
  ],
}
const scene = (id: string, act: string) => ({ scene_id: id, act_ref: act, scene_actions: [`${id} 행동`], estimated_seconds: 4, location: '회사 복도', characters_in_scene: [] })
const OLD = { scenes: [scene('s1', 'ki'), scene('s2', 'sho'), scene('s3', 'ten'), scene('s4', 'ketsu')], total_estimated_seconds: 16 }

let stored: Record<string, unknown>
const fresh = (runtimeSeconds: number) => ({
  id: 'run-1', status: 'awaiting_confirmation', updated_at: '2026-11-10T00:00:00.000Z',
  state: {
    input: { story: '민호가 자판기에서 캔을 뽑는다.', runtimeSeconds, cast: { characters: [] } },
    genre: { genre: 'Comedy', depth_level: runtimeSeconds <= 15 ? 'D1' : 'D2', runtime_seconds: runtimeSeconds },
    narrativeStructure: FOUR_ACTS, dramaturgy: { world_inventory: [] },
    characters: { characters: [{ id: 'minho', name: '민호' }], relationships: [], subtext_notes: [] },
    scenes: OLD, _sceneStoryVersion: 'v-original', _sceneRevisionNotes: [],
    _sceneStoryProposal: newRewriteProposal({ id: 'p1', level: 'reword', feedback: '문장을 다듬어 줘', baseScenes: OLD as never, createdAt: new Date().toISOString() }),
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.run.mockImplementation(async () => structuredClone(stored))
  // 작은 가짜 DB — updated_at 이 읽은 때와 같을 때만 쓴다(실제 조건부 저장과 같다).
  let pending: Record<string, unknown> | null = null
  let expectedUpdatedAt: unknown = null
  const query = { update: mocks.update, eq: mocks.eq, select: mocks.select }
  mocks.from.mockReturnValue(query)
  mocks.update.mockImplementation((patch: Record<string, unknown>) => { pending = patch; return query })
  mocks.eq.mockImplementation((column: string, value: unknown) => { if (column === 'updated_at') expectedUpdatedAt = value; return query })
  mocks.select.mockImplementation(async () => {
    const ok = pending && expectedUpdatedAt === stored.updated_at
    if (ok) stored = { ...stored, ...pending }
    pending = null
    return { data: ok ? [{ id: 'run-1' }] : [], error: null }
  })
  mocks.scenes.mockImplementation(async () => ({ scenes: [scene('n1', 'ki'), scene('n2', 'ten')], total_estimated_seconds: 15 }))
})

const variants = () => (stored.state as { _sceneStoryProposal: { variants: Array<Record<string, unknown>> } })._sceneStoryProposal.variants
const structureArg = (call: unknown[]) => call[2] as typeof FOUR_ACTS
const baseArg = (call: unknown[]) => call[9] as typeof OLD

describe('15초 이하 옛 초안 다시 쓰기', () => {
  // 왜: 이 규칙 전에 4막으로 쓴 15초 초안을 다듬으면 씬 하한(막 수 4)과 상한(2)이 부딪쳐 헛된 고쳐 쓰기 한 번 뒤 4씬이 남았다(검토 a).
  it('15초 이하 초안을 구조를 둔 채 다시 쓸 때 들고 온 구조가 막 3개 이상이면 앞뒤 두 막으로 합쳐 씬을 쓴다', async () => {
    stored = fresh(15)
    await generateSceneStoryRewrite('project-1', 'run-1', 'p1')
    expect(mocks.scenes).toHaveBeenCalledTimes(3)
    for (const call of mocks.scenes.mock.calls) {
      expect(structureArg(call).acts.map((a) => a.act_id)).toEqual(['ki', 'ten'])
      // 기준 초안의 막 참조도 합친 막으로 옮겨 준다 — 모델이 옛 막 이름(sho · ketsu)을 그대로 따라 쓰지 않게.
      expect(baseArg(call).scenes.map((s) => s.act_ref)).toEqual(['ki', 'ki', 'ten', 'ten'])
    }
    for (const variant of variants()) {
      expect(variant).toMatchObject({ status: 'ready' })
      expect((variant.narrativeStructure as typeof FOUR_ACTS).acts.map((a) => a.act_id)).toEqual(['ki', 'ten'])
    }
  })

  // 왜: 정상 경로 고정 — 15초보다 긴 초안은 들고 온 구조로 씬만 다시 쓰고 구조를 안에 싣지 않는다(지금 동작).
  it('15초보다 긴 초안을 구조를 둔 채 다시 쓸 때는 들고 온 구조를 그대로 쓴다', async () => {
    stored = fresh(60)
    await generateSceneStoryRewrite('project-1', 'run-1', 'p1')
    for (const call of mocks.scenes.mock.calls) {
      expect(structureArg(call).acts).toHaveLength(4)
      expect(baseArg(call)).toEqual(OLD)
    }
    for (const variant of variants()) expect(variant.narrativeStructure).toBeUndefined()
  })
})
