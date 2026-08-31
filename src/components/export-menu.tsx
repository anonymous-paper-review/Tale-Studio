'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { loadShotsResult } from '@/lib/shots-cache'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { errorMessage, exportProject, exportStage } from '@/lib/export'
import type { ExportResult, ExportStage } from '@/lib/export/types'
import { useProjectStore } from '@/stores/project-store'
import type { StageId } from '@/types'
import { captureScreenJpeg } from '@/lib/export/screenshot'
import { selectHandoffTake, type VideoTakeSelectionRecord } from '@/lib/director-video-take-selection'
import { DEFAULT_LOCALE, parseAppLocale, type AppLocale } from '@/lib/locale'
import { useT } from '@/lib/i18n'

export type ExportFileKind = 'image' | 'video' | 'audio' | 'text' | 'other'
export type ExportFileCountsByKind = Partial<Record<ExportFileKind, number>>

export const LARGE_EXPORT_CONFIRM_BYTES = 350 * 1024 * 1024

const ESTIMATED_BYTES_BY_KIND: Record<ExportFileKind, number> = {
  image: 3 * 1024 * 1024,
  video: 35 * 1024 * 1024,
  audio: 8 * 1024 * 1024,
  text: 64 * 1024,
  other: 1024 * 1024,
}

type ExportScope = 'stage' | 'project'
type ProjectRef = { id: string; name: string }
type FileCountEstimate = {
  counts: ExportFileCountsByKind
  known: boolean
}
type HandoffClip = VideoTakeSelectionRecord & {
  shot_id?: unknown
}


export function estimateExportBytes(fileCountsByKind: ExportFileCountsByKind): number {
  return Object.entries(fileCountsByKind).reduce((total, [kind, count]) => {
    const bytesPerFile = ESTIMATED_BYTES_BY_KIND[kind as ExportFileKind]
    if (!bytesPerFile || typeof count !== 'number' || !Number.isFinite(count) || count <= 0) {
      return total
    }

    return total + Math.floor(count) * bytesPerFile
  }, 0)
}

export function shouldConfirmLargeExport(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes >= LARGE_EXPORT_CONFIRM_BYTES
}

export function resolveExportStage(currentStage: StageId | string | null | undefined): ExportStage | null {
  switch (currentStage) {
    case 'producer':
    case 'writer':
    case 'artist':
    case 'director':
      return currentStage
    default:
      return null
  }
}

export function ExportMenu() {
  const t = useT()
  const projectId = useProjectStore((s) => s.projectId)
  const projectTitle = useProjectStore((s) => s.projectTitle)
  const currentStage = useProjectStore((s) => s.currentStage)
  const [busyScope, setBusyScope] = useState<
    ExportScope | 'screenshot' | null
  >(null)

  const stage = resolveExportStage(currentStage)
  const isBusy = busyScope !== null
  const disabled = !projectId || isBusy

  const runExport = async (scope: ExportScope) => {
    if (!projectId || isBusy) return

    const project: ProjectRef = {
      id: projectId,
      name: projectTitle.trim() || 'Untitled',
    }

    setBusyScope(scope)
    try {
      // 콘텐츠 언어(#i18n-s5-batch6): export 산출물의 라벨/헤더는 UI locale(useT)이 아니라
      //   프로젝트 자체의 locale 을 따른다 — 여기서 한 번 읽어 넘기기만 하고 저장은 안 한다.
      const locale = await fetchProjectLocale(projectId)
      let result: ExportResult

      if (scope === 'stage') {
        if (!stage) {
          toast.error(t('This stage does not support export.'))
          return
        }
        result = await exportStage(stage, project, undefined, locale)
      } else {
        const estimate = await estimateWholeProjectFileCounts(projectId)
        if (!estimate.known) {
          if (!confirmUnknownExportSize(t)) return
        } else {
          const estimatedBytes = estimateExportBytes(estimate.counts)
          if (shouldConfirmLargeExport(estimatedBytes) && !confirmLargeExport(estimatedBytes, t)) {
            return
          }
        }
        result = await exportProject(project, undefined, locale)
      }

      toast.success(exportSuccessMessage(result, t))
    } catch (error) {
      toast.error(t('Export failed: {error}', { error: errorMessage(error, t('Unknown error')) }))
    } finally {
      setBusyScope(null)
    }
  }

  const runScreenshot = async () => {
    if (!projectId || isBusy) return
    setBusyScope('screenshot')
    // 진행 상황 토스트(#c1) — 전체 보드 캡처는 이미지 임베드에 수 초 걸려 피드백이 필요하다.
    const toastId = toast.loading(t('Preparing the screen…'))
    try {
      const base = projectTitle.trim() || 'tale-studio'
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
      // 드롭다운이 닫혀 캡처에 잡히지 않도록 한 박자 양보
      await new Promise((resolve) => setTimeout(resolve, 300))
      await captureScreenJpeg(`${base}-${stamp}.jpg`, (current, total) => {
        toast.loading(
          total > 0 ? t('Capturing screen… image {current}/{total}', { current, total }) : t('Capturing screen…'),
          { id: toastId },
        )
      })
      toast.success(t('Saved the screen as JPEG'), { id: toastId })
    } catch (error) {
      toast.error(t('Capture failed: {error}', { error: errorMessage(error, t('Unknown error')) }), { id: toastId })
    } finally {
      setBusyScope(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('Export')}
          title={projectId ? t('Export') : t('Open a project first.')}
          disabled={disabled}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isBusy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Download className="h-5 w-5" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="min-w-44">
        <DropdownMenuItem
          disabled={!projectId || isBusy}
          onSelect={() => void runScreenshot()}
          className="cursor-pointer"
        >
          {t('Save screen as JPEG')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!projectId || isBusy || !stage}
          onSelect={() => void runExport('stage')}
          className="cursor-pointer"
        >
          {t('This stage as ZIP')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!projectId || isBusy}
          onSelect={() => void runExport('project')}
          className="cursor-pointer"
        >
          {t('Entire project as ZIP')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function exportSuccessMessage(result: ExportResult, t: ReturnType<typeof useT>): string {
  const failed = result.failed ? `, ${t('{count} failed', { count: result.failed })}` : ''
  return `${t('Export complete: {count} files', { count: result.downloaded })}${failed}`
}

function confirmLargeExport(estimatedBytes: number, t: ReturnType<typeof useT>): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true
  }

  return window.confirm(
    t('Estimated export size is {size}. Continue?', { size: formatBytes(estimatedBytes) }),
  )
}

function confirmUnknownExportSize(t: ReturnType<typeof useT>): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true
  }

  return window.confirm(t('Could not estimate size — continue anyway?'))
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) return `${Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}



/** projects.locale 을 1회 조회한다 — export 콘텐츠 언어 소스(#i18n-s5-batch6). 실패 시 DEFAULT_LOCALE. */
export async function fetchProjectLocale(projectId: string): Promise<AppLocale> {
  try {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data, error } = await supabase
      .from('projects')
      .select('locale')
      .eq('id', projectId)
      .single()

    if (error || !data) return DEFAULT_LOCALE
    return parseAppLocale((data as { locale?: unknown }).locale) ?? DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

export async function estimateWholeProjectFileCounts(projectId: string): Promise<FileCountEstimate> {
  try {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const [appearancesRes, locationsRes, shotsRes, clipsRes] = await Promise.all([
      supabase
        .from('character_appearances')
        .select('sheet_url,portrait_url')
        .eq('project_id', projectId)
        .eq('is_default', true),
      supabase
        .from('locations')
        .select('wide_shot,establishing_shot')
        .eq('project_id', projectId),
      loadShotsResult(projectId),
      supabase
        .from('video_clips')
        .select('id,shot_id,url,status,is_final,take_number,created_at,deleted_at')
        .eq('project_id', projectId),
    ])

    if (appearancesRes.error || locationsRes.error || shotsRes.error || clipsRes.error) {
      const failure =
        appearancesRes.error ?? locationsRes.error ?? shotsRes.error ?? clipsRes.error
      console.warn('[export-menu] DB size estimate failed; requiring unknown-size confirmation:', failure)
      return { counts: emptyCounts(), known: false }
    }

    const counts = emptyCounts()

    for (const row of appearancesRes.data ?? []) {
      addUrlCount(counts, 'image', row.sheet_url)
      addUrlCount(counts, 'image', row.portrait_url)
    }

    for (const row of locationsRes.data ?? []) {
      addUrlCount(counts, 'image', row.wide_shot)
      addUrlCount(counts, 'image', row.establishing_shot)
    }

    const clipsByShot = new Map<string, HandoffClip[]>()
    for (const clip of clipsRes.data ?? []) {
      if (typeof clip.shot_id !== 'string') continue
      const clips = clipsByShot.get(clip.shot_id) ?? []
      clips.push(clip)
      clipsByShot.set(clip.shot_id, clips)
    }

    for (const row of shotsRes.data ?? []) {
      addStoryboardCount(counts, row.storyboard_image)
      const clips = clipsByShot.get(row.shot_id) ?? []
      const videoUrl = clips.length === 0 ? row.video_url : selectHandoffTake(clips)?.url
      addUrlCount(counts, 'video', videoUrl)
    }

    return { counts, known: true }
  } catch (error) {
    console.warn('[export-menu] DB size estimate threw; requiring unknown-size confirmation:', errorMessage(error))
    return { counts: emptyCounts(), known: false }
  }
}


function emptyCounts(): Required<ExportFileCountsByKind> {
  return { image: 0, video: 0, audio: 0, text: 0, other: 0 }
}


function addStoryboardCount(counts: ExportFileCountsByKind, value: unknown) {
  const storyboard = recordValue(value)
  if (!storyboard) {
    addUrlCount(counts, 'image', value)
    return
  }

  const status = typeof storyboard.status === 'string' ? storyboard.status : 'completed'
  if (status === 'completed') addUrlCount(counts, 'image', storyboard.url)
}

function addUrlCount(counts: ExportFileCountsByKind, kind: ExportFileKind, value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return
  counts[kind] = (counts[kind] ?? 0) + 1
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
