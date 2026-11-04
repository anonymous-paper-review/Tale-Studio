'use client'

// 레일의 [내보내기](v3, 오너 2026-11-03 "내보내기에 추가하되 버튼을 누르면 check 박스가 떠서 어떤 아이템만 내보낼 수 있을지 정해줘").
//   누르면 예전 메뉴의 네 칸(화면 JPEG · 마스터 시트 그림 · 이 단계 ZIP · 전체 프로젝트 ZIP)이 체크 창으로 뜨고, 고른 것만 차례로 받는다.
//   칸마다 고를 수 있는 조건 · 파일 이름 · 받는 방식 · 알림은 예전 메뉴 그대로다. 고르기 · 순서 규칙은 lib/export/export-choices.
//   약속: tests/editor/export-dialog.test.ts · tests/editor/export-menu.test.ts · tests/writer/master-sheet-export.test.ts
import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Lock } from 'lucide-react'
import { ExportIcon } from '@/components/icons/v3-icons'
import { FOOTER_TRIGGER_CLASS } from '@/components/layout/footer-icon-item'
import { toast } from 'sonner'
import { invalidateShots, loadShotsResult } from '@/lib/shots-cache'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { errorMessage, exportProject, exportStage } from '@/lib/export'
import {
  exportChoiceStates,
  exportRunList,
  runExportChoices,
  waitUntilGone,
  warnsMultipleDownloads,
  type ExportChoice,
  type ExportChoiceState,
} from '@/lib/export/export-choices'
import type { ExportResult, ExportStage } from '@/lib/export/types'
import { useProjectStore } from '@/stores/project-store'
import { useProjectFormatStore } from '@/stores/project-format-store'
import type { StageId } from '@/types'
import { captureScreenJpeg } from '@/lib/export/screenshot'
import { selectHandoffTake, type VideoTakeSelectionRecord } from '@/lib/director-video-take-selection'
import { DEFAULT_LOCALE, parseAppLocale, type AppLocale } from '@/lib/locale'
import { useT } from '@/lib/i18n'
import { refetchBillingAccount, useBillingAccount } from '@/lib/billing/use-billing-account'
import { previzExportAccess, type PrevizExportAccess } from '@/lib/billing/export-access'
import { PRICING_PAGE_VISIBLE } from '@/lib/billing/pricing-visibility'
import { STAGE_LABEL } from '@/lib/constants'
import { cn } from '@/lib/utils'

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

/** 체크 창의 testid — 창이 문서에서 사라졌는지 이것으로 본다(화면 JPEG 를 찍기 전에). */
const EXPORT_DIALOG_TESTID = 'export-dialog'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))


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
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<ReadonlySet<ExportChoice>>(() => new Set())
  // 고른 칸을 다 받을 때까지 — 레일 단추가 돌고 다시 열 수 없다(예전 메뉴와 같다).
  const [busy, setBusy] = useState(false)

  // 요금제 잠금(2026-10-27 오너 "s2 내보내기 막으셈") — 네 칸 모두 previz 데이터라 요금제 표의 내보내기 칸을 따른다.
  //   창을 열 때마다 다시 읽어, 방금 요금제를 바꿨어도 새로 고침 없이 맞게 보인다.
  const account = useBillingAccount()
  const access = previzExportAccess({
    account: account.data ? { plan: account.data.subscription.plan, unlimited: account.data.unlimited } : null,
    loading: account.loading,
    error: account.error,
  })

  const stage = resolveExportStage(currentStage)
  const states = exportChoiceStates({ hasProject: !!projectId, busy, access, stage })

  // 창을 열 때마다 아무것도 체크하지 않은 채로 시작한다(실수로 전체 프로젝트 ZIP 같은 큰 받기가 시작되지 않게).
  const openChoices = () => {
    setPicked(new Set())
    setOpen(true)
    void refetchBillingAccount()
  }

  const toggle = (choice: ExportChoice) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(choice)) next.delete(choice)
      else next.add(choice)
      return next
    })

  const runExport = async (scope: ExportScope) => {
    if (!projectId) return

    const project: ProjectRef = {
      id: projectId,
      name: projectTitle.trim() || 'Untitled',
    }

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
    }
  }

  const runScreenshot = async () => {
    if (!projectId) return
    // 진행 상황 토스트(#c1) — 전체 보드 캡처는 이미지 임베드에 수 초 걸려 피드백이 필요하다.
    const toastId = toast.loading(t('Preparing the screen…'))
    try {
      const base = projectTitle.trim() || 'tale-studio'
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
      await captureScreenJpeg(`${base}-${stamp}.jpg`, (current, total) => {
        toast.loading(
          total > 0 ? t('Capturing screen… image {current}/{total}', { current, total }) : t('Capturing screen…'),
          { id: toastId },
        )
      })
      toast.success(t('Saved the screen as JPEG'), { id: toastId })
    } catch (error) {
      toast.error(t('Capture failed: {error}', { error: errorMessage(error, t('Unknown error')) }), { id: toastId })
    }
  }

  // 마스터 시트(2026-10-20 오너 "storyboard 탭에서 마스터시트 지워주고 export로 기능 빼줘") — 예전 Storyboard 탭과 같은 시트 ·
  //   같은 파일(한 장 PNG · 여러 장 ZIP)을 미리보기 없이 바로 받는다. 어느 단계에서든 고를 수 있다. 무거운 그리기 코드는 받을 때만 읽는다.
  const runMasterSheet = async () => {
    if (!projectId) return
    const toastId = toast.loading(t('Preparing the master sheet…'))
    try {
      const [{ exportMasterSheet }, { renderMasterSheetPageCanvas, canvasToPngBlob }, { useWriterStore }, { default: JSZip }] = await Promise.all([
        import('@/lib/export/master-sheet'),
        import('@/features/writer/master-sheet-render'),
        import('@/stores/writer-store'),
        import('jszip'),
      ])
      const outcome = await exportMasterSheet(
        { projectTitle: projectTitle.trim(), projectFormat: useProjectFormatStore.getState().format },
        {
          load: async () => {
            // 30초 보관본을 거치지 않는다 — 러프를 다 그린 직후에 받아도 새 그림이 들어가게(검토 지적).
            await invalidateShots(projectId)
            await useWriterStore.getState().loadProject()
            const { sceneManifest, shots } = useWriterStore.getState()
            return { sceneManifest, shots }
          },
          projectLocale: () => fetchProjectLocale(projectId),
          renderPage: renderMasterSheetPageCanvas,
          toPng: canvasToPngBlob,
          release: (canvas) => {
            canvas.width = 0
            canvas.height = 0
          },
          zip: async (files) => {
            const zip = new JSZip()
            for (const file of files) zip.file(file.name, file.data)
            return zip.generateAsync({ type: 'blob' })
          },
          download: downloadBlob,
        },
      )
      if (outcome.kind === 'empty') {
        toast.error(t('No scenes or shots generated yet'), { id: toastId })
        return
      }
      toast.success(t('Downloaded the master sheet.'), { id: toastId })
      if (outcome.missingFrameShots > 0) {
        toast.warning(t('{count} shots have no rough images yet', { count: outcome.missingFrameShots }))
      }
    } catch (error) {
      toast.error(t('Master sheet export failed: {message}', { message: errorMessage(error, t('Unknown error')) }), { id: toastId })
    }
  }

  // 고른 칸을 창의 순서대로 하나씩 받는다 — 화면 JPEG 는 창이 문서에서 사라지고(닫히는 움직임) 한 장면 더 그린 뒤에 찍는다.
  const start = async () => {
    const list = exportRunList(picked, states)
    if (!projectId || busy || list.length === 0) return
    setBusy(true)
    try {
      await runExportChoices(list, {
        closeDialog: () => setOpen(false),
        dialogGone: () => waitUntilGone(() => !!document.querySelector(`[data-testid="${EXPORT_DIALOG_TESTID}"]`), sleep).then(nextFrame),
        run: {
          screen: runScreenshot,
          sheet: runMasterSheet,
          stage: () => runExport('stage'),
          project: () => runExport('project'),
        },
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={t('Export')}
        aria-haspopup="dialog"
        title={projectId ? t('Export') : t('Open a project first.')}
        disabled={!projectId || busy}
        onClick={openChoices}
        className={FOOTER_TRIGGER_CLASS}
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <ExportIcon className="size-6" />
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid={EXPORT_DIALOG_TESTID}>
          <DialogHeader>
            <DialogTitle>{t('Export')}</DialogTitle>
            <DialogDescription>{t('Choose what to export. Only the checked items are saved, one after another.')}</DialogDescription>
          </DialogHeader>
          <ExportDialogBody
            access={access}
            states={states}
            picked={picked}
            stageName={stage ? STAGE_LABEL[currentStage] : null}
            onToggle={toggle}
            onCancel={() => setOpen(false)}
            onStart={() => void start()}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

/** 체크 창의 몸통 — 요금제 안내 · 네 칸 · 여러 파일 안내 · 단추. 창(포털) 밖에서도 그릴 수 있게 따로 둔다. */
export function ExportDialogBody({
  access,
  states,
  picked,
  stageName,
  onToggle,
  onCancel,
  onStart,
}: {
  access: PrevizExportAccess
  states: readonly ExportChoiceState[]
  picked: ReadonlySet<ExportChoice>
  /** 이 단계 ZIP 칸에 붙일 지금 단계 이름(없으면 그 칸을 고를 수 없다). */
  stageName: string | null
  onToggle: (choice: ExportChoice) => void
  onCancel: () => void
  onStart: () => void
}) {
  const t = useT()
  const labels: Record<ExportChoice, string> = {
    screen: t('Save screen as JPEG'),
    sheet: t('Save master sheet as image'),
    stage: t('This stage as ZIP'),
    project: t('Entire project as ZIP'),
  }
  const list = exportRunList(picked, states)

  return (
    <>
      {access !== 'open' ? (
        <div role="status" className="flex flex-col gap-1 rounded-xl bg-card px-4 py-3 text-caption text-muted-foreground">
          {access === 'locked' ? (
            <>
              <p className="flex items-center gap-1.5 text-label font-medium text-foreground">
                <Lock className="size-3.5 shrink-0" aria-hidden />
                {t('Previz data export needs Producer10 or above')}
              </p>
              <p>{t('Final videos can be saved from Editor.')}</p>
              {PRICING_PAGE_VISIBLE && (
                <Link href="/pricing" className="mt-1 self-start text-label font-medium text-info underline-offset-4 hover:underline">
                  {t('View pricing')}
                </Link>
              )}
            </>
          ) : access === 'failed' ? (
            t('Could not check your plan. Close this window and open it again.')
          ) : (
            t('Checking your plan…')
          )}
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {states.map((state) => {
          const checked = state.enabled && picked.has(state.choice)
          const detail = state.choice === 'stage' ? (state.blockedBy === 'stage' ? t('Not available on this stage.') : stageName) : null
          return (
            <li key={state.choice}>
              {/* v3 고르기 표시 — 고른 칸은 지금 단계 색 테두리 + 그 색 18% 바탕(선택 카드와 같다). 체크는 다른 창과 같은 진짜 체크박스. */}
              <label
                className={cn(
                  'flex items-center gap-3 rounded-[14px] border-[1.5px] px-4 py-3 transition-colors duration-100 ease-out',
                  checked ? 'border-stage bg-stage/18' : 'border-transparent bg-card',
                  state.enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
                  state.enabled && !checked && 'hover:bg-accent',
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-stage scheme-dark"
                  checked={checked}
                  disabled={!state.enabled}
                  onChange={() => onToggle(state.choice)}
                  data-testid={`export-choice-${state.choice}`}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-label font-medium text-foreground">{labels[state.choice]}</span>
                  {detail ? <span className="text-caption text-muted-foreground">{detail}</span> : null}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {warnsMultipleDownloads(list) ? (
        <p className="text-caption text-subtle-foreground">
          {t('When you export more than one, your browser may ask whether to allow multiple downloads.')}
        </p>
      ) : null}

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button disabled={list.length === 0} onClick={onStart} data-testid="export-start">
          {t('Export')}
        </Button>
      </DialogFooter>
    </>
  )
}

function downloadBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
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

  return window.confirm(t('Could not estimate size. Continue anyway?'))
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
