import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import { GET } from '@/app/api/writer/export/[projectId]/route'

const PROJECT_ID = 'project-1'
const USER = { id: 'user-1' }

const genre = {
  genre: 'mystery',
  tone: ['tense'],
  targetEmotion: ['wonder'],
  runtime_seconds: 60,
  depth_level: 'D2',
  format: 'vertical_9:16',
}
const narrativeStructure = {
  structure_type: '3-act',
  acts: [{ act_id: 'a1', purpose: 'setup', proportion: 1 }],
  pov: '3rd_limited',
  theme: 'truth',
  central_dramatic_question: 'Will the door open?',
  turning_point_position: 0.5,
}
const characters = {
  characters: [
    {
      id: 'hero',
      name: 'Hero',
      role: 'protagonist',
      personality: ['curious'],
      arc: { start_state: 'lost', end_state: 'found', arc_type: 'positive_change' },
      appearance_description: 'red coat',
      motivation: { want: 'answers', need: 'trust' },
    },
  ],
  relationships: [],
  subtext_notes: [],
}
const scenes = {
  scenes: [
    {
      scene_id: 'scene_1',
      act_ref: 'a1',
      location: 'attic',
      time_of_day: 'night',
      characters_in_scene: ['hero'],
      purpose: 'discovery',
      emotion_beat: { start: 'uneasy', end: 'hopeful' },
      dialogue_summary: 'Hero whispers.',
      info_asymmetry: 'audience=character',
      estimated_seconds: 10,
      scene_actions: ['opens a box'],
    },
  ],
  total_estimated_seconds: 10,
}
const shotDesign = [
  {
    intent: {
      shot_id: 'shot_1',
      scene_id: 'scene_1',
      dramatic_purpose: 'show hesitation',
      duration_seconds: 5,
      audience_focus: 'the box',
      shot_position_in_scene: 'opening',
    },
    static_spec: { shot_id: 'shot_1', shot_type: 'CU', camera_angle: 'eye_level' },
    dynamic_spec: { shot_id: 'shot_1', motion_prompt: 'slow push toward the box' },
  },
]
const renderPrompts = {
  total_shots: 1,
  shots: [
    {
      shot_id: 'shot_1',
      scene_id: 'scene_1',
      duration_seconds: 5,
      t2i: { prompt: 'A close-up of an old box.', aspect_ratio: '9:16', reference_assets: [] },
      ti2v: { motion_prompt: 'Camera slowly pushes in.', duration_seconds: 5 },
    },
  ],
}

const completedState = { genre, narrativeStructure, characters, scenes, shotDesign, renderPrompts }

beforeEach(() => {
  mocks.getUser.mockReset()
  mocks.userOwnsProject.mockReset()
  mocks.from.mockReset()
})

describe('GET /api/writer/export/[projectId]', () => {
  it('returns 401 for unauthenticated requests', async () => {
    mocks.getUser.mockResolvedValue(null)

    const response = await GET(request(), ctx())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mocks.userOwnsProject).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('returns 403 for authenticated non-owners', async () => {
    mocks.getUser.mockResolvedValue(USER)
    mocks.userOwnsProject.mockResolvedValue(false)

    const response = await GET(request(), ctx())

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' })
    expect(mocks.userOwnsProject).toHaveBeenCalledWith(PROJECT_ID, USER.id)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('returns a normalized projection for an owner with a completed run', async () => {
    mocks.getUser.mockResolvedValue(USER)
    mocks.userOwnsProject.mockResolvedValue(true)
    const query = mockWriterRuns([run('completed', completedState, '2026-07-01T00:00:00Z')])

    const response = await GET(request(), ctx())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      storyBible: { genre, narrativeStructure, characters },
      scenes: scenes.scenes,
      shotDesign,
      renderPrompts,
    })
    expect(mocks.from).toHaveBeenCalledWith('writer_runs')
    expect(query.eq).toHaveBeenCalledWith('project_id', PROJECT_ID)
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(query.limit).toHaveBeenCalledWith(5)
  })

  it('prefers an older completed run over a newer failed run with data', async () => {
    mocks.getUser.mockResolvedValue(USER)
    mocks.userOwnsProject.mockResolvedValue(true)
    const failedState = {
      ...completedState,
      genre: { ...genre, genre: 'failed-newer' },
    }
    const olderCompletedState = {
      ...completedState,
      genre: { ...genre, genre: 'completed-older' },
    }
    mockWriterRuns([
      run('failed', failedState, '2026-07-02T00:00:00Z'),
      run('completed', olderCompletedState, '2026-07-01T00:00:00Z'),
    ])

    const response = await GET(request(), ctx())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.storyBible.genre.genre).toBe('completed-older')
  })

  it('prefers an older completed run from the scoped extra query when the recent window is failed-only', async () => {
    mocks.getUser.mockResolvedValue(USER)
    mocks.userOwnsProject.mockResolvedValue(true)
    const failedRuns = Array.from({ length: 5 }, (_, index) =>
      run(
        'failed',
        { ...completedState, genre: { ...genre, genre: `failed-window-${index}` } },
        `2026-07-0${5 - index}T00:00:00Z`,
      ),
    )
    const olderCompletedState = {
      ...completedState,
      genre: { ...genre, genre: 'completed-outside-window' },
    }
    const recentQuery = writerRunsQuery(failedRuns)
    const completedQuery = writerRunsQuery([
      run('completed', olderCompletedState, '2026-06-30T00:00:00Z'),
    ])
    mocks.from.mockReturnValueOnce(recentQuery).mockReturnValueOnce(completedQuery)

    const response = await GET(request(), ctx())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.storyBible.genre.genre).toBe('completed-outside-window')
    expect(mocks.from).toHaveBeenCalledTimes(2)
    expect(recentQuery.limit).toHaveBeenCalledWith(5)
    expect(completedQuery.select).toHaveBeenCalledWith('id,status,state,created_at')
    expect(completedQuery.eq).toHaveBeenNthCalledWith(1, 'project_id', PROJECT_ID)
    expect(completedQuery.eq).toHaveBeenNthCalledWith(2, 'status', 'completed')
    expect(completedQuery.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(completedQuery.limit).toHaveBeenCalledWith(1)
  })

  it('returns all-null stages for an owner with no run', async () => {
    mocks.getUser.mockResolvedValue(USER)
    mocks.userOwnsProject.mockResolvedValue(true)
    mockWriterRuns([])

    const response = await GET(request(), ctx())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      storyBible: null,
      scenes: null,
      shotDesign: null,
      renderPrompts: null,
    })
  })
})

function request(): Request {
  return new Request(`http://localhost/api/writer/export/${PROJECT_ID}`)
}

function ctx(projectId = PROJECT_ID): { params: Promise<{ projectId: string }> } {
  return { params: Promise.resolve({ projectId }) }
}

function run(status: string, state: Record<string, unknown>, createdAt: string): Record<string, unknown> {
  return {
    id: `${status}-${createdAt}`,
    status,
    state,
    created_at: createdAt,
  }
}

function writerRunsQuery(rows: Record<string, unknown>[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
}

function mockWriterRuns(rows: Record<string, unknown>[]) {
  const query = writerRunsQuery(rows)
  mocks.from.mockReturnValue(query)
  return query
}
