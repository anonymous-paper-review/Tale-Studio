// 이 규칙 전에 4막으로 쓴 15초 옛 초안에 채팅으로 수정을 요청하면 씬 2개 상한을 걸지 않아 AI 를 한 번만 부르고 예전처럼 고친다(검토 a 재검토 2026-11-10)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ run: vi.fn(), generate: vi.fn(), from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn() }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.run }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/writer/llm/local', () => ({ localGenerateJson: mocks.generate }))
vi.mock('@/lib/writer/pipeline', () => ({ resolveModels: () => ({ S: { provider: 'local', baseUrl: 'http://fixture.invalid' } }) }))
vi.mock('@/lib/writer/logger', () => ({
  PipelineLogger: class { init = vi.fn(); flushRawLlm = vi.fn(); markStage = vi.fn(); saveLlmCall = vi.fn(); saveStage = vi.fn(); saveText = vi.fn() },
}))
import { generateSceneStoryProposal } from '@/lib/writer/scene-story-proposal'

// 이 시험을 위해 지은 옛 15초 초안 — 기승전결 4막 · 씬 4개(11/10 점검 C01 과 같은 모양).
const FOUR_ACTS = {
  structure_type: 'kishōtenketsu', pov: '3rd_limited', theme: '횡재', central_dramatic_question: '민호는 캔을 다 가질까?', turning_point_position: 0.5,
  acts: [
    { act_id: 'ki', purpose: '도입', proportion: 0.25 },
    { act_id: 'sho', purpose: '전개', proportion: 0.25 },
    { act_id: 'ten', purpose: '전환', proportion: 0.25 },
    { act_id: 'ketsu', purpose: '여운', proportion: 0.25 },
  ],
}
const scene = (id: string, act: string, action: string) => ({
  scene_id: id, act_ref: act, location: '회사 복도', time_of_day: 'night', narrative_time: 'present', characters_in_scene: ['minho'],
  purpose: 'setup', emotion_beat: { start: '심심함', end: '기쁨' }, dialogue_summary: '민호가 자판기 앞에서 웃는다.', key_dialogue: [],
  info_asymmetry: 'audience=character', estimated_seconds: 4, scene_actions: [action],
})
const OLD = {
  scenes: [scene('scene_1', 'ki', '민호가 동전을 넣는다.'), scene('scene_2', 'sho', '민호가 버튼을 누른다.'), scene('scene_3', 'ten', '캔이 쏟아진다.'), scene('scene_4', 'ketsu', '민호가 웃는다.')],
  total_estimated_seconds: 16,
}
const REVISED = { ...OLD, scenes: OLD.scenes.map((s) => ({ ...s, dialogue_summary: '민호가 자판기 앞에서 크게 웃는다.' })) }
const run = () => ({
  id: 'run-1', status: 'awaiting_confirmation', updated_at: '2026-11-10T00:00:00.000Z',
  state: {
    input: { story: '민호가 자판기에서 캔을 뽑는다.', outputLocale: 'ko', runtimeSeconds: 15 },
    genre: { genre: 'Comedy', tone: [], targetEmotion: [], runtime_seconds: 15, depth_level: 'D1', format: 'horizontal_16:9' },
    narrativeStructure: FOUR_ACTS, characters: { characters: [{ id: 'minho', name: '민호' }], relationships: [], subtext_notes: [] },
    scenes: OLD, _sceneStoryVersion: 'v1',
    _sceneStoryProposal: { id: 'p1', status: 'generating', feedback: '웃음을 더 크게', createdAt: new Date().toISOString(), baseScenes: OLD },
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.run.mockResolvedValue(run())
  mocks.generate.mockResolvedValue(REVISED)
  const query = { update: mocks.update, eq: mocks.eq, select: mocks.select }
  mocks.from.mockReturnValue(query)
  mocks.update.mockReturnValue(query)
  mocks.eq.mockReturnValue(query)
  mocks.select.mockResolvedValue({ data: [{ id: 'run-1' }], error: null })
})

describe('15초 옛 초안 채팅 수정 요청', () => {
  // 왜: 옛 4막 구조는 씬 하한이 4라 상한 2를 걸면 고쳐 쓰기 지시에 "씬 수 4~4개"와 "예산 이탈"이 함께 들어가 AI 를 헛되이 한 번 더 불렀다(검토 a).
  it('15초 이하여도 들어온 구조가 막 3개 이상인 옛 초안이면 씬 2개 상한을 걸지 않아, 채팅 수정 요청이 AI 를 한 번만 부르고 씬 4개로 고친다', async () => {
    await generateSceneStoryProposal('project-1', 'run-1', 'p1')
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    const proposal = mocks.update.mock.calls[0][0].state._sceneStoryProposal
    expect(proposal.status).toBe('ready')
    expect(proposal.scenes.scenes).toHaveLength(4)
  })
})
