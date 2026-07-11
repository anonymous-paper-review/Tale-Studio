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
import { collectProducerArtifacts, type ProducerArtifactBoard } from '@/lib/export/producer'
import {
  collectWriterArtifacts,
  type WriterExportFetch,
  type WriterExportProjection,
} from '@/lib/export/writer'

const PROJECT_A = 'project-a'
const PROJECT_B = 'project-b'
const USER_A = { id: 'user-a' }
const SECRET_MARKER = 'writer_runs secret must not leak'

beforeEach(() => {
  mocks.getUser.mockReset()
  mocks.userOwnsProject.mockReset()
  mocks.from.mockReset()
})

describe('G002 writer export route auth boundaries', () => {
  it('returns 401 before ownership or writer_runs access for unauthenticated requests', async () => {
    mocks.getUser.mockResolvedValue(null)
    mocks.from.mockImplementation(() => {
      throw new Error(SECRET_MARKER)
    })

    const response = await GET(request(PROJECT_A), ctx(PROJECT_A))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
    expect(JSON.stringify(body)).not.toContain(SECRET_MARKER)
    expect(mocks.userOwnsProject).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('returns 403 for a valid user who owns project A but requests project B', async () => {
    mocks.getUser.mockResolvedValue(USER_A)
    mocks.userOwnsProject.mockImplementation(async (projectId: string, userId: string) => {
      return projectId === PROJECT_A && userId === USER_A.id
    })
    mocks.from.mockImplementation(() => {
      throw new Error(SECRET_MARKER)
    })

    const response = await GET(request(PROJECT_B), ctx(PROJECT_B))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ error: 'forbidden' })
    expect(JSON.stringify(body)).not.toContain(SECRET_MARKER)
    expect(mocks.userOwnsProject).toHaveBeenCalledWith(PROJECT_B, USER_A.id)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})

describe('G002 writer export route run selection', () => {
  it('prefers an older completed usable run over a newer failed usable run', async () => {
    mockOwner()
    mockWriterRuns([
      run('failed', stateWithGenre('newer-failed'), '2026-07-02T00:00:00Z'),
      run('completed', stateWithGenre('older-completed'), '2026-07-01T00:00:00Z'),
    ])

    const response = await GET(request(PROJECT_A), ctx(PROJECT_A))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.storyBible.genre.genre).toBe('older-completed')
  })

  it('falls back to the newest usable run when every usable run failed', async () => {
    mockOwner()
    mockWriterRuns([
      run('failed', stateWithGenre('newest-usable-failed'), '2026-07-03T00:00:00Z'),
      run('failed', stateWithGenre('older-usable-failed'), '2026-07-02T00:00:00Z'),
    ])

    const response = await GET(request(PROJECT_A), ctx(PROJECT_A))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.storyBible.genre.genre).toBe('newest-usable-failed')
  })

  it('returns an all-null 200 when recent runs have non-record or empty unusable state', async () => {
    mockOwner()
    mockWriterRuns([
      run('completed', null, '2026-07-04T00:00:00Z'),
      run('completed', [], '2026-07-03T00:00:00Z'),
      run('completed', {}, '2026-07-02T00:00:00Z'),
      run(
        'failed',
        { genre: null, narrativeStructure: null, characters: null, scenes: 'bad', shotDesign: {}, renderPrompts: null },
        '2026-07-01T00:00:00Z',
      ),
    ])

    const response = await GET(request(PROJECT_A), ctx(PROJECT_A))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      storyBible: null,
      scenes: null,
      shotDesign: null,
      renderPrompts: null,
    })
  })

  it('throws on supabaseAdmin writer_runs errors instead of masking them as empty exports', async () => {
    mockOwner()
    mockWriterRunLoadError('database unavailable')

    await expect(GET(request(PROJECT_A), ctx(PROJECT_A))).rejects.toThrow(
      'writer export run load failed: database unavailable',
    )
  })
})

describe('G002 writer collector markdown robustness', () => {
  it('does not throw or inline raw JSON braces for deeply malformed partial projections', async () => {
    const malformedProjection = {
      storyBible: {
        genre: {
          genre: { raw: 'object should not be stringified' },
          genre_native: '네이티브 장르',
          tone: [{ raw: 'bad tone' }, true, 'tense'],
          targetEmotion: [{ raw: 'bad emotion' }],
          runtime_seconds: 'sixty',
        },
        narrativeStructure: {
          acts: { not: 'an array' },
          theme: ['bad'],
          theme_native: '네이티브 주제',
          turning_point_position: Number.NaN,
        },
        characters: {
          characters: [
            null,
            {
              id: { raw: 'bad id' },
              name: { raw: 'bad name' },
              role_native: '네이티브 역할',
              arc: { start_state: { raw: 'bad arc' }, end_state_native: '끝' },
              motivation: { want: { raw: 'bad want' }, need_native: '필요' },
            },
          ],
        },
      },
      scenes: { scenes: 'not an array' },
      shotDesign: [
        {
          intent: { shot_id: { raw: 'bad shot id' }, dramatic_purpose: { raw: 'bad purpose' } },
          static_spec: 'not a record',
          dynamic_spec: { character_motion: [{ character_id: { raw: 'bad character' }, verb: { raw: 'bad verb' } }] },
        },
      ],
      renderPrompts: null,
    }

    const files = await collectWriterArtifacts('project-malformed', {
      fetchFn: fetchProjection(malformedProjection),
    })

    expect(files.map((file) => file.path).sort()).toEqual([
      'writer/prompts.md',
      'writer/scenes.md',
      'writer/shots.md',
      'writer/story-bible.md',
    ])
    for (const file of files) {
      expect(file.kind).toBe('text')
      expect(file.content ?? '').not.toMatch(/[{}]/)
      expect(file.content ?? '').not.toContain('```json')
    }
  })

  it('keeps markdown injection in scene prose inside escaped table cells', async () => {
    const files = await collectWriterArtifacts('project-injection', {
      fetchFn: fetchProjection({
        storyBible: null,
        scenes: [
          {
            scene_id: 'scene-injection',
            location: 'attic',
            characters_present: ['hero'],
            narrative_summary: 'Safe line\n# Injected | pipe |',
            dialogue_summary: 'Dialogue line\n# Injected | pipe |',
            emotion_beat: { start: 'calm', end: 'alarmed' },
          },
        ],
        shotDesign: null,
        renderPrompts: null,
      }),
    })

    const scenes = content(files, 'writer/scenes.md')
    expect(scenes).not.toMatch(/(^|\n)# Injected/m)
    expect(scenes).not.toContain('| pipe |')
    expect(scenes).toContain('\\| pipe \\|')
  })

  it('uses native text over EN base fields when native variants are present', async () => {
    const nativeProjection: WriterExportProjection = {
      storyBible: {
        genre: { genre: 'English genre', genre_native: '네이티브 장르' },
        narrativeStructure: {
          structure_type: 'English structure',
          structure_type_native: '네이티브 구조',
          theme: 'English theme',
          theme_native: '네이티브 주제',
        },
        characters: {
          characters: [
            {
              id: 'hero',
              name: 'English name',
              name_native: '네이티브 이름',
              role: 'English role',
              role_native: '네이티브 역할',
            },
          ],
        },
      },
      scenes: [
        {
          scene_id: 'scene-native',
          narrative_summary: 'English scene',
          narrative_summary_native: '네이티브 장면',
        },
      ],
      shotDesign: [
        {
          intent: {
            shot_id: 'shot-native',
            scene_id: 'scene-native',
            dramatic_purpose: 'English purpose',
            dramatic_purpose_native: '네이티브 의도',
          },
        },
      ],
      renderPrompts: { shots: [] },
    }

    const files = await collectWriterArtifacts('project-native', {
      fetchFn: fetchProjection(nativeProjection),
    })
    const allMarkdown = files.map((file) => file.content ?? '').join('\n')

    expect(allMarkdown).toContain('네이티브 장르')
    expect(allMarkdown).toContain('네이티브 주제')
    expect(allMarkdown).toContain('네이티브 이름')
    expect(allMarkdown).toContain('네이티브 장면')
    expect(allMarkdown).toContain('네이티브 의도')
    expect(allMarkdown).not.toContain('English genre')
    expect(allMarkdown).not.toContain('English scene')
    expect(allMarkdown).not.toContain('English purpose')
  })
})

describe('G002 producer collector robustness', () => {
  it('does not throw on malformed missing board fields and remains markdown-only', () => {
    const malformedBoard = {
      projectSettings: {
        playtime: 'not a number',
        tone: 'not an array',
        targetEmotion: [123, 'unease'],
        format: { raw: 'bad format' },
      },
      cast: [
        null,
        {
          localId: 'cast-malformed',
          name: { raw: 'bad name' },
          entityType: 'object',
          appearance: null,
          role: ['bad role'],
          arc: { start_state: { raw: 'bad start' }, end_state: '끝' },
          motivation: { want: { raw: 'bad want' }, need: '필요' },
        },
      ],
      backgrounds: [
        null,
        {
          localId: 'bg-malformed',
          imageUrl: 'https://attacker.example/background.png',
          name: { raw: 'bad name' },
          purpose: null,
          visualDescription: ['bad description'],
        },
      ],
    } as unknown as ProducerArtifactBoard

    let files: ReturnType<typeof collectProducerArtifacts> = []
    expect(() => {
      files = collectProducerArtifacts(malformedBoard)
    }).not.toThrow()

    expect(files.map((file) => file.path)).toEqual([
      'producer/story.md',
      'producer/settings.md',
      'producer/cast.md',
      'producer/backgrounds.md',
    ])
    expect(files.filter((file) => file.path.startsWith('producer/backgrounds/'))).toEqual([])
    expect(files.some((file) => file.kind === 'media')).toBe(false)
    expect(content(files, 'producer/story.md')).toContain('스토리 작성 전')
  })
})

function mockOwner() {
  mocks.getUser.mockResolvedValue(USER_A)
  mocks.userOwnsProject.mockResolvedValue(true)
}

function request(projectId: string): Request {
  return new Request(`http://localhost/api/writer/export/${projectId}`)
}

function ctx(projectId: string): { params: Promise<{ projectId: string }> } {
  return { params: Promise.resolve({ projectId }) }
}

function stateWithGenre(marker: string): Record<string, unknown> {
  return { genre: { genre: marker } }
}

function run(status: string, state: unknown, createdAt: string): Record<string, unknown> {
  return {
    id: `${status}-${createdAt}`,
    status,
    state,
    created_at: createdAt,
  }
}

function mockWriterRuns(rows: Record<string, unknown>[]) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
  mocks.from.mockReturnValue(query)
  return query
}

function mockWriterRunLoadError(message: string) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: null, error: { message } }),
  }
  mocks.from.mockReturnValue(query)
  return query
}

function fetchProjection(payload: unknown): WriterExportFetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  }))
}

function content(files: Array<{ path: string; content?: string | null }>, path: string): string {
  const file = files.find((candidate) => candidate.path === path)
  expect(file).toBeTruthy()
  return file?.content ?? ''
}
