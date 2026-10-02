// 다시 쓰기는 고른 정도로 Writer 앞단을 세 번 돌려 세 가지 안을 저장하고, 안을 만드는 동안 트리트먼트 본문은 그대로 둔다 (2026-10-02 오너 · 시안 v04)
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
import { newRewriteProposal, type RewriteLevel } from '@/lib/producer/scene-story-rewrite'

const scene = (id: string, text: string, location = '운동장') => ({ scene_id: id, scene_actions: [text], estimated_seconds: 12, location, characters_in_scene: [] })
const scenes = (text = '원문') => ({ scenes: [scene('s1', text)], total_estimated_seconds: 12 })

let stored: Record<string, unknown>
const fresh = (level: RewriteLevel) => ({
  id: 'run-1', status: 'awaiting_confirmation', updated_at: '2026-10-02T00:00:00.000Z',
  state: {
    input: { story: '운동장에서 다투고 화해하는 두 아이', cast: { characters: [] } },
    genre: { genre: '드라마' }, narrativeStructure: { acts: [{ act_id: 'act_1' }] }, dramaturgy: { world_inventory: [] },
    characters: { characters: [{ id: 'jia', name: '지아' }], relationships: [], subtext_notes: [] },
    scenes: scenes(), _sceneStoryVersion: 'v-original', _sceneRevisionNotes: ['결말을 짧게'],
    _sceneStoryProposal: newRewriteProposal({ id: 'p1', level, feedback: level, baseScenes: scenes() as never, createdAt: new Date().toISOString() }),
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  stored = fresh('reword')
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
  let n = 0
  mocks.scenes.mockImplementation(async () => scenes(`새 글 ${++n}`))
  mocks.dramaturgy.mockResolvedValue({ world_inventory: [], core_engine: '새 엔진' })
  mocks.structure.mockResolvedValue({ acts: [{ act_id: 'act_1' }], structure_type: '3-act' })
})

const proposal = () => (stored.state as { _sceneStoryProposal: { status: string; variants: Array<Record<string, unknown>> } })._sceneStoryProposal

describe('세 가지 안 만들기', () => {
  it('표현을 새로는 지금 트리트먼트를 바탕으로 씬만 세 번 다시 쓴다', async () => {
    await generateSceneStoryRewrite('project-1', 'run-1', 'p1')
    expect(mocks.scenes).toHaveBeenCalledTimes(3)
    expect(mocks.dramaturgy).not.toHaveBeenCalled()
    expect(mocks.structure).not.toHaveBeenCalled()
    for (const call of mocks.scenes.mock.calls) expect(call[9]).toEqual(scenes())
    const notes = mocks.scenes.mock.calls.map((call) => (call[7] as string[]).at(-1))
    expect(new Set(notes).size).toBe(3)
    expect(proposal().status).toBe('ready')
    expect(proposal().variants.map((v) => v.status)).toEqual(['ready', 'ready', 'ready'])
    expect(mocks.flush).toHaveBeenCalledWith('scene-story-rewrite')
  })

  it('아이디어부터 다시는 처음 아이디어로 이야기 엔진과 구조부터 세 번 다시 쓴다', async () => {
    stored = fresh('rethink')
    await generateSceneStoryRewrite('project-1', 'run-1', 'p1')
    expect(mocks.dramaturgy).toHaveBeenCalledTimes(3)
    expect(mocks.structure).toHaveBeenCalledTimes(3)
    expect(mocks.scenes).toHaveBeenCalledTimes(3)
    for (const call of mocks.scenes.mock.calls) {
      expect(call[9]).toBeUndefined()
      expect(call[7]).not.toContain('결말을 짧게')
      expect(String((call[0] as { story: string }).story)).toContain('운동장에서 다투고 화해하는 두 아이')
    }
    const variant = proposal().variants[0]
    expect(variant).toMatchObject({ status: 'ready', narrativeStructure: { structure_type: '3-act' }, dramaturgy: { core_engine: '새 엔진' } })
    expect(variant.characters).toBeTruthy()
  })

  it('세 안을 만드는 동안 트리트먼트 본문과 버전은 바뀌지 않는다', async () => {
    await generateSceneStoryRewrite('project-1', 'run-1', 'p1')
    for (const [patch] of mocks.update.mock.calls) {
      expect(patch.state.scenes).toEqual(scenes())
      expect(patch.state._sceneStoryVersion).toBe('v-original')
      expect(patch.status).toBeUndefined()
    }
  })

  it('세 안 중 하나가 실패해도 나온 안은 저장한다', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.scenes.mockImplementationOnce(async () => scenes('새 글 1')).mockImplementationOnce(async () => { throw new Error('Provider unavailable') })
    await generateSceneStoryRewrite('project-1', 'run-1', 'p1')
    expect(proposal().variants.map((v) => v.status).sort()).toEqual(['failed', 'ready', 'ready'])
    expect(proposal().status).toBe('ready')
    errorLog.mockRestore()
  })

  it('버린 다시 쓰기 결과가 늦게 도착하면 저장하지 않는다', async () => {
    mocks.scenes.mockImplementation(async () => {
      stored = { ...stored, state: { ...(stored.state as object), _sceneStoryProposal: undefined } }
      return scenes('늦은 결과')
    })
    await generateSceneStoryRewrite('project-1', 'run-1', 'p1')
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
