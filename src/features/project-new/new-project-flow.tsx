'use client'

// 새 프로젝트(2026-10-09 오너 "업로드를 먼저 받고, 무엇인지 고르게 하자" · 처음은 2026-10-02 시안 v04 0.1).
//   ① 자료 · 아이디어 → ② 쓰임새(자료를 올렸을 때만) → ③ 길이 · 화면. 길이는 마지막에 남은 것만 묻는다 —
//   원작(대본 그대로 · 만화 원고)을 그대로 쓰면 원작 길이대로라 화면 비율만, 아니면 만들 것 카드.
//   자료가 있으면 ①에서 "다음"을 누를 때 프로젝트를 만들고 올린다(docx 글은 서버에서만 꺼낼 수 있어 대본인지 알려면 먼저 올려야 한다).
//   만들어 두고 시작하지 못한 채 떠나면 빈 프로젝트를 지운다. 오류는 채팅이 아니라 그 자리 바로 아래에 붙인다.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, FileText, ImageIcon, Loader2, Lock, RotateCcw, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useImageUploadConsent } from '@/components/upload/image-upload-consent'
import { FORMAT_OPTIONS } from '@/features/producer/quest-journal'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { PROJECT_PURPOSES, type ProjectPurposeId } from '@/lib/project/purpose'
import {
  DEFAULT_ORIGINAL_FORMAT,
  IMAGE_GROUP_USES,
  IMAGE_USES,
  IMAGE_USE_LABEL,
  TEXT_USES,
  TEXT_USE_LABEL,
  analysisNotice,
  chooseGroupUse,
  chooseImageUse,
  creationLengthStep,
  defaultTextUse,
  materialNextStep,
  materialProblems,
  needsAnalysisNotice,
  planCreation,
  type ImageUse,
  type MaterialImage,
  type MaterialText,
  type TextUse,
} from '@/lib/project/creation-materials'
import { newProjectInputError, newProjectTitle } from '@/lib/project/new-project-input'
import { MAX_COMIC_PAGES } from '@/lib/producer/comic-intake'
import { beginTreatment, checkCreationFile, createProjectForNewFlow, ingestCreationFile, type CreationUpload } from '@/lib/project/start-new-project'
import { UPLOAD_ACCEPT, kindOf } from '@/lib/upload/limits'
import { useLocaleStore } from '@/stores/locale-store'
import type { ProjectFormat } from '@/types/project'

interface PickedFile {
  id: string
  file: File
  /** rejected = 받을 수 없는 형식 · 크기(고르는 즉시 거른다, 지우고 다른 파일을 올린다). failed = 올리다 실패(다시 올리기). */
  status: 'ready' | 'uploading' | 'done' | 'failed' | 'rejected'
  error?: string
  result?: CreationUpload
  /** 고른 쓰임새 — 글은 올린 뒤 꼴로 미리 골라 두고, 그림은 사용자가 고르기 전까지 null. */
  use?: TextUse | ImageUse | null
}

interface ReferenceOption {
  id: string
  title: string
}

type Step = 1 | 2 | 3

export function NewProjectFlow() {
  const t = useT()
  const router = useRouter()
  const locale = useLocaleStore((s) => s.locale)
  const [step, setStep] = useState<Step>(1)
  const [purpose, setPurpose] = useState<ProjectPurposeId | null>(null)
  const [format, setFormat] = useState<ProjectFormat>(DEFAULT_ORIGINAL_FORMAT)
  const [idea, setIdea] = useState('')
  const [files, setFiles] = useState<PickedFile[]>([])
  const [imageMode, setImageMode] = useState<'group' | 'each'>('group')
  const [inputError, setInputError] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'uploading' | 'starting' | null>(null)
  const [dragging, setDragging] = useState(false)
  const [references, setReferences] = useState<ReferenceOption[]>([])
  const [canUseReference, setCanUseReference] = useState(false)
  const [referenceProjectId, setReferenceProjectId] = useState('')
  const [includeLastShotFrame, setIncludeLastShotFrame] = useState(false)
  // 자료를 올리다 실패하면 이미 만든 프로젝트로 다시 시도한다 — 같은 프로젝트를 두 번 만들지 않는다.
  const createdProjectId = useRef<string | null>(null)
  // 시작을 마쳤는가 — 만들어 두고 시작하지 못한 채 떠나면(뒤로 · 다른 메뉴 · 탭 닫기) 빈 프로젝트를 지운다(무료 요금제 한 칸을 막지 않게).
  const startedRef = useRef(false)
  useEffect(() => {
    const abandon = () => {
      const created = createdProjectId.current
      if (!created || startedRef.current) return
      createdProjectId.current = null
      void fetch(`/api/project/${created}`, { method: 'DELETE', keepalive: true }).catch(() => null)
    }
    window.addEventListener('pagehide', abandon)
    return () => {
      window.removeEventListener('pagehide', abandon)
      abandon()
    }
  }, [])
  const fileInput = useRef<HTMLInputElement>(null)
  const { requestImageUploadConsent, imageUploadConsentDialog } = useImageUploadConsent('new-project')

  useEffect(() => {
    fetch('/api/project/list')
      .then((r) => r.json())
      .then((data) => {
        setReferences(Array.isArray(data?.projects) ? data.projects.map((p: { id: string; title?: string }) => ({ id: p.id, title: p.title || 'Untitled' })) : [])
        setCanUseReference(data?.canUseReference === true)
      })
      .catch(() => {})
  }, [])

  // 올린 자료 → 쓰임새 규칙의 입력(lib/project/creation-materials).
  const texts: MaterialText[] = useMemo(
    () => files.flatMap((item) => (item.result?.kind === 'text' ? [{ id: item.id, name: item.file.name, text: item.result.text, use: (item.use as TextUse | undefined) ?? defaultTextUse(item.result.text) }] : [])),
    [files],
  )
  const images: MaterialImage[] = useMemo(
    () => files.flatMap((item) => (item.result?.kind === 'image'
      ? [{ id: item.id, name: item.file.name, thumbUrl: item.result.thumbUrl, sliceUrls: item.result.sliceUrls, use: (item.use as ImageUse | null | undefined) ?? null }]
      : [])),
    [files],
  )
  const problems = materialProblems(texts, images)
  const lengthStep = creationLengthStep(planCreation({ idea, texts, images }))

  const addFiles = async (picked: File[]) => {
    if (busy || !picked.length) return
    const pickedImages = picked.filter((file) => kindOf(file.name) === 'image')
    // 그림은 쓸 권리를 먼저 확인한다(채팅에 올릴 때와 같은 창).
    const allowImages = pickedImages.length === 0 || (await requestImageUploadConsent(pickedImages))
    const accepted = picked.filter((file) => allowImages || kindOf(file.name) !== 'image')
    if (!accepted.length) return
    setInputError(false)
    setStepError(null)
    // 받을 수 없는 형식 · 크기는 고르는 즉시 이유를 보인다 — 프로젝트를 만들기 전에 거른다.
    setFiles((prev) => [...prev, ...accepted.map((file): PickedFile => {
      const rejected = checkCreationFile(file)
      return rejected ? { id: crypto.randomUUID(), file, status: 'rejected', error: rejected } : { id: crypto.randomUUID(), file, status: 'ready' }
    })])
  }

  const removeFile = (id: string) => setFiles((prev) => prev.filter((item) => item.id !== id))

  const cancel = async () => {
    // 시작하지 못한 채 만들어 둔 프로젝트는 지운다 — 빈 프로젝트가 목록에 남지 않게.
    const created = createdProjectId.current
    createdProjectId.current = null
    if (created) await fetch(`/api/project/${created}`, { method: 'DELETE' }).catch(() => null)
    router.push('/projects')
  }

  /** 프로젝트가 없으면 만든다(한 번만). */
  const ensureProject = async (): Promise<string | null> => {
    if (createdProjectId.current) return createdProjectId.current
    const created = await createProjectForNewFlow({
      title: newProjectTitle(idea, files.map((item) => item.file.name), 'Untitled'),
      ...(referenceProjectId && canUseReference ? { referenceProjectId, includeLastShotFrame } : {}),
    })
    if (!created.ok) {
      setStepError(created.error || t('Failed to create project'))
      return null
    }
    for (const warning of created.warnings) toast.warning(warning.detail ?? warning.code ?? t('Some reference assets could not be copied to the new project.'))
    createdProjectId.current = created.projectId
    return created.projectId
  }

  /** ① → ② (자료가 있으면 만들고 올린 뒤) 또는 ③(아이디어만). */
  const nextFromMaterial = async () => {
    if (busy) return
    if (newProjectInputError({ idea, fileCount: files.length })) {
      setInputError(true)
      return
    }
    if (files.some((item) => item.status === 'rejected')) {
      setStepError(t('Remove the files that cannot be uploaded, then start again.'))
      return
    }
    setStepError(null)
    if (materialNextStep(files.length) === 'length') {
      setStep(3)
      return
    }
    setBusy('uploading')
    try {
      const projectId = await ensureProject()
      if (!projectId) return
      // 아직 못 올린 파일만 차례로 올린다(진행이 파일마다 보인다). 글은 올린 뒤 꼴로 쓰임새를 미리 골라 둔다.
      let failed = false
      for (const item of files) {
        if (item.status === 'done') continue
        setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading', error: undefined } : f)))
        const result = await ingestCreationFile(projectId, item.file)
        if ('error' in result) {
          failed = true
          setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'failed', error: result.error } : f)))
        } else {
          const use = result.kind === 'text' ? defaultTextUse(result.text) : null
          setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'done', result, use } : f)))
        }
      }
      if (!failed) setStep(2)
    } finally {
      setBusy(null)
    }
  }

  const setTextUse = (id: string, use: TextUse) => setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, use } : f)))
  const applyImageUses = (next: MaterialImage[]) => {
    const byId = new Map(next.map((image) => [image.id, image.use]))
    setFiles((prev) => prev.map((f) => (byId.has(f.id) ? { ...f, use: byId.get(f.id) ?? null } : f)))
  }

  const start = async () => {
    if (busy) return
    if (lengthStep === 'purpose' && !purpose) return
    setBusy('starting')
    setStepError(null)
    try {
      const projectId = await ensureProject()
      if (!projectId) return
      const uploaded: CreationUpload[] = files.flatMap((item) => (item.result ? [{ ...item.result, use: item.use ?? undefined } as CreationUpload] : []))
      await beginTreatment({
        projectId,
        idea,
        title: newProjectTitle(idea, files.map((item) => item.file.name), 'Untitled'),
        files: uploaded,
        purposeId: lengthStep === 'purpose' ? purpose : null,
        format: lengthStep === 'format' ? format : null,
      })
      startedRef.current = true
      router.push(`/studio/producer?projectId=${projectId}`)
    } finally {
      setBusy(null)
    }
  }

  const stepLabels: Array<{ n: Step; label: string; skipped?: boolean }> = [
    { n: 1, label: t('Material and idea') },
    { n: 2, label: t('How to use'), skipped: step === 3 && files.length === 0 },
    { n: 3, label: t('Length and screen') },
  ]

  return (
    <main className="mx-auto w-full max-w-[640px] px-6 py-10">
      <ol className="mb-6 flex items-center gap-2 text-xs text-muted-foreground" aria-label={t('New project')}>
        {stepLabels.map(({ n, label, skipped }) => (
          <li key={n} className="flex items-center gap-2">
            <span className={cn(step === n && 'font-semibold text-foreground', skipped && 'opacity-50')} aria-current={step === n ? 'step' : undefined}>
              {n} {label}
            </span>
            <span aria-hidden className="h-px w-6 bg-border" />
          </li>
        ))}
        <li>Producer</li>
      </ol>

      {step === 1 ? (
        <section data-testid="new-project-material">
          <h1 className="text-2xl font-bold tracking-tight">{t('Add your material or idea')}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t('Either one is enough.')}</p>

          <Textarea
            value={idea}
            onChange={(e) => {
              setIdea(e.target.value)
              if (inputError) setInputError(false)
            }}
            placeholder={t('E.g. Two kids playing hopscotch in the schoolyard argue, then make up with a little help from a friend')}
            aria-invalid={inputError || undefined}
            aria-describedby={inputError ? 'new-project-input-error' : undefined}
            disabled={!!busy}
            rows={6}
            className={cn('mt-5 resize-y text-sm leading-6', inputError && 'border-destructive')}
            data-testid="new-project-idea"
          />
          {inputError ? (
            <p id="new-project-input-error" role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive" data-testid="new-project-input-error">
              <AlertCircle className="size-3.5" aria-hidden /> {t('Write an idea or upload a file.')}
            </p>
          ) : null}

          <div
            className={cn('mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed p-3.5 text-xs text-muted-foreground', dragging ? 'border-primary bg-primary/5' : 'border-border')}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              // 올리는 동안 놓은 파일은 받지 않는다 — 올릴 목록은 "다음"을 누를 때 정해져 조용히 빠진다(addFiles 가 거른다).
              void addFiles(Array.from(e.dataTransfer.files))
            }}
          >
            <span>{t('Story, script, planning notes, character or background images')}</span>
            <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={!!busy}>
              <Upload className="size-4" /> {t('Upload files')}
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={UPLOAD_ACCEPT}
              className="hidden"
              onChange={(e) => {
                void addFiles(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
          </div>

          {files.length ? (
            <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label={t('Upload files')}>
              {files.map((item) => (
                <li
                  key={item.id}
                  data-testid="new-project-file"
                  data-status={item.status}
                  className={cn(
                    'inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-xs',
                    item.status === 'failed' || item.status === 'rejected' ? 'border-destructive/60 bg-destructive/10 text-destructive' : 'border-border bg-muted/40',
                  )}
                >
                  {item.status === 'uploading' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : kindOf(item.file.name) === 'image' ? <ImageIcon className="size-3.5" aria-hidden /> : null}
                  <span className="truncate">{item.file.name}</span>
                  {item.status === 'failed' ? <span title={item.error}>· {t('Could not upload')}</span> : null}
                  {item.status === 'rejected' ? <span>· {item.error}</span> : null}
                  {item.status === 'failed' ? (
                    <button type="button" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline" onClick={() => void nextFromMaterial()} disabled={!!busy}>
                      <RotateCcw className="size-3" aria-hidden /> {t('Upload again')}
                    </button>
                  ) : null}
                  <button type="button" aria-label={t('Remove')} className="text-muted-foreground hover:text-foreground" onClick={() => removeFile(item.id)} disabled={!!busy}>
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-3.5 rounded-r-md border-l-2 border-primary bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {t('Next, you choose how to use each file. If you only have an idea, Producer writes the treatment for you.')}
          </p>

          <div className="mt-4 space-y-1.5">
            <label htmlFor="new-project-reference" className="text-xs font-medium text-muted-foreground">{t('Reference project (optional)')}</label>
            <div className="flex items-center gap-2">
              <select
                id="new-project-reference"
                value={referenceProjectId}
                onChange={(e) => {
                  setReferenceProjectId(e.target.value)
                  if (!e.target.value) setIncludeLastShotFrame(false)
                }}
                disabled={!!busy || !canUseReference || !!createdProjectId.current}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">{t('No reference project')}</option>
                {references.map((project) => (
                  <option key={project.id} value={project.id}>{project.title}</option>
                ))}
              </select>
              {!canUseReference ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3.5" aria-hidden /> {t('Locked')}</span>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {canUseReference ? t('Optionally copy assets from an existing project in this workspace.') : t('Reference projects are available on Producer10 and above.')}
            </p>
            {referenceProjectId && canUseReference ? (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={includeLastShotFrame} onChange={(e) => setIncludeLastShotFrame(e.target.checked)} disabled={!!busy || !!createdProjectId.current} className="size-4" />
                {t('Include the last shot frame')}
              </label>
            ) : null}
          </div>

          {stepError ? <p role="alert" className="mt-4 text-sm text-destructive">{stepError}</p> : null}

          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => void cancel()} disabled={!!busy}>{t('Cancel')}</Button>
            <Button onClick={() => void nextFromMaterial()} disabled={!!busy} data-testid="new-project-next">
              {busy === 'uploading' ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy === 'uploading' ? t('Uploading your files…') : t('Next')}
            </Button>
          </div>
        </section>
      ) : step === 2 ? (
        <section data-testid="new-project-uses">
          <h1 className="text-2xl font-bold tracking-tight">{t('How should we use what you uploaded?')}</h1>
          {images.length ? <p className="mt-1.5 text-sm text-muted-foreground">{t('Choose a use for every picture before you go on.')}</p> : null}

          <ul className="mt-5 space-y-2.5">
            {texts.map((text) => (
              <li key={text.id} className="rounded-xl border border-border bg-card p-3" data-testid="new-project-use-row">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{text.name}</span>
                </div>
                <UseChoices label={text.name}>
                  {TEXT_USES.map((use) => (
                    <UseChip key={use} selected={text.use === use} onClick={() => setTextUse(text.id, use)}>{t(TEXT_USE_LABEL[use])}</UseChip>
                  ))}
                </UseChoices>
              </li>
            ))}

            {images.length >= 2 && imageMode === 'group' ? (
              <li className="rounded-xl border border-border bg-card p-3" data-testid="new-project-use-group">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>{t('{n} pictures', { n: images.length })}</span>
                  <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => setImageMode('each')}>
                    {t('Decide one by one')}
                  </button>
                </div>
                <div className="mt-2 flex gap-1 overflow-x-auto">
                  {images.map((image) => <Thumb key={image.id} image={image} />)}
                </div>
                <UseChoices label={t('{n} pictures', { n: images.length })}>
                  {IMAGE_GROUP_USES.map((use) => (
                    <UseChip key={use} selected={images.every((image) => image.use === use)} onClick={() => applyImageUses(chooseGroupUse(images, use))}>
                      {t(IMAGE_USE_LABEL[use])}
                    </UseChip>
                  ))}
                </UseChoices>
              </li>
            ) : (
              images.map((image) => (
                <li key={image.id} className="rounded-xl border border-border bg-card p-3" data-testid="new-project-use-row">
                  <div className="flex items-center gap-2 text-sm">
                    <Thumb image={image} />
                    <span className="truncate">{image.name}</span>
                  </div>
                  <UseChoices label={image.name}>
                    {IMAGE_USES.map((use) => (
                      <UseChip key={use} selected={image.use === use} onClick={() => applyImageUses(chooseImageUse(images, image.id, use))}>
                        {t(IMAGE_USE_LABEL[use])}
                      </UseChip>
                    ))}
                  </UseChoices>
                </li>
              ))
            )}
          </ul>
          {images.length >= 2 && imageMode === 'each' ? (
            <button type="button" className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => setImageMode('group')}>
              {t('Decide all at once')}
            </button>
          ) : null}

          {needsAnalysisNotice(images) ? (
            <p className="mt-3.5 rounded-r-md border-l-2 border-primary bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground" data-testid="new-project-analysis-notice">
              {analysisNotice(locale)}
            </p>
          ) : null}
          {problems.includes('too_many_comic_pages') ? (
            <p role="alert" className="mt-3 flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5" aria-hidden /> {t('Comic pages can be up to {max} at a time.', { max: MAX_COMIC_PAGES })}
            </p>
          ) : null}
          {problems.includes('two_originals') ? (
            <p role="alert" className="mt-3 flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5" aria-hidden /> {t('Keep only one original as written: the script or the comic pages.')}
            </p>
          ) : null}

          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>{t('Back')}</Button>
            <Button onClick={() => setStep(3)} disabled={problems.length > 0} data-testid="new-project-next">{t('Next')}</Button>
          </div>
        </section>
      ) : (
        <section data-testid="new-project-length">
          {lengthStep === 'format' ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight">{t('Choose the screen ratio')}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{t('The video runs as long as the original, so only the screen ratio is left.')}</p>
              <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="radiogroup" aria-label={t('Choose the screen ratio')}>
                {FORMAT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={format === option.value}
                    data-testid="new-project-format"
                    onClick={() => setFormat(option.value)}
                    className={cn(
                      'rounded-xl border bg-card p-3.5 text-left text-sm font-semibold transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      format === option.value ? 'border-primary bg-primary/10' : 'border-border',
                    )}
                  >
                    {/* Producer 보드의 포맷 칸과 같은 이름 */}
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight">{t('What do you want to make?')}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{t('We will fill in the screen ratio and runtime to match. You can change them in Producer.')}</p>
              <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label={t('What do you want to make?')}>
                {PROJECT_PURPOSES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={purpose === option.id}
                    data-testid="new-project-purpose"
                    onClick={() => setPurpose(option.id)}
                    className={cn(
                      'rounded-xl border bg-card p-3.5 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      purpose === option.id ? 'border-primary bg-primary/10' : 'border-border',
                    )}
                  >
                    <span className="block text-sm font-semibold">{t(option.label)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{t(option.description)}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {stepError ? <p role="alert" className="mt-4 text-sm text-destructive">{stepError}</p> : null}

          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(files.length ? 2 : 1)} disabled={!!busy}>{t('Back')}</Button>
            <Button onClick={() => void start()} disabled={!!busy || (lengthStep === 'purpose' && !purpose)} data-testid="new-project-start">
              {busy === 'starting' ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy === 'starting' ? t('Starting…') : t('Start with Producer')}
            </Button>
          </div>
        </section>
      )}
      {imageUploadConsentDialog}
    </main>
  )
}

function UseChoices({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} className="mt-2 flex flex-wrap gap-1.5">
      {children}
    </div>
  )
}

function UseChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      data-testid="new-project-use"
      className={cn(
        'rounded-lg border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        selected ? 'border-primary bg-primary/10 font-medium text-foreground' : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Thumb({ image }: { image: Pick<MaterialImage, 'thumbUrl' | 'name'> }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 올린 원본(우리 저장소)을 작게 보이는 확인용 썸네일이다.
    <img src={image.thumbUrl} alt="" title={image.name} className="size-10 shrink-0 rounded-md border border-border object-cover" />
  )
}
