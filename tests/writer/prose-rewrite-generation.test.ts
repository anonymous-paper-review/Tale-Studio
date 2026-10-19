// 리뉴얼 1차: 조건(러닝타임 · 장르·분위기)을 바꿔 다시 쓰면 세 안 모두 새 조건으로 쓰고, 길이가 바뀌면 이야기 구조부터 다시 잡는다 (2026-10-19)
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

const scene = (id: string, text: string) => ({ scene_id: id, scene_actions: [text], estimated_seconds: 12, location: 'hall', characters_in_scene: [] })
const scenes = (text = '원문') => ({ scenes: [scene('s1', text)], total_estimated_seconds: 12 })
const genre = { genre: '드라마', tone: [], targetEmotion: [], runtime_seconds: 60, depth_level: 'D2', format: 'horizontal_16:9' }

let stored: Record<string, unknown>
const fresh = (conditions: { runtimeSeconds: number; genre: string; seed: 'keep' | 'new' }) => ({
  id: 'run-1', status: 'awaiting_confirmation', updated_at: '2026-10-19T00:00:00.000Z',
  state: {
    input: { story: '자판기 앞에서 벌어진 일', runtimeSeconds: 60, genre, cast: { characters: [] } },
    genre, narrativeStructure: { acts: [{ act_id: 'act_1' }] }, dramaturgy: { world_inventory: [] },
    characters: { characters: [{ id: 'minho', name: '민호' }], relationships: [], subtext_notes: [] },
    scenes: scenes(), _sceneStoryVersion: 'v-original',
    _sceneStoryProposal: newRewriteProposal({
      id: 'p1', level: conditions.seed === 'new' ? 'rethink' : 'reword', feedback: 'conditions',
      baseScenes: scenes() as never, createdAt: new Date().toISOString(), conditions,
    }),
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  stored = fresh({ runtimeSeconds: 300, genre: '코미디', seed: 'keep' })
  mocks.run.mockImplementation(async () => structuredClone(stored))
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
  let n = 0
  mocks.scenes.mockImplementation(async () => scenes(`새 글 ${++n}`))
  mocks.dramaturgy.mockResolvedValue({ world_inventory: [], core_engine: '새 엔진' })
  mocks.structure.mockResolvedValue({ acts: [{ act_id: 'act_1' }, { act_id: 'act_2' }], structure_type: '3-act' })
})

const proposal = () => (stored.state as { _sceneStoryProposal: { status: string; variants: Array<Record<string, unknown>> } })._sceneStoryProposal

describe('조건을 바꿔 세 가지 안 만들기', () => {
  // 왜: 러닝타임을 15~60초에서 1~5분으로 바꾸면 씬 수와 흐름이 달라진다 — 옛 구조에 새 길이를 끼우면 장면이 모자란다.
  it('러닝타임을 바꿔 다시 쓰면 세 안 모두 새 길이로 이야기 구조부터 다시 잡는다', async () => {
    await generateSceneStoryRewrite('project-1', 'run-1', 'p1')

    expect(mocks.structure).toHaveBeenCalledTimes(3)
    for (const call of mocks.structure.mock.calls) {
      expect(call[1]).toMatchObject({ genre: '코미디', runtime_seconds: 300, depth_level: 'D3' })
    }
    expect(mocks.dramaturgy).not.toHaveBeenCalled()
    for (const call of mocks.scenes.mock.calls) {
      expect(call[0]).toMatchObject({ runtimeSeconds: 300 })
      expect(call[1]).toMatchObject({ genre: '코미디', runtime_seconds: 300 })
      // 소재 그대로 — 지금 산문을 바탕으로 쓴다.
      expect(call[9]).toEqual(scenes())
    }
    expect(proposal().variants.every((v) => (v.narrativeStructure as { structure_type?: string })?.structure_type === '3-act')).toBe(true)
  })

  // 왜: 장르·분위기만 바꾸면 이야기 흐름은 지키고 새 분위기로 문장을 다시 쓴다.
  it('장르·분위기만 바꿔 다시 쓰면 구조는 그대로 두고 새 장르로 씬을 쓴다', async () => {
    stored = fresh({ runtimeSeconds: 60, genre: '코미디', seed: 'keep' })

    await generateSceneStoryRewrite('project-1', 'run-1', 'p1')

    expect(mocks.structure).not.toHaveBeenCalled()
    for (const call of mocks.scenes.mock.calls) {
      expect(call[1]).toMatchObject({ genre: '코미디', runtime_seconds: 60 })
      expect((call[7] as string[]).join('\n')).toContain('코미디')
    }
  })

  // 왜: 소재 "새롭게"는 처음 아이디어로 이야기 엔진 · 구조 · 씬을 새 조건으로 다시 돈다.
  it('소재를 새롭게로 다시 쓰면 새 조건으로 이야기 엔진부터 다시 쓴다', async () => {
    stored = fresh({ runtimeSeconds: 15, genre: '호러', seed: 'new' })

    await generateSceneStoryRewrite('project-1', 'run-1', 'p1')

    expect(mocks.dramaturgy).toHaveBeenCalledTimes(3)
    for (const call of mocks.dramaturgy.mock.calls) {
      expect(call[0]).toMatchObject({ runtimeSeconds: 15 })
      expect(call[1]).toMatchObject({ genre: '호러', runtime_seconds: 15, depth_level: 'D1' })
    }
    for (const call of mocks.scenes.mock.calls) expect(call[9]).toBeUndefined()
  })
})
