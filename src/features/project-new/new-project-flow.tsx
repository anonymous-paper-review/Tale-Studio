'use client'

// 새 프로젝트 0.1(2026-10-02 오너 — tale-proto-v04). 한 화면 한 질문: ① 무엇을 만들까요 → ② 자료 · 아이디어.
//   시작하면 Producer 로 가면서 트리트먼트를 바로 쓴다(Writer 앞단). 오류는 채팅이 아니라 입력창 바로 아래에 붙인다.
//   자료를 올리지 못하면 그 파일만 실패로 두고 다시 올리기를 준다 — 적어 둔 아이디어는 그대로 남는다.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ImageIcon, Loader2, Lock, RotateCcw, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useImageUploadConsent } from '@/components/upload/image-upload-consent'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { PROJECT_PURPOSES, purposeSummary, type ProjectPurposeId } from '@/lib/project/purpose'
import { newProjectInputError, newProjectTitle } from '@/lib/project/new-project-input'
import { beginTreatment, checkCreationFile, createProjectForNewFlow, ingestCreationFile, type CreationUpload } from '@/lib/project/start-new-project'
import { UPLOAD_ACCEPT, kindOf } from '@/lib/upload/limits'
import { useLocaleStore } from '@/stores/locale-store'

interface PickedFile {
  id: string
  file: File
  /** rejected = 받을 수 없는 형식 · 크기(고르는 즉시 거른다, 지우고 다른 파일을 올린다). failed = 올리다 실패(다시 올리기). */
  status: 'ready' | 'uploading' | 'done' | 'failed' | 'rejected'
  error?: string
  result?: CreationUpload
}

interface ReferenceOption {
  id: string
  title: string
}

export function NewProjectFlow() {
  const t = useT()
  const router = useRouter()
  const locale = useLocaleStore((s) => s.locale)
  const [step, setStep] = useState<1 | 2>(1)
  const [purpose, setPurpose] = useState<ProjectPurposeId | null>(null)
  const [idea, setIdea] = useState('')
  const [files, setFiles] = useState<PickedFile[]>([])
  const [inputError, setInputError] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
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

  const addFiles = async (picked: File[]) => {
    if (!picked.length) return
    const images = picked.filter((file) => kindOf(file.name) === 'image')
    // 그림은 쓸 권리를 먼저 확인한다(채팅에 올릴 때와 같은 창).
    const allowImages = images.length === 0 || (await requestImageUploadConsent(images))
    const accepted = picked.filter((file) => allowImages || kindOf(file.name) !== 'image')
    if (!accepted.length) return
    setInputError(false)
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

  const start = async () => {
    if (!purpose || starting) return
    if (newProjectInputError({ idea, fileCount: files.length })) {
      setInputError(true)
      return
    }
    if (files.some((item) => item.status === 'rejected')) {
      setStartError(t('Remove the files that cannot be uploaded, then start again.'))
      return
    }
    setStarting(true)
    setStartError(null)
    try {
      let projectId = createdProjectId.current
      if (!projectId) {
        const created = await createProjectForNewFlow({
          title: newProjectTitle(idea, files.map((item) => item.file.name), 'Untitled'),
          ...(referenceProjectId && canUseReference ? { referenceProjectId, includeLastShotFrame } : {}),
        })
        if (!created.ok) {
          setStartError(created.error || t('Failed to create project'))
          return
        }
        for (const warning of created.warnings) toast.warning(warning.detail ?? warning.code ?? t('Some reference assets could not be copied to the new project.'))
        projectId = created.projectId
        createdProjectId.current = projectId
      }

      // 아직 못 올린 파일만 차례로 올린다(진행이 파일마다 보인다).
      const uploaded: CreationUpload[] = []
      let failed = false
      for (const item of files) {
        if (item.status === 'done' && item.result) {
          uploaded.push(item.result)
          continue
        }
        setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading', error: undefined } : f)))
        const result = await ingestCreationFile(projectId, item.file)
        if ('error' in result) {
          failed = true
          setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'failed', error: result.error } : f)))
        } else {
          uploaded.push(result)
          setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'done', result } : f)))
        }
      }
      if (failed) return

      await beginTreatment({ projectId, purposeId: purpose, idea, files: uploaded })
      startedRef.current = true
      router.push(`/studio/producer?projectId=${projectId}`)
    } finally {
      setStarting(false)
    }
  }

  const summary = purpose ? purposeSummary(purpose, locale) : ''

  return (
    <main className="mx-auto w-full max-w-[640px] px-6 py-10">
      <ol className="mb-6 flex items-center gap-2 text-xs text-muted-foreground" aria-label={t('New project')}>
        <li className={cn(step === 1 && 'font-semibold text-foreground')} aria-current={step === 1 ? 'step' : undefined}>1 {t('What to make')}</li>
        <li aria-hidden className="h-px w-6 bg-border" />
        <li className={cn(step === 2 && 'font-semibold text-foreground')} aria-current={step === 2 ? 'step' : undefined}>2 {t('Material and idea')}</li>
        <li aria-hidden className="h-px w-6 bg-border" />
        <li>Producer</li>
      </ol>

      {step === 1 ? (
        <section data-testid="new-project-what">
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
          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => router.push('/projects')}>{t('Cancel')}</Button>
            <Button disabled={!purpose} onClick={() => setStep(2)} data-testid="new-project-next">{t('Next')}</Button>
          </div>
        </section>
      ) : (
        <section data-testid="new-project-material">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-1.5 text-xs">
            <span>{summary}</span>
            <button type="button" className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setStep(1)} disabled={starting}>
              {t('Change')}
            </button>
          </div>
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
            disabled={starting}
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
              void addFiles(Array.from(e.dataTransfer.files))
            }}
          >
            <span>{t('Story, script, planning notes, character or background images')}</span>
            <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={starting}>
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
                    <button type="button" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline" onClick={() => void start()} disabled={starting}>
                      <RotateCcw className="size-3" aria-hidden /> {t('Upload again')}
                    </button>
                  ) : null}
                  <button type="button" aria-label={t('Remove')} className="text-muted-foreground hover:text-foreground" onClick={() => removeFile(item.id)} disabled={starting}>
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-3.5 rounded-r-md border-l-2 border-primary bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {t('Scripts and images you upload are used as they are. If you only have an idea or a story, Producer writes the treatment for you.')}
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
                disabled={starting || !canUseReference || !!createdProjectId.current}
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
                <input type="checkbox" checked={includeLastShotFrame} onChange={(e) => setIncludeLastShotFrame(e.target.checked)} disabled={starting} className="size-4" />
                {t('Include the last shot frame')}
              </label>
            ) : null}
          </div>

          {startError ? <p role="alert" className="mt-4 text-sm text-destructive">{startError}</p> : null}

          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => (createdProjectId.current ? void cancel() : setStep(1))} disabled={starting}>
              {createdProjectId.current ? t('Cancel') : t('Back')}
            </Button>
            <Button onClick={() => void start()} disabled={starting} data-testid="new-project-start">
              {starting ? <Loader2 className="size-4 animate-spin" /> : null}
              {starting ? t('Starting…') : t('Start with Producer')}
            </Button>
          </div>
        </section>
      )}
      {imageUploadConsentDialog}
    </main>
  )
}
