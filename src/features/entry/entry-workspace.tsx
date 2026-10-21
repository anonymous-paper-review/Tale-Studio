'use client'

// Producer 시작 화면(리뉴얼 1차 2026-10-19, id entry · /studio/start). 같은 초안을 두 탭으로 채운다(오너 결정: 1안 · 2안 둘 다):
//   화면에서 고르기(1안: ① 이야기 재료 → ② 설정) · 채팅으로 만들기(2안: 가운데 채팅). 마지막에 고른 탭은 브라우저에 기억한다.
//   시작한 프로젝트는 고칠 수 없는 완료 화면이다. AI가 읽거나 산문 초안을 쓰는 동안은 전체 잠금 화면을 띄운다.
//   오른쪽 채팅은 이 단계에 없다(layout.tsx).
import { useEffect, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CircleAlert, LayoutList, Loader2, MessageSquare, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { STAGE_BADGE_CLASS, STAGE_LABEL } from '@/lib/constants'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/project-store'
import { ENTRY_FILE_ACCEPT, IMAGE_EXT_LABEL, TEXT_EXT_LABEL, WRITING_STEPS, pickEntryFile, readStoredTab, readingSteps, writeStoredTab, type EntryTab } from './options'
import { useImageUploadConsent } from '@/components/upload/image-upload-consent'
import { entryStarted, useEntryStore } from './entry-store'
import { BusyOverlayPortal, UploadingChip, stepsFrom, useUploadErrorMessage } from './entry-parts'
import { writeWorkspaceTab } from '@/stores/writer-room-store'
import { EntryForm } from './entry-form'
import { EntryChat } from './entry-chat'
import { EntrySummary } from './entry-summary'
import { ProjectTitleField } from './project-title-field'

// ── 탭 기억(이 브라우저) — 서버 그리기는 기본 탭, 붙은 뒤 저장된 탭 ─────────────────
const tabListeners = new Set<() => void>()
let tabCache: EntryTab | null | undefined

function subscribeTab(listener: () => void) {
  tabListeners.add(listener)
  return () => {
    tabListeners.delete(listener)
  }
}
function tabSnapshot(): EntryTab {
  if (tabCache === undefined) tabCache = readStoredTab()
  return tabCache ?? 'form'
}
function setTab(tab: EntryTab) {
  tabCache = tab
  writeStoredTab(tab)
  // Writer 도 같은 방식으로 연다(한 사람의 방식은 하나 — writer-room-store).
  writeWorkspaceTab(tab === 'chat' ? 'chat' : 'screen')
  for (const listener of tabListeners) listener()
}

export function EntryWorkspace() {
  const t = useT()
  const router = useRouter()
  const projectId = useProjectStore((s) => s.projectId)
  const projectTitle = useProjectStore((s) => s.projectTitle)
  const reachedStage = useProjectStore((s) => s.reachedStage)
  const load = useEntryStore((s) => s.load)
  const reset = useEntryStore((s) => s.reset)
  const status = useEntryStore((s) => s.status)
  const entryProjectId = useEntryStore((s) => s.projectId)
  const draft = useEntryStore((s) => s.draft)
  const stage = useEntryStore((s) => s.stage)
  const writer = useEntryStore((s) => s.writer)
  const reading = useEntryStore((s) => s.reading)
  const writing = useEntryStore((s) => s.writing)
  const saveError = useEntryStore((s) => s.saveError)
  const tab = useSyncExternalStore(subscribeTab, tabSnapshot, () => 'form' as EntryTab)

  useEffect(() => {
    if (!projectId) return
    void load(projectId)
    return () => reset()
  }, [projectId, load, reset])

  // 산문 초안이 다 되면 Writer(산문 작업공간)로 간다.
  useEffect(() => {
    if (writing.status !== 'done' || !entryProjectId) return
    useProjectStore.getState().unlockThrough('producer')
    router.push(`/studio/producer?projectId=${encodeURIComponent(entryProjectId)}`)
  }, [writing.status, entryProjectId, router])

  const started = entryStarted({ draft, stage, writer }, reachedStage)
  const ready = status === 'ready' && entryProjectId === projectId

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v === 'chat' ? 'chat' : 'form')} className="flex min-h-0 flex-1 flex-col gap-0">
      <header className="sticky top-0 z-sticky flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-6">
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium', STAGE_BADGE_CLASS.entry)}>{STAGE_LABEL.entry}</span>
        {/* 제목은 시작 화면에서 바로 정한다(2026-10-21 오너 "프로젝트 제목을 처음에 설정 불가능"). */}
        <ProjectTitleField
          title={projectTitle}
          onRename={(next) => void useProjectStore.getState().renameProject(next).then((saved) => {
            if (!saved) toast.error(t("Couldn't save the title. Please try again."))
          })}
        />
        {saveError && !started ? (
          <p className="ml-auto flex shrink-0 items-center gap-1 text-xs text-destructive" role="status">
            <CircleAlert className="size-3.5" aria-hidden />
            {t("Couldn't save the last change.")}
          </p>
        ) : null}
        {!started ? (
          <TabsList className={saveError ? undefined : 'ml-auto'} aria-label={t('How to make it')}>
            <TabsTrigger value="form" className="px-3">
              <LayoutList aria-hidden />
              {t('Choose on screen')}
            </TabsTrigger>
            <TabsTrigger value="chat" className="px-3">
              <MessageSquare aria-hidden />
              {t('Make it with chat')}
            </TabsTrigger>
          </TabsList>
        ) : null}
      </header>

      {status === 'error' ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center" role="alert">
          <CircleAlert className="size-6 text-destructive" aria-hidden />
          <p className="text-sm">{t("Couldn't load the start screen.")}</p>
          <Button variant="outline" onClick={() => projectId && void load(projectId)}>
            {t('Try again')}
          </Button>
        </div>
      ) : !ready ? (
        <p className="flex items-center justify-center gap-2 px-6 py-24 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {t('Loading…')}
        </p>
      ) : started ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EntrySummary />
        </div>
      ) : (
        <>
          <TabsContent value="form" className="min-h-0 flex-1 overflow-y-auto">
            <EntryForm />
          </TabsContent>
          <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
            <EntryChat />
          </TabsContent>
          <EntryFileDialog />
          <NoTextDialog tab={tab} />
        </>
      )}

      <BusyOverlayPortal
        open={!!reading}
        title={t(reading?.image ? 'Reading text from the image' : 'Reading your text')}
        steps={stepsFrom(readingSteps(!!reading?.image), reading?.step ?? 0, t)}
      />
      <WritingOverlay />
    </Tabs>
  )
}

/** 산문 초안을 쓰는 동안의 잠금 화면 — 실패하면 [닫기] · [다시 시도]. */
function WritingOverlay() {
  const t = useT()
  const writing = useEntryStore((s) => s.writing)
  const retryWriter = useEntryStore((s) => s.retryWriter)
  const dismiss = useEntryStore((s) => s.dismissWriting)
  const failed = writing.status === 'failed'
  const open = writing.status === 'starting' || writing.status === 'writing' || failed
  const startFailed = failed && writing.error === 'start_failed'
  return (
    <BusyOverlayPortal
      open={open}
      title={failed ? t(startFailed ? "Couldn't start" : "Couldn't write the prose draft") : t('Writing the prose draft')}
      description={failed ? t(startFailed ? 'Please check the settings and try again.' : 'Something went wrong while writing. Please try again.') : undefined}
      steps={stepsFrom(WRITING_STEPS, writing.step, t)}
      footer={
        failed ? (
          <>
            <Button variant="outline" onClick={dismiss}>
              {t('Close')}
            </Button>
            <Button onClick={() => void retryWriter()}>{t('Try again')}</Button>
          </>
        ) : undefined
      }
    />
  )
}

/** 파일 첨부 창(EF) — 두 탭이 같은 창을 연다. 파일 하나 · 10MB까지, 글 파일과 글이 담긴 이미지만. */
function EntryFileDialog() {
  const t = useT()
  const open = useEntryStore((s) => s.fileDialogOpen)
  const upload = useEntryStore((s) => s.upload)
  const uploadFile = useEntryStore((s) => s.uploadFile)
  const close = useEntryStore((s) => s.closeFileDialog)
  const projectId = useEntryStore((s) => s.projectId)
  const errorMessage = useUploadErrorMessage()
  const uploading = upload.status === 'uploading'
  // 그림 파일은 사용 동의를 받은 뒤에만 올린다(다른 그림 올리기 화면과 같은 약속) — 동의는 이 프로젝트 · 이 고르기에만 쓴다.
  const { requestImageUploadConsent, imageUploadConsentDialog } = useImageUploadConsent(projectId ? `entry:${projectId}` : null)

  const pick = (files: FileList | null | undefined) => {
    const file = files?.[0]
    if (file && !uploading) void pickEntryFile(file, { requestConsent: requestImageUploadConsent, upload: uploadFile })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Attach a file')}</DialogTitle>
            <DialogDescription>{t('One file · up to 10MB')}</DialogDescription>
          </DialogHeader>
          <label
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-border px-6 py-8 text-center transition-colors duration-100 ease-out hover:border-border-strong hover:bg-accent/40 focus-within:ring-[3px] focus-within:ring-ring/50',
              uploading && 'pointer-events-none opacity-70',
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              pick(e.dataTransfer.files)
            }}
          >
            <input
              type="file"
              accept={ENTRY_FILE_ACCEPT}
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                pick(e.target.files)
                e.target.value = ''
              }}
            />
            <Upload className="size-5 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">{t('Click here to choose a file')}</span>
            <span className="text-xs text-muted-foreground">{t('Or drop it here')}</span>
          </label>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t('Text files')}</dt>
            <dd className="font-mono text-xs leading-5">{TEXT_EXT_LABEL}</dd>
            <dt className="text-muted-foreground">{t('Images with text')}</dt>
            <dd className="flex flex-col gap-0.5">
              <span className="font-mono text-xs leading-5">{IMAGE_EXT_LABEL}</span>
              <span className="text-xs text-muted-foreground">{t('A photographed script or a memo screenshot')}</span>
            </dd>
          </dl>
          {uploading ? (
            <div>
              <UploadingChip name={upload.name ?? ''} />
            </div>
          ) : null}
          {upload.error ? (
            <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{errorMessage(upload.error)}</span>
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{t('Webtoons, character sheets and reference photos will be read in a later version.')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={uploading}>
              {t('Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {imageUploadConsentDialog}
    </>
  )
}

/** 글을 찾지 못한 파일(E2e) — [다른 파일 올리기] / [파일 빼고 진행]. 창을 닫으면 파일을 뺀다. */
function NoTextDialog({ tab }: { tab: EntryTab }) {
  const t = useT()
  const file = useEntryStore((s) => s.draft.file)
  const uploading = useEntryStore((s) => s.upload.status === 'uploading')
  const removeFile = useEntryStore((s) => s.removeFile)
  const continueWithoutFile = useEntryStore((s) => s.continueWithoutFile)
  const openFileDialog = useEntryStore((s) => s.openFileDialog)
  const open = !!file?.noText && !uploading
  const image = file?.kind === 'image'
  const name = file?.name ?? ''

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : void removeFile())}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{image ? t("Couldn't find text in the image") : t("Couldn't find text in the file")}</DialogTitle>
          <DialogDescription>
            {image
              ? t('There is no readable text in {name}. Upload an image where text is visible, or a text file.', { name })
              : t('There is no readable text in {name}. If it is a scanned PDF, upload the pages as images, or upload a text file.', { name })}
          </DialogDescription>
        </DialogHeader>
        {image ? <p className="text-xs text-muted-foreground">{t('Reading pictures for characters and backgrounds opens in a later version.')}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => void continueWithoutFile(tab)}>
            {t('Continue without the file')}
          </Button>
          <Button
            onClick={async () => {
              await removeFile()
              openFileDialog()
            }}
          >
            {t('Upload another file')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
