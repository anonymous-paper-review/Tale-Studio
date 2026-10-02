// 트리트먼트 다시 쓰기의 요청 · 적용 · 되돌리기를 씬 확정 단계에서 처리한다 (2026-10-02 오너 · 시안 v04)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  access: vi.fn(), run: vi.fn(), from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), trigger: vi.fn(), after: vi.fn(),
}))
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), after: mocks.after }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.access }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.run }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/writer/pipeline/steps', () => ({ triggerWriterStep: mocks.trigger }))

import { POST } from '@/app/api/writer/scene-gate/route'
import { newRewriteProposal } from '@/lib/producer/scene-story-rewrite'

const version = '2026-10-02T01:00:00.000Z'
const scene = (id: string, text: string) => ({ scene_id: id, scene_actions: [text], location: '운동장', characters_in_scene: [], estimated_seconds: 12 })
const scenes = (...texts: string[]) => ({ scenes: texts.map((text, i) => scene(`s${i + 1}`, text)), total_estimated_seconds: texts.length * 12 })
const original = scenes('지아가 돌을 던진다.', '둘이 부딪힌다.')
type State = Record<string, unknown> & { scenes: ReturnType<typeof scenes> }
const run = (state: Partial<State> = {}) => ({
  id: 'run-1', status: 'awaiting_confirmation', updated_at: version,
  state: {
    input: { story: '두 아이가 다투고 화해하는 이야기', preserveScript: false },
    genre: { genre: '드라마' }, narrativeStructure: { structure_type: 'kishotenketsu' }, dramaturgy: { core_engine: '옛 엔진' },
    characters: { characters: [{ id: 'jia', name: '지아' }], relationships: [], subtext_notes: [] }, world: { locations: [] },
    scenes: original, storyCheck: { passed: true }, _sceneStoryVersion: 'story-1', _sceneRevisionNotes: ['결말을 짧게'],
    ...state,
  },
})
const readyRewrite = (level: 'reword' | 'rethink') => {
  const proposal = newRewriteProposal({ id: 'p1', level, feedback: level, baseScenes: original as never, createdAt: new Date().toISOString() })
  const variants = proposal.variants!.map((v, i) => ({
    ...v, status: 'ready' as const,
    scenes: level === 'rethink' ? { scenes: [scene('n1', `완전히 새 이야기 ${i + 1}`)], total_estimated_seconds: 12, new_characters: [{ id: 'suji', name: '수지' }] } : scenes('지아가 돌을 던진다.', `둘이 부딪힌다 ${i + 1}.`),
    ...(level === 'rethink' ? { narrativeStructure: { structure_type: '3-act' }, dramaturgy: { core_engine: `새 엔진 ${i + 1}` }, characters: { characters: [{ id: 'suji', name: '수지' }], relationships: [], subtext_notes: [] }, world: { locations: [{ id: 'roof', name: '옥상', description: '' }] } } : {}),
  }))
  return { ...proposal, status: 'ready' as const, variants }
}
const post = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/writer/scene-gate', {
  method: 'POST', body: JSON.stringify({ projectId: 'project-1', ...body }), headers: { 'Content-Type': 'application/json' },
}))
const saved = () => mocks.update.mock.calls.at(-1)![0]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.access.mockResolvedValue({ ok: true, projectId: 'project-1' })
  mocks.run.mockResolvedValue(run())
  const query = { update: mocks.update, eq: mocks.eq, select: mocks.select }
  mocks.from.mockReturnValue(query)
  mocks.update.mockReturnValue(query)
  mocks.eq.mockReturnValue(query)
  mocks.select.mockResolvedValue({ data: [{ id: 'run-1' }], error: null })
})

describe('다시 쓰기 요청', () => {
  it('다시 쓰기를 요청하면 세 안을 만드는 수정안을 만들고 트리트먼트는 그대로 둔다', async () => {
    const response = await post({ action: 'rewrite', level: 'reword' })
    expect(response.status).toBe(200)
    expect(saved().state.scenes).toEqual(original)
    expect(saved().state._sceneStoryProposal).toMatchObject({ status: 'generating', level: 'reword', baseScenes: original })
    expect(saved().state._sceneStoryProposal.variants).toHaveLength(3)
    expect(saved().status).toBe('awaiting_confirmation')
    expect(mocks.after).toHaveBeenCalledOnce()
  })

  it('대본을 그대로 보존한 트리트먼트는 다시 쓰지 않는다', async () => {
    mocks.run.mockResolvedValue(run({ input: { story: '대본', preserveScript: true } }))
    expect((await post({ action: 'rewrite', level: 'polish' })).status).toBe(409)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('세 안을 만드는 중이면 다시 쓰기를 또 받지 않는다', async () => {
    mocks.run.mockResolvedValue(run({ _sceneStoryProposal: newRewriteProposal({ id: 'p0', level: 'polish', feedback: 'polish', baseScenes: original as never, createdAt: new Date().toISOString() }) }))
    expect((await post({ action: 'rewrite', level: 'reword' })).status).toBe(409)
  })

  it('세 안이 남아 있으면 확정하지 않는다', async () => {
    mocks.run.mockResolvedValue(run({ _sceneStoryProposal: readyRewrite('reword') }))
    expect((await post({ action: 'confirm' })).status).toBe(409)
  })
})

describe('고른 안 적용과 되돌리기', () => {
  it('고른 안을 적용하면 그 안이 트리트먼트가 되고 되돌릴 수 있게 이전 트리트먼트를 남긴다', async () => {
    mocks.run.mockResolvedValue(run({ _sceneStoryProposal: readyRewrite('reword') }))
    expect((await post({ action: 'apply', proposalId: 'p1', variantId: 'v2' })).status).toBe(200)
    const state = saved().state
    expect(state.scenes.scenes.map((s: { scene_actions: string[] }) => s.scene_actions[0])).toEqual(['지아가 돌을 던진다.', '둘이 부딪힌다 2.'])
    expect(state._sceneStoryProposal).toBeUndefined()
    expect(state._sceneStoryUndo).toMatchObject({ label: 'v2', scenes: original })
    expect(state._sceneStoryVersion).not.toBe('story-1')
    expect(state._sceneStoryUndo.storyVersion).toBe(state._sceneStoryVersion)
  })

  it('아이디어부터 다시 안을 적용하면 이야기 구조와 인물도 그 안으로 바뀐다', async () => {
    mocks.run.mockResolvedValue(run({ _sceneStoryProposal: readyRewrite('rethink') }))
    expect((await post({ action: 'apply', proposalId: 'p1', variantId: 'v1' })).status).toBe(200)
    const state = saved().state
    expect(state.scenes.scenes[0].scene_actions).toEqual(['완전히 새 이야기 1'])
    expect(state.narrativeStructure).toEqual({ structure_type: '3-act' })
    expect(state.dramaturgy).toEqual({ core_engine: '새 엔진 1' })
    expect(state.characters.characters.map((c: { id: string }) => c.id)).toEqual(['suji'])
    expect(state._sceneRevisionNotes).toEqual([])
    expect(state._sceneStoryUndo).toMatchObject({ narrativeStructure: { structure_type: 'kishotenketsu' }, revisionNotes: ['결말을 짧게'] })
  })

  it('아직 나오지 않은 안은 적용하지 않는다', async () => {
    const proposal = readyRewrite('reword')
    proposal.variants[2] = { ...proposal.variants[2], status: 'generating' as never, scenes: undefined as never }
    mocks.run.mockResolvedValue(run({ _sceneStoryProposal: { ...proposal, status: 'generating' } }))
    expect((await post({ action: 'apply', proposalId: 'p1', variantId: 'v3' })).status).toBe(409)
  })

  it('적용한 뒤 되돌리면 적용 전 트리트먼트로 돌아간다', async () => {
    mocks.run.mockResolvedValue(run({ _sceneStoryProposal: readyRewrite('rethink') }))
    await post({ action: 'apply', proposalId: 'p1', variantId: 'v1' })
    const applied = saved()
    mocks.run.mockResolvedValue({ ...run(), state: applied.state, updated_at: applied.updated_at })
    expect((await post({ action: 'undo', undoId: applied.state._sceneStoryUndo.id })).status).toBe(200)
    const state = saved().state
    expect(state.scenes).toEqual(original)
    expect(state.narrativeStructure).toEqual({ structure_type: 'kishotenketsu' })
    expect(state.characters.characters.map((c: { id: string }) => c.id)).toEqual(['jia'])
    expect(state._sceneRevisionNotes).toEqual(['결말을 짧게'])
    expect(state._sceneStoryUndo).toBeUndefined()
  })

  it('적용한 뒤 트리트먼트를 직접 고쳤으면 되돌리지 않는다', async () => {
    mocks.run.mockResolvedValue(run({ _sceneStoryProposal: readyRewrite('reword') }))
    await post({ action: 'apply', proposalId: 'p1', variantId: 'v1' })
    const applied = saved()
    mocks.run.mockResolvedValue({ ...run(), state: { ...applied.state, _sceneStoryVersion: 'edited-later' }, updated_at: applied.updated_at })
    expect((await post({ action: 'undo', undoId: applied.state._sceneStoryUndo.id })).status).toBe(409)
  })

  it('그대로 두기를 고르면 되돌리기만 지우고 트리트먼트는 그대로다', async () => {
    mocks.run.mockResolvedValue(run({ _sceneStoryProposal: readyRewrite('reword') }))
    await post({ action: 'apply', proposalId: 'p1', variantId: 'v1' })
    const applied = saved()
    mocks.run.mockResolvedValue({ ...run(), state: applied.state, updated_at: applied.updated_at })
    expect((await post({ action: 'keep', undoId: applied.state._sceneStoryUndo.id })).status).toBe(200)
    expect(saved().state.scenes).toEqual(applied.state.scenes)
    expect(saved().state._sceneStoryUndo).toBeUndefined()
  })

  it('직접 고쳐 저장하면 다시 쓰기 되돌리기는 사라진다', async () => {
    mocks.run.mockResolvedValue(run({ _sceneStoryUndo: { id: 'u1', label: 'v1', storyVersion: 'story-1', scenes: original } }))
    const response = await post({ action: 'save', expectedStoryVersion: 'story-1', scenes: [{ sceneId: 's1', beats: ['고친 문장'] }, { sceneId: 's2', beats: ['둘이 부딪힌다.'] }] })
    expect(response.status).toBe(200)
    expect(saved().state._sceneStoryUndo).toBeUndefined()
  })
})

describe('트리트먼트 초안의 확정', () => {
  it('넘기기 전 트리트먼트 초안은 확정 단추로 넘기지 않고 Writer로 넘기기를 거치게 한다', async () => {
    // 왜: 확정만 하면 Producer 값(스타일 · 캐스팅 · 배경)이 실리지 않은 채 나머지가 돌고, Producer 도 잠기지 않는다.
    mocks.run.mockResolvedValue(run({ input: { story: '씨앗', treatmentDraft: true, sceneGate: true } }))
    const response = await post({ action: 'confirm' })
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('treatment_draft_handoff_required')
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

describe('세 안은 따로 만든다 (검토 지적)', () => {
  it('다시 쓰기는 안마다 따로 요청해 각자 시간을 쓴다', async () => {
    // 왜: 아이디어부터 다시는 안마다 이야기 엔진 · 구조 · 씬을 새로 돈다 — 세 안을 한 요청(300초)에 몰면 시간이 넘쳐 아무것도 남지 않는다.
    await post({ action: 'rewrite', level: 'rethink' })
    const scheduled = mocks.after.mock.calls[0][0] as () => Promise<void>
    const sent: Array<{ url: string; body: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: URL | string, init?: RequestInit) => {
      sent.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return Response.json({ ok: true })
    }))
    await scheduled()
    vi.unstubAllGlobals()
    expect(sent.map((r) => r.url)).toEqual(Array(3).fill('http://localhost/api/writer/scene-story-rewrite'))
    expect(sent.map((r) => r.body.variantId)).toEqual(['v1', 'v2', 'v3'])
    expect(new Set(sent.map((r) => r.body.proposalId)).size).toBe(1)
  })
})
