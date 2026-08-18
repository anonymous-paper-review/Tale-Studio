import { translate } from '@/lib/i18n'
import { DEFAULT_LOCALE, type AppLocale } from '@/lib/locale'

import { h1, h2, table } from './md'
import { sanitizeSegment } from './sanitize'
import type { ArtifactFile, ExportResult, ExportStage } from './types'
import { bundleAndDownload } from './zip'

export type { ArtifactFile, ExportResult, ExportStage } from './types'

export interface ExportProjectInfo {
  id: string
  name: string
}

// locale: 콘텐츠 언어 — 호출부(entry point)가 projects.locale 을 읽어 명시 주입한다(#i18n-s5-batch6).
//   스토어 직접 읽기 금지(export 는 서버/CLI 재사용 가능해야 함). collectorFor 경유 호출은 항상
//   명시 전달하지만, 타입 자체는 optional — collector 를 직접 호출하는 기존 호출부(테스트 등)가
//   1-인자 호출로 깨지지 않게 한다. 미지정 시 각 구현체가 DEFAULT_LOCALE('en')로 떨어진다.
export type ExportCollector = (project: ExportProjectInfo, locale?: AppLocale) => Promise<ArtifactFile[]>

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
  locale: AppLocale = DEFAULT_LOCALE,
): Promise<ExportResult> {
  const files = await collectorFor(stage, deps)(project, locale)
  return bundleAndDownload(files, `${sanitizeSegment(project.name)}-${stage}-export.zip`)
}

export async function exportProject(
  project: ExportProjectInfo,
  deps?: ExportDeps,
  locale: AppLocale = DEFAULT_LOCALE,
): Promise<ExportResult> {
  const files = await composeProjectArtifacts(project, deps, locale)
  return bundleAndDownload(files, `${sanitizeSegment(project.name)}-export.zip`)
}

export async function composeProjectArtifacts(
  project: ExportProjectInfo,
  deps?: ExportDeps,
  locale: AppLocale = DEFAULT_LOCALE,
): Promise<ArtifactFile[]> {
  const entries: StageManifestEntry[] = []

  for (const stage of EXPORT_STAGES) {
    try {
      const files = await collectorFor(stage, deps)(project, locale)
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
      content: renderReadme(project, entries, new Date().toISOString(), locale),
    },
    ...bundledFiles,
  ]
}

export function createDefaultExportDeps(): CompleteExportDeps {
  return {
    // locale 기본값(DEFAULT_LOCALE): collectorFor 경유 호출은 항상 명시 전달하지만, 이 함수의
    //   collector 를 직접 호출하는 기존 호출부(테스트 등)가 1-인자 호출로 깨지지 않도록 유지.
    producer: async (project, locale = DEFAULT_LOCALE) => {
      const { collectProducerArtifacts, loadProducerBoard } = await import('./producer')
      const board = await loadProducerBoard(project.id)
      return collectProducerArtifacts(board, locale)
    },
    writer: async (project, locale = DEFAULT_LOCALE) => {
      const { collectWriterArtifacts } = await import('./writer')
      const base = await collectWriterArtifacts(project.id, {}, locale)
      // 러프 보드 산출물(#c7·#c12): treatment.md + 패널 png + 보드 컨택트 시트.
      //   보조 수집이 실패해도 기본 md 묶음 내보내기는 계속한다.
      try {
        const { collectWriterBoardArtifacts } = await import('./writer-board')
        return [...base, ...(await collectWriterBoardArtifacts(project.id, locale))]
      } catch (error) {
        console.warn('[export] writer board artifacts failed:', error)
        return base
      }
    },
    artist: async (project, locale = DEFAULT_LOCALE) => {
      const { collectArtistArtifacts, loadArtistData } = await import('./artist')
      const data = await loadArtistData(project.id)
      return collectArtistArtifacts(data, locale)
    },
    director: async (project, locale = DEFAULT_LOCALE) => {
      const { collectDirectorArtifacts, loadDirectorData } = await import('./director')
      const data = await loadDirectorData(project.id)
      return collectDirectorArtifacts(data, locale)
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
  locale: AppLocale,
): string {
  return `${h1(project.name)}- **Generated:** ${generatedAt}\n\n${h2('Table of Contents / Manifest')}${table(
    ['Stage', 'Status', 'Files', 'Error'],
    entries.map((entry) => [
      entry.stage,
      entry.error ? translate(locale, 'Error') : entry.files.length === 0 ? translate(locale, 'Empty') : translate(locale, 'Done'),
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
