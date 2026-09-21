// 프로젝트 주인만 Writer 내보내기를 열고, 문제가 있는 자료도 안전한 문서로 정리한다 (G002)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({
  userOwnsProject: mocks.userOwnsProject,
  // director-store 가 폴링 상한을 이 상수에서 파생시킨다(#poll-timeout-align).
  STALE_QUEUED_MS: 10 * 60 * 1000,
}))
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

describe('프로젝트 내보내기 권한 확인 (G002)', () => {
  it('로그인하지 않은 사람은 프로젝트를 내보낼 수 없다', async () => {
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

  it('다른 사람의 프로젝트는 내보낼 수 없다', async () => {
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

describe('내보낼 자료를 고르는 기준 (G002)', () => {
  it('새 자료가 실패했으면 이전에 완성된 자료를 우선 내보낸다', async () => {
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

  it('모든 자료가 실패했으면 가장 최근 자료를 내보낸다', async () => {
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

  it('최근 자료가 유효하지 않으면 내용 없는 내보내기를 돌려준다', async () => {
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

  it('자료를 불러오는 중 저장소 오류가 나면 원인을 숨기지 않고 알린다', async () => {
    mockOwner()
    mockWriterRunLoadError('database unavailable')

    await expect(GET(request(PROJECT_A), ctx(PROJECT_A))).rejects.toThrow(
      'writer export run load failed: database unavailable',
    )
  })
})

describe('내보내는 문서의 내용 정리 (G002)', () => {
  it('자료가 심하게 망가져도 문서 생성을 중단하지 않고 읽기 쉬운 내용만 담는다', async () => {
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
    }, 'ko')

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

  it('장면 설명에 특수 문자가 있어도 문서 표가 깨지지 않는다', async () => {
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
    }, 'ko')

    const scenes = content(files, 'writer/scenes.md')
    expect(scenes).not.toMatch(/(^|\n)# Injected/m)
    expect(scenes).not.toContain('| pipe |')
    expect(scenes).toContain('\\| pipe \\|')
  })

  it('번역된 설명이 있으면 기본 영어 설명보다 번역문을 우선한다', async () => {
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
    }, 'ko')
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

describe('Producer 정보 내보내기 안정성 (G002)', () => {
  it('내용이 빠진 인물과 배경 자료도 오류 없이 문서로만 내보낸다', () => {
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
      files = collectProducerArtifacts(malformedBoard, 'ko')
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
