// AI 수정안 생성은 원문을 보존하고 버리기·새 실행·동시 직접 저장 뒤의 늦은 응답을 안전하게 처리한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ run: vi.fn(), scenes: vi.fn(), from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), flush: vi.fn(), init: vi.fn() }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.run }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/writer/pipeline/stages/s3_scenes', () => ({ runScenes: mocks.scenes }))
vi.mock('@/lib/writer/pipeline', () => ({ resolveModels: () => ({ S: { provider: 'gemini' } }) }))
vi.mock('@/lib/writer/logger', () => ({ PipelineLogger: class { init = mocks.init; flushRawLlm = mocks.flush } }))
import { generateSceneStoryProposal } from '@/lib/writer/scene-story-proposal'

const scenes = (text = '원문') => ({ scenes: [{ scene_id: 's1', scene_actions: [text], estimated_seconds: 12 }], total_estimated_seconds: 12 })
const run = () => ({
  id: 'run-1', status: 'awaiting_confirmation', updated_at: new Date().toISOString(),
  state: {
    input: { story: '처음 이야기' }, genre: {}, narrativeStructure: {}, characters: { characters: [] },
    scenes: scenes(), _sceneStoryVersion: 'original-version',
    _sceneStoryProposal: { id: 'p1', status: 'generating', feedback: '다듬어 줘', createdAt: new Date().toISOString(), baseScenes: scenes() },
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.run.mockResolvedValue(run())
  mocks.scenes.mockResolvedValue(scenes('AI 수정안'))
  const query = { update: mocks.update, eq: mocks.eq, select: mocks.select }
  mocks.from.mockReturnValue(query)
  mocks.update.mockReturnValue(query)
  mocks.eq.mockReturnValue(query)
  mocks.select.mockResolvedValue({ data: [{ id: 'run-1' }], error: null })
})

describe('씬 스토리 수정안 생성 완료', () => {
  // 같이 정한 것. 왜: 정상 경로 고정 — 모델 결과는 적용 전까지 별도로 남아야 한다.
  it('AI 생성이 끝나면 원문을 유지한 채 적용할 수정안만 저장한다', async () => {
    await generateSceneStoryProposal('project-1', 'run-1', 'p1')
    const patch = mocks.update.mock.calls[0][0]
    expect(patch.state.scenes).toEqual(scenes())
    expect(patch.state._sceneStoryProposal.scenes).toEqual(scenes('AI 수정안'))
    expect(patch.state._sceneStoryProposal.status).toBe('ready')
    expect(patch.state._sceneStoryVersion).toBe('original-version')
    expect(mocks.scenes.mock.calls[0][9]).toEqual(scenes())
    expect(mocks.flush).toHaveBeenCalledWith('scene-story-proposal')
    expect(mocks.eq).toHaveBeenCalledWith('status', 'awaiting_confirmation')
  })
  // 같이 정한 것. 왜: 모델을 기다리는 사이 사람이 저장한 본문은 늦은 생성 결과보다 우선한다.
  it('AI를 기다리던 중 직접 저장했으면 생성 완료 뒤에도 직접 저장한 본문을 유지한다', async () => {
    const latest = run()
    latest.state.scenes = scenes('직접 저장한 원문')
    latest.state._sceneStoryVersion = 'manual-version'
    mocks.run.mockResolvedValueOnce(run()).mockResolvedValue(latest)
    await generateSceneStoryProposal('project-1', 'run-1', 'p1')
    expect(mocks.update.mock.calls[0][0].state.scenes).toEqual(scenes('직접 저장한 원문'))
    expect(mocks.update.mock.calls[0][0].state._sceneStoryVersion).toBe('manual-version')
  })
  // 같이 정한 것. 왜: 버린 수정안이나 다른 실행 결과가 뒤늦게 되살아나면 안 된다.
  it.each(['버린 수정안', '다른 수정안', '새 실행', '이미 확정', '기한 만료'])('이전 생성 결과가 늦게 도착하면 현재 작업을 바꾸지 않는다 (%s)', async (reason) => {
    const latest = run()
    if (reason === '버린 수정안') delete (latest.state as { _sceneStoryProposal?: unknown })._sceneStoryProposal
    if (reason === '다른 수정안') latest.state._sceneStoryProposal.id = 'p2'
    if (reason === '새 실행') latest.id = 'run-2'
    if (reason === '이미 확정') latest.status = 'running'
    if (reason === '기한 만료') latest.state._sceneStoryProposal.createdAt = '2020-01-01T00:00:00Z'
    mocks.run.mockResolvedValueOnce(run()).mockResolvedValue(latest)
    await generateSceneStoryProposal('project-1', 'run-1', 'p1')
    expect(mocks.scenes).toHaveBeenCalledOnce()
    expect(mocks.update).not.toHaveBeenCalled()
  })
  // 혼자 정한 것(쉬움). 왜: 읽은 직후 사람이 저장하는 경쟁이 생겨도 새 원문 위에서 수정안만 저장해야 한다.
  it('수정안 저장과 직접 저장이 겹치면 최신 원문을 다시 읽어 수정안만 저장한다', async () => {
    const latest = run()
    latest.state.scenes = scenes('경쟁 중 저장한 원문')
    mocks.run.mockResolvedValueOnce(run()).mockResolvedValueOnce(run()).mockResolvedValue(latest)
    mocks.select.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValue({ data: [{ id: 'run-1' }], error: null })
    await generateSceneStoryProposal('project-1', 'run-1', 'p1')
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.update.mock.calls[1][0].state.scenes).toEqual(scenes('경쟁 중 저장한 원문'))
  })
  it('고친 결과가 지금 산문과 한 글자도 다르지 않으면 수정안 카드를 만들지 않고 바꿀 곳이 없었다고 남긴다', async () => {
    // 왜: 바뀐 것이 0개인 수정안을 적용하면 아무것도 안 바뀌는데 '적용했어요'가 뜨고, 요청 문장이 이후 수정 지시로 계속 남았다(디자이너 QA 1차 #01).
    mocks.scenes.mockResolvedValue(scenes())
    await generateSceneStoryProposal('project-1', 'run-1', 'p1')
    const patch = mocks.update.mock.calls[0][0]
    expect(patch.state._sceneStoryProposal.status).toBe('failed')
    expect(patch.state._sceneStoryProposal.error).toBe('scene_story_proposal_unchanged')
    expect(patch.state._sceneStoryProposal.scenes).toBeUndefined()
    expect(patch.state.scenes).toEqual(scenes())
  })
  // 같이 정한 것. 왜: 생성 실패는 초안 손실이나 전체 제작 실패로 번지면 안 된다.
  it('AI 생성이 실패하면 원문을 유지하고 수정안의 실패만 저장한다', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.scenes.mockRejectedValue(new Error('Provider unavailable'))
    await generateSceneStoryProposal('project-1', 'run-1', 'p1')
    expect(mocks.update.mock.calls[0][0].state.scenes).toEqual(scenes())
    expect(mocks.update.mock.calls[0][0].state._sceneStoryProposal.status).toBe('failed')
    expect(mocks.update.mock.calls[0][0].status).toBeUndefined()
    errorLog.mockRestore()
  })
})

describe('바뀐 곳 없는 수정안 판정(검토 지적 8)', () => {
  const scene = (over: Record<string, unknown> = {}) => ({ scene_id: 'scene_1', act_ref: 'act_1', location: '회사 복도', narrative_time: 'present', characters_in_scene: ['minho'], scene_actions: ['민호가 동전을 넣는다.'], dialogue_summary: '민호가 동전을 넣는다.', key_dialogue: [{ speaker: 'minho', line: '또야?' }], estimated_seconds: 6, ...over })
  const scenes = (over: Record<string, unknown> = {}) => ({ scenes: [scene(over)], total_estimated_seconds: 6 }) as never

  it('대사나 장소만 바꾼 수정안은 바뀐 것으로 본다', async () => {
    // 왜: 씬 글만 비교해 대사 · 장소만 고친 수정안을 "바꿀 곳 없음"으로 버렸다 — 적용했다면 바뀌었을 내용이다.
    const { sceneStoryUnchanged } = await import('@/lib/producer/scene-story-proposal')
    expect(sceneStoryUnchanged(scenes(), scenes({ key_dialogue: [{ speaker: 'minho', line: '또 삼켰네.' }] }))).toBe(false)
    expect(sceneStoryUnchanged(scenes(), scenes({ location: '휴게실' }))).toBe(false)
  })

  it('길이 숫자만 달라진 수정안은 바뀐 곳이 없는 것으로 본다', async () => {
    // 왜: 정상 경로 고정 — 보이는 글이 그대로인데 길이 숫자만 다르면 "달라진 씬 0개" 카드가 된다.
    const { sceneStoryUnchanged } = await import('@/lib/producer/scene-story-proposal')
    expect(sceneStoryUnchanged(scenes(), scenes({ estimated_seconds: 9 }))).toBe(true)
  })
})
