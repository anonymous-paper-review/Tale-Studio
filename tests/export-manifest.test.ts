import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

import { sanitizeSegment } from '@/lib/export/sanitize'
import { bundleAndDownload } from '@/lib/export/zip'
import {
  createDefaultExportDeps,
  composeProjectArtifacts,
  exportProject,
  exportStage,
  type ArtifactFile,
  type ExportDeps,
  type ExportResult,
  type ExportStage,
} from '@/lib/export'

vi.mock('@/lib/export/zip', () => ({
  bundleAndDownload: vi.fn(async (files: ArtifactFile[]): Promise<ExportResult> => ({
    total: files.length,
    downloaded: files.length,
    failed: 0,
  })),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: createClientMock,
}))

const PROJECT = { id: 'project-1', name: '테스트 프로젝트' }
const NOW = '2026-07-11T12:34:56.789Z'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('composeProjectArtifacts export manifest', () => {
  it('prepends README.md listing all four stages with counts matching bundled files', async () => {
    const deps = depsFromFiles({
      producer: [textFile('producer/story.md'), textFile('producer/settings.md')],
      writer: [textFile('writer/scenes.md')],
      artist: [textFile('artist/assets.md')],
      director: [textFile('director/shotlist.md'), mediaFile('director/clips/shot-1.mp4')],
    })

    const files = await composeProjectArtifacts(PROJECT, deps)
    const readme = textContent(files, 'README.md')

    expect(paths(files)).toEqual([
      'README.md',
      'producer/story.md',
      'producer/settings.md',
      'writer/scenes.md',
      'artist/assets.md',
      'director/shotlist.md',
      'director/clips/shot-1.mp4',
    ])
    expect(readme).toContain('# 테스트 프로젝트')
    expect(readme).toContain(`- **Generated:** ${NOW}`)
    expect(readme).toContain('## Table of Contents / Manifest')
    expect(readme).toContain('| producer | 완료 | 2 |  |')
    expect(readme).toContain('| writer | 완료 | 1 |  |')
    expect(readme).toContain('| artist | 완료 | 1 |  |')
    expect(readme).toContain('| director | 완료 | 2 |  |')
  })

  it('marks a zero-file stage as 비어 있음 without adding an empty folder artifact', async () => {
    const deps = depsFromFiles({
      producer: [textFile('producer/story.md')],
      writer: [textFile('writer/scenes.md')],
      artist: [],
      director: [textFile('director/shotlist.md')],
    })

    const files = await composeProjectArtifacts(PROJECT, deps)
    const readme = textContent(files, 'README.md')

    expect(readme).toContain('| artist | 비어 있음 | 0 |  |')
    expect(paths(files)).toEqual([
      'README.md',
      'producer/story.md',
      'writer/scenes.md',
      'director/shotlist.md',
    ])
    expect(paths(files).some((path) => path === 'artist' || path.startsWith('artist/'))).toBe(false)
  })

  it('records a failed stage as 오류 and keeps exporting the remaining stages', async () => {
    const deps = depsFromFiles({
      producer: [textFile('producer/story.md')],
      writer: new Error('writer offline'),
      artist: [textFile('artist/assets.md')],
      director: [textFile('director/shotlist.md')],
    })

    const files = await composeProjectArtifacts(PROJECT, deps)
    const readme = textContent(files, 'README.md')

    expect(readme).toContain('| writer | 오류 | 0 | writer offline |')
    expect(paths(files)).toEqual([
      'README.md',
      'producer/story.md',
      'artist/assets.md',
      'director/shotlist.md',
    ])
  })

  it('escapes pipes and newlines in README manifest error cells', async () => {
    const deps = depsFromFiles({
      producer: [textFile('producer/story.md')],
      writer: new Error('writer | offline\nretry later'),
      artist: [],
      director: [],
    })

    const files = await composeProjectArtifacts(PROJECT, deps)
    const readme = textContent(files, 'README.md')

    expect(readme).toContain('| writer | 오류 | 0 | writer \\| offline<br>retry later |')
    expect(readme).not.toContain('| writer | 오류 | 0 | writer | offline')
  })

  it('uses DB-derived producer files when the default producer collector runs with a cold store', async () => {
    createClientMock.mockReturnValue(
      mockProducerSupabase({
        project: {
          story_text: '',
          settings: null,
          last_writer_run_id: null,
          producer_draft: {
            version: 1,
            savedAt: 1,
            storyText: 'DB 드래프트 스토리',
            storyReady: true,
            settings: {
              playtime: 75,
              genre: '미스터리',
              format: 'horizontal_16:9',
              tone: ['긴장감'],
              dialogueLanguage: 'ko',
            },
            cast: [
              {
                localId: 'draft-cast-1',
                name: 'DB 주인공',
                entityType: 'person',
                appearance: '빗속 코트',
                origin: 'producer',
              },
            ],
            backgrounds: [
              {
                localId: 'draft-bg-1',
                name: 'DB 골목',
                visualDescription: '네온 간판 골목',
                purpose: '추적',
                origin: 'producer',
              },
            ],
          },
        },
      }),
    )
    const { useProducerStore } = await import('@/stores/producer-store')
    useProducerStore.getState().reset()

    const producerFiles = await createDefaultExportDeps().producer(PROJECT)
    const story = textContent(producerFiles, 'producer/story.md')
    const cast = textContent(producerFiles, 'producer/cast.md')

    expect(story).toContain('DB 드래프트 스토리')
    expect(story).not.toContain('스토리 작성 전')
    expect(cast).toContain('DB 주인공')

    await exportProject(
      PROJECT,
      depsFromFiles({
        producer: producerFiles,
        writer: [],
        artist: [],
        director: [],
      }),
    )
    const bundledFiles = vi.mocked(bundleAndDownload).mock.calls.at(-1)?.[0] as ArtifactFile[]
    const readme = textContent(bundledFiles, 'README.md')

    expect(readme).toContain('| producer | 완료 | 4 |  |')
  })
})

describe('export orchestrator download names', () => {
  it('uses sanitizeSegment(project.name) for project and stage zip names', async () => {
    const project = { id: 'project-unsafe', name: '../../My Project:*?' }
    const deps = depsFromFiles({
      producer: [textFile('producer/story.md')],
      writer: [textFile('writer/scenes.md')],
      artist: [],
      director: [],
    })

    await exportProject(project, deps)

    expect(bundleAndDownload).toHaveBeenLastCalledWith(
      expect.any(Array),
      `${sanitizeSegment(project.name)}-export.zip`,
    )

    vi.clearAllMocks()

    await exportStage('writer', project, deps)

    expect(bundleAndDownload).toHaveBeenLastCalledWith(
      [textFile('writer/scenes.md')],
      `${sanitizeSegment(project.name)}-writer-export.zip`,
    )
  })
})

function depsFromFiles(
  filesByStage: Record<ExportStage, ArtifactFile[] | Error>,
): Required<ExportDeps> {
  return {
    producer: collector(filesByStage.producer),
    writer: collector(filesByStage.writer),
    artist: collector(filesByStage.artist),
    director: collector(filesByStage.director),
  }
}

function collector(value: ArtifactFile[] | Error) {
  return vi.fn(async () => {
    if (value instanceof Error) throw value
    return value
  })
}

function textFile(path: string): ArtifactFile {
  return { path, kind: 'text', content: `${path} content` }
}

function mediaFile(path: string): ArtifactFile {
  return { path, kind: 'media', url: `https://cdn.test/${path}` }
}

function paths(files: ArtifactFile[]): string[] {
  return files.map((file) => file.path)
}

function textContent(files: ArtifactFile[], path: string): string {
  const file = files.find((candidate) => candidate.path === path)
  expect(file).toMatchObject({ kind: 'text' })
  expect(file?.content).toEqual(expect.any(String))
  return file!.content!
}

function mockProducerSupabase({
  project,
  characters = [],
  locations = [],
}: {
  project: Record<string, unknown>
  characters?: Record<string, unknown>[]
  locations?: Record<string, unknown>[]
}) {
  const results: Record<string, { data: unknown; error: null }> = {
    projects: { data: project, error: null },
    characters: { data: characters, error: null },
    locations: { data: locations, error: null },
  }

  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => {
          const result = results[table]
          if (!result) throw new Error(`unexpected table ${table}`)
          return table === 'projects'
            ? { single: vi.fn(async () => result) }
            : Promise.resolve(result)
        }),
      })),
    })),
  }
}
