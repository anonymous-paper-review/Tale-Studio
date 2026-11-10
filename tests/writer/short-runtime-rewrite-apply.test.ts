// 다시 쓴 안이 합친 이야기 구조를 들고 오면(15초 이하 옛 초안) 그 안을 적용할 때 구조도 같이 저장하고, 되돌리면 옛 구조로 돌아간다(검토 a 2026-11-10)
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

// 이 시험을 위해 지은 옛 15초 초안(4막 · 4씬)과, 두 막으로 합친 구조를 들고 온 다듬기 안.
const OLD_STRUCTURE = { structure_type: 'kishōtenketsu', acts: [{ act_id: 'ki' }, { act_id: 'sho' }, { act_id: 'ten' }, { act_id: 'ketsu' }] }
const FOLDED = { structure_type: 'kishōtenketsu', acts: [{ act_id: 'ki' }, { act_id: 'ten' }] }
const scene = (id: string, act: string, text: string) => ({ scene_id: id, act_ref: act, scene_actions: [text], location: '회사 복도', characters_in_scene: [], estimated_seconds: 4 })
const original = { scenes: [scene('s1', 'ki', '민호가 동전을 넣는다.'), scene('s2', 'sho', '버튼을 누른다.'), scene('s3', 'ten', '캔이 쏟아진다.'), scene('s4', 'ketsu', '민호가 웃는다.')], total_estimated_seconds: 16 }
const run = () => ({
  id: 'run-1', status: 'awaiting_confirmation', updated_at: '2026-11-10T01:00:00.000Z',
  state: {
    input: { story: '민호가 자판기에서 캔을 뽑는다.', runtimeSeconds: 15, preserveScript: false },
    genre: { genre: 'Comedy' }, narrativeStructure: OLD_STRUCTURE, dramaturgy: { core_engine: '엔진' },
    characters: { characters: [{ id: 'minho', name: '민호' }], relationships: [], subtext_notes: [] }, world: { locations: [] },
    scenes: original, storyCheck: { passed: true }, _sceneStoryVersion: 'story-1', _sceneRevisionNotes: [],
    _sceneStoryProposal: (() => {
      const proposal = newRewriteProposal({ id: 'p1', level: 'reword', feedback: '문장을 다듬어 줘', baseScenes: original as never, createdAt: new Date().toISOString() })
      const variants = proposal.variants!.map((v, i) => ({
        ...v, status: 'ready' as const, narrativeStructure: FOLDED,
        scenes: { scenes: [scene('n1', 'ki', '민호가 동전을 넣는다.'), scene('n2', 'ten', `캔이 쏟아진다 ${i + 1}.`)], total_estimated_seconds: 15 },
      }))
      return { ...proposal, status: 'ready' as const, variants }
    })(),
  },
})
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

describe('합친 구조를 들고 온 다시 쓰기 안 적용', () => {
  // 왜: 안의 씬은 두 막(ki · ten)을 가리키는데 저장된 구조가 4막으로 남으면 구조와 씬이 어긋난다 — 길이를 안 바꾼 다듬기여도 같이 저장한다.
  it('다시 쓴 안이 합친 이야기 구조를 들고 오면 적용할 때 그 구조도 같이 저장하고, 되돌리면 옛 구조로 돌아간다', async () => {
    expect((await post({ action: 'apply', proposalId: 'p1', variantId: 'v2' })).status).toBe(200)
    const applied = saved()
    expect(applied.state.narrativeStructure).toEqual(FOLDED)
    expect(applied.state.scenes.scenes.map((s: { act_ref: string }) => s.act_ref)).toEqual(['ki', 'ten'])
    expect(applied.state._sceneStoryUndo).toMatchObject({ narrativeStructure: OLD_STRUCTURE })

    mocks.run.mockResolvedValue({ ...run(), state: applied.state, updated_at: applied.updated_at })
    expect((await post({ action: 'undo', undoId: applied.state._sceneStoryUndo.id })).status).toBe(200)
    expect(saved().state.narrativeStructure).toEqual(OLD_STRUCTURE)
  })
})
