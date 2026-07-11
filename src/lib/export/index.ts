import { h1, h2, table } from './md'
import { sanitizeSegment } from './sanitize'
import type { ArtifactFile, ExportResult, ExportStage } from './types'
import { bundleAndDownload } from './zip'

export type { ArtifactFile, ExportResult, ExportStage } from './types'

export interface ExportProjectInfo {
  id: string
  name: string
}

export type ExportCollector = (project: ExportProjectInfo) => Promise<ArtifactFile[]>

export interface ExportDeps {
  producer?: ExportCollector
  writer?: ExportCollector
  artist?: ExportCollector
  director?: ExportCollector
}

type CompleteExportDeps = Record<ExportStage, ExportCollector>

type StageManifestEntry = {
  stage: ExportStage
  files: ArtifactFile[]
  error?: string
}

const EXPORT_STAGES: ExportStage[] = ['producer', 'writer', 'artist', 'director']

/**
 * Exports a single stage. Collector/download errors are intentionally propagated
 * so callers can present the failing stage directly.
 */
export async function exportStage(
  stage: ExportStage,
  project: ExportProjectInfo,
  deps?: ExportDeps,
): Promise<ExportResult> {
  const files = await collectorFor(stage, deps)(project)
  return bundleAndDownload(files, `${sanitizeSegment(project.name)}-${stage}-export.zip`)
}

export async function exportProject(
  project: ExportProjectInfo,
  deps?: ExportDeps,
): Promise<ExportResult> {
  const files = await composeProjectArtifacts(project, deps)
  return bundleAndDownload(files, `${sanitizeSegment(project.name)}-export.zip`)
}

export async function composeProjectArtifacts(
  project: ExportProjectInfo,
  deps?: ExportDeps,
): Promise<ArtifactFile[]> {
  const entries: StageManifestEntry[] = []

  for (const stage of EXPORT_STAGES) {
    try {
      const files = await collectorFor(stage, deps)(project)
      entries.push({ stage, files })
    } catch (error) {
      entries.push({ stage, files: [], error: errorMessage(error) })
    }
  }

  const bundledFiles = entries.flatMap((entry) => entry.files)
  return [
    {
      path: 'README.md',
      kind: 'text',
      content: renderReadme(project, entries, new Date().toISOString()),
    },
    ...bundledFiles,
  ]
}

export function createDefaultExportDeps(): CompleteExportDeps {
  return {
    producer: async (project) => {
      const { collectProducerArtifacts, loadProducerBoard } = await import('./producer')
      const board = await loadProducerBoard(project.id)
      return collectProducerArtifacts(board)
    },
    writer: async (project) => {
      const { collectWriterArtifacts } = await import('./writer')
      return collectWriterArtifacts(project.id)
    },
    artist: async (project) => {
      const { collectArtistArtifacts, loadArtistData } = await import('./artist')
      const data = await loadArtistData(project.id)
      return collectArtistArtifacts(data)
    },
    director: async (project) => {
      const { collectDirectorArtifacts, loadDirectorData } = await import('./director')
      const data = await loadDirectorData(project.id)
      return collectDirectorArtifacts(data)
    },
  }
}

function collectorFor(stage: ExportStage, deps?: ExportDeps): ExportCollector {
  return deps?.[stage] ?? createDefaultExportDeps()[stage]
}

function renderReadme(
  project: ExportProjectInfo,
  entries: StageManifestEntry[],
  generatedAt: string,
): string {
  return `${h1(project.name)}- **Generated:** ${generatedAt}\n\n${h2('Table of Contents / Manifest')}${table(
    ['Stage', 'Status', 'Files', 'Error'],
    entries.map((entry) => [
      entry.stage,
      entry.error ? '오류' : entry.files.length === 0 ? '비어 있음' : '완료',
      String(entry.files.length),
      entry.error ?? '',
    ]),
  )}`
}

export function errorMessage(error: unknown, fallback = 'unknown error'): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  const message = String(error).trim()
  return message || fallback
}
