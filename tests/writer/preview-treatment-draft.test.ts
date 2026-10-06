// 씬 스토리 미리보기는 트리트먼트 초안 여부, 적용 뒤 되돌리기, 트리트먼트가 만든 인물·장소를 함께 알려 준다 (2026-10-02 오너 · 시안 v04)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ run: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: vi.fn(async (_req: Request, projectId: string) => ({ ok: true, projectId })) }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.run }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import { GET } from '@/app/api/writer/preview/[projectId]/route'

const scenes = { scenes: [{ scene_id: 's1', scene_actions: ['지아가 돌을 던진다.'], location: 'yard', characters_in_scene: ['jia'] }], total_estimated_seconds: 12 }
const run = (state: Record<string, unknown>) => ({
  id: 'run-1', status: 'awaiting_confirmation', updated_at: '2026-10-02T00:00:00.000Z', created_at: '2026-10-01T23:59:00.000Z',
  state: { input: { story: '씨앗', treatmentDraft: true }, scenes, _sceneStoryVersion: 'story-2', ...state },
})
const preview = async () => (await GET(new NextRequest('http://localhost/api/writer/preview/p1?locale=ko'), { params: Promise.resolve({ projectId: 'p1' }) })).json()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.from.mockImplementation(() => {
    const result = { data: [], error: null }
    const query: Record<string, unknown> = { maybeSingle: vi.fn(async () => result), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) }
    query.select = vi.fn(() => query)
    query.eq = vi.fn(() => query)
    return query
  })
})

describe('트리트먼트 초안 미리보기', () => {
  it('새 프로젝트의 트리트먼트 초안이면 초안이라고 알린다', async () => {
    mocks.run.mockResolvedValue(run({}))
    expect((await preview()).draft).toBe(true)
  })

  it('트리트먼트가 만든 인물과 장소를 Producer 카드로 옮길 수 있게 함께 보낸다', async () => {
    mocks.run.mockResolvedValue(run({
      characters: { characters: [{ id: 'jia', name: '지아', role: 'protagonist', appearance_description: '분홍 원피스', arc: { start_state: '고집', end_state: '양보', arc_type: 'positive_change' }, motivation: { want: '이기기', need: '친구' } }] },
      world: { locations: [{ id: 'yard', name: '운동장', description: '흙바닥' }] },
    }))
    expect((await preview()).treatmentCast).toEqual({
      version: expect.any(String),
      characters: [{ id: 'jia', name: '지아', role: 'protagonist', entityType: 'person', appearance: '분홍 원피스', arc: { start_state: '고집', end_state: '양보', arc_type: 'positive_change' }, want: '이기기' }],
      locations: [{ id: 'yard', name: '운동장', description: '흙바닥' }],
    })
  })

  it('다시 쓰기 안을 적용한 뒤에는 되돌리기를 알려 주고, 그 뒤에 고쳤으면 알리지 않는다', async () => {
    mocks.run.mockResolvedValue(run({ _sceneStoryUndo: { id: 'u1', label: 'v2', storyVersion: 'story-2', scenes } }))
    expect((await preview()).sceneStoryUndo).toEqual({ id: 'u1', label: 'v2' })
    mocks.run.mockResolvedValue(run({ _sceneStoryUndo: { id: 'u1', label: 'v2', storyVersion: 'story-1', scenes } }))
    expect((await preview()).sceneStoryUndo).toBeNull()
  })
})

describe('카드 맞춤 버전 (검토 지적)', () => {
  it('수정안을 만들거나 버려도 트리트먼트 인물이 그대로면 카드 맞춤 버전이 바뀌지 않는다', async () => {
    // 왜: 첫 수정안 요청이 원문 버전을 실행 시각으로 채우면서 맞춤 버전이 바뀌어, 사람이 지운 카드가 되살아났다.
    const cast = { characters: { characters: [{ id: 'jia', name: '지아' }] }, world: { locations: [{ id: 'yard', name: '운동장', description: '' }] } }
    mocks.run.mockResolvedValue(run({ ...cast, _sceneStoryVersion: undefined }))
    const before = (await preview()).treatmentCast.version
    mocks.run.mockResolvedValue(run({ ...cast, _sceneStoryVersion: '2026-10-02T00:05:00.000Z' }))
    expect((await preview()).treatmentCast.version).toBe(before)
    mocks.run.mockResolvedValue(run({ ...cast, characters: { characters: [{ id: 'jia', name: '지아' }, { id: 'suji', name: '수지' }] } }))
    expect((await preview()).treatmentCast.version).not.toBe(before)
  })
})

describe('대본을 그대로 보존한 초안의 장소 (2026-10-06 운영 제보)', () => {
  const preserved = {
    input: { story: '대본', treatmentDraft: true, preserveScript: true },
    characters: { characters: [{ id: 'char_1', name: '미나코', role: 'supporting' }] },
    scenes: { scenes: [
      { scene_id: 'scene_1', scene_actions: ['미나코가 걷는다.'], location: '북적이는 인도', characters_in_scene: ['char_1'] },
      { scene_id: 'scene_2', scene_actions: ['미나코가 앉는다.'], location: '붐비는 카페', characters_in_scene: ['char_1'] },
      { scene_id: 'scene_3', scene_actions: ['미나코가 돌아온다.'], location: '북적이는 인도', characters_in_scene: ['char_1'] },
    ], total_estimated_seconds: 30 },
  }

  it('장소 목록이 없는 보존 대본 초안은 씬에 적힌 장소로 배경 목록을 만든다', async () => {
    // 왜: 보존 모드 초안은 씬을 대본에서 그대로 옮겨 장소 목록을 만들지 않는다. 배경 카드가 0장이면 넘기기가 막힌다.
    mocks.run.mockResolvedValue(run(preserved))
    expect((await preview()).treatmentCast.locations).toEqual([
      { id: '북적이는 인도', name: '북적이는 인도', description: '' },
      { id: '붐비는 카페', name: '붐비는 카페', description: '' },
    ])
  })

  it('장소 목록이 이미 있으면 씬에서 장소를 더 만들지 않는다', async () => {
    mocks.run.mockResolvedValue(run({ ...preserved, world: { locations: [{ id: 'cafe', name: '붐비는 카페', description: '창가 자리' }] } }))
    expect((await preview()).treatmentCast.locations).toEqual([{ id: 'cafe', name: '붐비는 카페', description: '창가 자리' }])
  })
})

describe('트리트먼트를 쓴 바탕 (검토 지적)', () => {
  it('트리트먼트 초안은 무엇을 바탕으로 썼는지 함께 알려 준다', async () => {
    const { fnv1a } = await import('@/lib/stable-hash')
    mocks.run.mockResolvedValue(run({ input: { story: '씨앗', treatmentDraft: true, runtimeSeconds: 300 } }))
    expect((await preview()).draftBasis).toEqual({ storyHash: fnv1a('씨앗'), runtimeSeconds: 300, preserveScript: false })
  })

  it('Producer 값이 트리트먼트를 쓴 바탕과 다르면 바뀐 것을 짚는다', async () => {
    const { fnv1a } = await import('@/lib/stable-hash')
    const { staleDraftFields } = await import('@/lib/writer/treatment-draft')
    const basis = { storyHash: fnv1a('씨앗'), runtimeSeconds: 300, preserveScript: false }
    expect(staleDraftFields(basis, { storyText: '씨앗', playtime: 300, preserveScript: null })).toEqual([])
    expect(staleDraftFields(basis, { storyText: '씨앗 두 줄', playtime: 60, preserveScript: true })).toEqual(['story', 'runtime', 'preserveScript'])
  })
})
