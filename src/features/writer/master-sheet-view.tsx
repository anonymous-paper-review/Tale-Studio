'use client'

// Writer 마스터 시트 탭 — 러프 스토리보드를 클라이언트용 촬영 시트로 정리해 이미지로 내보낸다.
//   화면 미리보기는 실제로 내보낼 캔버스를 그대로 그려 dataURL 로 보여준다(WYSIWYG, 어긋날 수 없음).
//   탭이 보이지 않는 동안은 무거운 이미지 로드·캔버스 합성을 하지 않는다(지연 마운트).

import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Download, ImageIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WriterHeader } from '@/features/writer/writer-header'
import { canvasToPngBlob, renderMasterSheetPageCanvas } from '@/features/writer/master-sheet-render'
import { buildMasterSheet, masterSheetExportPlan, type MasterSheetResult } from '@/lib/writer/master-sheet'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'
import { useWriterUiStore } from '@/stores/writer-ui-store'
import { useT } from '@/lib/i18n'

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

export function MasterSheetView() {
  const t = useT()
  // useEffect deps 에 들어갈 locale — useLocale() 래퍼 대신 store 를 직접 읽는다(#unstable-hook-deps,
  //   rough-storyboard-view 와 동일 패턴). 원시값이라 언어가 실제로 바뀔 때만 참조가 갱신된다.
  const locale = useLocaleStore((s) => s.locale)
  const projectTitle = useProjectStore((s) => s.projectTitle)
  const projectFormat = useProjectFormatStore((s) => s.format)
  const sceneManifest = useWriterStore((s) => s.sceneManifest)
  const shots = useWriterStore((s) => s.shots)
  const isActive = useWriterUiStore((s) => s.activeTab === 'sheet')

  const sheet = useMemo<MasterSheetResult | null>(() => {
    if (!sceneManifest || shots.length === 0) return null
    return buildMasterSheet({
      projectFormat,
      scenes: sceneManifest.scenes.map((s) => ({
        sceneId: s.sceneId,
        sortOrder: s.sortOrder,
        location: s.location,
        timeOfDay: s.timeOfDay,
        charactersPresent: s.charactersPresent,
      })),
      shots: shots.map((s) => ({
        shotId: s.shotId,
        sceneId: s.sceneId,
        sortOrder: s.sortOrder,
        shotType: s.shotType,
        actionDescription: s.actionDescription,
        characters: s.characters,
        dialogueLines: s.dialogueLines,
        durationSeconds: s.durationSeconds,
        roughStoryboard: s.roughStoryboard,
      })),
      characters: sceneManifest.characters,
      locations: sceneManifest.locations,
    })
  }, [sceneManifest, shots, projectFormat])

  // 미리보기에 쓸 캔버스를 들고 있다가 내보내기 때 그대로 재사용 — 두 번 그리지 않고,
  //   화면에 보인 것과 파일로 받는 것이 같은 비트가 되게 한다.
  const canvasesRef = useRef<HTMLCanvasElement[]>([])
  // 그린 기준 — 시트뿐 아니라 제목·언어가 바뀌어도 다시 그린다(머리글과 라벨이 그 값으로 찍힌다).
  const renderedForRef = useRef<{ sheet: MasterSheetResult; title: string; locale: string } | null>(null)
  const [previewSrcs, setPreviewSrcs] = useState<string[]>([])
  const [rendering, setRendering] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const done = renderedForRef.current
    if (!isActive || !sheet || (done?.sheet === sheet && done.title === projectTitle && done.locale === locale)) return
    let cancelled = false
    setRendering(true)
    setPreviewSrcs([])
    void (async () => {
      const renderCtx = {
        projectTitle,
        frameAspectRatio: sheet.frameAspectRatio,
        totalRuntimeSeconds: sheet.totalRuntimeSeconds,
        locale,
      }
      const canvases: HTMLCanvasElement[] = []
      for (const page of sheet.pages) {
        if (cancelled) return
        canvases.push(await renderMasterSheetPageCanvas(page, renderCtx))
      }
      if (cancelled) return
      canvasesRef.current = canvases
      renderedForRef.current = { sheet, title: projectTitle, locale }
      setPreviewSrcs(canvases.map((c) => c.toDataURL('image/png')))
    })()
      .catch((e) => {
        if (!cancelled) {
          toast.error(
            t('Master sheet preview failed: {message}', { message: e instanceof Error ? e.message : '' }),
          )
        }
      })
      .finally(() => {
        if (!cancelled) setRendering(false)
      })
    return () => {
      cancelled = true
    }
  }, [isActive, sheet, projectTitle, locale, t])

  const handleExport = async () => {
    if (!sheet || canvasesRef.current.length === 0) return
    setExporting(true)
    try {
      const plan = masterSheetExportPlan(sheet.pages, projectTitle)
      if (plan.kind === 'png') {
        const blob = await canvasToPngBlob(canvasesRef.current[0])
        downloadBlob(blob, plan.fileName)
      } else {
        const zip = new JSZip()
        for (let i = 0; i < canvasesRef.current.length; i++) {
          zip.file(plan.entries[i], await canvasToPngBlob(canvasesRef.current[i]))
        }
        downloadBlob(await zip.generateAsync({ type: 'blob' }), plan.fileName)
      }
      toast.success(t('Downloaded the master sheet.'))
    } catch (e) {
      toast.error(t('Master sheet export failed: {message}', { message: e instanceof Error ? e.message : '' }))
    } finally {
      setExporting(false)
    }
  }

  const hasShots = shots.length > 0
  const headerDescription = t(
    'Master sheet: a client-ready shooting sheet built from the rough storyboard, exported as an image',
  )

  if (!hasShots) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <WriterHeader description={headerDescription} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <ImageIcon className="size-12 text-muted-foreground" />
          <p className="text-base font-medium">{t('No scenes or shots generated yet')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WriterHeader
        description={headerDescription}
        actions={
          <Button
            size="sm"
            variant="outline"
            className="hover-red-beam"
            disabled={exporting || rendering || previewSrcs.length === 0}
            onClick={() => void handleExport()}
          >
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            {t('Export as image')}
          </Button>
        }
      />
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-6 py-2 text-xs tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">
          {t('{pages} pages · {shots} shots', { pages: sheet?.pages.length ?? 0, shots: sheet?.shotCount ?? 0 })}
        </span>
        {sheet && sheet.missingFrameShots > 0 ? (
          <span className="text-warning">
            {t('{count} shots have no rough images yet', { count: sheet.missingFrameShots })}
          </span>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col items-center gap-6 p-6">
          {previewSrcs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              <p className="text-sm">{t('Preparing the master sheet preview…')}</p>
            </div>
          ) : (
            previewSrcs.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- 캔버스 합성 결과(dataURL), next/image 최적화 대상 아님
              <img
                key={i}
                src={src}
                alt={t('Master sheet page {page}', { page: i + 1 })}
                className="w-full max-w-2xl rounded-lg border border-border shadow-sm"
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
