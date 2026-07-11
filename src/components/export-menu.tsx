'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { errorMessage, exportProject, exportStage } from '@/lib/export'
import type { ExportResult, ExportStage } from '@/lib/export/types'
import { useProjectStore } from '@/stores/project-store'
import type { StageId } from '@/types'

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
  const projectId = useProjectStore((s) => s.projectId)
  const projectTitle = useProjectStore((s) => s.projectTitle)
  const currentStage = useProjectStore((s) => s.currentStage)
  const [busyScope, setBusyScope] = useState<ExportScope | null>(null)

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
      let result: ExportResult

      if (scope === 'stage') {
        if (!stage) {
          toast.error('이 단계는 내보내기를 지원하지 않습니다.')
          return
        }
        result = await exportStage(stage, project)
      } else {
        const estimate = await estimateWholeProjectFileCounts(projectId)
        if (!estimate.known) {
          if (!confirmUnknownExportSize()) return
        } else {
          const estimatedBytes = estimateExportBytes(estimate.counts)
          if (shouldConfirmLargeExport(estimatedBytes) && !confirmLargeExport(estimatedBytes)) {
            return
          }
        }
        result = await exportProject(project)
      }

      toast.success(exportSuccessMessage(result))
    } catch (error) {
      toast.error(`내보내기 실패: ${errorMessage(error, '알 수 없는 오류')}`)
    } finally {
      setBusyScope(null)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="내보내기 / Export"
            title={projectId ? '내보내기 / Export' : '프로젝트를 먼저 열어주세요'}
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
            disabled={!projectId || isBusy || !stage}
            onSelect={() => void runExport('stage')}
            className="cursor-pointer"
          >
            이 단계만 내보내기
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!projectId || isBusy}
            onSelect={() => void runExport('project')}
            className="cursor-pointer"
          >
            전체 프로젝트 ZIP
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="text-[10px] font-medium leading-none text-muted-foreground">
        내보내기
      </span>
    </>
  )
}

function exportSuccessMessage(result: ExportResult): string {
  const failed = result.failed ? `, ${result.failed}개 실패` : ''
  return `내보내기 완료: ${result.downloaded}개 파일${failed}`
}

function confirmLargeExport(estimatedBytes: number): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true
  }

  return window.confirm(
    `예상 내보내기 크기가 ${formatBytes(estimatedBytes)}입니다. 계속 진행할까요?`,
  )
}

function confirmUnknownExportSize(): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true
  }

  return window.confirm('크기 추정 불가 — 계속하시겠습니까?')
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) return `${Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}



async function estimateWholeProjectFileCounts(projectId: string): Promise<FileCountEstimate> {
  try {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const [charactersRes, locationsRes, shotsRes, clipsRes] = await Promise.all([
      supabase
        .from('characters')
        .select('view_main,view_back,view_side_left,view_side_right')
        .eq('project_id', projectId),
      supabase
        .from('locations')
        .select('wide_shot,establishing_shot')
        .eq('project_id', projectId),
      supabase
        .from('shots')
        .select('storyboard_image,video_url')
        .eq('project_id', projectId),
      supabase
        .from('video_clips')
        .select('url,status,is_final')
        .eq('project_id', projectId),
    ])

    if (charactersRes.error || locationsRes.error || shotsRes.error || clipsRes.error) {
      const failure =
        charactersRes.error ?? locationsRes.error ?? shotsRes.error ?? clipsRes.error
      console.warn('[export-menu] DB size estimate failed; falling back:', failure)
      return { counts: await fallbackWholeProjectFileCounts(projectId), known: false }
    }

    const counts = emptyCounts()

    for (const row of charactersRes.data ?? []) {
      addUrlCount(counts, 'image', row.view_main)
      addUrlCount(counts, 'image', row.view_back)
      addUrlCount(counts, 'image', row.view_side_left)
      addUrlCount(counts, 'image', row.view_side_right)
    }

    for (const row of locationsRes.data ?? []) {
      addUrlCount(counts, 'image', row.wide_shot)
      addUrlCount(counts, 'image', row.establishing_shot)
    }

    for (const row of shotsRes.data ?? []) {
      addStoryboardCount(counts, row.storyboard_image)
      addUrlCount(counts, 'video', row.video_url)
    }

    for (const row of clipsRes.data ?? []) {
      const status = typeof row.status === 'string' ? row.status : ''
      if (status === 'completed' || row.is_final === true) {
        addUrlCount(counts, 'video', row.url)
      }
    }

    return { counts, known: true }
  } catch (error) {
    console.warn('[export-menu] DB size estimate threw; falling back:', errorMessage(error))
    return { counts: await fallbackWholeProjectFileCounts(projectId), known: false }
  }
}

async function fallbackWholeProjectFileCounts(projectId: string): Promise<ExportFileCountsByKind> {
  const counts = emptyCounts()

  try {
    const [{ useAssetStorageStore }, { useWriterStore }, { useDirectorCanvasStore }] = await Promise.all([
      import('@/stores/asset-storage-store'),
      import('@/stores/writer-store'),
      import('@/stores/director-store'),
    ])

    const assetStore = useAssetStorageStore.getState()
    const assets = [
      ...assetStore.listCharactersByProject(projectId),
      ...assetStore.listWorldsByProject(projectId),
    ]

    for (const asset of assets) {
      const multiViewCount = countGeneratedImages(counts, asset.views.fiveView)
      countGeneratedImages(counts, asset.views.sixteenAngle)
      if (multiViewCount === 0) countGeneratedImages(counts, asset.views.single)
      for (const variant of asset.statusVariants) {
        countGeneratedImages(counts, variant.images)
      }
    }

    for (const shot of useWriterStore.getState().shots) {
      addUrlCount(counts, 'image', shot.referenceImageUrl)
      addUrlCount(counts, 'image', shot.roughStoryboard?.url)
    }

    for (const node of useDirectorCanvasStore.getState().nodes) {
      const data = recordValue(node.data)
      if (data?.kind === 'shot') {
        if (Array.isArray(data.referenceImages)) {
          for (const image of data.referenceImages) {
            addUrlCount(counts, 'image', recordValue(image)?.url)
          }
        }
        addStoryboardCount(counts, data.storyboardImage)
      }
      if (data?.kind === 'video') {
        addUrlCount(counts, 'video', data.videoUrl)
      }
    }
  } catch (error) {
    console.warn('[export-menu] fallback size estimate failed:', errorMessage(error))
  }

  return counts
}

function emptyCounts(): Required<ExportFileCountsByKind> {
  return { image: 0, video: 0, audio: 0, text: 0, other: 0 }
}

function countGeneratedImages(counts: ExportFileCountsByKind, images: unknown): number {
  if (!Array.isArray(images)) return 0

  let count = 0
  for (const image of images) {
    const before = counts.image ?? 0
    addUrlCount(counts, 'image', recordValue(image)?.url)
    if ((counts.image ?? 0) > before) count += 1
  }
  return count
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
