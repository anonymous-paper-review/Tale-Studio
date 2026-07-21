'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

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

  const runScreenshot = async () => {
    if (!projectId || isBusy) return
    setBusyScope('screenshot')
    try {
      const base = projectTitle.trim() || 'tale-studio'
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
      // 드롭다운이 닫혀 캡처에 잡히지 않도록 한 박자 양보
      await new Promise((resolve) => setTimeout(resolve, 300))
      await captureScreenJpeg(`${base}-${stamp}.jpg`)
      toast.success('화면을 JPEG로 저장했어요')
    } catch (error) {
      toast.error(`캡처 실패: ${errorMessage(error, '알 수 없는 오류')}`)
    } finally {
      setBusyScope(null)
    }
  }

  return (
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
          disabled={!projectId || isBusy}
          onSelect={() => void runScreenshot()}
          className="cursor-pointer"
        >
          화면 JPEG로 저장
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!projectId || isBusy || !stage}
          onSelect={() => void runExport('stage')}
          className="cursor-pointer"
        >
          이 단계 ZIP
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



export async function estimateWholeProjectFileCounts(projectId: string): Promise<FileCountEstimate> {
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
        .select('shot_id,storyboard_image,video_url')
        .eq('project_id', projectId),
      supabase
        .from('video_clips')
        .select('id,shot_id,url,status,is_final,take_number,created_at,deleted_at')
        .eq('project_id', projectId),
    ])

    if (charactersRes.error || locationsRes.error || shotsRes.error || clipsRes.error) {
      const failure =
        charactersRes.error ?? locationsRes.error ?? shotsRes.error ?? clipsRes.error
      console.warn('[export-menu] DB size estimate failed; requiring unknown-size confirmation:', failure)
      return { counts: emptyCounts(), known: false }
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
