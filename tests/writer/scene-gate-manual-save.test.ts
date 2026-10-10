// 씬 스토리를 직접 저장하면 원본과 확정 대기를 유지하고, 권한·입력·동시 수정 충돌을 확인한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  run: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  trigger: vi.fn(),
  after: vi.fn(),
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: mocks.after,
}))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: mocks.access }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.run }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/writer/pipeline/steps', () => ({ triggerWriterStep: mocks.trigger }))

import { POST } from '@/app/api/writer/scene-gate/route'
import { GET } from '@/app/api/writer/preview/[projectId]/route'
import type { SceneStoryProposal } from '@/lib/producer/scene-story-proposal'

const version = '2026-10-01T01:00:00.000Z'
const scene = (id: string) => ({
  scene_id: id,
  scene_actions: ['수림이 기다린다.'],
  location: 'court',
  characters_in_scene: ['char_1'],
  dialogue_summary: '기존 요약',
  estimated_seconds: 12,
  provenance: undefined as { source: 'script'; generated_fields: string[] } | undefined,
})
const run = () => ({
  id: 'run-1',
  status: 'awaiting_confirmation',
  updated_at: version,
  state: {
    input: { story: 'Producer에서 정한 원래 이야기', preserveScript: false },
    scenes: { scenes: [scene('scene_1'), scene('scene_2')], total_estimated_seconds: 24 },
    storyCheck: { passed: true },
    _sceneRevisionNotes: ['기존 수정 요청'],
  },
})
const editedScenes = () => [
  { sceneId: 'scene_2', beats: ['수림이 문을 연다.'] },
  { sceneId: 'scene_1', beats: ['승우가 일어선다.', '수림이 다가온다.'] },
]
const request = (patch: Record<string, unknown> = {}) => new NextRequest('http://localhost/api/writer/scene-gate', {
  method: 'POST',
  body: JSON.stringify({ projectId: 'project-1', action: 'save', expectedUpdatedAt: version, scenes: editedScenes(), ...patch }),
  headers: { 'Content-Type': 'application/json' },
})

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

describe('씬 스토리 직접 저장', () => {
  // 같이 정한 것. 왜: 직접 저장한 뒤 문장만 다듬어 달라고 해도 예전 이야기로 돌아가면 안 된다.
  it('직접 고친 뒤 AI에 수정을 부탁하면 현재 저장된 씬을 기준으로 다듬는다', async () => {
    expect((await POST(request())).status).toBe(200)
    const saved = mocks.update.mock.calls[0][0]
    mocks.run.mockResolvedValue({ ...run(), state: saved.state, updated_at: saved.updated_at })
    const response = await POST(request({ action: 'revise', feedback: '문장만 매끄럽게 다듬어 주세요.' }))
    expect(response.status).toBe(200)
    const revised = mocks.update.mock.calls[1][0]
    expect(revised.state._sceneStoryProposal.baseScenes).toEqual(saved.state.scenes)
    expect(revised.state.scenes).toEqual(saved.state.scenes)
    expect(revised.state.storyCheck).toEqual(saved.state.storyCheck)
    expect(revised.state.input).toEqual(run().state.input)
    expect(revised.state._sceneStoryProposal.feedback).toBe('문장만 매끄럽게 다듬어 주세요.')
    expect(revised.state._sceneRevisionNotes).toEqual(['기존 수정 요청'])
    expect(revised.status).toBe('awaiting_confirmation')
  })

  // 같이 정한 것. 왜: 여러 번 다듬을 때 이전 수정의 결과도 다음 요청에 이어져야 한다.
  it('AI에 다시 수정을 부탁하면 첫 초안이 아니라 가장 최근 초안을 기준으로 다듬는다', async () => {
    const latest = run()
    latest.state.scenes.scenes[0].scene_actions = ['승우가 증거 서류를 가방에서 꺼낸다.']
    mocks.run.mockResolvedValue({
      ...latest,
      state: { ...latest.state, _sceneRevisionSource: run().state.scenes },
    })
    expect((await POST(request({ action: 'revise', feedback: '긴 문장만 줄여 주세요.' }))).status).toBe(200)
    expect(mocks.update.mock.calls[0][0].state._sceneStoryProposal.baseScenes).toEqual(latest.state.scenes)
    expect(latest.state.scenes.scenes[0].scene_actions).toEqual(['승우가 증거 서류를 가방에서 꺼낸다.'])
  })

  // 혼자 정한 것(쉬움). 왜: 요청 접수 전 응답이 늦게 도착해 수정이 끝난 것으로 보이면 동시 편집이 열린다.
  it.each(['confirm', 'revise'])('씬 스토리 요청이 접수되면 이후 변경을 구분할 시각도 돌려준다 (%s)', async (action) => {
    const response = await POST(request({ action, feedback: '문장만 다듬어 주세요.' }))
    expect(response.status).toBe(200)
    expect((await response.json()).updatedAt).toBe(mocks.update.mock.calls[0][0].updated_at)
  })

  // 같이 정한 것. 왜: 정상 경로 고정 — 직접 고친 본문을 저장하는 일은 다음 생성을 시작하는 일이 아니다.
  it('씬 스토리를 직접 저장하면 수정한 본문만 저장하고 확정을 기다린다', async () => {
    const original = run()
    mocks.run.mockResolvedValue(original)
    const response = await POST(request())
    expect(response.status).toBe(200)
    const body = await response.json()
    const patch = mocks.update.mock.calls[0][0]
    expect(body).toEqual({ ok: true, action: 'save', updatedAt: patch.updated_at, storyVersion: patch.updated_at })
    expect(patch.status).toBe('awaiting_confirmation')
    expect(patch.state).toEqual({
      ...original.state,
      storyCheck: undefined,
      _sceneStoryVersion: patch.updated_at,
      scenes: {
        ...original.state.scenes,
        scenes: [
          { ...original.state.scenes.scenes[0], scene_actions: editedScenes()[1].beats },
          { ...original.state.scenes.scenes[1], scene_actions: editedScenes()[0].beats },
        ],
      },
    })
    expect(original).toEqual(run())
    expect(mocks.eq).toHaveBeenCalledWith('id', 'run-1')
    expect(mocks.eq).toHaveBeenCalledWith('status', 'awaiting_confirmation')
    expect(mocks.eq).toHaveBeenCalledWith('updated_at', version)
    expect(mocks.after).not.toHaveBeenCalled()
    expect(mocks.trigger).not.toHaveBeenCalled()
  })

  // 같이 정한 것. 왜: 직접 고친 내용을 확정할 때 이전 본문에 대한 점검 결과를 재사용하면 안 된다.
  it('직접 고친 씬을 확정하면 기존 점검을 재사용하지 않고 다시 점검하도록 넘긴다', async () => {
    expect((await POST(request())).status).toBe(200)
    const saved = mocks.update.mock.calls[0][0]
    expect(saved.state.storyCheck).toBeUndefined()
    mocks.run.mockResolvedValue({ ...run(), state: saved.state, updated_at: saved.updated_at })
    expect((await POST(request({ action: 'confirm' }))).status).toBe(200)
    const confirmed = mocks.update.mock.calls[1][0]
    expect(confirmed.state.storyCheck).toBeUndefined()
    expect(confirmed.state._gateConfirmed).toBe(true)
    expect(confirmed.state.scenes).toEqual(saved.state.scenes)
    expect(confirmed.status).toBe('running')
    expect(mocks.after).toHaveBeenCalledOnce()
  })

  // 혼자 정한 것(쉬움). 왜: 다른 사람이나 공유 링크 방문자가 쓰기 경로를 호출할 수 있다.
  it.each([401, 403])('프로젝트 수정 권한이 없으면 직접 저장할 수 없다 (%s)', async (status) => {
    mocks.access.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Access denied' }, { status }) })
    expect((await POST(request())).status).toBe(status)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  // 혼자 정한 것(쉬움). 왜: 다른 탭에서 확정했거나 다시 쓰는 동안 이전 편집 창을 저장할 수 있다.
  it.each(['running', 'completed', 'failed'])('확정을 기다리는 중이 아니면 직접 저장하지 않는다 (%s)', async (status) => {
    mocks.run.mockResolvedValue({ ...run(), status })
    expect((await POST(request())).status).toBe(409)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  // 혼자 정한 것(쉬움). 왜: 저장 화면을 연 뒤 다른 탭에서 본문을 바꾸면 이전 초안으로 덮어쓸 수 있다.
  it('저장 전에 초안이 바뀌었으면 이전 초안으로 덮어쓰지 않는다', async () => {
    expect((await POST(request({ expectedUpdatedAt: '2026-09-30T01:00:00.000Z' }))).status).toBe(409)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  // 혼자 정한 것(쉬움). 왜: 같은 초안을 읽은 저장과 확정 요청이 동시에 도착할 수 있다.
  it.each(['save', 'confirm', 'revise'])('동시에 다른 수정이 먼저 저장됐으면 그 내용을 덮어쓰지 않는다 (%s)', async (action) => {
    mocks.select.mockResolvedValue({ data: [], error: null })
    expect((await POST(request({ action, feedback: '두 번째 씬을 줄여 주세요.' }))).status).toBe(409)
    expect(mocks.eq).toHaveBeenCalledWith('updated_at', version)
    expect(mocks.after).not.toHaveBeenCalled()
  })

  // 혼자 정한 것(쉬움). 왜: 손상된 입력이나 조작한 요청으로 씬을 없애거나 다른 씬을 덮어쓸 수 있다.
  it.each([
    ['씬 누락', [{ sceneId: 'scene_1', beats: ['본문'] }]],
    ['씬 중복', [{ sceneId: 'scene_1', beats: ['본문'] }, { sceneId: 'scene_1', beats: ['본문'] }]],
    ['다른 씬', [{ sceneId: 'scene_1', beats: ['본문'] }, { sceneId: 'scene_3', beats: ['본문'] }]],
    ['빈 본문', [{ sceneId: 'scene_1', beats: ['  '] }, { sceneId: 'scene_2', beats: ['본문'] }]],
    ['빈 목록', [{ sceneId: 'scene_1', beats: [] }, { sceneId: 'scene_2', beats: ['본문'] }]],
    ['글이 아닌 값', [{ sceneId: 'scene_1', beats: [1] }, { sceneId: 'scene_2', beats: ['본문'] }]],
  ])('씬이 빠지거나 중복되거나 빈 본문이면 저장하지 않는다 (%s)', async (_label, scenes) => {
    expect((await POST(request({ scenes }))).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  // 혼자 정한 것(쉬움). 왜: 너무 큰 복사 붙여넣기나 조작한 요청이 저장 가능한 본문 범위를 넘을 수 있다.
  it.each([
    ['문장 길이', ['가'.repeat(10_001)]],
    ['문장 수', Array.from({ length: 201 }, () => '본문')],
    ['전체 길이', Array.from({ length: 21 }, () => '가'.repeat(10_000))],
  ])('본문이 정해진 크기를 넘으면 저장하지 않는다 (%s)', async (_label, beats) => {
    expect((await POST(request({ scenes: [{ sceneId: 'scene_1', beats }, editedScenes()[0]] }))).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  // 혼자 정한 것(쉬움). 왜: 구버전 화면이나 잘못된 요청에는 어떤 초안을 편집했는지 표시가 없을 수 있다.
  it('편집한 초안의 버전을 보내지 않으면 직접 저장하지 않는다', async () => {
    expect((await POST(request({ expectedUpdatedAt: undefined }))).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  // 이미 정한 대본 보존 동작. 왜: 보존하기로 한 원본을 새 저장 경로가 우회해서 고치면 안 된다.
  it.each(['보존 설정', '대본 출처'])('대본 보존 중이면 원문에서 옮긴 씬을 직접 덮어쓰지 않는다 (%s)', async (source) => {
    const saved = run()
    if (source === '보존 설정') saved.state.input.preserveScript = true
    else saved.state.scenes.scenes[0].provenance = { source: 'script', generated_fields: [] }
    mocks.run.mockResolvedValue(saved)
    const response = await POST(request())
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('preserved_script')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  // 혼자 정한 것(쉬움). 왜: 화면은 실제로 읽은 초안을 저장 요청에 함께 보내야 오래된 편집을 구분할 수 있다.
  it('씬 스토리를 읽으면 직접 고칠 때 확인할 초안 버전도 받는다', async () => {
    mocks.from.mockImplementation(() => {
      const result = { data: [], error: null }
      const query = {
        select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => result),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      }
      query.select.mockReturnValue(query)
      query.eq.mockReturnValue(query)
      return query
    })
    const response = await GET(new NextRequest('http://localhost/api/writer/preview/project-1?locale=ko'), {
      params: Promise.resolve({ projectId: 'project-1' }),
    })
    expect(response.status).toBe(200)
    const preview = await response.json()
    expect(preview.updatedAt).toBe(version)
    expect(preview.storyVersion).toBe(version)
    expect(preview.sceneStoryProposal).toBeNull()
  })

  // 같이 정한 것. 왜: 수정안 완성 여부와 무관하게 사용자는 현재 씬을 직접 고칠 수 있어야 한다.
  it('AI 수정안 상태만 바뀌었으면 직접 편집 중인 원문을 저장할 수 있다', async () => {
    const original = run()
    const p = { id: 'proposal-1', status: 'generating', feedback: '고쳐 줘', createdAt: new Date().toISOString(), baseScenes: original.state.scenes }
    mocks.run.mockResolvedValue({ ...original, updated_at: '2026-10-01T02:00:00.000Z', state: { ...original.state, _sceneStoryVersion: version, _sceneStoryProposal: p } })
    const response = await POST(request({ expectedStoryVersion: version }))
    expect(response.status).toBe(200)
    expect(mocks.update.mock.calls[0][0].state._sceneStoryProposal).toEqual(p)
  })

  // 같이 정한 것. 왜: 적용을 누르기 전 원문을 확정하면 미검토한 제안이 사라질 수 있다.
  it.each(['generating', 'ready', 'failed'])('미해결 수정안이 있으면 먼저 적용하거나 버리도록 안내한다 (%s)', async (status) => {
    mocks.run.mockResolvedValue({ ...run(), state: { ...run().state, _sceneStoryProposal: { id: 'proposal-1', status } } })
    const response = await POST(request({ action: 'confirm' }))
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('scene_story_proposal_pending')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  const ready = () => ({
    id: 'proposal-1', status: 'ready', feedback: '첫 씬 수정', createdAt: new Date().toISOString(),
    baseScenes: run().state.scenes,
    scenes: { ...run().state.scenes, scenes: [{ ...scene('scene_1'), scene_actions: ['AI가 고친 첫 장면'] }, scene('scene_2')] },
  }) as unknown as SceneStoryProposal

  // 같이 정한 것. 왜: 정상 경로 고정 — 적용은 원문을 바꾸지만 다음 제작을 시작하지 않는다.
  it('AI 수정안을 적용하면 고친 씬을 저장하고 확정을 기다린다', async () => {
    mocks.run.mockResolvedValue({ ...run(), state: { ...run().state, _sceneStoryProposal: ready() } })
    const response = await POST(request({ action: 'apply', proposalId: 'proposal-1' }))
    expect(response.status).toBe(200)
    const patch = mocks.update.mock.calls[0][0]
    expect(patch.state.scenes.scenes[0].scene_actions).toEqual(['AI가 고친 첫 장면'])
    expect(patch.state._sceneStoryProposal).toBeUndefined()
    expect(patch.state.storyCheck).toBeUndefined()
    expect(patch.status).toBe('awaiting_confirmation')
    expect(mocks.after).not.toHaveBeenCalled()
  })

  // 같이 정한 것. 왜: 같은 씬을 직접 바꾸고 나서 이전 AI 결과를 적용하면 수동 편집이 사라진다.
  it('같은 씬을 직접 고친 뒤 이전 수정안을 적용하면 다시 제안하도록 안내한다', async () => {
    const current = run()
    current.state.scenes.scenes[0].scene_actions = ['직접 고친 첫 장면']
    mocks.run.mockResolvedValue({ ...current, state: { ...current.state, _sceneStoryProposal: ready() } })
    const response = await POST(request({ action: 'apply', proposalId: 'proposal-1' }))
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('scene_story_changed')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  // 같이 정한 것. 왜: 버리기는 생성 중이어도 원문에 영향을 주지 않아야 한다.
  it.each(['generating', 'ready', 'failed'])('AI 수정안을 버리면 원문을 유지한다 (%s)', async (status) => {
    mocks.run.mockResolvedValue({ ...run(), state: { ...run().state, _sceneStoryProposal: { ...ready(), status } } })
    const response = await POST(request({ action: 'discard', proposalId: 'proposal-1' }))
    expect(response.status).toBe(200)
    const patch = mocks.update.mock.calls[0][0]
    expect(patch.state.scenes).toEqual(run().state.scenes)
    expect(patch.state._sceneStoryProposal).toBeUndefined()
    expect(patch.state._sceneStoryVersion).toBe(version)
  })

  // 혼자 정한 것(쉬움). 왜: 이전 화면에서 누른 버튼이 새 수정안을 적용하거나 지우면 안 된다.
  it.each(['apply', 'discard'])('이미 교체된 수정안의 버튼을 누르면 현재 수정안은 유지한다 (%s)', async (action) => {
    mocks.run.mockResolvedValue({ ...run(), state: { ...run().state, _sceneStoryProposal: ready() } })
    expect((await POST(request({ action, proposalId: 'old-proposal' }))).status).toBe(409)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  // 같이 정한 것. 왜: 오래된 제안 뒤 다시 요청하면 지금 저장된 글을 출발점으로 삼아야 한다.
  it.each(['ready', 'failed', 'expired'])('수정안을 다시 요청하면 최신 원문을 기준으로 새 수정안을 만든다 (%s)', async (status) => {
    const original = run()
    original.state.scenes.scenes[0].scene_actions = ['지금 저장된 원문']
    mocks.run.mockResolvedValue({ ...original, state: { ...original.state, _sceneStoryProposal: { ...ready(), status: status === 'expired' ? 'generating' : status, createdAt: '2020-01-01T00:00:00Z' } } })
    const response = await POST(request({ action: 'revise', feedback: '이 글을 다시 다듬어 줘' }))
    expect(response.status).toBe(200)
    const next = mocks.update.mock.calls[0][0].state._sceneStoryProposal
    expect(next.id).not.toBe('proposal-1')
    expect(next.baseScenes).toEqual(original.state.scenes)
    expect(next.status).toBe('generating')
    expect((await response.json()).proposalId).toBe(next.id)
  })

  // 혼자 정한 것(쉬움). 왜: 이중 클릭이나 중복 전송이 같은 요청의 생성을 여러 번 시작하면 안 된다.
  it('수정안을 이미 생성하고 있으면 중복 요청으로 다시 생성하지 않는다', async () => {
    mocks.run.mockResolvedValue({ ...run(), state: { ...run().state, _sceneStoryProposal: { ...ready(), status: 'generating' } } })
    const response = await POST(request({ action: 'revise', feedback: '고쳐 줘' }))
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('scene_story_proposal_pending')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  // 같이 정한 것. 왜: 생성 완료 알림이 도착하는 순간 직접 저장해도 원문 버전이 같으면 저장할 수 있다.
  it('직접 저장 중 수정안만 완성되면 최신 수정안을 보존하며 직접 저장을 마친다', async () => {
    const original = { ...run(), state: { ...run().state, _sceneStoryVersion: version, _sceneStoryProposal: { ...ready(), status: 'generating' } } }
    const latest = { ...original, updated_at: '2026-10-01T02:00:00Z', state: { ...original.state, _sceneStoryProposal: ready() } }
    mocks.run.mockResolvedValueOnce(original).mockResolvedValue(latest)
    mocks.select.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValue({ data: [{ id: 'run-1' }], error: null })
    const response = await POST(request({ expectedStoryVersion: version, expectedUpdatedAt: undefined }))
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.update.mock.calls[1][0].state._sceneStoryProposal.status).toBe('ready')
    expect(mocks.update.mock.calls[1][0].state.scenes.scenes[0].scene_actions).toEqual(editedScenes()[1].beats)
  })
})
